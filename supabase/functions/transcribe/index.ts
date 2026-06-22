import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

type TranscribeType = 'youtube' | 'reel';

function detectTypeFromUrl(url: string): TranscribeType | null {
  if (/youtube\.com\/(watch|shorts)|youtu\.be\//i.test(url)) return 'youtube';
  if (/instagram\.com\/reel(s)?\//i.test(url)) return 'reel';
  return null;
}

const TRANSCRIBE_PROMPT = `Transcreva integralmente o conteudo falado deste video em portugues do Brasil.
Regras:
- Retorne APENAS o texto transcrito, sem cabecalhos, sem timestamps, sem markdown.
- Preserve a ordem original das ideias.
- Se o video estiver em outro idioma, traduza para portugues do Brasil mantendo o sentido.
- Ignore sons de fundo, musicas e ruidos — foque na fala.`;

const YOUTUBE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

// Gemini transcreve o YouTube nativamente: passamos a URL como fileData.fileUri e o
// modelo le o video direto da fonte — sem precisar baixar/extrair audio na Edge Function.
async function transcribeYoutubeWithGemini(
  apiKey: string,
  youtubeUrl: string,
): Promise<{ text: string; model: string }> {
  let lastError = '';

  for (const model of YOUTUBE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { fileData: { fileUri: youtubeUrl } },
                  { text: TRANSCRIBE_PROMPT },
                ],
              },
            ],
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        lastError = `${model}: HTTP ${res.status} ${body.slice(0, 400)}`;
        continue;
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      if (!text) {
        lastError = `${model}: resposta vazia`;
        continue;
      }
      return { text, model };
    } catch (err) {
      lastError = `${model}: ${String(err)}`;
    }
  }

  throw new Error(lastError || 'Falha desconhecida ao transcrever via Gemini');
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
    const googleKey = await getCredential('google_api_key')
      ?? await getCredential('gemini_imagen_api_key')
      ?? '';
    if (!googleKey) {
      return new Response(
        JSON.stringify({
          error: 'Credencial Google AI nao configurada. Acesse Configuracoes → Credenciais.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    try {
      const result = await transcribeYoutubeWithGemini(googleKey, url);
      return new Response(
        JSON.stringify({ ...result, source: 'gemini' }),
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
