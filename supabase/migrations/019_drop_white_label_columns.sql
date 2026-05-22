-- 019_drop_white_label_columns.sql
-- Remove o aparato de white-label dinamico da plataforma.
-- Em modo self-hosted, a marca da plataforma e fixa (Agentise dark glassmorphism)
-- definida em apps/web/src/index.css. Nao ha customizacao por workspace.
--
-- IMPORTANTE: brand_kits permanece intocado — define o visual dos CARROSSEIS
-- gerados (dominio nuclear), nao da plataforma.
--
-- A tabela workspaces como um todo sera removida em uma fase posterior
-- (singleton de tenant). Aqui apenas dropamos as colunas de white-label.

ALTER TABLE workspaces
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS favicon_url,
  DROP COLUMN IF EXISTS brand_primary_color,
  DROP COLUMN IF EXISTS brand_secondary_color,
  DROP COLUMN IF EXISTS custom_domain;

DROP INDEX IF EXISTS idx_workspaces_custom_domain;

INSERT INTO schema_versions (version, description)
VALUES ('019', '019_drop_white_label_columns: drop logo_url/favicon_url/brand_*_color/custom_domain (tema fixo)')
ON CONFLICT (version) DO NOTHING;
