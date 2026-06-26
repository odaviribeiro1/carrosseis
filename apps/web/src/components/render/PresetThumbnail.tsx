import type { Preset } from '@/lib/presets/types';
import { SlideRenderer, FRAME_W, FRAME_H } from './SlideRenderer';

interface PresetThumbnailProps {
  preset: Preset;
  /** Largura do thumbnail em px (altura segue 4:5). */
  width?: number;
}

const SAMPLE = {
  title: 'Seu título aqui em destaque',
  body: 'Um trecho de exemplo mostrando como o corpo do texto aparece neste preset.',
  cta: 'Saiba mais',
};

/**
 * Thumbnail de preset = um SlideRenderer (slide tipo capa) ao vivo, escalado,
 * com conteúdo de exemplo. Evita depender de assets PNG estáticos e mostra
 * exatamente o estilo real do preset.
 */
export function PresetThumbnail({ preset, width = 200 }: PresetThumbnailProps) {
  const scale = width / FRAME_W;
  return (
    <div style={{ width, height: FRAME_H * scale, overflow: 'hidden', borderRadius: 8 }}>
      <SlideRenderer
        preset={preset}
        slideType="capa"
        tokens={preset.tokens}
        content={SAMPLE}
        scale={scale}
      />
    </div>
  );
}
