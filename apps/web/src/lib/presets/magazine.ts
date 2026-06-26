import type { Preset } from './types';

// "Revista" — papel quente, título serifado, ar editorial. Stack em todos os
// tipos; o slot preenche o espaço restante.
export const magazine: Preset = {
  id: 'magazine',
  name: 'Revista',
  tokens: {
    typography: {
      title: { family: 'Playfair Display', sizePx: 92, weight: 800, lineHeight: 1.0, letterSpacing: -0.5 },
      subtitle: { family: 'Inter', sizePx: 32, weight: 400, lineHeight: 1.3, letterSpacing: 1, transform: 'uppercase' },
      body: { family: 'Inter', sizePx: 37, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
      cta: { family: 'Inter', sizePx: 32, weight: 600, lineHeight: 1.2, letterSpacing: 1.5, transform: 'uppercase' },
    },
    colors: { bg: '#F7F2E9', surface: '#EDE6D6', text: '#1C1A17', textMuted: '#7A7264', accent: '#B23A1E' },
    radius: 4,
    shadow: '0 6px 30px rgba(28,26,23,0.10)',
    decoration: 'top-rule',
  },
  layouts: {
    capa: {
      mode: 'stack',
      padPct: 9,
      slot: { radius: 4, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 2 },
        { kind: 'subtitle', gapPct: 2 },
        { kind: 'title', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 26 },
        { kind: 'footer' },
      ],
    },
    conteudo: {
      mode: 'stack',
      padPct: 9,
      slot: { radius: 4, objectFit: 'cover' },
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
      padPct: 9,
      slot: { radius: 4, objectFit: 'cover' },
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
