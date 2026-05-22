-- 029_drop_meta_instagram.sql
-- Remove a feature de publicação no Instagram via Meta API.
--
-- O produto agora é apenas geração + edição + download de carrosséis.
-- Esta migration é idempotente para permitir reaplicação em qualquer estado.

SET search_path TO content_hub, public;

-- =============================================================================
-- 1. Drop tabelas
-- =============================================================================

DROP TABLE IF EXISTS content_hub.meta_connections CASCADE;
DROP TABLE IF EXISTS content_hub.scheduled_posts CASCADE;
-- Versões antigas viviam em public.* — remover se sobraram.
DROP TABLE IF EXISTS public.meta_connections CASCADE;
DROP TABLE IF EXISTS public.scheduled_posts CASCADE;

-- =============================================================================
-- 2. Drop função RPC get_meta_config (se existir em qualquer schema)
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_meta_config();
DROP FUNCTION IF EXISTS content_hub.get_meta_config();

-- =============================================================================
-- 3. Limpar colunas e CHECK constraint em carousels
-- =============================================================================

ALTER TABLE content_hub.carousels DROP COLUMN IF EXISTS scheduled_at;
ALTER TABLE content_hub.carousels DROP COLUMN IF EXISTS published_at;
ALTER TABLE content_hub.carousels DROP COLUMN IF EXISTS meta_post_id;

-- Atualizar status: agora só draft/ready (sem 'scheduled' / 'published').
-- Migrar valores antigos antes de trocar o constraint.
UPDATE content_hub.carousels
SET status = 'ready'
WHERE status IN ('scheduled', 'published');

ALTER TABLE content_hub.carousels DROP CONSTRAINT IF EXISTS carousels_status_check;
ALTER TABLE content_hub.carousels
  ADD CONSTRAINT carousels_status_check
  CHECK (status IN ('draft', 'ready'));

-- =============================================================================
-- 4. Registrar
-- =============================================================================

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('029', '029_drop_meta_instagram: remove integração Instagram/Meta (tabelas, função RPC, colunas e status)')
ON CONFLICT (version) DO NOTHING;
