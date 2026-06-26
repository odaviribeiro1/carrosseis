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

// ---------------------------------------------------------------------------
// Modelo de layout FLEX. Cada slide é uma sequência ordenada de blocos. O bloco
// 'slot' (imagem) usa flex:1 e CONSOME o espaço que o texto deixou — texto curto
// => slot alto (sem faixa branca). O canvas total continua 1080x1350.
// ---------------------------------------------------------------------------

export type SlideMode = 'stack' | 'split' | 'full-bleed';
export type BlockKind = 'header' | 'title' | 'subtitle' | 'body' | 'cta' | 'slot' | 'footer' | 'spacer';
export type ObjectFit = 'cover' | 'contain';

export interface LayoutBlock {
  kind: BlockKind;
  /** Cresce para preencher o espaço livre (tipicamente só o 'slot'). */
  flex?: number;
  /** Altura mínima em % do frame (segurança p/ o slot nunca sumir). */
  minPct?: number;
  /** Margem inferior em % do frame (respiro entre blocos). */
  gapPct?: number;
}

/** Aparência do slot de imagem (tamanho vem do layout flex). */
export interface ImageSlotStyle {
  radius: number; // px
  overlay?: string; // gradiente/cor sobre a imagem (legibilidade no full-bleed)
  objectFit: ObjectFit;
}

export interface SlideLayout {
  mode: SlideMode;
  /** Padding interno do frame em % (todas as bordas) — default 8. */
  padPct?: number;
  /** Blocos na ordem vertical (stack/full-bleed) ou da coluna de texto (split). */
  blocks: LayoutBlock[];
  /** No modo 'split': largura da coluna de imagem em % (resto é texto). */
  splitImagePct?: number;
  /** Aparência do slot. */
  slot: ImageSlotStyle;
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
