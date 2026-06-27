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

// Baseline anti-IA injetado em TODOS os tons: tira o "cheiro de IA" do texto.
const BASELINE_ANTI_IA = `Você escreve como um criador de conteúdo brasileiro experiente, não como uma IA. Siga estas regras inegociáveis:

PROIBIDO TERMINANTEMENTE:
- Terminar slides com pergunta retórica. Nada de "Será que...?", "Você está pronto para...?", "Que tal...?", "E você, o que acha?". No carrossel inteiro, no MÁXIMO uma pergunta, e só se for genuína e específica.
- Vocabulário de IA: "game-changer", "transformador", "revolucionar", "revolução", "jornada", "ebulição", "divisor de águas", "cenário", "panorama", "no mundo de", "universo de", "em constante evolução", "promissor", "inovador" (como adjetivo vazio), "potencial", "impactar".
- Hype promocional vazio: "o futuro é promissor", "as possibilidades são infinitas", "prepare-se", "fique ligado", "isso muda tudo", "só o começo".
- Frases de preenchimento: "a expectativa só aumenta", "vamos acompanhar de perto", "só o tempo dirá", "as cartas estão na mesa", "fica a reflexão".
- Frases-fórmula de profundidade falsa terminadas em -ndo: "impulsionando o mercado", "revolucionando o setor", "destacando a importância", "moldando o futuro".
- Paralelismo negativo: "não é só X, é Y".
- Regra de três decorativa (listas de 3 adjetivos/itens só pelo ritmo).

OBRIGATÓRIO:
- Concretude acima de tudo: números, nomes próprios, datas, fatos específicos. Se não tem fato, não enche com adjetivo.
- Variar o ritmo: misture frases curtas e secas com frases mais longas. Nunca todos os slides com a mesma cadência.
- Cada slide entrega informação NOVA. Zero repetição de ideia entre slides.
- Português brasileiro natural, como se fala/escreve de verdade — não traduzido, não corporativo.
- Se faltar dado real sobre o tema, prefira ser específico sobre o que se sabe a inventar hype.`;

// Bloco do tom selecionado (1 dos 4), somado ao baseline.
const TONE_BLOCKS: Record<string, string> = {
  informativo: `TOM: INFORMATIVO. Você explica um assunto de forma direta, densa e factual, como alguém que entende do tema explicando com clareza para um colega esperto.

VOZ:
- Frases declarativas, diretas. Vai ao ponto.
- Cada slide = um fato, dado ou ideia concreta que avança o entendimento.
- Zero opinião, zero hype, zero suspense artificial.
- Prioriza: o quê, quanto, quem, quando. Números e nomes em primeiro plano.

ESTRUTURA:
- Capa: a informação mais importante ou surpreendente, dita de forma seca e direta (o gancho é o próprio fato, não uma provocação).
- Demais slides: desenvolvem o assunto em blocos de informação, do mais relevante ao detalhe.
- Fechamento: o estado atual dos fatos, sem CTA forçado nem pergunta.

EVITE: tom de palestra motivacional, perguntas ao leitor, adjetivos grandiloquentes.

EXEMPLO (bom): "A Meta está desenvolvendo um app de mercados de previsão. O projeto se chama Arena internamente e é tocado por uma equipe pequena. Na primeira versão não envolve dinheiro real — funciona por pontos, como um jogo."`,

  storytelling: `TOM: STORYTELLING. Você conta o assunto como uma história, com tensão e progressão, de um jeito que prende a leitura do início ao fim.

VOZ:
- Tem arco: situação → virada/conflito → desfecho.
- Pode ter ponto de vista e cor ("o detalhe curioso é que...").
- Usa cena e concretude, não abstração. Mostra, não resume.
- O gancho da capa cria tensão real; cada slide a desenvolve ou vira a chave.

ESTRUTURA:
- Capa: abertura que cria tensão ou curiosidade genuína a partir de um fato concreto.
- Meio: desenvolve a história — o que estava em jogo, o que mudou, qual a complicação.
- Fim: o desfecho ou o ponto de virada atual. Sem moral da história piegas, sem "jornada".

EVITE: clichês narrativos ("era uma vez", "imagine só", "prepare-se"), final motivacional, a palavra "jornada".

EXEMPLO (bom): "Por anos a Meta copiou os concorrentes: pegou os Stories do Snapchat, os Reels do TikTok. Agora ela mira um alvo diferente — e mais arriscado. Internamente, o projeto tem nome: Arena."`,

  educativo: `TOM: EDUCATIVO. Você ensina o assunto a quem não conhece, construindo o entendimento passo a passo, como um bom professor — claro e paciente, sem ser condescendente.

VOZ:
- Assume que o leitor não sabe. Define os termos quando aparecem.
- Constrói incrementalmente: cada slide apoia no anterior.
- Usa analogias concretas e exemplos do cotidiano para explicar o abstrato.
- Tom claro e calmo, foco em "você vai entender isso".

ESTRUTURA:
- Capa: apresenta o conceito ou a pergunta-chave que o carrossel vai responder (de forma concreta, não retórica).
- Meio: explica em etapas — primeiro o conceito base, depois as camadas, com exemplos.
- Fim: consolida o que foi aprendido com um exemplo prático ou um resumo claro (sem pergunta retórica).

EVITE: jargão sem explicação, tom condescendente ("é simples!", "óbvio"), encher de pergunta.

EXEMPLO (bom): "Mercado de previsão é uma plataforma onde se aposta dinheiro no resultado de um evento futuro. Diferente da aposta esportiva, dá pra apostar em quase tudo: se o Fed vai cortar juros, quem vence uma eleição. Quem acerta, ganha. A plataforma fica com uma taxa."`,

  noticiario: `TOM: NOTICIÁRIO. Você escreve como um repórter: objetivo, sóbrio, factual, no estilo jornalístico de pirâmide invertida (o mais importante primeiro).

VOZ:
- Lead na capa: o fato central, respondendo o quê/quem de cara.
- Atribui fontes quando há ("segundo o New York Times", "de acordo com analistas").
- Factual e neutro. Sem opinião, sem hype, sem adjetivo de torcida.
- Datas, números e nomes próprios em destaque.

ESTRUTURA:
- Capa: lead jornalístico — a notícia em uma ou duas frases.
- Meio: desdobra os fatos em ordem de importância — contexto, dados, fontes.
- Fim: o ponto em aberto / próximos passos factuais (o que ainda não se sabe), sem especulação nem CTA.

EVITE: linguagem de marketing, exclamação, opinião do autor, suspense artificial.

EXEMPLO (bom): "A Meta desenvolve um aplicativo de mercados de previsão, segundo o New York Times. O projeto, chamado internamente de Arena, é conduzido por uma equipe reduzida. A empresa não confirmou oficialmente o lançamento nem uma data."`,
};

