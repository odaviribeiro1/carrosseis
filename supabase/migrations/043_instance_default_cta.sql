-- 043_instance_default_cta
-- CTA fixo global da instância: um slide de CTA (título + corpo + botão) definido
-- uma vez em Configurações e aplicado como slide final de todo carrossel novo.

ALTER TABLE content_hub.instance_settings
  ADD COLUMN IF NOT EXISTS default_cta jsonb; -- { enabled, title, body, button }

INSERT INTO content_hub.schema_versions (version, description)
VALUES ('043', '043_instance_default_cta: CTA fixo global (slide final padrão)')
ON CONFLICT (version) DO NOTHING;
