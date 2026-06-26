import type { Preset } from './types';

// "Tech Dark" — quase preto, acento neon, ar de produto/tech. Stack; o slot
// preenche o espaço restante.
export const techDark: Preset = {
  id: 'tech-dark',
  name: 'Tech Dark',
  tokens: {
    typography: {
      title: { family: 'Inter', sizePx: 80, weight: 800, lineHeight: 1.04, letterSpacing: -1.5 },
      subtitle: { family: 'Inter', sizePx: 34, weight: 500, lineHeight: 1.25, letterSpacing: 0 },
      body: { family: 'Inter', sizePx: 37, weight: 400, lineHeight: 1.45, letterSpacing: 0 },
      cta: { family: 'Inter', sizePx: 33, weight: 700, lineHeight: 1.15, letterSpacing: 1, transform: 'uppercase' },
    },
    colors: { bg: '#08090C', surface: '#11141A', text: '#EAF2FF', textMuted: '#7C8696', accent: '#00E0A4' },
    radius: 14,
    shadow: '0 0 40px rgba(0,224,164,0.18)',
    decoration: 'corner-dot',
  },
  layouts: {
    capa: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 14, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 2.5 },
        { kind: 'subtitle', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 24 },
        { kind: 'footer' },
      ],
    },
    conteudo: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 14, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 22 },
        { kind: 'body', gapPct: 2 },
        { kind: 'footer' },
      ],
    },
    cta: {
      mode: 'stack',
      padPct: 8,
      slot: { radius: 14, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 16 },
        { kind: 'cta', gapPct: 0 },
      ],
    },
  },
};
