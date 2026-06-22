import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

type ScrapeType = 'post' | 'carousel' | 'reel';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;

function detectTypeFromUrl(url: string): ScrapeType | null {
  if (/instagram\.com\/reel(s)?\//i.test(url)) return 'reel';
  if (/instagram\.com\/(p|tv)\//i.test(url)) return 'post';
  return null;
}

function actorForType(type: ScrapeType): string {
  return type === 'reel' ? 'apify~instagram-reel-scraper' : 'apify~instagram-post-scraper';
}

async function startActorRun(actor: string, token: string, input: unknown) {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify run start falhou (${res.status}): ${text.slice(0, 200)}`);
  }
  return await res.json() as { data: { id: string; defaultDatasetId: string } };
}

async function pollRun(runId: string, token: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    if (!res.ok) throw new Error(`Falha no polling Apify (${res.status})`);
    const json = await res.json() as { data: { status: string; defaultDatasetId: string } };
    if (json.data.status === 'SUCCEEDED') return json.data.defaultDatasetId;
    if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(json.data.status)) {
      throw new Error(`Apify run terminou em ${json.data.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('timeout');
}

async function fetchDataset(datasetId: string, token: string): Promise<unknown[]> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`);
  if (!res.ok) throw new Error(`Falha ao ler dataset (${res.status})`);
  return await res.json();
}

type ApifyPostItem = {
  type?: string;          // "Sidecar" | "Image" | "Video"
  caption?: string;
  displayUrl?: string;
  images?: string[];
  videoUrl?: string;
  childPosts?: Array<{ displayUrl?: string; type?: string }>;
};

function normalizePostResult(item: ApifyPostItem): {
  caption: string;
  images: string[];
  videoUrl: string | null;
  type: 'Sidecar' | 'Image' | 'Video';
} {
  const caption = item.caption ?? '';
  const rawType = item.type ?? '';
  if (rawType === 'Sidecar') {
    const images = (item.childPosts ?? [])
      .map((c) => c.displayUrl)
      .filter((u): u is string => Boolean(u));
    // Fallback para `images` se childPosts vier vazio.
    const fallback = item.images && item.images.length > 0 ? item.images : [];
    return { caption, images: images.length > 0 ? images : fallback, videoUrl: null, type: 'Sidecar' };
  }
  if (rawType === 'Video') {
    return { caption, images: [], videoUrl: item.videoUrl ?? null, type: 'Video' };
  }
  // Default = Image (foto única).
  return {
    caption,
    images: item.displayUrl ? [item.displayUrl] : (item.images ?? []),
    videoUrl: null,
    type: 'Image',
  };
}

type ApifyReelItem = {
  caption?: string;
  videoUrl?: string;
  displayUrl?: string;
};

function normalizeReelResult(item: ApifyReelItem): {
  caption: string;
  images: string[];
  videoUrl: string | null;
  type: 'Video';
} {
  return {
    caption: item.caption ?? '',
    images: item.displayUrl ? [item.displayUrl] : [],
    videoUrl: item.videoUrl ?? null,
    type: 'Video',
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = await getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nao autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: 'content_hub' },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const url = String(body?.url ?? '').trim();
    const requestedType = (body?.type as ScrapeType | undefined);

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL e obrigatoria' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const detected = detectTypeFromUrl(url);
    if (!detected) {
      return new Response(
        JSON.stringify({ error: 'URL invalida. Cole um link de post/carrossel ou reels do Instagram.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 'carousel' e 'post' usam o mesmo actor; diferenciamos pelo `type` do item retornado.
    const effectiveType: ScrapeType =
      requestedType === 'reel' || detected === 'reel' ? 'reel' : 'post';

    const token = await getCredential('apify_token') ?? '';
    if (!token) {
      return new Response(
        JSON.stringify({
          error: 'Token Apify nao configurado. Acesse Configuracoes → Credenciais.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const actor = actorForType(effectiveType);
    // Os actors instagram-post-scraper / instagram-reel-scraper exigem o campo
    // `username`, que aceita username, URL de perfil OU URL direta de post/reel.
    const input = { username: [url], resultsLimit: 1 };

    let datasetId: string;
    try {
      const run = await startActorRun(actor, token, input);
      datasetId = await pollRun(run.data.id, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scrape-instagram] actor=${actor} type=${effectiveType} falha: ${msg}`);
      const status = msg === 'timeout' ? 504 : 502;
      const userMsg = msg === 'timeout'
        ? 'A extracao demorou mais que o esperado. Tente novamente.'
        : `Falha ao extrair do Instagram: ${msg}`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = await fetchDataset(datasetId, token);
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Este post e privado ou nao foi encontrado.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const first = items[0] as Record<string, unknown>;
    const normalized = effectiveType === 'reel'
      ? normalizeReelResult(first as ApifyReelItem)
      : normalizePostResult(first as ApifyPostItem);

    return new Response(JSON.stringify(normalized), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
