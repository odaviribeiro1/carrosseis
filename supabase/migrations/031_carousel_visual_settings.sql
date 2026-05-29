CREATE TABLE IF NOT EXISTS content_hub.carousel_visual_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id uuid NOT NULL REFERENCES content_hub.carousels(id) ON DELETE CASCADE,
  image_style text NOT NULL DEFAULT 'realista',
  color_palette jsonb NOT NULL DEFAULT '["#1E3A5F","#3B82F6","#94A3B8","#F8FAFC","#0F1223"]'::jsonb,
  aspect_ratio text NOT NULL DEFAULT '4:5',
  reference_image_url text,
  image_prompt text DEFAULT '',
  resolution text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_carousel_visual_settings UNIQUE (carousel_id)
);

ALTER TABLE content_hub.carousel_visual_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visual_settings_select" ON content_hub.carousel_visual_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "visual_settings_insert" ON content_hub.carousel_visual_settings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "visual_settings_update" ON content_hub.carousel_visual_settings
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "visual_settings_delete" ON content_hub.carousel_visual_settings
  FOR DELETE USING (auth.uid() IS NOT NULL);

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('031', '031_carousel_visual_settings: configuracoes visuais de geracao de imagem por carrossel')
ON CONFLICT (version) DO NOTHING;
