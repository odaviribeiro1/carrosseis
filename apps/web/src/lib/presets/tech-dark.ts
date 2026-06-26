import type { Preset } from './types';

// "Tech Dark" — quase preto, acento neon, cantos retos, ar de produto/tech.
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
    colors: {
      bg: '#08090C',
      surface: '#11141A',
      text: '#EAF2FF',
      textMuted: '#7C8696',
      accent: '#00E0A4',
    },
    radius: 14,
    shadow: '0 0 40px rgba(0,224,164,0.18)',
    decoration: 'corner-dot',
  },
  layouts: {
    capa: {
      header: { x: 8, y: 7, w: 84, h: 6 },
      title: { x: 8, y: 16, w: 84, h: 32 },
      subtitle: { x: 8, y: 49, w: 84, h: 10 },
      imageSlot: { x: 8, y: 61, w: 84, h: 31, radius: 14, objectFit: 'cover' },
      footer: { x: 8, y: 93, w: 84, h: 5 },
    },
    conteudo: {
      header: { x: 8, y: 7, w: 84, h: 6 },
      title: { x: 8, y: 15, w: 84, h: 18 },
      imageSlot: { x: 8, y: 35, w: 84, h: 32, radius: 14, objectFit: 'cover' },
      body: { x: 8, y: 70, w: 84, h: 22 },
      footer: { x: 8, y: 93, w: 84, h: 5 },
    },
    cta: {
      header: { x: 8, y: 7, w: 84, h: 6 },
      title: { x: 8, y: 22, w: 84, h: 24 },
      body: { x: 8, y: 48, w: 84, h: 16 },
      imageSlot: { x: 8, y: 64, w: 84, h: 18, radius: 14, objectFit: 'cover' },
      cta: { x: 8, y: 84, w: 84, h: 10 },
    },
  },
};
