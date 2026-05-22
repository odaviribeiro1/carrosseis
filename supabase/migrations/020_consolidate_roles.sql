-- 020_consolidate_roles.sql
-- Consolida 4 roles (owner, admin, editor, viewer) em 2 (admin, member).
-- Em modo self-hosted (uma instancia = um cliente, ainda multi-usuario interno)
-- nao ha demanda por hierarquia de quatro niveis: precisamos apenas separar
-- "quem administra" (admin) de "quem cria/edita conteudo" (member).
--
-- Mapping:
--   owner  -> admin
--   admin  -> admin
--   editor -> member
--   viewer -> member  (descartado como categoria propria; nao havia demanda
--                       explicita por role so-leitura no produto self-hosted)
--
-- TODO Fase 6: quando workspace_members for removida, criar tabela user_roles
-- e trigger on_first_user_signup para promover o primeiro usuario a admin.

-- 1. Atualizar dados existentes.
UPDATE workspace_members SET role = 'admin'  WHERE role IN ('owner', 'admin');
UPDATE workspace_members SET role = 'member' WHERE role IN ('editor', 'viewer');

-- 2. Atualizar CHECK constraint para aceitar apenas admin / member.
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('admin', 'member'));

-- 3. Reescrever policies que mencionavam owner/editor/viewer.
--    Helper get_user_role(workspace_id) continua aceitando workspace_id como
--    argumento ate a Fase 6 (que dropa workspace_members).

-- 3a. workspaces (migration 004)
DROP POLICY IF EXISTS "workspace_update" ON workspaces;
CREATE POLICY "workspace_update" ON workspaces
  FOR UPDATE USING (
    get_user_role(id) = 'admin'
  );

DROP POLICY IF EXISTS "workspace_delete" ON workspaces;
CREATE POLICY "workspace_delete" ON workspaces
  FOR DELETE USING (
    get_user_role(id) = 'admin'
  );

-- 3b. workspace_members (migration 004)
DROP POLICY IF EXISTS "members_insert" ON workspace_members;
CREATE POLICY "members_insert" ON workspace_members
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) = 'admin'
    OR NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = workspace_members.workspace_id)
  );

