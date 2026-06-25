-- 035_carousel_art_direction
-- Direcao de arte GLOBAL por carrossel (ancora de consistencia visual entre
-- slides) + hash para cache. Gerada uma vez via GPT e reutilizada enquanto as
-- entradas que a afetam (aspectos visuais + imagens de referencia) nao mudarem.

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS art_direction jsonb,
  ADD COLUMN IF NOT EXISTS art_direction_hash text;

-- As colunas herdam o RLS ja habilitado em content_hub.carousels:
-- cada usuario so le/escreve a direcao de arte dos proprios carrosseis.

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('035', '035_carousel_art_direction: direcao de arte global cacheada (art_direction + hash)')
ON CONFLICT (version) DO NOTHING;
