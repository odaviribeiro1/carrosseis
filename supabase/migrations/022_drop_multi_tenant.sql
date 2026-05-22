-- 022_drop_multi_tenant.sql
-- Achata o multi-tenancy para singleton (uma instancia = um cliente, ainda
-- multi-usuario interno). Remove workspaces, workspace_members e a coluna
-- workspace_id de TODAS as tabelas restantes. Reescreve as RLS para
-- "qualquer usuario autenticado".
--
-- Roles passam a viver em uma tabela global user_roles, e o trigger
-- handle_new_user grava la (primeiro user = admin, demais = member).
--
-- Esta migration substitui a 021_default_workspace_trigger por um trigger
-- equivalente baseado em user_roles.

-- =============================================================================
-- 1. Tabela global de roles (substitui workspace_members)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado le todos os roles (para a tela Members).
CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Apenas admin pode promover/rebaixar/remover.
CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "user_roles_update" ON user_roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "user_roles_delete" ON user_roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- 2. Migrar dados existentes de workspace_members -> user_roles
-- =============================================================================

INSERT INTO user_roles (user_id, role)
SELECT DISTINCT ON (user_id) user_id, role
FROM workspace_members
ORDER BY user_id, CASE WHEN role = 'admin' THEN 0 ELSE 1 END
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- 3. Helper get_user_role() sem args (substitui a versao com workspace_id)
-- =============================================================================

DROP FUNCTION IF EXISTS get_user_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_workspace_member(uuid) CASCADE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- =============================================================================
-- 4. Drop policies antigas e colunas workspace_id em todas as tabelas restantes
-- =============================================================================

-- brand_kits ------------------------------------------------------------------
DROP POLICY IF EXISTS "brand_kits_select" ON brand_kits;
DROP POLICY IF EXISTS "brand_kits_insert" ON brand_kits;
DROP POLICY IF EXISTS "brand_kits_update" ON brand_kits;
DROP POLICY IF EXISTS "brand_kits_delete" ON brand_kits;

DROP INDEX IF EXISTS idx_brand_kits_workspace_id;

-- Drop trigger antigo que referenciava workspace_id
DROP TRIGGER IF EXISTS trg_single_default_brand_kit ON brand_kits;
DROP FUNCTION IF EXISTS ensure_single_default_brand_kit();

ALTER TABLE brand_kits DROP COLUMN IF EXISTS workspace_id;

-- Recria trigger sem workspace_id (apenas um default global)
CREATE OR REPLACE FUNCTION ensure_single_default_brand_kit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE brand_kits
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_single_default_brand_kit
  BEFORE INSERT OR UPDATE ON brand_kits
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_brand_kit();

CREATE POLICY "brand_kits_select" ON brand_kits
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "brand_kits_insert" ON brand_kits
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brand_kits_update" ON brand_kits
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "brand_kits_delete" ON brand_kits
  FOR DELETE USING (get_user_role() = 'admin');

-- templates -------------------------------------------------------------------
DROP POLICY IF EXISTS "templates_select" ON templates;
DROP POLICY IF EXISTS "templates_insert" ON templates;
DROP POLICY IF EXISTS "templates_update" ON templates;
DROP POLICY IF EXISTS "templates_delete" ON templates;

DROP INDEX IF EXISTS idx_templates_workspace_id;
ALTER TABLE templates DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_insert" ON templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND is_system = false);
CREATE POLICY "templates_update" ON templates
  FOR UPDATE USING (auth.uid() IS NOT NULL AND is_system = false);
CREATE POLICY "templates_delete" ON templates
  FOR DELETE USING (get_user_role() = 'admin' AND is_system = false);

-- template_slide_variants -----------------------------------------------------
DROP POLICY IF EXISTS "variants_select" ON template_slide_variants;
DROP POLICY IF EXISTS "variants_insert" ON template_slide_variants;
DROP POLICY IF EXISTS "variants_update" ON template_slide_variants;
DROP POLICY IF EXISTS "variants_delete" ON template_slide_variants;

CREATE POLICY "variants_select" ON template_slide_variants
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "variants_insert" ON template_slide_variants
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND template_id IN (SELECT id FROM templates WHERE is_system = false)
  );
CREATE POLICY "variants_update" ON template_slide_variants
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND template_id IN (SELECT id FROM templates WHERE is_system = false)
  );
CREATE POLICY "variants_delete" ON template_slide_variants
  FOR DELETE USING (
    get_user_role() = 'admin'
    AND template_id IN (SELECT id FROM templates WHERE is_system = false)
  );

