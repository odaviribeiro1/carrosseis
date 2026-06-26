import type { Preset } from './types';

// "Revista" — papel quente, título serifado grande, regra superior, ar editorial.
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
    colors: {
      bg: '#F7F2E9',
      surface: '#EDE6D6',
      text: '#1C1A17',
      textMuted: '#7A7264',
      accent: '#B23A1E',
    },
    radius: 4,
    shadow: '0 6px 30px rgba(28,26,23,0.10)',
    decoration: 'top-rule',
  },
  layouts: {
    capa: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      subtitle: { x: 9, y: 15, w: 82, h: 5 },
      title: { x: 9, y: 21, w: 82, h: 28 },
      imageSlot: { x: 9, y: 51, w: 82, h: 42, radius: 4, objectFit: 'cover' },
      footer: { x: 9, y: 94, w: 82, h: 4 },
    },
    conteudo: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      title: { x: 9, y: 15, w: 82, h: 20 },
      imageSlot: { x: 9, y: 37, w: 82, h: 28, radius: 4, objectFit: 'cover' },
      body: { x: 9, y: 68, w: 82, h: 24 },
      footer: { x: 9, y: 94, w: 82, h: 4 },
    },
    cta: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      title: { x: 9, y: 24, w: 82, h: 26 },
      body: { x: 9, y: 52, w: 82, h: 16 },
      cta: { x: 9, y: 72, w: 82, h: 9 },
      imageSlot: { x: 9, y: 84, w: 82, h: 11, radius: 4, objectFit: 'cover' },
    },
  },
};
