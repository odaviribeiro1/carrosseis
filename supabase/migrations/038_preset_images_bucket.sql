-- 038_preset_images_bucket
-- Bucket publico para as imagens de referencia dos presets de aspectos visuais.
-- Antes elas viviam como base64 dentro de visual_presets.settings (jsonb), o que
-- deixava o preset pesado (~MBs) e nao sobrevivia ao round-trip pela API.
-- Agora o preset guarda apenas URLs publicas; o generate-slide-image busca essas
-- URLs server-side, e a UI as renderiza direto em <img>.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('preset-images', 'preset-images', true, 10485760,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_preset_images_select" ON storage.objects;
CREATE POLICY "storage_preset_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'preset-images');
DROP POLICY IF EXISTS "storage_preset_images_insert" ON storage.objects;
CREATE POLICY "storage_preset_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'preset-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "storage_preset_images_update" ON storage.objects;
CREATE POLICY "storage_preset_images_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'preset-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "storage_preset_images_delete" ON storage.objects;
CREATE POLICY "storage_preset_images_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'preset-images' AND auth.role() = 'authenticated');

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('038', '038_preset_images_bucket: bucket publico para imagens de referencia dos presets')
ON CONFLICT (version) DO NOTHING;
