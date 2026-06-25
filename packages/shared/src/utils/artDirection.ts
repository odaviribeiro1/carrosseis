/**
 * Utilitarios puros para a Direcao de Arte global do carrossel.
 *
 * Usam apenas Web APIs (crypto.subtle, TextEncoder) — validos tanto no browser
 * quanto no runtime Deno das Edge Functions. A Edge Function importa este
 * arquivo por caminho relativo; o app web importa via `@content-hub/shared`.
 * Fonte unica de verdade para o hash de cache (evita divergencia client/server).
 */

/** Objeto de direcao de arte compartilhado por todos os slides do carrossel. */
export interface ArtDirection {
  /** Paleta exata em hex. */
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  /** Estilo visual geral (ex: "fotografia editorial minimalista"). */
  visualStyle: string;
  /** Tratamento de fundo recorrente (ex: "gradiente suave + grao sutil"). */
  backgroundTreatment: string;
  /** Iluminacao (ex: "luz lateral suave, sombras longas"). */
  lighting: string;
  /** Composicao / grid coeso entre slides. */
  composition: string;
  /** Tipografia coesa entre slides. */
  typography: {
    heading: string;
    body: string;
    treatment: string;
  };
  /** Motifs visuais recorrentes (ex: ["linhas finas", "circulo de destaque"]). */
  motifs: string[];
}

/** Entradas que afetam a direcao de arte — base do hash de cache. */
export interface ArtDirectionInputs {
  /** Aspectos visuais do carrossel (estilo, paleta, proporcao, etc.). */
  visualSettings: unknown;
  /** Fingerprint estavel das imagens de referencia (ex: contagem + tamanhos). */
  referenceImagesKey?: string | null;
}

/**
 * Serializa um valor de forma deterministica: chaves de objeto ordenadas
 * alfabeticamente (arrays preservam a ordem). Garante que o mesmo conteudo
 * — independente da ordem das chaves — produza sempre a mesma string.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Hash estavel (SHA-256 hex) das entradas que afetam a direcao de arte.
 * Mesmas entradas -> mesmo hash (reuso de cache). Mudar paleta/estilo/proporcao
 * ou as imagens de referencia -> hash diferente (invalida e forca recomputo).
 * Editar o conteudo textual NAO afeta o hash (a direcao de arte e a ancora).
 */
export async function computeArtHash(inputs: ArtDirectionInputs): Promise<string> {
  const normalized = stableStringify({
    visualSettings: inputs.visualSettings ?? null,
    referenceImagesKey: inputs.referenceImagesKey ?? null,
  });
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Faz parse estrito de JSON. Tolera fences de markdown (```json ... ```)
 * que alguns LLMs adicionam, mas exige um objeto/array JSON valido.
 * Lanca se nao for parseavel — usado para detectar saida malformada do GPT.
 */
export function parseJsonStrict<T = unknown>(raw: string): T {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new Error('JSON vazio');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      return JSON.parse(match[1].trim()) as T;
    }
    throw new Error('JSON invalido');
  }
}

/**
 * Renderiza a direcao de arte como um bloco de texto para injetar no prompt
 * de cada slide (Nano Banana), garantindo coesao visual entre todos eles.
 */
export function artDirectionToPromptBlock(art: ArtDirection): string {
  const lines = [
    'DIRECAO DE ARTE GLOBAL (identica em TODOS os slides deste carrossel):',
    `- Estilo visual: ${art.visualStyle}`,
    `- Tratamento de fundo: ${art.backgroundTreatment}`,
    `- Iluminacao: ${art.lighting}`,
    `- Composicao: ${art.composition}`,
    `- Tipografia: titulos ${art.typography.heading}; corpo ${art.typography.body}; ${art.typography.treatment}`,
  ];
  if (art.motifs?.length) {
    lines.push(`- Motifs recorrentes: ${art.motifs.join(', ')}`);
  }
  lines.push(
    'Mantenha esta direcao de arte rigorosamente consistente entre os slides (mesma atmosfera, fundo, iluminacao e tipografia).',
  );
  return lines.join('\n');
}
