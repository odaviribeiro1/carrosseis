import type { Preset, ColorTokens, SlideLayout } from './types';

// "Post do X" — social-native, "screenshot de post". Header com avatar/nome/@/selo.
// O slot fica abaixo do texto e cresce para preencher o espaço.

const slot = { radius: 36, objectFit: 'cover' as const };

const layouts: Record<'capa' | 'conteudo' | 'cta', SlideLayout> = {
  // Como num post real do X: título + corpo fundidos num único bloco corrido (mesmo
  // tamanho, abertura em negrito). O bloco 'post' substitui title+subtitle/body.
  capa: {
    mode: 'stack',
    padPct: 7.5,
    slot,
    blocks: [
      { kind: 'header', variant: 'social', gapPct: 2.5 },
      { kind: 'post', gapPct: 5 },
      { kind: 'slot', flex: 1, minPct: 26 },
      { kind: 'footer' },
    ],
  },
  conteudo: {
    mode: 'stack',
    padPct: 7.5,
    slot,
    blocks: [
      { kind: 'header', variant: 'social', gapPct: 2.5 },
      { kind: 'post', gapPct: 5 },
      { kind: 'slot', flex: 1, minPct: 24 },
      { kind: 'footer' },
    ],
  },
  // CTA: bloco de texto fundido + botão pílula sólido; slot menor de apoio.
  cta: {
    mode: 'stack',
    padPct: 7.5,
    slot,
    blocks: [
      { kind: 'header', variant: 'social', gapPct: 2.5 },
      { kind: 'post', gapPct: 5 },
      { kind: 'slot', flex: 1, minPct: 18 },
      { kind: 'cta', gapPct: 0 },
    ],
  },
};

// Fábrica para as variantes clara/escura (mesma estrutura, cores diferentes).
export function makePostX(id: string, name: string, colors: ColorTokens, shadow: string): Preset {
  return {
    id,
    name,
    tokens: {
      typography: {
        // O bloco 'post' usa o token `body` como tamanho ÚNICO (título + corpo no
        // mesmo tamanho); a abertura sai em negrito. title/subtitle ficam definidos
        // por completude do tipo, mas o preset social não os usa mais.
        title: { family: 'Inter', sizePx: 44, weight: 800, lineHeight: 1.2, letterSpacing: -0.6 },
        subtitle: { family: 'Inter', sizePx: 44, weight: 500, lineHeight: 1.4, letterSpacing: -0.2 },
        body: { family: 'Inter', sizePx: 44, weight: 400, lineHeight: 1.4, letterSpacing: -0.2 },
        cta: { family: 'Inter', sizePx: 36, weight: 700, lineHeight: 1.1, letterSpacing: -0.2 },
      },
      colors,
      radius: 999,
      shadow,
      decoration: 'none',
    },
    layouts,
  };
}

export const postX = makePostX(
  'post-x',
  'Post do X',
  { bg: '#FFFFFF', surface: '#EFF3F4', text: '#0F1419', textMuted: '#536471', accent: '#1D9BF0' },
  '0 10px 36px rgba(29,155,240,0.18)',
);
