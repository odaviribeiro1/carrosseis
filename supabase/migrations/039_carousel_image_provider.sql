-- 039_carousel_image_provider
-- Provider de geracao de imagem por carrossel:
--   'gpt_image'   -> OpenAI GPT Image 2 (padrao, so precisa da chave OpenAI)
--   'nano_banana' -> Google Gemini (Nano Banana), exige chave Google
-- A Edge Function generate-slide-image le esta coluna e roteia o provider.

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS image_provider text NOT NULL DEFAULT 'gpt_image';

-- Restringe aos valores conhecidos (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carousels_image_provider_check'
  ) THEN
    ALTER TABLE content_hub.carousels
      ADD CONSTRAINT carousels_image_provider_check
      CHECK (image_provider IN ('gpt_image', 'nano_banana'));
  END IF;
END $$;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('039', '039_carousel_image_provider: provider de imagem por carrossel (gpt_image | nano_banana)')
ON CONFLICT (version) DO NOTHING;