function buildVoiceBlock(tone: string): string {
  return `${BASELINE_ANTI_IA}\n\n${TONE_BLOCKS[tone] ?? TONE_BLOCKS.informativo}`;
}

function buildPrompt(params: {
  content: string;
  topic: string;
  tone: string;
  audience: string;
  slideCount: number;
  category: string;
  angle: string;
  maxWords: number;
  socialFormat: boolean;
}): string {
  const voiceBlock = buildVoiceBlock(params.tone);
  const angleLine = params.angle?.trim()
    ? `Angulo/foco da adaptacao: ${params.angle.trim()}`
    : '';
  // Presets Twitter (Post do X): o carrossel e UM post unico, com leitura linear,
  // escrito corrido e depois fatiado em slides — nao N blocos autonomos sobre o tema.
  if (params.socialFormat) {
    return `${voiceBlock}

---

Voce e um criador de conteudo viral no X (Twitter), especialista em carrosseis que se leem como UM POST UNICO dividido em telas. Aplique o tom acima ao REGISTRO do texto; a estrutura de continuidade (roteiro fatiado) e definida abaixo. Os dois se somam.

Categoria do template: ${params.category}
Publico-alvo: ${params.audience || 'geral'}
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

  return `${voiceBlock}

---

Voce e um especialista em criacao de carrosseis visuais. Aplique o tom acima ao texto.
Gere o conteudo textual para um carrossel com ${params.slideCount} slides.

Categoria do template: ${params.category}
Publico-alvo: ${params.audience || 'geral'}
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

// Prompt para a legenda (caption) do post no Instagram a partir dos slides.
// Reusa o baseline anti-IA + o tom do carrossel.
function buildCaptionPrompt(params: {
  slides: Array<{ headline?: string; body?: string }>;
  tone: string;
  audience: string;
}): string {
  const slidesText = params.slides
    .map((s, i) => `Slide ${i + 1}: ${[s.headline, s.body].filter(Boolean).join(' — ')}`)
    .join('\n');
  return `${buildVoiceBlock(params.tone)}

---

Escreva a LEGENDA de um post de carrossel no Instagram a partir do conteudo dos slides abaixo.
Publico-alvo: ${params.audience || 'geral'}.

<slides>
${slidesText}
</slides>

Regras da legenda:
- Primeira linha: um GANCHO curto e forte (para o scroll).
- Corpo conciso (2 a 5 frases) que dao vontade de abrir o carrossel — sem repetir literalmente os slides.
- Uma CTA leve no final (ex.: salve, comente, compartilhe) — natural, sem hype.
- Termine com 5 a 12 HASHTAGS relevantes ao tema, em uma linha.
- Portugues do Brasil, no tom definido acima. Maximo ~2000 caracteres.

Retorne APENAS um JSON valido: { "caption": "<legenda completa com hashtags ao final>" }`;
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
      tone = 'informativo',
      slide_count = 5,
      max_words = 35,
      category = 'educacional',
      social_format = false,
      slides: slidesToShorten = [],
      caption_slides = [],
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

    // Modo 'caption': sugere a legenda do post no Instagram a partir dos slides.
    if (mode === 'caption') {
      const captionResult = await adapter.generateContent(
        buildCaptionPrompt({
          slides: Array.isArray(caption_slides) ? caption_slides : [],
          tone: String(tone || 'informativo'),
          audience,
        }),
        { apiKey, model, maxTokens: 700 },
      );
      let caption = '';
      try {
        caption = String(JSON.parse(captionResult.content)?.caption ?? '');
      } catch {
        const m = captionResult.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        caption = m?.[1] ? String(JSON.parse(m[1])?.caption ?? '') : captionResult.content.trim();
      }
      return new Response(JSON.stringify({ caption }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt({
      content,
      topic,
      tone: String(tone || 'informativo'),
      audience,
      slideCount: slide_count,
      category,
      angle,
      maxWords: Number(max_words) || 35,
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
