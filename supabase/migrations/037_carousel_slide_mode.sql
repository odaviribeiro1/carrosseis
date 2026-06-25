-- 037_carousel_slide_mode
-- Modo de conteudo de cada slide do carrossel:
--   'image_text' (Nano Banana gera imagens + texto) ou 'text_only' (apenas texto).
-- Persistido junto dos demais aspectos visuais para sobreviver ao reload de rascunho.

ALTER TABLE content_hub.carousel_visual_settings
  ADD COLUMN IF NOT EXISTS slide_mode text NOT NULL DEFAULT 'image_text';

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('037', '037_carousel_slide_mode: modo do slide (imagens+texto ou apenas texto)')
ON CONFLICT (version) DO NOTHING;
