import type { Preset } from './types';

// "Post do X" — limpo, tipografia forte, cartão claro. Stack: o slot abaixo do
// texto cresce e preenche o espaço restante.
export const postX: Preset = {
  id: 'post-x',
  name: 'Post do X',
  tokens: {
    typography: {
      title: { family: 'Inter', sizePx: 76, weight: 800, lineHeight: 1.05, letterSpacing: -1.5 },
      subtitle: { family: 'Inter', sizePx: 40, weight: 500, lineHeight: 1.2, letterSpacing: -0.3 },
      body: { family: 'Inter', sizePx: 38, weight: 400, lineHeight: 1.4, letterSpacing: -0.2 },
      cta: { family: 'Inter', sizePx: 36, weight: 700, lineHeight: 1.2, letterSpacing: 0 },
    },
    colors: { bg: '#FFFFFF', surface: '#F4F6F8', text: '#0F1419', textMuted: '#536471', accent: '#1D9BF0' },
    radius: 28,
    shadow: '0 8px 40px rgba(15,20,25,0.08)',
    decoration: 'accent-bar',
  },
  layouts: {
    capa: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 28, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 2.5 },
        { kind: 'subtitle', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 22 },
        { kind: 'footer' },
      ],
    },
    conteudo: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 28, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 22 },
        { kind: 'footer' },
      ],
    },
    cta: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 28, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 18 },
        { kind: 'cta', gapPct: 0 },
      ],
    },
  },
};
