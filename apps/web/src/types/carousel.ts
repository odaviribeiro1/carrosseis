import { z } from 'zod';

export const slideContentSchema = z.object({
  position: z.number(),
  type: z.enum(['capa', 'conteudo', 'cta', 'transicao']),
  headline: z.string(),
  body: z.string(),
  cta: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export const generatedContentSchema = z.object({
  slides: z.array(slideContentSchema).min(1).max(20),
});

export type SlideContent = z.infer<typeof slideContentSchema>;
export type GeneratedContent = z.infer<typeof generatedContentSchema>;

export const visualSettingsSchema = z.object({
  imageStyle: z.string().min(1, 'Selecione um estilo'),
  colorPalette: z.array(z.string()).length(5),
  aspectRatio: z.string().min(1, 'Selecione uma proporcao'),
  // Conteudo de cada slide: imagens + texto (Nano Banana gera cena rica) ou apenas texto.
  slideMode: z.enum(['image_text', 'text_only']).default('image_text'),
  // Imagens de referencia (data URLs base64) usadas como inspiracao na geracao.
  referenceImages: z.array(z.string()).default([]),
  imagePrompt: z.string().default(''),
  resolution: z.string().min(1, 'Selecione uma resolucao'),
});

export type VisualSettings = z.infer<typeof visualSettingsSchema>;

// ---------------------------------------------------------------------------
// Design spec — coletada por slide para compor um prompt robusto ao Nano Banana.
// 4 dimensoes: tipografia, hierarquia, layout, identidade.
// ---------------------------------------------------------------------------

export const TEXT_ROLES = ['titulo', 'subtitulo', 'corpo', 'destaque'] as const;
export const textRoleSchema = z.enum(TEXT_ROLES);
export type TextRole = z.infer<typeof textRoleSchema>;

export const FONT_FAMILIES = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Roboto',
  'Playfair Display',
  'Lora',
  'Oswald',
  'Bebas Neue',
] as const;

export const typographyStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().int().min(8).max(200),
});
export type TypographyStyle = z.infer<typeof typographyStyleSchema>;

export const designSpecSchema = z.object({
  // Tipografia: fonte + tamanho px por papel de texto.
  typography: z.object({
    titulo: typographyStyleSchema,
    subtitulo: typographyStyleSchema,
    corpo: typographyStyleSchema,
    destaque: typographyStyleSchema,
  }),
  // Hierarquia: papel atribuido a cada bloco de conteudo.
  hierarchy: z.object({
    headline: textRoleSchema,
    body: textRoleSchema,
    cta: textRoleSchema,
  }),
  // Layout: alinhamento + posicao do bloco de texto.
  layout: z.object({
    align: z.enum(['left', 'center', 'right']),
    position: z.enum(['top', 'center', 'bottom']),
  }),
  // Identidade: posicao do logo + watermark (paleta vem dos Aspectos Visuais).
  identity: z.object({
    logoPosition: z.enum(['none', 'top-left', 'top-right', 'bottom-left', 'bottom-right']),
    watermark: z.boolean(),
    watermarkText: z.string().default(''),
  }),
});
export type DesignSpec = z.infer<typeof designSpecSchema>;

// Defaults heuristicos coerentes com a hierarquia, por tipo de slide.
export function defaultDesignSpec(slideType: SlideContent['type']): DesignSpec {
  const isCapa = slideType === 'capa';
  return {
    typography: {
      titulo: { fontFamily: 'Inter', fontSize: isCapa ? 72 : 52 },
      subtitulo: { fontFamily: 'Inter', fontSize: 40 },
      corpo: { fontFamily: 'Inter', fontSize: 32 },
      destaque: { fontFamily: 'Inter', fontSize: 44 },
    },
    hierarchy: { headline: 'titulo', body: 'corpo', cta: 'destaque' },
    layout: { align: 'center', position: isCapa ? 'center' : 'top' },
    identity: { logoPosition: 'none', watermark: false, watermarkText: '' },
  };
}

export const canvasJsonSchema = z.object({
  width: z.number().default(1080),
  height: z.number().default(1350),
  elements: z.array(
    z.object({
      type: z.string(),
      attrs: z.record(z.unknown()),
    })
  ).default([]),
}).passthrough();

export type CanvasJson = z.infer<typeof canvasJsonSchema>;
