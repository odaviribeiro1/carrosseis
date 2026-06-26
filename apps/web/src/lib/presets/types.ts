// Sistema de presets curados. Um preset define a ESTRUTURA (zonas) e a PELE
// (tipografia/cores/decoração) de cada slide — tudo determinístico. A IA só
// preenche o slot de imagem. Variedade entre clientes vem de preset + Brand Kit.

export type SlideType = 'capa' | 'conteudo' | 'cta';
export type TextRole = 'title' | 'subtitle' | 'body' | 'cta';

/** Estilo tipográfico de um papel de texto. */
export interface TypeStyle {
  family: string;
  sizePx: number;
  weight: number;
  lineHeight: number;
  letterSpacing: number; // em px
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  italic?: boolean;
}

/** Paleta do preset. accent/bg/text podem ser sobrescritos pelo Brand Kit. */
export interface ColorTokens {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
}

export interface StyleTokens {
  typography: Record<TextRole, TypeStyle>;
  colors: ColorTokens;
  radius: number; // px, cantos de cartões/superfícies
  shadow: string; // CSS box-shadow ('none' permitido)
  /** Decoração opcional do preset (barra de destaque, etc.). */
  decoration?: 'none' | 'accent-bar' | 'top-rule' | 'corner-dot';
}

/** Zona retangular em % de 1080x1350 (origem topo-esquerda). */
export interface LayoutZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ObjectFit = 'cover' | 'contain';

export interface ImageSlot extends LayoutZone {
  radius: number; // px
  overlay?: string; // cor rgba sobre a imagem (ex.: escurecer p/ legibilidade)
  objectFit: ObjectFit;
}

/** Zonas de um tipo de slide. title sempre presente; demais opcionais. */
export interface SlideLayout {
  header?: LayoutZone;
  title: LayoutZone;
  subtitle?: LayoutZone;
  body?: LayoutZone;
  cta?: LayoutZone;
  imageSlot?: ImageSlot;
  footer?: LayoutZone;
}

export interface Preset {
  id: string;
  name: string;
  tokens: StyleTokens;
  layouts: Record<SlideType, SlideLayout>;
}

/** Conteúdo textual de um slide (renderizado por código). */
export interface SlideText {
  title: string;
  body: string;
  cta: string;
}

/** Overrides vindos do Brand Kit (todos opcionais). */
export interface BrandKitOverrides {
  colors?: Partial<Pick<ColorTokens, 'bg' | 'accent' | 'text'>>;
  fonts?: { heading?: { family?: string; url?: string }; body?: { family?: string; url?: string } };
  logoUrl?: string;
}
