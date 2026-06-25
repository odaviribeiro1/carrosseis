import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';
import { OpenAIAdapter } from '../generate-content/adapters/openai.ts';
import {
  computeArtHash,
  parseJsonStrict,
  type ArtDirection,
} from '../../../packages/shared/src/utils/artDirection.ts';

const ART_DIRECTION_MODEL_DEFAULT = 'gpt-4o';

function buildSystemPrompt(params: { content: string; visualSettings: unknown }): string {
  return `Voce e um diretor de arte senior. A partir do conteudo do carrossel e dos
aspectos visuais escolhidos, defina UMA direcao de arte GLOBAL, coesa, que sera
compartilhada por TODOS os slides para garantir consistencia visual (mesma
paleta, mesma tipografia, mesmo tratamento de fundo, mesma atmosfera).

<conteudo_carrossel>
${params.content || '(sem conteudo textual)'}
</conteudo_carrossel>

<aspectos_visuais>
${JSON.stringify(params.visualSettings ?? {}, null, 2)}
</aspectos_visuais>

Retorne APENAS um objeto JSON valido, sem texto adicional, neste formato exato:
{
  "palette": { "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "background": "#RRGGBB", "text": "#RRGGBB" },
  "visualStyle": "estilo visual geral em uma frase",
  "backgroundTreatment": "tratamento de fundo recorrente",
  "lighting": "iluminacao",
  "composition": "regras de composicao/grid coesas entre slides",
  "typography": { "heading": "familia/peso para titulos", "body": "familia/peso para corpo", "treatment": "tratamento tipografico" },
  "motifs": ["motif recorrente 1", "motif recorrente 2"]
}

Regras:
- Respeite a paleta e o estilo dos aspectos visuais.
- Todas as cores em hexadecimal valido (#RRGGBB).
- Seja especifico e consistente: estes valores serao a ancora de cada slide.`;
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const corsHeaders = await getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Nao autorizado' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: 'content_hub' },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Nao autenticado' }, 401, corsHeaders);
    }

    const body = await req.json();
    const {
      carousel_id,
      content = '',
      visual_settings = null,
      reference_images_key = null,
      force = false,
      model: modelOverride,
    } = body ?? {};

    if (!carousel_id) {
      return jsonResponse({ error: 'carousel_id e obrigatorio' }, 400, corsHeaders);
    }

    const hash = await computeArtHash({
      visualSettings: visual_settings,
      referenceImagesKey: reference_images_key,
    });

    // 1) Reusa o cache, exceto quando forcado a recomputar.
    if (!force) {
      const { data: existing, error: readError } = await userClient
        .from('carousels')
        .select('art_direction, art_direction_hash')
        .eq('id', carousel_id)
        .maybeSingle();
      if (readError) throw readError;

      if (existing?.art_direction && existing.art_direction_hash === hash) {
        console.log('[art-direction] cache hit — GPT pulado', { carousel_id, hash });
        return jsonResponse(
          { art_direction: existing.art_direction, hash, cached: true },
          200,
          corsHeaders,
        );
      }
    }

    // 2) Recomputa via GPT (OpenAI).
    const apiKey = await getCredential('openai_api_key') ?? '';
    if (!apiKey) {
      return jsonResponse(
        { error: 'Credencial openai_api_key nao configurada. Acesse /settings/credentials.' },
        500,
        corsHeaders,
      );
    }

    const model = String(modelOverride || ART_DIRECTION_MODEL_DEFAULT);
    const adapter = new OpenAIAdapter();
    const systemPrompt = buildSystemPrompt({ content, visualSettings: visual_settings });

    let artDirection: ArtDirection | null = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 3 && !artDirection; attempt += 1) {
      try {
        const result = await adapter.generateContent(systemPrompt, {
          apiKey,
          model,
          maxTokens: 1200,
        });
        artDirection = parseJsonStrict<ArtDirection>(result.content);
      } catch (err) {
        lastErr = String(err);
        console.warn('[art-direction] JSON malformado, reprocessando', { attempt, lastErr });
      }
    }

    if (!artDirection) {
      return jsonResponse(
        { error: `Falha ao gerar direcao de arte (JSON invalido). ${lastErr}` },
        502,
        corsHeaders,
      );
    }

    // 3) Persiste a nova direcao de arte + hash (RLS via userClient).
    const { error: updateError } = await userClient
      .from('carousels')
      .update({ art_direction: artDirection, art_direction_hash: hash })
      .eq('id', carousel_id);
    if (updateError) throw updateError;

    console.log('[art-direction] recomputed', { carousel_id, hash });
    return jsonResponse({ art_direction: artDirection, hash, cached: false }, 200, corsHeaders);
  } catch (err) {
    const headers = await getCorsHeaders(req);
    return jsonResponse({ error: `Erro interno: ${String(err)}` }, 500, headers);
  }
});
