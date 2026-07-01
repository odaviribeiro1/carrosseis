-- 048_cta_presets_and_social_profiles
-- Predefinições de CTA e perfis sociais salvos, armazenados como arrays JSONB
-- na tabela singleton instance_settings.

ALTER TABLE content_hub.instance_settings
  ADD COLUMN IF NOT EXISTS saved_cta_presets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE content_hub.instance_settings
  ADD COLUMN IF NOT EXISTS saved_social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('048', '048_cta_presets_and_social_profiles: colunas saved_cta_presets e saved_social_profiles em instance_settings')
ON CONFLICT (version) DO NOTHING;
