# Validação — Slide-como-Imagem (Nano Banana)

Roteiro para validar live a refatoração (geração/edição de slides como imagens).

## 0. Deploy (pré-requisito)

```bash
export SUPABASE_ACCESS_TOKEN=<token valido>      # gere em Account > Access Tokens

# Migration (cria image_url/design_spec/current_version, carousel_slide_versions, bucket slide-images)
supabase db push                                  # pede SUPABASE_DB_PASSWORD

# Edge Function
supabase functions deploy generate-slide-image
```

Secrets necessários nas Edge Functions: `google_api_key` (ou `gemini_imagen_api_key`).

## 1. Funcionais

| # | Passo | Esperado |
|---|-------|----------|
| 1 | Criar carrossel: fonte → config → aspectos visuais → preview | Preview mostra tipografia/hierarquia/layout/identidade + resumo do prompt por slide |
| 2 | "Padronizar tipografia em todos os slides" (em um slide) | Fonte+px daquele slide replicados nos demais (ver no resumo do prompt) |
| 3 | Aceitar | Barra "Gerando slide X/N"; ao terminar abre a tela final com imagens do Nano Banana com o texto correto |
| 4 | Tela final → escrever refino → "Regenerar este slide" | Só o slide ativo muda; nova imagem aplica o ajuste |
| 5 | "Aplicar em todos os slides" | Todos regeneram mantendo o conteúdo de cada um; barra "Aplicando X/N" |
| 6 | "Reverter para versão anterior" (2x) | Volta um passo por clique (imagem anterior) |
| 7 | Prompt vazio em "Aplicar em todos" / sem API key | Erro claro em pt-BR |
| 8 | "Baixar ZIP" (tela final e Dashboard) | ZIP com os PNGs gerados |

## 2. Side-effects (SQL — Supabase Studio → SQL Editor)

```sql
-- Slides com imagem + design spec + versão
select id, position, current_version,
       left(image_url, 60) as image_url, image_prompt is not null as has_prompt,
       design_spec is not null as has_spec
from content_hub.carousel_slides
where carousel_id = '<CAROUSEL_ID>'
order by position;

-- Versões arquivadas (aparecem após regenerar/reverter)
select id, slide_id, version, left(image_url,60) as image_url, created_at
from content_hub.carousel_slide_versions
where slide_id = '<SLIDE_ID>'
order by version desc;

-- Blobs no Storage
select name, created_at from storage.objects
where bucket_id = 'slide-images'
order by created_at desc limit 20;
```

Logs da função: Supabase Dashboard → Functions → `generate-slide-image` → Logs (procurar 2xx + o modelo usado).

## 3. RLS (2 usuários)

```sql
-- Como user A e como user B (sessões separadas): cada um só vê seus carrosséis/slides/versões.
select count(*) from content_hub.carousel_slide_versions;   -- deve refletir só o que o usuário pode ver
```

## 4. Visual / Responsivo

- Preview e tela final em 1280px+: painéis (slides / imagem ativa / refino) alinhados.
- 768px: sem overflow horizontal.
- 375px (tela final): mensagem "Use no Desktop".
- Tema dark glassmorphism mantido; nenhum resquício de toolbar/camadas/propriedades do Konva.
