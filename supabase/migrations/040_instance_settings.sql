-- 040_instance_settings
-- Configuracao global (singleton) da instancia. Por enquanto guarda o modelo de
-- geracao de imagem padrao, escolhido pelo owner na aba Credenciais. Cada carrossel
-- recebe esse valor em carousels.image_provider no momento da criacao; a Edge
-- Function generate-slide-image continua lendo carousels.image_provider.

CREATE TABLE IF NOT EXISTS content_hub.instance_settings (
  id boolean PRIMARY KEY DEFAULT true,
  image_provider text NOT NULL DEFAULT 'gpt_image'
    CHECK (image_provider IN ('gpt_image', 'nano_banana')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_settings_singleton CHECK (id)
);

-- Garante a unica linha (id = true). Executado via service role -> ignora RLS.
INSERT INTO content_hub.instance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE content_hub.instance_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado (o create flow precisa ler o modelo padrao).
DROP POLICY IF EXISTS "instance_settings_select" ON content_hub.instance_settings;
CREATE POLICY "instance_settings_select" ON content_hub.instance_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Escrita: apenas owner.
DROP POLICY IF EXISTS "instance_settings_update" ON content_hub.instance_settings;
CREATE POLICY "instance_settings_update" ON content_hub.instance_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "instance_settings_insert" ON content_hub.instance_settings;
CREATE POLICY "instance_settings_insert" ON content_hub.instance_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('040', '040_instance_settings: config global singleton (modelo de imagem padrao)')
ON CONFLICT (version) DO NOTHING;
