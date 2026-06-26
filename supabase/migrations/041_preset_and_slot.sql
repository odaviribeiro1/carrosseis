-- 041_preset_and_slot
-- Arquitetura híbrida: cada slide = preset (template determinístico) + texto
-- renderizado por código + imagem da IA só dentro do slot.
--   carousels.preset_id        -> preset escolhido na Configuração
--   carousel_slides.slide_type -> 'capa' | 'conteudo' | 'cta'
--   carousel_slides.text_content -> { title, body, cta } (editável, render por código)
--   carousel_slides.slot_image_url -> imagem gerada pela IA (apenas o slot)
--   carousel_slides.composed_image_url -> PNG 1080x1350 final (composto no client; lazy)

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS preset_id text;

ALTER TABLE content_hub.carousel_slides
  ADD COLUMN IF NOT EXISTS slide_type text,
  ADD COLUMN IF NOT EXISTS text_content jsonb,
  ADD COLUMN IF NOT EXISTS slot_image_url text,
  ADD COLUMN IF NOT EXISTS composed_image_url text;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('041', '041_preset_and_slot: preset_id + slide_type/text_content/slot_image_url/composed_image_url')
ON CONFLICT (version) DO NOTHING;
