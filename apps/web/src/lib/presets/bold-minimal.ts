import type { Preset } from './types';

// "Bold Minimal" — tipografia gigante, off-white. Conteúdo: split (texto |
// imagem lado a lado). Capa/CTA: stack com o slot preenchendo o espaço.
export const boldMinimal: Preset = {
  id: 'bold-minimal',
  name: 'Bold Minimal',
  tokens: {
    typography: {
      title: { family: 'Inter', sizePx: 104, weight: 900, lineHeight: 0.98, letterSpacing: -3 },
      subtitle: { family: 'Inter', sizePx: 36, weight: 500, lineHeight: 1.25, letterSpacing: -0.2 },
      body: { family: 'Inter', sizePx: 40, weight: 500, lineHeight: 1.35, letterSpacing: -0.4 },
      cta: { family: 'Inter', sizePx: 34, weight: 800, lineHeight: 1.1, letterSpacing: 0.5, transform: 'uppercase' },
    },
    colors: { bg: '#F2F0EB', surface: '#E7E4DC', text: '#111111', textMuted: '#6B6B6B', accent: '#FF4D2E' },
    radius: 0,
    shadow: 'none',
    decoration: 'accent-bar',
  },
  layouts: {
    capa: {
      mode: 'stack',
      padPct: 7,
      slot: { radius: 0, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 22 },
        { kind: 'subtitle', gapPct: 0 },
      ],
    },
    conteudo: {
      mode: 'split',
      padPct: 7,
      splitImagePct: 40,
      slot: { radius: 0, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 0 },
        { kind: 'spacer', flex: 1 },
        { kind: 'footer' },
      ],
    },
    cta: {
      mode: 'stack',
      padPct: 7,
      slot: { radius: 0, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 3 },
        { kind: 'cta', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 14 },
      ],
    },
  },
};
