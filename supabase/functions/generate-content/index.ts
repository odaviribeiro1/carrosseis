import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';
import { OpenAIAdapter } from './adapters/openai.ts';
import { AnthropicAdapter } from './adapters/anthropic.ts';
import { GoogleAdapter } from './adapters/google.ts';
import { GroqAdapter } from './adapters/groq.ts';
import type { LLMAdapter } from './adapters/types.ts';

const adapters: Record<string, () => LLMAdapter> = {
  openai: () => new OpenAIAdapter(),
  anthropic: () => new AnthropicAdapter(),
  google: () => new GoogleAdapter(),
  groq: () => new GroqAdapter(),
};

const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  google: 'google_api_key',
  groq: 'groq_api_key',
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-1.5-pro',
  groq: 'llama-3.3-70b-versatile',
};

function buildPrompt(params: {
  content: string;
  topic: string;
  toneOfVoice: string;
  audience: string;
  slideCount: number;
  category: string;
}): string {
  return `Voce e um especialista em criacao de carrosseis visuais.
Gere o conteudo textual para um carrossel com ${params.slideCount} slides.

Categoria do template: ${params.category}
Publico-alvo: ${params.audience || 'geral'}
Tom de voz: ${params.toneOfVoice || 'profissional e acessivel'}

<user_content>
${params.content || params.topic}
</user_content>

Retorne APENAS um JSON valido no formato abaixo, sem texto adicional:
{
  "slides": [
    {
      "position": 1,
      "type": "capa",
      "headline": "Titulo impactante do carrossel",
      "body": "Subtitulo ou descricao breve",
      "cta": "",
      "notes": ""
    },
    {
      "position": 2,
      "type": "conteudo",
      "headline": "Titulo do slide",
      "body": "Conteudo principal do slide com informacoes relevantes",
      "cta": "",
      "notes": ""
    }
  ]
}

Regras:
- O primeiro slide deve ser tipo "capa" com titulo impactante
- Os slides intermediarios devem ser tipo "conteudo"
- O ultimo slide deve ser tipo "cta" com call-to-action
- Cada headline deve ter no maximo 60 caracteres
- Cada body deve ter no maximo 200 caracteres
- O conteudo deve ser relevante, engajante e adequado ao tom de voz
- Use o idioma portugues do Brasil`;
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

    // Verify user
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
    const {
      topic = '',
      content = '',
      audience = '',
      tone_of_voice = '',
      slide_count = 5,
      category = 'educacional',
      provider: providerOverride,
      model: modelOverride,
    } = body;

    const provider = String(
      providerOverride || await getCredential('llm_provider') || 'openai',
    ).toLowerCase();

    const credentialKey = PROVIDER_ENV_KEYS[provider];
    if (!credentialKey) {
      return new Response(JSON.stringify({ error: `Provider nao suportado: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await getCredential(credentialKey) ?? '';
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: `Credencial ${credentialKey} nao configurada. Acesse /settings/credentials.`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const model = String(
      modelOverride || await getCredential('llm_model') || DEFAULT_MODELS[provider],
    );

    const adapterFactory = adapters[provider];
    if (!adapterFactory) {
      return new Response(JSON.stringify({ error: `Provider nao suportado: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adapter = adapterFactory();
    const prompt = buildPrompt({
      content,
      topic,
      toneOfVoice: tone_of_voice,
      audience,
      slideCount: slide_count,
      category,
    });

    const result = await adapter.generateContent(prompt, {
      apiKey,
      model,
      maxTokens: Math.min(slide_count * 400, 4000),
    });

    // Parse JSON from response
    let parsedContent;
    try {
      parsedContent = JSON.parse(result.content);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        parsedContent = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Resposta da IA nao e JSON valido');
      }
    }

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const corsHeaders = await getCorsHeaders(req);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
