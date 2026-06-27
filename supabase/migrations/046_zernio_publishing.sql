-- 046_zernio_publishing
-- Publicacao/agendamento de carrossel no Instagram via Zernio.
-- Singleton: a conexao Zernio (profile + conta IG) vive em instance_settings;
-- os posts publicados/agendados ficam em scheduled_posts.

-- Conexao Zernio da instancia: { profile_id, account_id, username, connected_at }.
ALTER TABLE content_hub.instance_settings
  ADD COLUMN IF NOT EXISTS zernio_connection jsonb;

-- Posts enviados ao Zernio (publicados/agendados/rascunho).
CREATE TABLE IF NOT EXISTS content_hub.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id uuid NOT NULL REFERENCES content_hub.carousels(id) ON DELETE CASCADE,
  zernio_post_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for timestamptz,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_posts_carousel_idx
  ON content_hub.scheduled_posts (carousel_id);

ALTER TABLE content_hub.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Base singleton: qualquer autenticado (mesma postura das demais tabelas de dominio).
DROP POLICY IF EXISTS "scheduled_posts_select" ON content_hub.scheduled_posts;
CREATE POLICY "scheduled_posts_select" ON content_hub.scheduled_posts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "scheduled_posts_insert" ON content_hub.scheduled_posts;
CREATE POLICY "scheduled_posts_insert" ON content_hub.scheduled_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "scheduled_posts_update" ON content_hub.scheduled_posts;
CREATE POLICY "scheduled_posts_update" ON content_hub.scheduled_posts
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "scheduled_posts_delete" ON content_hub.scheduled_posts;
CREATE POLICY "scheduled_posts_delete" ON content_hub.scheduled_posts
  FOR DELETE USING (auth.uid() IS NOT NULL);

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('046', '046_zernio_publishing: conexao Zernio (instance_settings) + tabela scheduled_posts')
ON CONFLICT (version) DO NOTHING;
