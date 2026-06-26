-- 042_carousel_social_profile
-- Identidade social usada pelos presets estilo "Post do X" (header com avatar,
-- nome, @ e selo). Guardada por carrossel; só faz sentido para os presets
-- post-x / post-x-dark, mas a coluna é genérica.

ALTER TABLE content_hub.carousels
  ADD COLUMN IF NOT EXISTS social_profile jsonb; -- { name, handle, avatar_url }

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('042', '042_carousel_social_profile: identidade social (nome/@/avatar) para presets Post do X')
ON CONFLICT (version) DO NOTHING;