DROP POLICY IF EXISTS "members_update" ON workspace_members;
CREATE POLICY "members_update" ON workspace_members
  FOR UPDATE USING (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "members_delete" ON workspace_members;
CREATE POLICY "members_delete" ON workspace_members
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

-- 3c. brand_kits (migration 005)
DROP POLICY IF EXISTS "brand_kits_insert" ON brand_kits;
CREATE POLICY "brand_kits_insert" ON brand_kits
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "brand_kits_update" ON brand_kits;
CREATE POLICY "brand_kits_update" ON brand_kits
  FOR UPDATE USING (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "brand_kits_delete" ON brand_kits;
CREATE POLICY "brand_kits_delete" ON brand_kits
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

-- 3d. ai_configs (migration 006) — dropada em 018, bloco condicional
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_configs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "ai_configs_insert" ON ai_configs';
    EXECUTE 'CREATE POLICY "ai_configs_insert" ON ai_configs FOR INSERT WITH CHECK (get_user_role(workspace_id) = ''admin'')';
    EXECUTE 'DROP POLICY IF EXISTS "ai_configs_update" ON ai_configs';
    EXECUTE 'CREATE POLICY "ai_configs_update" ON ai_configs FOR UPDATE USING (get_user_role(workspace_id) = ''admin'')';
    EXECUTE 'DROP POLICY IF EXISTS "ai_configs_delete" ON ai_configs';
    EXECUTE 'CREATE POLICY "ai_configs_delete" ON ai_configs FOR DELETE USING (get_user_role(workspace_id) = ''admin'')';
  END IF;
END $$;

-- 3e. templates (migration 007)
DROP POLICY IF EXISTS "templates_insert" ON templates;
CREATE POLICY "templates_insert" ON templates
  FOR INSERT WITH CHECK (
    workspace_id IS NOT NULL
    AND get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "templates_update" ON templates;
CREATE POLICY "templates_update" ON templates
  FOR UPDATE USING (
    workspace_id IS NOT NULL
    AND get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "templates_delete" ON templates;
CREATE POLICY "templates_delete" ON templates
  FOR DELETE USING (
    workspace_id IS NOT NULL
    AND get_user_role(workspace_id) = 'admin'
  );

-- 3f. template_slide_variants (migration 007)
DROP POLICY IF EXISTS "variants_insert" ON template_slide_variants;
CREATE POLICY "variants_insert" ON template_slide_variants
  FOR INSERT WITH CHECK (
    template_id IN (
      SELECT id FROM templates
      WHERE workspace_id IS NOT NULL
        AND get_user_role(workspace_id) IN ('admin', 'member')
    )
  );

DROP POLICY IF EXISTS "variants_update" ON template_slide_variants;
CREATE POLICY "variants_update" ON template_slide_variants
  FOR UPDATE USING (
    template_id IN (
      SELECT id FROM templates
      WHERE workspace_id IS NOT NULL
        AND get_user_role(workspace_id) IN ('admin', 'member')
    )
  );

DROP POLICY IF EXISTS "variants_delete" ON template_slide_variants;
CREATE POLICY "variants_delete" ON template_slide_variants
  FOR DELETE USING (
    template_id IN (
      SELECT id FROM templates
      WHERE workspace_id IS NOT NULL
        AND get_user_role(workspace_id) = 'admin'
    )
  );

-- 3g. carousels / carousel_slides / carousel_versions (migration 008)
DROP POLICY IF EXISTS "carousels_insert" ON carousels;
CREATE POLICY "carousels_insert" ON carousels
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "carousels_update" ON carousels;
CREATE POLICY "carousels_update" ON carousels
  FOR UPDATE USING (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "carousels_delete" ON carousels;
CREATE POLICY "carousels_delete" ON carousels
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "slides_insert" ON carousel_slides;
CREATE POLICY "slides_insert" ON carousel_slides
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "slides_update" ON carousel_slides;
CREATE POLICY "slides_update" ON carousel_slides
  FOR UPDATE USING (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "slides_delete" ON carousel_slides;
CREATE POLICY "slides_delete" ON carousel_slides
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "versions_insert" ON carousel_versions;
CREATE POLICY "versions_insert" ON carousel_versions
  FOR INSERT WITH CHECK (
    carousel_id IN (
      SELECT id FROM carousels
      WHERE get_user_role(workspace_id) IN ('admin', 'member')
    )
  );

-- 3h. custom_fonts (migration 009)
DROP POLICY IF EXISTS "fonts_insert" ON custom_fonts;
CREATE POLICY "fonts_insert" ON custom_fonts
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "fonts_delete" ON custom_fonts;
CREATE POLICY "fonts_delete" ON custom_fonts
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

-- 3i. meta_connections / scheduled_posts (migration 010)
DROP POLICY IF EXISTS "meta_insert" ON meta_connections;
CREATE POLICY "meta_insert" ON meta_connections
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "meta_update" ON meta_connections;
CREATE POLICY "meta_update" ON meta_connections
  FOR UPDATE USING (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "meta_delete" ON meta_connections;
CREATE POLICY "meta_delete" ON meta_connections
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_posts;
CREATE POLICY "scheduled_insert" ON scheduled_posts
  FOR INSERT WITH CHECK (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "scheduled_update" ON scheduled_posts;
CREATE POLICY "scheduled_update" ON scheduled_posts
  FOR UPDATE USING (
    get_user_role(workspace_id) IN ('admin', 'member')
  );

DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_posts;
CREATE POLICY "scheduled_delete" ON scheduled_posts
  FOR DELETE USING (
    get_user_role(workspace_id) = 'admin'
  );

-- 4. Registrar a migration.
INSERT INTO schema_versions (version, description)
VALUES ('020', '020_consolidate_roles: 4 roles (owner/admin/editor/viewer) -> 2 (admin/member)')
ON CONFLICT (version) DO NOTHING;
