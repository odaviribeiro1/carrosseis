-- 028_invites_and_owner_role.sql
-- Substitui o modelo "primeiro user vira admin + self-signup aberto" por:
--   * Primeiro user vira `owner` (único)
--   * Self-signup fecha após o owner existir
--   * Novos users só entram via convite (token válido por 7 dias)
--
-- Renomeia 'admin' -> 'owner' em content_hub.user_roles.

SET search_path TO content_hub, public;

-- =============================================================================
-- 1. Atualizar CHECK em user_roles: 'admin' -> 'owner'
-- =============================================================================

-- Renomear dados existentes
UPDATE content_hub.user_roles
SET role = 'owner'
WHERE role = 'admin';

-- Trocar a constraint
ALTER TABLE content_hub.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE content_hub.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('owner', 'member'));

-- =============================================================================
-- 2. Atualizar policies RLS de user_roles para checar 'owner' em vez de 'admin'
-- =============================================================================

DROP POLICY IF EXISTS "user_roles_insert" ON content_hub.user_roles;
DROP POLICY IF EXISTS "user_roles_update" ON content_hub.user_roles;
DROP POLICY IF EXISTS "user_roles_delete" ON content_hub.user_roles;

CREATE POLICY "user_roles_insert" ON content_hub.user_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "user_roles_update" ON content_hub.user_roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "user_roles_delete" ON content_hub.user_roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

-- =============================================================================
-- 3. Tabela de convites
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_hub.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_token_idx
  ON content_hub.invites(token)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS invites_email_idx
  ON content_hub.invites(lower(email));

ALTER TABLE content_hub.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_owner_all" ON content_hub.invites;
CREATE POLICY "invites_owner_all" ON content_hub.invites
  FOR ALL USING (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM content_hub.user_roles WHERE user_id = auth.uid() AND role = 'owner')
  );

-- =============================================================================
-- 4. Helper: is_owner()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = content_hub, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM content_hub.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- =============================================================================
-- 5. Substituir handle_new_user(): primeiro = owner; demais exigem invite_token
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = content_hub, public, auth
AS $$
DECLARE
  v_user_count int;
  v_invite_token text;
  v_invite content_hub.invites%ROWTYPE;
  v_role text;
BEGIN
  SELECT count(*) INTO v_user_count FROM content_hub.user_roles;

  -- Caso 1: primeira pessoa do sistema vira owner
  IF v_user_count = 0 THEN
    INSERT INTO content_hub.user_roles (user_id, role)
    VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Caso 2: signup só permitido com token de convite válido
  v_invite_token := NEW.raw_user_meta_data ->> 'invite_token';

  IF v_invite_token IS NULL OR v_invite_token = '' THEN
    RAISE EXCEPTION 'Self-signup desabilitado. Solicite um convite ao owner desta instancia.';
  END IF;

  SELECT * INTO v_invite
  FROM content_hub.invites
  WHERE token = v_invite_token
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
    AND lower(email) = lower(NEW.email);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite invalido, expirado, ja utilizado ou email nao corresponde.';
  END IF;

  v_role := v_invite.role;

  UPDATE content_hub.invites
  SET used_at = now()
  WHERE id = v_invite.id;

  INSERT INTO content_hub.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-vincular o trigger para garantir que aponta para a função nova
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 6. RPC pública para o frontend descobrir se é o primeiro signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.signup_is_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = content_hub, public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM content_hub.user_roles LIMIT 1);
$$;

GRANT EXECUTE ON FUNCTION public.signup_is_open() TO anon, authenticated;

-- =============================================================================
-- 7. RPC para validar convite antes do signup (consumida em /invite)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_invite(p_token text)
RETURNS TABLE(email text, role text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = content_hub, public
AS $$
  SELECT email, role, expires_at
  FROM content_hub.invites
  WHERE token = p_token
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO anon, authenticated;

-- =============================================================================
-- 8. Registrar
-- =============================================================================

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('028', '028_invites_and_owner_role: role owner + tabela invites + signup fechado')
ON CONFLICT (version) DO NOTHING;
