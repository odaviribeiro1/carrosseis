-- 033_slide_content
-- Conteudo textual estruturado por slide (headline/body/cta/type), para permitir
-- editar um rascunho voltando a tela de Preview antes de gerar as imagens.

ALTER TABLE content_hub.carousel_slides
  ADD COLUMN IF NOT EXISTS content jsonb;

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('033', '033_slide_content: conteudo textual estruturado por slide (edicao de rascunho na Preview)')
ON CONFLICT (version) DO NOTHING;
