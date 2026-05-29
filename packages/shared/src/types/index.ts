export type UserRole = 'owner' | 'member';

export interface BrandKit {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: { family: string; url: string };
    body: { family: string; url: string };
  };
  logo_url: string | null;
  avatar_url: string | null;
  tone_of_voice: string | null;
  is_default: boolean;
}

export type CarouselStatus = 'draft' | 'ready';

export interface Carousel {
  id: string;
  created_by: string;
  title: string;
  status: CarouselStatus;
  brand_kit_id: string | null;
  template_id: string | null;
  slide_count: number;
  ai_input: {
    type: 'url' | 'text' | 'video';
    content: string;
    topic?: string;
    audience?: string;
    tone?: string;
  } | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CarouselVisualSettings {
  id: string;
  carousel_id: string;
  image_style: string;
  color_palette: string[];
  aspect_ratio: string;
  reference_image_url: string | null;
  image_prompt: string;
  resolution: string;
  created_at: string;
  updated_at: string;
}

export interface CarouselSlide {
  id: string;
  carousel_id: string;
  position: number;
  canvas_json: Record<string, unknown>;
  thumbnail_url: string | null;
  export_url: string | null;
}

export type TemplateCategory =
  | 'educacional'
  | 'vendas'
  | 'storytelling'
  | 'antes_depois'
  | 'lista'
  | 'cta';

export type SlidePosition = 'capa' | 'conteudo' | 'cta' | 'transicao';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  is_system: boolean;
  thumbnail_url: string | null;
  slide_count_default: number;
  created_at: string;
}

export interface TemplateSlideVariant {
  id: string;
  template_id: string;
  slide_position: SlidePosition;
  variant_name: string;
  layout_json: Record<string, unknown>;
  thumbnail_url: string | null;
}
