import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

function detectUrlType(url: string): 'youtube' | 'twitter' | 'direct' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  return 'direct';
}

const TRANSCRIBE_PROMPT = `Transcreva integralmente o conteudo falado deste video em portugues do Brasil.
Regras:
- Retorne APENAS o texto transcrito, sem cabecalhos, sem timestamps, sem markdown.
- Preserve a ordem original das ideias.
- Se o video estiver em outro idioma, traduza para portugues do Brasil mantendo o sentido.
- Ignore sons de fundo, musicas e ruidos — foque na fala.`;

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

async function transcribeYoutubeWithGemini(
  apiKey: string,
  youtubeUrl: string,
): Promise<{ transcript: string; model: string }> {
  let lastError = '';

  for (const model of MODELS) {
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
      const transcript = parts
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      if (!transcript) {
        lastError = `${model}: resposta vazia`;
        continue;
      }
      return { transcript, model };
    } catch (err) {
      lastError = `${model}: ${String(err)}`;
    }
  }

  throw new Error(lastError || 'Falha desconhecida ao transcrever via Gemini');
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
    const { url } = body;

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL e obrigatoria' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const urlType = detectUrlType(url);

    if (urlType === 'youtube') {
      const apiKey = await getCredential('google_api_key') ?? await getCredential('gemini_imagen_api_key') ?? '';
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: 'Credencial Google AI nao configurada. Acesse /settings/credentials.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      try {
        const { transcript, model } = await transcribeYoutubeWithGemini(apiKey, url);
        return new Response(
          JSON.stringify({ transcript, source: 'gemini', model }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: `Falha ao transcrever via Gemini: ${String(err)}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    if (urlType === 'twitter') {
      return new Response(
        JSON.stringify({ error: 'Transcricao de Twitter/X em implementacao. Cole o texto da thread manualmente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Tipo de URL nao suportado. Use YouTube ou cole o texto manualmente.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const corsHeaders = await getCorsHeaders(req);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