-- carousels -------------------------------------------------------------------
DROP POLICY IF EXISTS "carousels_select" ON carousels;
DROP POLICY IF EXISTS "carousels_insert" ON carousels;
DROP POLICY IF EXISTS "carousels_update" ON carousels;
DROP POLICY IF EXISTS "carousels_delete" ON carousels;

DROP INDEX IF EXISTS idx_carousels_workspace_id;
ALTER TABLE carousels DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "carousels_select" ON carousels
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "carousels_insert" ON carousels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "carousels_update" ON carousels
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "carousels_delete" ON carousels
  FOR DELETE USING (get_user_role() = 'admin' OR created_by = auth.uid());

-- carousel_slides -------------------------------------------------------------
DROP POLICY IF EXISTS "slides_select" ON carousel_slides;
DROP POLICY IF EXISTS "slides_insert" ON carousel_slides;
DROP POLICY IF EXISTS "slides_update" ON carousel_slides;
DROP POLICY IF EXISTS "slides_delete" ON carousel_slides;

DROP INDEX IF EXISTS idx_carousel_slides_workspace_id;
ALTER TABLE carousel_slides DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "slides_select" ON carousel_slides
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "slides_insert" ON carousel_slides
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "slides_update" ON carousel_slides
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "slides_delete" ON carousel_slides
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- carousel_versions -----------------------------------------------------------
DROP POLICY IF EXISTS "versions_select" ON carousel_versions;
DROP POLICY IF EXISTS "versions_insert" ON carousel_versions;

ALTER TABLE carousel_versions DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "versions_select" ON carousel_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "versions_insert" ON carousel_versions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- custom_fonts ----------------------------------------------------------------
DROP POLICY IF EXISTS "fonts_select" ON custom_fonts;
DROP POLICY IF EXISTS "fonts_insert" ON custom_fonts;
DROP POLICY IF EXISTS "fonts_delete" ON custom_fonts;

DROP INDEX IF EXISTS idx_custom_fonts_workspace_id;
ALTER TABLE custom_fonts DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "fonts_select" ON custom_fonts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fonts_insert" ON custom_fonts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "fonts_delete" ON custom_fonts
  FOR DELETE USING (get_user_role() = 'admin');

-- meta_connections ------------------------------------------------------------
-- Em singleton, ha apenas UMA conexao Meta (a do dono da instancia).
DROP POLICY IF EXISTS "meta_select" ON meta_connections;
DROP POLICY IF EXISTS "meta_insert" ON meta_connections;
DROP POLICY IF EXISTS "meta_update" ON meta_connections;
DROP POLICY IF EXISTS "meta_delete" ON meta_connections;

DROP INDEX IF EXISTS idx_meta_connections_workspace_id;
ALTER TABLE meta_connections DROP COLUMN IF EXISTS workspace_id;

-- A unique antiga era (workspace_id, user_id); agora a unica logica relevante
-- e (user_id) — cada usuario tem no maximo uma conexao.
ALTER TABLE meta_connections DROP CONSTRAINT IF EXISTS meta_connections_workspace_id_user_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_connections_user_id_key'
  ) THEN
    ALTER TABLE meta_connections ADD CONSTRAINT meta_connections_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE POLICY "meta_select" ON meta_connections
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_insert" ON meta_connections
  FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "meta_update" ON meta_connections
  FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY "meta_delete" ON meta_connections
  FOR DELETE USING (get_user_role() = 'admin');

-- scheduled_posts -------------------------------------------------------------
DROP POLICY IF EXISTS "scheduled_select" ON scheduled_posts;
DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_posts;
DROP POLICY IF EXISTS "scheduled_update" ON scheduled_posts;
DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_posts;

DROP INDEX IF EXISTS idx_scheduled_posts_workspace_id;
ALTER TABLE scheduled_posts DROP COLUMN IF EXISTS workspace_id;

CREATE POLICY "scheduled_select" ON scheduled_posts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "scheduled_insert" ON scheduled_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "scheduled_update" ON scheduled_posts
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "scheduled_delete" ON scheduled_posts
  FOR DELETE USING (get_user_role() = 'admin');

-- =============================================================================
-- 5. Reescrever trigger handle_new_user para gravar em user_roles
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Primeiro usuario vira admin; demais viram member.
  IF NOT EXISTS (SELECT 1 FROM user_roles LIMIT 1) THEN
    v_role := 'admin';
  ELSE
    v_role := 'member';
  END IF;

  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 6. Drop workspaces e workspace_members
-- =============================================================================

DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;

-- =============================================================================
-- 7. Registrar a migration
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('022', '022_drop_multi_tenant: drop workspaces/workspace_members + workspace_id, criar user_roles global')
ON CONFLICT (version) DO NOTHING;
