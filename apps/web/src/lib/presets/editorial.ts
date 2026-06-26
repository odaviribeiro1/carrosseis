import type { Preset } from './types';

// "Editorial" — revista escura, título serifado. Capa/CTA: imagem full-bleed
// com texto sobreposto. Conteúdo: stack com imagem grande no meio.
export const editorial: Preset = {
  id: 'editorial',
  name: 'Editorial',
  tokens: {
    typography: {
      title: { family: 'Playfair Display', sizePx: 84, weight: 700, lineHeight: 1.02, letterSpacing: -0.5 },
      subtitle: { family: 'Inter', sizePx: 34, weight: 400, lineHeight: 1.3, letterSpacing: 0.2, italic: true },
      body: { family: 'Inter', sizePx: 36, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
      cta: { family: 'Inter', sizePx: 32, weight: 600, lineHeight: 1.2, letterSpacing: 2, transform: 'uppercase' },
    },
    colors: { bg: '#0E0E10', surface: '#1A1A1F', text: '#F5F3EE', textMuted: '#9A958C', accent: '#C8A45C' },
    radius: 6,
    shadow: 'none',
    decoration: 'top-rule',
  },
  layouts: {
    capa: {
      mode: 'full-bleed',
      padPct: 9,
      slot: {
        radius: 0,
        objectFit: 'cover',
        overlay: 'linear-gradient(180deg, rgba(14,14,16,0.15) 35%, rgba(14,14,16,0.96) 100%)',
      },
      blocks: [
        { kind: 'header' },
        { kind: 'spacer', flex: 1 },
        { kind: 'title', gapPct: 2.5 },
        { kind: 'subtitle' },
      ],
    },
    conteudo: {
      mode: 'stack',
      padPct: 9,
      slot: { radius: 6, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 3 },
        { kind: 'title', gapPct: 3 },
        { kind: 'slot', flex: 1, minPct: 24 },
        { kind: 'body', gapPct: 2 },
        { kind: 'footer' },
      ],
    },
    cta: {
      mode: 'full-bleed',
      padPct: 9,
      slot: {
        radius: 0,
        objectFit: 'cover',
        overlay: 'linear-gradient(180deg, rgba(14,14,16,0.25) 25%, rgba(14,14,16,0.95) 100%)',
      },
      blocks: [
        { kind: 'header' },
        { kind: 'spacer', flex: 1 },
        { kind: 'title', gapPct: 2.5 },
        { kind: 'body', gapPct: 3 },
        { kind: 'cta' },
      ],
    },
  },
};
