import type { Preset } from './types';

// "Post do X" — limpo, tipografia forte, cartão claro, slot de imagem em destaque.
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
    colors: {
      bg: '#FFFFFF',
      surface: '#F4F6F8',
      text: '#0F1419',
      textMuted: '#536471',
      accent: '#1D9BF0',
    },
    radius: 28,
    shadow: '0 8px 40px rgba(15,20,25,0.08)',
    decoration: 'accent-bar',
  },
  layouts: {
    capa: {
      header: { x: 8, y: 7, w: 84, h: 7 },
      title: { x: 8, y: 17, w: 84, h: 34 },
      subtitle: { x: 8, y: 52, w: 84, h: 12 },
      imageSlot: { x: 8, y: 66, w: 84, h: 27, radius: 28, objectFit: 'cover' },
      footer: { x: 8, y: 94, w: 84, h: 4 },
    },
    conteudo: {
      header: { x: 8, y: 7, w: 84, h: 7 },
      title: { x: 8, y: 16, w: 84, h: 16 },
      imageSlot: { x: 8, y: 34, w: 84, h: 34, radius: 28, objectFit: 'cover' },
      body: { x: 8, y: 71, w: 84, h: 22 },
      footer: { x: 8, y: 94, w: 84, h: 4 },
    },
    cta: {
      header: { x: 8, y: 7, w: 84, h: 7 },
      title: { x: 8, y: 20, w: 84, h: 24 },
      body: { x: 8, y: 46, w: 84, h: 16 },
      imageSlot: { x: 8, y: 63, w: 84, h: 20, radius: 28, objectFit: 'cover' },
      cta: { x: 8, y: 85, w: 84, h: 9 },
    },
  },
};
