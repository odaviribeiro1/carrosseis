-- 027_update_functions_to_new_schema.sql
-- Recria funcoes PL/pgSQL que referenciam tabelas pelo nome curto. Como
-- PL/pgSQL re-parseia o corpo da funcao a cada chamada, o search_path
-- precisa incluir `content_hub` para que `user_roles`, `brand_kits` etc.
-- resolvam para o novo schema.
--
-- Mantemos o nome `get_user_role` (em vez de `current_user_role`
-- sugerido no prompt da Fase 7) porque todas as RLS policies criadas em
-- 022_drop_multi_tenant.sql ja chamam `get_user_role()` e essas
-- referencias sao resolvidas por OID, nao por nome.

-- =============================================================================
-- 1. get_user_role(): le user_roles
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = content_hub, public
AS $$
  SELECT role FROM content_hub.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- =============================================================================
-- 2. handle_new_user(): grava em user_roles (primeiro user = admin)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = content_hub, public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM content_hub.user_roles LIMIT 1) THEN
    v_role := 'admin';
  ELSE
    v_role := 'member';
  END IF;

  INSERT INTO content_hub.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- O trigger on_auth_user_created em auth.users ja foi criado em 022 e
-- continua valido (ele referencia handle_new_user por OID).

-- =============================================================================
-- 3. ensure_single_default_brand_kit(): garante apenas 1 brand_kit default
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_single_default_brand_kit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = content_hub, public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE content_hub.brand_kits
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 4. Registrar a migration
-- =============================================================================
INSERT INTO content_hub.schema_versions (version, description)
VALUES ('027', '027_update_functions_to_new_schema: get_user_role / handle_new_user / ensure_single_default_brand_kit apontam para content_hub')
ON CONFLICT (version) DO NOTHING;
