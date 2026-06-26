import type { Preset } from './types';

// "Bold Minimal" — tipografia gigante, fundo off-white, bloco de acento.
// Slot de imagem pequeno/secundario; o texto domina.
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
    colors: {
      bg: '#F2F0EB',
      surface: '#E7E4DC',
      text: '#111111',
      textMuted: '#6B6B6B',
      accent: '#FF4D2E',
    },
    radius: 0,
    shadow: 'none',
    decoration: 'accent-bar',
  },
  layouts: {
    capa: {
      header: { x: 7, y: 7, w: 86, h: 6 },
      title: { x: 7, y: 16, w: 86, h: 44 },
      imageSlot: { x: 7, y: 62, w: 86, h: 24, radius: 0, objectFit: 'cover' },
      subtitle: { x: 7, y: 88, w: 86, h: 7 },
    },
    conteudo: {
      header: { x: 7, y: 7, w: 86, h: 6 },
      title: { x: 7, y: 15, w: 86, h: 30 },
      imageSlot: { x: 55, y: 47, w: 38, h: 30, radius: 0, objectFit: 'cover' },
      body: { x: 7, y: 47, w: 44, h: 40 },
      footer: { x: 7, y: 93, w: 86, h: 5 },
    },
    cta: {
      header: { x: 7, y: 7, w: 86, h: 6 },
      title: { x: 7, y: 22, w: 86, h: 34 },
      body: { x: 7, y: 58, w: 86, h: 14 },
      cta: { x: 7, y: 76, w: 86, h: 10 },
      imageSlot: { x: 7, y: 88, w: 86, h: 8, radius: 0, objectFit: 'cover' },
    },
  },
};
