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

function buildTopicPrompt(content: string): string {
  return `Voce e um especialista em conteudo para redes sociais.
Com base no conteudo abaixo, gere um tema/titulo curto, claro e atrativo para um carrossel.

<user_content>
${content}
</user_content>

Regras:
- Responda APENAS com o tema, em uma unica linha
- Maximo 60 caracteres
- Sem aspas, sem prefixos como "Tema:", sem texto adicional
- Use o idioma portugues do Brasil`;
}

function buildPrompt(params: {
  content: string;
  topic: string;
  toneOfVoice: string;
  audience: string;
  slideCount: number;
  category: string;
  angle: string;
  maxWords: number;
  keepOriginalTone: boolean;
  socialFormat: boolean;
}): string {
  const toneLine = params.keepOriginalTone
    ? 'Tom de voz: mantenha FIELMENTE o tom de voz original do conteudo fornecido.'
    : `Tom de voz: ${params.toneOfVoice || 'profissional e acessivel'}`;
  const angleLine = params.angle?.trim()
    ? `Angulo/foco da adaptacao: ${params.angle.trim()}`
    : '';
  // Presets Twitter (Post do X): o carrossel e UM post unico, com leitura linear,
  // escrito corrido e depois fatiado em slides — nao N blocos autonomos sobre o tema.
  if (params.socialFormat) {
    return `Voce e um criador de conteudo viral no X (Twitter), especialista em carrosseis que se leem como UM POST UNICO dividido em telas.

Categoria do template: ${params.category}
Publico-alvo: ${params.audience || 'geral'}
${toneLine}
${angleLine}

<user_content>
${params.content || params.topic}
</user_content>

PENSE EM 2 ETAPAS:
1) Primeiro, escreva (mentalmente, sem retornar) UM UNICO post corrido sobre o tema, como um criador escreveria no X: comeco-meio-fim, um raciocinio que progride e prende a atencao ate o final.
2) Depois, FATIE esse post em ${params.slideCount} partes nos pontos naturais de respiro (fim de um raciocinio, antes de uma virada, antes de uma pergunta). Cada parte vira um slide. NUNCA gere ${params.slideCount} blocos isolados sobre o mesmo tema.

COMO ESCREVER (estilo post unico fatiado):
- Slide 1 (type "capa"): uma ABERTURA DE GANCHO — frase curta, provocativa, que para o scroll (ex.: "Zuckerberg quer te fazer PERDER dinheiro com apostas."). Coloque-a em "headline". O "body" do slide 1 fica VAZIO ("") ou com no maximo UMA frase curta de continuacao.
- Slides 2 a ${params.slideCount}: SEM titulo/manchete. "headline" VAZIO (""). O texto vai TODO no "body" e CONTINUA o slide anterior — pode ate completar uma frase comecada. Proibido abrir o slide com um mini-titulo-resumo.
- CONTINUIDADE (o que cria a leitura linear): cada slide (menos o 1o) conecta ao anterior — completa uma ideia iniciada ou responde a um gancho deixado. Cada slide (menos o ultimo) idealmente deixa um fio solto / cliffhanger que puxa pro proximo (ex.: terminar com uma pergunta que o slide seguinte responde). O conjunto deve poder ser lido DE CIMA A BAIXO como um texto so.
- ENFASE: use **negrito** (markdown) em palavras/expressoes-chave DENTRO das frases do body (ex.: "**Stories do Snapchat**", "**aposta dinheiro**") — de 1 a 3 por slide, distribuido no fluxo. NUNCA crie um titulo/manchete em negrito no topo dos slides. Use SOMENTE **assim**; nada de #, *, _ ou listas.
- O ultimo slide fecha o raciocinio; use "cta" apenas se um convite leve fizer sentido.
- LIMITE RIGIDO: o "body" de CADA slide deve ter no MAXIMO ${params.maxWords} palavras. Se uma parte passar do limite, corte num ponto de respiro anterior — sem espremer e sem estourar.
- Idioma: portugues do Brasil.

Retorne APENAS um JSON valido, sem texto adicional:
{
  "slides": [
    { "position": 1, "type": "capa", "headline": "<gancho de abertura forte>", "body": "", "cta": "", "notes": "" },
    { "position": 2, "type": "conteudo", "headline": "", "body": "<continuacao em fluxo, com **enfase** em palavras-chave>", "cta": "", "notes": "" }
  ]
}`;
  }

  return `Voce e um especialista em criacao de carrosseis visuais.
Gere o conteudo textual para um carrossel com ${params.slideCount} slides.

Categoria do template: ${params.category}
Publico-alvo: ${params.audience || 'geral'}
${toneLine}
${angleLine}

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
- CRITICO: o corpo (body) de CADA slide deve ter no MAXIMO ${params.maxWords} palavras. Se o conteudo exceder, DISTRIBUA em mais slides em vez de espremer texto. Nunca ultrapasse ${params.maxWords} palavras no corpo de um slide.
- O conteudo deve ser relevante, engajante e adequado ao tom de voz
- Use o idioma portugues do Brasil`;
}

// Prompt para encurtar corpos de slides que estouraram o teto de palavras.
function buildShortenPrompt(slides: Array<{ position: number; body: string }>, maxWords: number): string {
  return `Reescreva o corpo de cada slide abaixo para ter NO MAXIMO ${maxWords} palavras,
preservando o sentido e o idioma (portugues do Brasil). Nao adicione comentarios.

Slides:
${JSON.stringify(slides)}

Retorne APENAS um JSON valido: { "slides": [ { "position": <num>, "body": "<texto curto>" } ] }`;
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
      mode = 'slides',
      topic = '',
      content = '',
      angle = '',
      audience = '',
      tone_of_voice = '',
      keep_original_tone = false,
      slide_count = 5,
      max_words = 35,
      category = 'educacional',
      social_format = false,
      slides: slidesToShorten = [],
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

    // Modo 'topic': sugere um tema curto a partir do conteudo e retorna { topic }.
    if (mode === 'topic') {
      const topicResult = await adapter.generateContent(buildTopicPrompt(content || topic), {
        apiKey,
        model,
        maxTokens: 60,
      });
      const suggestedTopic = topicResult.content
        .trim()
        .replace(/^["']|["']$/g, '')
        .split('\n')[0]
        .slice(0, 80);
      return new Response(JSON.stringify({ topic: suggestedTopic }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Modo 'shorten': reescreve corpos que estouraram o teto de palavras.
    if (mode === 'shorten') {
      const shortenResult = await adapter.generateContent(
        buildShortenPrompt(slidesToShorten, Number(max_words) || 35),
        { apiKey, model, maxTokens: 2000 },
      );
      let parsed;
      try {
        parsed = JSON.parse(shortenResult.content);
      } catch {
        const m = shortenResult.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        parsed = m?.[1] ? JSON.parse(m[1]) : { slides: [] };
      }
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt({
      content,
      topic,
      toneOfVoice: tone_of_voice,
      audience,
      slideCount: slide_count,
      category,
      angle,
      maxWords: Number(max_words) || 35,
      keepOriginalTone: Boolean(keep_original_tone),
      socialFormat: Boolean(social_format),
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
