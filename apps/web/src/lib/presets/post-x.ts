import type { Preset } from './types';

// "Post do X" — social-native, "screenshot de post viral". Branco, leitura
// imediata, acento azul. Assinatura: dot azul + filete fino no topo, ancorando
// a composição. O slot fica abaixo do texto e cresce para preencher o espaço.
export const postX: Preset = {
  id: 'post-x',
  name: 'Post do X',
  tokens: {
    typography: {
      title: { family: 'Inter', sizePx: 72, weight: 800, lineHeight: 1.08, letterSpacing: -1.6 },
      subtitle: { family: 'Inter', sizePx: 38, weight: 500, lineHeight: 1.3, letterSpacing: -0.3 },
      body: { family: 'Inter', sizePx: 38, weight: 400, lineHeight: 1.42, letterSpacing: -0.2 },
      cta: { family: 'Inter', sizePx: 36, weight: 700, lineHeight: 1.1, letterSpacing: -0.2 },
    },
    colors: { bg: '#FFFFFF', surface: '#F4F6F8', text: '#0F1419', textMuted: '#536471', accent: '#1D9BF0' },
    radius: 999,
    shadow: '0 10px 36px rgba(29,155,240,0.18)',
    decoration: 'top-rule',
  },
  layouts: {
    // Capa: título com mais presença (scale) + subtítulo; slot grande embaixo.
    capa: {
      mode: 'stack',
      padPct: 7.5,
      slot: { radius: 36, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 4 },
        { kind: 'title', gapPct: 2.4, scale: 1.16 },
        { kind: 'subtitle', gapPct: 4 },
        { kind: 'slot', flex: 1, minPct: 26 },
        { kind: 'footer' },
      ],
    },
    // Conteúdo: mais texto, título normal, corpo legível; slot preenche o resto.
    conteudo: {
      mode: 'stack',
      padPct: 7.5,
      slot: { radius: 36, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 4 },
        { kind: 'title', gapPct: 3 },
        { kind: 'body', gapPct: 4 },
        { kind: 'slot', flex: 1, minPct: 24 },
        { kind: 'footer' },
      ],
    },
    // CTA: corpo + botão pílula sólido; slot menor de apoio.
    cta: {
      mode: 'stack',
      padPct: 7.5,
      slot: { radius: 36, objectFit: 'cover' },
      blocks: [
        { kind: 'header', gapPct: 4 },
        { kind: 'title', gapPct: 3, scale: 1.08 },
        { kind: 'body', gapPct: 4 },
        { kind: 'slot', flex: 1, minPct: 18 },
        { kind: 'cta', gapPct: 0 },
      ],
    },
  },
};
