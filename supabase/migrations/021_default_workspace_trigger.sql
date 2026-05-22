-- 021_default_workspace_trigger.sql
-- Substitui o Wizard de onboarding por um trigger SQL que cria um workspace
-- default automaticamente no primeiro registro e adiciona cada usuario novo
-- como admin desse workspace.
--
-- Em modo self-hosted (uma instancia = um cliente, ainda multi-usuario interno),
-- esta migration e aplicada pelo bootstrap do wizard /setup.
--
-- TODO Fase 6: quando workspaces / workspace_members forem dropados, este
-- trigger sera reescrito para gravar em user_roles (nova tabela) com a regra
-- "primeiro usuario = admin, demais = member".

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Reutiliza o primeiro workspace existente; se nao houver, cria um default.
  SELECT id INTO v_workspace_id FROM workspaces LIMIT 1;
  IF v_workspace_id IS NULL THEN
    INSERT INTO workspaces (name, slug)
    VALUES ('Default', 'default')
    RETURNING id INTO v_workspace_id;
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'admin')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

INSERT INTO schema_versions (version, description)
VALUES ('021', '021_default_workspace_trigger: handle_new_user cria workspace default + admin no primeiro user (substitui Wizard)')
ON CONFLICT (version) DO NOTHING;
