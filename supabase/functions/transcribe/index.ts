import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

type TranscribeType = 'youtube' | 'reel';

function detectTypeFromUrl(url: string): TranscribeType | null {
  if (/youtube\.com\/(watch|shorts)|youtu\.be\//i.test(url)) return 'youtube';
  if (/instagram\.com\/reel(s)?\//i.test(url)) return 'reel';
  return null;
}

// Supadata fala com YouTube direto pela URL e retorna a transcricao pronta.
// Edge Functions Deno nao conseguem extrair audio do YouTube (sem yt-dlp), entao
// delegamos esse passo para um servico que faz isso server-side.
async function transcribeYoutubeViaSupadata(
  apiKey: string,
  url: string,
): Promise<{ text: string; language: string }> {
  const endpoint = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}&text=true`;
  const res = await fetch(endpoint, {
    headers: { 'x-api-key': apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supadata ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as { content?: string; lang?: string };
  return {
    text: (json.content ?? '').trim(),
    language: json.lang ?? 'pt',
  };
}

// Whisper aceita uma URL de video direto (CDN do Instagram) — baixamos como blob
// e enviamos como audio.mp4. Whisper extrai o audio da faixa internamente.
async function transcribeReelViaWhisper(
  apiKey: string,
  videoUrl: string,
): Promise<{ text: string; language: string }> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Falha ao baixar video (${videoRes.status})`);
  const videoBlob = await videoRes.blob();

  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('file', videoBlob, 'audio.mp4');
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as { text?: string; language?: string };
  return {
    text: (json.text ?? '').trim(),
    language: json.language ?? 'pt',
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
    const videoUrl = typeof body?.video_url === 'string' ? body.video_url.trim() : '';
    const requestedType = body?.type as TranscribeType | undefined;

    if (!url && !videoUrl) {
      return new Response(JSON.stringify({ error: 'url ou video_url e obrigatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const type: TranscribeType | null = requestedType
      ?? (url ? detectTypeFromUrl(url) : null)
      ?? (videoUrl ? 'reel' : null);

    if (!type) {
      return new Response(
        JSON.stringify({ error: 'Tipo nao suportado. Use YouTube ou Instagram Reel.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (type === 'reel') {
      if (!videoUrl) {
        return new Response(
          JSON.stringify({ error: 'video_url e obrigatorio para reel' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
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
      try {
        const result = await transcribeReelViaWhisper(apiKey, videoUrl);
        return new Response(
          JSON.stringify({ ...result, source: 'whisper' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: `Falha ao transcrever reel: ${String(err)}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // YouTube
    const supadataKey = await getCredential('supadata_api_key') ?? '';
    if (!supadataKey) {
      return new Response(
        JSON.stringify({
          error: 'Credencial Supadata nao configurada. Acesse Configuracoes → Credenciais.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    try {
      const result = await transcribeYoutubeViaSupadata(supadataKey, url);
      return new Response(
        JSON.stringify({ ...result, source: 'supadata' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Falha ao transcrever YouTube: ${String(err)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
