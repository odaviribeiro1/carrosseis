import type { Preset, StyleTokens, BrandKitOverrides } from './types';

/**
 * Funde os tokens do preset com os overrides do Brand Kit num único objeto.
 * O preset traz estrutura + estilo default; o Brand Kit personaliza cores de
 * marca (accent/bg/text) e famílias de fonte. Dentro de um carrossel tudo usa
 * os mesmos tokens (coeso); entre clientes os tokens mudam (variedade).
 */
export function mergeTokens(preset: Preset, brand?: BrandKitOverrides | null): StyleTokens {
  const t = preset.tokens;
  if (!brand) return t;

  const headingFamily = brand.fonts?.heading?.family;
  const bodyFamily = brand.fonts?.body?.family;

  return {
    ...t,
    colors: {
      ...t.colors,
      ...(brand.colors?.bg ? { bg: brand.colors.bg } : {}),
      ...(brand.colors?.accent ? { accent: brand.colors.accent } : {}),
      ...(brand.colors?.text ? { text: brand.colors.text } : {}),
    },
    typography: {
      title: { ...t.typography.title, ...(headingFamily ? { family: headingFamily } : {}) },
      subtitle: { ...t.typography.subtitle, ...(headingFamily ? { family: headingFamily } : {}) },
      body: { ...t.typography.body, ...(bodyFamily ? { family: bodyFamily } : {}) },
      cta: { ...t.typography.cta, ...(bodyFamily ? { family: bodyFamily } : {}) },
    },
  };
}

/** Famílias de fonte com `url` no Brand Kit, para carregar via FontFace. */
export function brandFontFaces(brand?: BrandKitOverrides | null): Array<{ family: string; url: string }> {
  const out: Array<{ family: string; url: string }> = [];
  const h = brand?.fonts?.heading;
  const b = brand?.fonts?.body;
  if (h?.family && h.url) out.push({ family: h.family, url: h.url });
  if (b?.family && b.url) out.push({ family: b.family, url: b.url });
  return out;
}
