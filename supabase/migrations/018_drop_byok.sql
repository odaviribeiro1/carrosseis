-- 018_drop_byok.sql
-- Remove o sistema BYOK (Bring-Your-Own-Key) por workspace.
-- Em modo self-hosted, todas as keys (LLM, Gemini Imagen, Supadata, Whisper,
-- Meta App ID/Secret) vivem em variaveis de ambiente das Edge Functions
-- (Deno.env.get(...)). Uma instancia = um conjunto de keys, definido pelo dono.
--
-- Mudancas:
--   1. DROP TABLE ai_configs (e indexes/policies em CASCADE).
--   2. DROP COLUMN access_token_id em meta_connections (Vault) — a coluna
--      access_token (text plain, migration 015) permanece para o token OAuth Meta.
--   3. DROP FUNCTION vault_insert — sem callers depois desta migration.

DROP TABLE IF EXISTS ai_configs CASCADE;

ALTER TABLE meta_connections DROP COLUMN IF EXISTS access_token_id;

DROP FUNCTION IF EXISTS vault_insert(text, text);

INSERT INTO schema_versions (version, description)
VALUES ('018', '018_drop_byok: drop ai_configs + access_token_id + vault_insert (keys via .env)')
ON CONFLICT (version) DO NOTHING;
