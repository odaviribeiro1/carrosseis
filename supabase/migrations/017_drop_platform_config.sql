-- 017_drop_platform_config.sql
-- Remove a tabela platform_config e a funcao get_setup_status.
-- Justificativa: o modelo self-hosted le credenciais Supabase de import.meta.env
-- (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). O singleton platform_config e a
-- RPC get_setup_status sao artefatos do bootstrap dinamico SaaS e perdem proposito.

DROP FUNCTION IF EXISTS get_setup_status();
DROP TABLE IF EXISTS platform_config CASCADE;

INSERT INTO schema_versions (version, description)
VALUES ('017', '017_drop_platform_config: remove platform_config + get_setup_status (migracao self-hosted)')
ON CONFLICT (version) DO NOTHING;
