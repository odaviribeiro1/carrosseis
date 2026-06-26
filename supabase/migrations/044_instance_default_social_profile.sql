-- 044_instance_default_social_profile
-- Identidade do post (Post do X) padrão da instância: nome, @ e avatar definidos
-- uma vez e reaproveitados em todo carrossel novo (presets sociais), evitando
-- preencher a cada criação.

ALTER TABLE content_hub.instance_settings
  ADD COLUMN IF NOT EXISTS default_social_profile jsonb; -- { name, handle, avatar_url }

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('044', '044_instance_default_social_profile: identidade do post padrão (Post do X)')
ON CONFLICT (version) DO NOTHING;
