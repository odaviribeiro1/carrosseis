// Mede o slot de imagem renderizado (1:1) e calcula o tamanho ideal para a
// geração: gpt-image-2 aceita W×H arbitrário, múltiplos de 16, ratio entre 1:3
// e 3:1. Gerar na proporção do slot => object-fit: cover corta quase nada.

const MIN_RATIO = 1 / 3; // mais "retrato" permitido (w/h)
const MAX_RATIO = 3; // mais "paisagem" permitido
const LONG_EDGE = 1280; // aresta maior alvo
const MIN_EDGE = 512;
const MAX_EDGE = 1536;

const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface SlotSize {
  /** "WxH" para o gpt-image-2 (múltiplos de 16). */
  size: string;
  /** "W:H" simplificado para mapear no Nano Banana (Gemini). */
  aspect: string;
  ratio: number; // w/h
}

/** Calcula o tamanho a partir de uma razão w/h (clampada). */
export function sizeFromRatio(ratioWH: number): SlotSize {
  const ratio = clamp(ratioWH || 0.8, MIN_RATIO, MAX_RATIO);
  let w: number;
  let h: number;
  if (ratio >= 1) {
    // paisagem: largura é a aresta maior
    w = LONG_EDGE;
    h = round16(LONG_EDGE / ratio);
  } else {
    // retrato: altura é a aresta maior
    h = LONG_EDGE;
    w = round16(LONG_EDGE * ratio);
  }
  w = clamp(round16(w), MIN_EDGE, MAX_EDGE);
  h = clamp(round16(h), MIN_EDGE, MAX_EDGE);
  return { size: `${w}x${h}`, aspect: aspectLabel(w, h), ratio: w / h };
}

/** Lê o [data-slot] dentro do nó (renderizado 1:1) e devolve o tamanho. */
export function measureSlotSize(node: HTMLElement | null | undefined): SlotSize {
  const fallback = sizeFromRatio(0.8); // 4:5 padrão
  if (!node) return fallback;
  const slot = node.querySelector('[data-slot]') as HTMLElement | null;
  if (!slot) return fallback;
  const r = slot.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return fallback;
  return sizeFromRatio(r.width / r.height);
}

/** Aproxima para um dos aspect ratios que o Gemini aceita. */
function aspectLabel(w: number, h: number): string {
  const candidates: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
  ];
  const r = w / h;
  let best = candidates[0]!;
  let bestDiff = Infinity;
  for (const cand of candidates) {
    const diff = Math.abs(cand[1] - r);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return best[0];
}
