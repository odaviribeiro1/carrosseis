import type { Preset } from './types';

// "Editorial" — revista escura, título serifado, imagem grande com overlay,
// numeração/etiqueta no header. Tom sofisticado.
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
    colors: {
      bg: '#0E0E10',
      surface: '#1A1A1F',
      text: '#F5F3EE',
      textMuted: '#9A958C',
      accent: '#C8A45C',
    },
    radius: 6,
    shadow: 'none',
    decoration: 'top-rule',
  },
  layouts: {
    capa: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      imageSlot: { x: 0, y: 0, w: 100, h: 60, radius: 0, overlay: 'linear-gradient(180deg, rgba(14,14,16,0.1) 40%, rgba(14,14,16,0.95) 100%)', objectFit: 'cover' },
      title: { x: 9, y: 60, w: 82, h: 26 },
      subtitle: { x: 9, y: 87, w: 82, h: 8 },
    },
    conteudo: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      title: { x: 9, y: 15, w: 82, h: 18 },
      imageSlot: { x: 9, y: 35, w: 82, h: 30, radius: 6, objectFit: 'cover' },
      body: { x: 9, y: 68, w: 82, h: 24 },
      footer: { x: 9, y: 94, w: 82, h: 4 },
    },
    cta: {
      header: { x: 9, y: 8, w: 82, h: 5 },
      imageSlot: { x: 0, y: 0, w: 100, h: 45, radius: 0, overlay: 'linear-gradient(180deg, rgba(14,14,16,0.2) 30%, rgba(14,14,16,0.92) 100%)', objectFit: 'cover' },
      title: { x: 9, y: 48, w: 82, h: 22 },
      body: { x: 9, y: 71, w: 82, h: 14 },
      cta: { x: 9, y: 87, w: 82, h: 7 },
    },
  },
};
