-- 034_carousel_downloaded
-- Marca quando um carrossel teve seus slides baixados (ZIP), para a aba "Baixado".

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('034', '034_carousel_downloaded: coluna downloaded_at para a aba Baixado')
ON CONFLICT (version) DO NOTHING;
