-- 047_share_links
-- Link temporário para enviar o carrossel pronto ao celular (QR code) e publicar
-- manualmente com música pelo app do Instagram. A página mobile é aberta sem login
-- (anon) e lê só via o RPC SECURITY DEFINER get_share — nunca a tabela direto.

CREATE TABLE IF NOT EXISTS content_hub.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id uuid NOT NULL REFERENCES content_hub.carousels(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  caption text,
  image_urls jsonb NOT NULL DEFAULT '[]',  -- snapshot ordenado: [{ position, url }]
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS share_links_carousel_idx ON content_hub.share_links (carousel_id);

ALTER TABLE content_hub.share_links ENABLE ROW LEVEL SECURITY;

-- Acesso direto só para autenticados (criar/editar o link). Anon NÃO tem policy:
-- lê exclusivamente pelo RPC get_share (SECURITY DEFINER ignora RLS).
DROP POLICY IF EXISTS "share_links_select" ON content_hub.share_links;
CREATE POLICY "share_links_select" ON content_hub.share_links
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "share_links_insert" ON content_hub.share_links;
CREATE POLICY "share_links_insert" ON content_hub.share_links
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "share_links_update" ON content_hub.share_links;
CREATE POLICY "share_links_update" ON content_hub.share_links
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "share_links_delete" ON content_hub.share_links;
CREATE POLICY "share_links_delete" ON content_hub.share_links
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Leitura anônima da página mobile. Retorna caption/urls APENAS se não expirado;
-- expirado => caption null, urls [], expired true. Token inexistente => 0 linhas.
CREATE OR REPLACE FUNCTION public.get_share(p_token text)
RETURNS TABLE(caption text, image_urls jsonb, expired boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = content_hub, public
AS $$
  SELECT
    CASE WHEN s.expires_at > now() THEN s.caption ELSE NULL END AS caption,
    CASE WHEN s.expires_at > now() THEN s.image_urls ELSE '[]'::jsonb END AS image_urls,
    (s.expires_at <= now()) AS expired
  FROM content_hub.share_links s
  WHERE s.token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_share(text) TO anon, authenticated;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('047', '047_share_links: tabela share_links + RPC get_share (acesso anonimo a link temporario)')
ON CONFLICT (version) DO NOTHING;
