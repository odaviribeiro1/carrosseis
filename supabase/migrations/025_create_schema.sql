-- 025_create_schema.sql
-- Cria o schema dedicado `content_hub` para isolar todas as tabelas de
-- dominio do produto, evitando colisao de nomes caso o cliente self-hosted
-- tenha outros projetos no mesmo Supabase.
--
-- Esta migration apenas cria o schema e concede privilegios. As tabelas
-- sao movidas em 026_move_tables_to_content_hub.sql e as funcoes que
-- referenciam tabelas pelo nome curto sao recriadas em
-- 027_update_functions_to_new_schema.sql.

CREATE SCHEMA IF NOT EXISTS content_hub;

GRANT USAGE ON SCHEMA content_hub TO authenticated, anon, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA content_hub TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA content_hub TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA content_hub TO authenticated, service_role;

-- Privilegios padrao para objetos futuros criados nesse schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA content_hub
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA content_hub
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA content_hub
  GRANT ALL ON FUNCTIONS TO authenticated, service_role;

INSERT INTO public.schema_versions (version, description)
VALUES ('025', '025_create_schema: cria schema content_hub e concede privilegios')
ON CONFLICT (version) DO NOTHING;
