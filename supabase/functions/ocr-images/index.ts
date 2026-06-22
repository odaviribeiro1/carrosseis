import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

const OCR_PROMPT = `Extraia TODO o texto visivel nesta imagem de um carrossel do Instagram. Retorne apenas o texto extraido, sem comentarios adicionais. Mantenha a formatacao e hierarquia visual (titulos maiores primeiro, subtitulos depois, corpo do texto por ultimo). Se nao houver texto, retorne uma string vazia.`;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function inferMime(contentType: string | null): string {
  if (contentType && /^image\/(jpeg|png|webp|gif)/i.test(contentType)) return contentType.split(';')[0];
  return 'image/jpeg';
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar imagem`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = inferMime(res.headers.get('content-type'));
  return `data:${mime};base64,${bytesToBase64(buf)}`;
}

async function ocrSingleImage(apiKey: string, url: string): Promise<string> {
  const dataUrl = await fetchImageAsDataUrl(url);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

// Processa em lotes de N para nao estourar rate limit da OpenAI.
async function ocrInBatches(
  apiKey: string,
  urls: string[],
  concurrency = 3,
): Promise<Array<{ url: string; text: string; error?: string }>> {
  const results: Array<{ url: string; text: string; error?: string }> = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map((u) => ocrSingleImage(apiKey, u)));
    settled.forEach((r, idx) => {
      const url = slice[idx];
      if (r.status === 'fulfilled') results.push({ url, text: r.value });
      else results.push({ url, text: '', error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    });
  }
  return results;
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
    const imageUrls = Array.isArray(body?.image_urls) ? body.image_urls.filter((u: unknown): u is string => typeof u === 'string') : [];

    if (imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'image_urls e obrigatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (imageUrls.length > 15) {
      return new Response(JSON.stringify({ error: 'Maximo de 15 imagens por requisicao' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await getCredential('openai_api_key') ?? '';
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Credencial OpenAI nao configurada. Acesse Configuracoes → Credenciais.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results = await ocrInBatches(apiKey, imageUrls, 3);
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
