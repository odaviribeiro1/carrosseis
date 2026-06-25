-- 036_visual_presets
-- Presets de Aspectos Visuais reutilizaveis entre carrosseis (estilo, paleta,
-- proporcao, imagens de referencia, prompt e resolucao salvos com um nome).
-- Compartilhados na instancia: qualquer usuario autenticado ve e aplica;
-- exclusao restrita ao criador.

CREATE TABLE IF NOT EXISTS content_hub.visual_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_presets_created_at
  ON content_hub.visual_presets(created_at DESC);

ALTER TABLE content_hub.visual_presets ENABLE ROW LEVEL SECURITY;

-- Compartilhado: leitura para qualquer autenticado.
DROP POLICY IF EXISTS "visual_presets_select" ON content_hub.visual_presets;
CREATE POLICY "visual_presets_select" ON content_hub.visual_presets
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Criacao apenas como si mesmo.
DROP POLICY IF EXISTS "visual_presets_insert" ON content_hub.visual_presets;
CREATE POLICY "visual_presets_insert" ON content_hub.visual_presets
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Atualizacao e exclusao restritas ao criador.
DROP POLICY IF EXISTS "visual_presets_update" ON content_hub.visual_presets;
CREATE POLICY "visual_presets_update" ON content_hub.visual_presets
  FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "visual_presets_delete" ON content_hub.visual_presets;
CREATE POLICY "visual_presets_delete" ON content_hub.visual_presets
  FOR DELETE USING (auth.uid() = created_by);

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('036', '036_visual_presets: presets de aspectos visuais compartilhados (reutilizaveis entre carrosseis)')
ON CONFLICT (version) DO NOTHING;
