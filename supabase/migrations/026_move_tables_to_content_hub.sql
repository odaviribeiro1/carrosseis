-- 026_move_tables_to_content_hub.sql
-- Move todas as tabelas de dominio (e a meta-tabela schema_versions) do
-- schema `public` para `content_hub`. RLS policies, triggers, indexes,
-- foreign keys e constraints sao preservados automaticamente pelo
-- Postgres ao mover via ALTER TABLE ... SET SCHEMA: as referencias sao
-- baseadas em OID e nao em nome, portanto seguem a tabela.
--
-- Funcoes PL/pgSQL que referenciam tabelas pelo nome curto sao recriadas
-- na migration 027 (porque PL/pgSQL re-parseia o corpo a cada chamada e
-- o search_path padrao das funcoes era `public`).
--
-- NAO mover: auth.* (gerenciado pelo Supabase) e storage.*.

-- Tabelas de dominio
ALTER TABLE IF EXISTS public.brand_kits SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.templates SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.template_slide_variants SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.carousels SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.carousel_slides SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.carousel_versions SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.custom_fonts SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.meta_connections SET SCHEMA content_hub;
ALTER TABLE IF EXISTS public.scheduled_posts SET SCHEMA content_hub;

-- Tabela global de roles (substituiu workspace_members na fase 6)
ALTER TABLE IF EXISTS public.user_roles SET SCHEMA content_hub;

-- Meta-tabela de versoes de schema. Movida POR ULTIMO porque as proprias
-- migrations passadas referenciaram `schema_versions` sem qualificar.
ALTER TABLE IF EXISTS public.schema_versions SET SCHEMA content_hub;

-- A partir daqui, schema_versions vive em content_hub. Todos os INSERTs
-- desta e das proximas migrations precisam qualificar com content_hub.
INSERT INTO content_hub.schema_versions (version, description)
VALUES ('026', '026_move_tables_to_content_hub: 11 tabelas movidas de public para content_hub')
ON CONFLICT (version) DO NOTHING;
