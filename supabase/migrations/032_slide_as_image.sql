-- 032_slide_as_image
-- Nova arquitetura "slide-como-imagem": cada slide passa a ser uma imagem inteira
-- gerada pelo Nano Banana, com o texto renderizado dentro da propria imagem.
-- Adiciona campos de imagem em carousel_slides + versionamento por slide.

-- 1) Campos de imagem em carousel_slides (canvas_json mantido apenas para legado).
ALTER TABLE content_hub.carousel_slides
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS design_spec jsonb,
  ADD COLUMN IF NOT EXISTS current_version int NOT NULL DEFAULT 1;

-- 2) Versionamento por slide (para "reverter para versao anterior").
CREATE TABLE IF NOT EXISTS content_hub.carousel_slide_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES content_hub.carousel_slides(id) ON DELETE CASCADE,
  version int NOT NULL,
  image_url text NOT NULL,
  image_prompt text,
  design_spec jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slide_versions_slide
  ON content_hub.carousel_slide_versions(slide_id);

ALTER TABLE content_hub.carousel_slide_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slide_versions_select" ON content_hub.carousel_slide_versions;
CREATE POLICY "slide_versions_select" ON content_hub.carousel_slide_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "slide_versions_insert" ON content_hub.carousel_slide_versions;
CREATE POLICY "slide_versions_insert" ON content_hub.carousel_slide_versions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "slide_versions_update" ON content_hub.carousel_slide_versions;
CREATE POLICY "slide_versions_update" ON content_hub.carousel_slide_versions
  FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "slide_versions_delete" ON content_hub.carousel_slide_versions;
CREATE POLICY "slide_versions_delete" ON content_hub.carousel_slide_versions
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 3) Bucket publico para as imagens geradas (URL permanente para exibicao/download).
--    Os arquivos sao salvos pela Edge Function generate-slide-image via service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('slide-images', 'slide-images', true, 10485760,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_slide_images_select" ON storage.objects;
CREATE POLICY "storage_slide_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'slide-images');
DROP POLICY IF EXISTS "storage_slide_images_insert" ON storage.objects;
CREATE POLICY "storage_slide_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'slide-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "storage_slide_images_update" ON storage.objects;
CREATE POLICY "storage_slide_images_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'slide-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "storage_slide_images_delete" ON storage.objects;
CREATE POLICY "storage_slide_images_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'slide-images' AND auth.role() = 'authenticated');

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('032', '032_slide_as_image: campos de imagem em carousel_slides, versionamento carousel_slide_versions e bucket slide-images')
ON CONFLICT (version) DO NOTHING;
