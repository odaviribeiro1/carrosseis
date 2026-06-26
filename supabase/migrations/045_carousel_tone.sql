-- 045_carousel_tone
-- Tom de voz do carrossel (4 presets robustos anti-IA). Define qual bloco de
-- prompt e injetado no generate-content antes da geracao do conteudo.

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'informativo'
  CHECK (tone IN ('informativo', 'storytelling', 'educativo', 'noticiario'));

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('045', '045_carousel_tone: tom de voz (informativo/storytelling/educativo/noticiario)')
ON CONFLICT (version) DO NOTHING;
