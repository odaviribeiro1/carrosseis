# CLAUDE.md — Content Hub

## Visão Geral

**Content Hub** é um boilerplate **open source self-hosted** de criação de carrosséis visuais (formato 4:5), alimentado por IA. Distribuído via fork: o operador clona o repositório, configura suas envs, sobe seu Supabase e faz deploy.

- **Escopo**: gerar carrosséis com IA, editar no Konva, baixar (PNG individual ou ZIP) e **publicar/agendar no Instagram via Zernio**.
- **Modelo**: instância única (singleton) — uma instância atende uma organização, com múltiplos usuários internos.
- **Sem billing interno** — controle comercial e de assinaturas, se houver, vive fora do produto.
- **Tema visual fixo no código** (`apps/web/src/index.css`). Personalização é por edição direta + rebuild.
- **Configuração via `.env` e `supabase secrets`** — não há fluxo de onboarding interativo no app.
- **Chaves de IA vivem como secrets da instância** (consumidas em `Deno.env.get(...)` nas Edge Functions), não são atributos por usuário.
- **Idioma da interface**: pt-BR apenas.

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Canvas/Editor | **Konva.js** (react-konva) — slides 1080×1350 com layers, undo/redo, zoom |
| Backend | Supabase (Postgres, Auth, Edge Functions Deno, Storage, pg_cron + pg_net) |
| Schema Postgres | `content_hub` — todas as tabelas de domínio vivem nele |
| Auth | Supabase Auth (email/senha) |
| Deploy Frontend | Vercel (root: `apps/web`) ou qualquer host estático |
| Exportação | Client-side via Konva (`stage.toDataURL()` / `stage.toBlob()`) — PNG 1080×1350 (4:5) em canvas offscreen |
| Filas/Jobs | Supabase pg_cron + **pg_net** (HTTP) → Edge Functions |
| Transcrição | **Gemini** (Google AI) para YouTube/Shorts via `fileData.fileUri` (reusa a Google API key); **Whisper** para Reels do Instagram |
| Geração de imagens | **Gemini** via Google AI API — dual-model: `gemini-3.1-flash-image-preview` (Nano Banana 2) → fallback `gemini-3-pro-image-preview` (Nano Banana Pro) |
| LLM | Multi-provider com adapters: **OpenAI, Anthropic, Google (Gemini), Groq** — escolhido via secret `LLM_PROVIDER` |
| Ícones embutidos | Lucide React |
| Shapes embutidos | Set SVG próprio (círculo, quadrado, retângulo, estrela, seta, balão, linha, triângulo) |
| Monorepo | **pnpm workspaces** |

---

## Estrutura do Monorepo

```
content-hub/
├── apps/
│   └── web/                    # App React (Vite SPA)
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/         # shadcn/ui components
│       │   │   ├── editor/     # EditorCanvas, EditorToolbar, PropertiesPanel, SlidePanel, LayersPanel
│       │   │   ├── preview/    # CarouselPreview com edição inline dos slides gerados
│       │   │   └── layout/     # AppShell, ProtectedRoute, RoleGuard
│       │   ├── pages/          # Login, Register, ForgotPassword, Dashboard, CreateCarousel,
│       │   │                   # Editor, Templates, BrandKits, Members, Settings
│       │   ├── hooks/          # use-auth, use-role, use-carousel-save, use-font-loader
│       │   ├── lib/
│       │   │   ├── supabase.ts # client com schema 'content_hub'
│       │   │   ├── ai/             # placeholder — lógica real nas Edge Functions
│       │   │   ├── export/         # export-png.ts, download-zip.ts
│       │   │   ├── templates/      # utils + system templates
│       │   │   ├── transcription/  # placeholder — lógica real na Edge Function transcribe
│       │   │   ├── qrcode.ts
│       │   │   └── utils.ts
│       │   ├── stores/         # auth-store, editor-store, role-store (Zustand)
│       │   ├── types/
│       │   ├── utils/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── index.css       # Tema dark glassmorphism Agentise (fixo)
│       ├── public/
│       └── .env.example
├── supabase/
│   ├── migrations/             # SQL idempotente — schema content_hub
│   ├── functions/              # Edge Functions Deno
│   │   ├── _shared/            # helpers (CORS, auth)
│   │   ├── generate-content/   # Proxy LLM multi-provider (OpenAI/Anthropic/Google/Groq)
│   │   ├── generate-image/     # Proxy Gemini — dual-model fallback
│   │   ├── transcribe/         # YouTube (Gemini) + Reels (Whisper)
│   │   ├── create-invite/      # Criação de convite por email
│   │   └── revoke-invite/      # Revogar convite
│   └── seed.sql
├── packages/
│   └── shared/                 # Types e utils compartilhados (@content-hub/shared)
├── .env.example                # Referência completa de envs
├── README.md
├── CONTRIBUTING.md
├── LICENSE
└── package.json
```

---

## Modelo de Dados (Postgres / schema `content_hub`)

Todas as tabelas de domínio vivem no schema `content_hub` (movidas em `026_move_tables_to_content_hub.sql`). O client Supabase JS é configurado com `db.schema = 'content_hub'` em `apps/web/src/lib/supabase.ts`.

### Tabelas principais

```sql
-- Roles globais (singleton)
user_roles (
  user_id uuid PK FK → auth.users,
  role text CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Brand Kit (identidade visual dos carrosséis gerados — não da plataforma)
brand_kits (
  id uuid PK,
  name text,
  colors jsonb,                 -- { primary, secondary, accent, background, text }
  fonts jsonb,                  -- { heading: { family, url }, body: { family, url } }
  logo_url text,
  avatar_url text,
  tone_of_voice text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Templates
templates (
  id uuid PK,
  name text,
  category text CHECK (category IN ('educacional', 'vendas', 'storytelling', 'antes_depois', 'lista', 'cta')),
  is_system boolean DEFAULT false,
  thumbnail_url text,
  slide_count_default int,
  created_at timestamptz,
  updated_at timestamptz DEFAULT now()
)

template_slide_variants (
  id uuid PK,
  template_id uuid FK → templates,
  slide_position text,          -- 'capa' | 'conteudo' | 'cta' | 'transicao'
  variant_name text,
  layout_json jsonb,            -- estrutura Konva serializada
  thumbnail_url text
)

-- Carrosséis
carousels (
  id uuid PK,
  created_by uuid FK → auth.users,
  title text,
  status text DEFAULT 'draft',  -- 'draft' | 'ready'
  brand_kit_id uuid FK → brand_kits NULL,
  template_id uuid FK → templates NULL,
  slide_count int,
  ai_input jsonb,               -- { type: 'url'|'text'|'video', content, topic, audience, tone }
  version int DEFAULT 1,
  created_at timestamptz,
  updated_at timestamptz
)

carousel_slides (
  id uuid PK,
  carousel_id uuid FK → carousels ON DELETE CASCADE,
  position int,
  canvas_json jsonb,            -- estado Konva stage serializado
  thumbnail_url text,
  export_url text               -- PNG exportado 1080x1350
)

carousel_versions (
  id uuid PK,
  carousel_id uuid FK → carousels,
  version int,
  snapshot_json jsonb,
  created_at timestamptz,
  created_by uuid FK → auth.users
)

-- Fontes customizadas
custom_fonts (
  id uuid PK,
  family_name text,
  font_url text,                -- URL no Supabase Storage
  format text,                  -- 'woff2' | 'ttf' | 'otf'
  weight text DEFAULT '400',
  style text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
)

-- Versões de schema aplicadas
schema_versions (
  version text PK,
  description text,
  applied_at timestamptz DEFAULT now()
)
```

### RLS

- Todas as tabelas têm RLS habilitado.
- **Política base** (singleton): `auth.uid() IS NOT NULL` para SELECT/INSERT/UPDATE/DELETE.
- **Refinamento por role**: operações sensíveis (DELETE em `carousels`, gestão de `user_roles`) checam `(SELECT role FROM content_hub.user_roles WHERE user_id = auth.uid()) = 'admin'`.
- **Templates**: `is_system = true` é read-only para todos; templates customizados são editáveis por qualquer usuário autenticado.
- **`schema_versions`**: SELECT permitido para `authenticated`; INSERT/UPDATE/DELETE apenas via service role.

### Promoção do primeiro usuário

Trigger `set_first_user_as_admin` em `auth.users` (criado em `021_default_workspace_trigger.sql`) insere automaticamente um registro em `user_roles` com `role = 'admin'` quando a tabela está vazia. Cadastros subsequentes entram como `member`.

---

## Funcionalidades

### 1. Autenticação

- **Páginas públicas**: `LoginPage`, `RegisterPage`, `ForgotPasswordPage`.
- **Rotas protegidas** via `ProtectedRoute` — redireciona para `/login` se não autenticado.
- Sem confirmação de email obrigatória por padrão (depende da config do Supabase Auth).

### 2. Geração de Carrossel por IA

1. Usuário escolhe **fonte de conteúdo**: texto livre, URL de blog, link YouTube, link Twitter/X.
2. Se URL de YouTube → Edge Function `transcribe` extrai a transcrição via Gemini (nativo, `fileData.fileUri`).
3. Usuário define tema, tom de voz (ou usa do Brand Kit), público-alvo, número de slides, categoria de template.
4. Frontend chama Edge Function `generate-content`:
   - Lê `LLM_PROVIDER` e `LLM_MODEL` do ambiente (overrides via payload).
   - Usa `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `GROQ_API_KEY` do ambiente.
   - Monta system prompt com tom de voz + estrutura do template.
   - Resposta é JSON com array de slides `{ position, type, headline, body, cta, notes }`.
5. Validação Zod rigorosa do output.
6. Tela de preview (`CarouselPreview.tsx`) — usuário edita inline antes de aceitar.
7. Aceitar → vai para o editor Konva.

### 3. Editor (Konva.js)

Layout: `SlidePanel` (esquerda) · `EditorCanvas` (centro, 1080×1350) · `PropertiesPanel` (direita) · `EditorToolbar` (topo) · `LayersPanel`.

Implementado:
- Toolbar: Texto, Imagem (upload), Shapes (Rect/Circle/Triangle/Star/Line/Arrow), Undo/Redo (history max 50), Zoom, Save, Download do slide atual (PNG), Download de todos (ZIP).
- Properties: posição, tamanho, rotação, opacidade, fontes, cores, alignment, stroke, border radius.
- Geração de imagem com IA no `PropertiesPanel` (substitui imagem do slide ativo).
- Store Zustand `editor-store.ts` com history/undo.

Pendente: ícone picker (Lucide), QR Code, Gráfico, Logo/Avatar do Brand Kit na toolbar; vídeo/GIF; máscaras de imagem; smart guides; agrupamento; copiar/colar entre slides; texto editável inline no canvas; UI de versões.

### 4. Exportação (única forma de saída do produto)

- PNG client-side via Konva (`stage.toDataURL({ pixelRatio: 2 })` em canvas offscreen 1080×1350).
- Botão "Baixar slide atual (PNG)" e botão "Baixar todos (ZIP)" no `EditorToolbar`.
- Botão "Download" no `DashboardPage` baixa todos os slides do carrossel selecionado como ZIP.
- ZIP gerado client-side via JSZip + file-saver.
- Upload opcional para Supabase Storage (`carousel_slides.export_url`) — usado apenas se houver necessidade de signed URL.
- Fontes customizadas carregadas via FontFace API antes da renderização.

### 5. Versionamento

- `carousel_versions` recebe snapshots a cada save significativo via `use-carousel-save`.
- **Pendente**: UI para listar e restaurar versões.

### 6. Templates

- Tabelas `templates` + `template_slide_variants` existem.
- Página `TemplatesPage`.
- **Pendente**: seed dos templates iniciais e UI completa de variações.

### 7. Roles

Apenas dois papéis em `content_hub.user_roles`:
- `admin` — primeiro usuário registrado; tudo.
- `member` — cria/edita carrosséis próprios; sem acesso a Settings de plataforma.

`RoleGuard` envolve rotas/elementos sensíveis.

---

## Convenções de Código

### Geral
- TypeScript strict mode.
- Path aliases: `@/` → `apps/web/src/`.
- Componentes: PascalCase, um por arquivo.
- Hooks: prefixo `use`, em `hooks/`.
- Utils: funções puras em `utils/` ou `lib/`.
- Types: em `types/` (preferir `interface` quando possível).
- Estado global: Zustand.
- Formulários: React Hook Form + Zod.
- Queries: TanStack Query para chamadas Supabase.
- Toasts: sonner.
- Modais: Dialog do shadcn/ui.

### Estilo
- Tailwind utility-first.
- shadcn/ui como base — customizar via Tailwind, não override CSS.
- Tema dark glassmorphism vive em `apps/web/src/index.css`. Edição direta + rebuild para mudar.
- Responsivo: mobile-first **fora do editor**. Editor exibe "Use no desktop" em telas < 1024px.
- Dark mode é default e único.

### Supabase
- Migrations idempotentes (`IF NOT EXISTS` / `IF EXISTS`); cada uma registrada em `content_hub.schema_versions`.
- Aplicadas via `supabase db push` (Supabase CLI).
- Edge Functions em TypeScript (Deno) — deploy via `supabase functions deploy <nome>`.
- Cada Edge Function valida JWT via `supabase.auth.getUser(token)` antes de tocar dados.
- Nomes de tabelas: snake_case, plural; colunas: snake_case.
- Sempre `created_at` e `updated_at timestamptz DEFAULT now()` em tabelas mutáveis.
- Secrets das Edge Functions vivem em `supabase secrets` (nunca em colunas).

### Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.
- Branch: `main` (produção), `dev` (integração).
- Feature branches: `feat/nome-da-feature`.

---

## Variáveis de Ambiente

### Frontend (`apps/web/.env`, lidas em build/dev pelo Vite)

| Var | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sim | Anon key do projeto Supabase |

### Edge Functions (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

| Var | Função consumidora | Descrição |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | todas | Injetadas automaticamente pelo runtime Deno do Supabase |
| `LLM_PROVIDER` | `generate-content` | `openai` \| `anthropic` \| `google` \| `groq` (default: `openai`) |
| `LLM_MODEL` | `generate-content` | Override do model (default por provider) |
| `OPENAI_API_KEY` | `generate-content` | |
| `ANTHROPIC_API_KEY` | `generate-content` | |
| `GOOGLE_API_KEY` | `generate-content`, `generate-image` | |
| `GROQ_API_KEY` | `generate-content` | |
| `GEMINI_IMAGEN_API_KEY` | `generate-image` | (alternativa a `GOOGLE_API_KEY`) |
| `google_api_key` | `transcribe` | YouTube/Shorts (Gemini) |
| `FRONTEND_ORIGIN` | `_shared/cors.ts` | Domínio do frontend em produção. Localhost, `*.supabase.co` e `*.vercel.app` já são liberados por padrão |

---

## Segurança

### Princípios

1. **Service Role Key nunca toca o browser** — disponível apenas como env var nativa nas Edge Functions (`SUPABASE_SERVICE_ROLE_KEY`).
2. **API keys de provedores externos vivem nas Edge Functions** — frontend nunca tem acesso direto.
3. **RLS habilitado em todas as tabelas** — base singleton `auth.uid() IS NOT NULL` + checagem de role para operações sensíveis.
4. **Validação em todas as fronteiras** — Zod nas respostas das Edge Functions, limites de tamanho em uploads.

### Edge Functions como barreira

Todas devem:
1. Validar JWT do usuário (`supabase.auth.getUser(token)`).
2. Verificar role quando aplicável (operações admin).
3. Sanitizar inputs e validar outputs com Zod.
4. (Pendente) Rate limiting.

### Uploads e Storage

- Buckets privados com signed URLs (expiração curta).
- Validar MIME type real via magic bytes.
- Limites: fontes max 2MB, imagens max 10MB.
- Whitelist de MIME types no Supabase Storage.

### Headers (Vercel `vercel.json`)

- `Content-Security-Policy` restritivo.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- CORS no Supabase com domínio específico (nunca wildcard `*`).

### Checklist pré-deploy

- [ ] Envs do frontend definidas no host (Vercel).
- [ ] Secrets das Edge Functions definidos via `supabase secrets set`.
- [ ] Edge Functions deployadas (`supabase functions deploy ...`).
- [ ] Migrations aplicadas (`supabase db push`).
- [ ] RLS habilitado em todas as tabelas.
- [ ] CORS no Supabase com domínio específico.
- [ ] CSP configurado em `vercel.json`.

---

## Regras Importantes

1. **Singleton self-hosted** — uma instância atende uma organização. Tabelas novas não devem carregar coluna de escopo por organização ou usuário (use RLS por `auth.uid()`).
2. **Tema fixo no código** — `apps/web/src/index.css` é a fonte da verdade visual da plataforma. Brand Kits (cores/fontes/logo do **carrossel gerado**) são domínio e permanecem como entidade.
3. **Secrets em env, não em coluna** — chaves de IA são `Deno.env.get(...)` nas Edge Functions. Não recriar fluxo de chaves por usuário.
4. **Migrations via Supabase CLI** — não bundle SQL no frontend, não executar migrations a partir do browser. `supabase db push` é o caminho.
5. **Schema `content_hub`** — todas as tabelas novas devem nascer nesse schema. O client JS já está configurado para selecioná-lo.
6. **Conventional Commits + pt-BR** em strings de UI.
7. **Exportação client-side idempotente** — mesmo input = mesmo output. Canvas offscreen com dimensões exatas (1080×1350).
8. **LLM adapter extensível** — adicionar provider = criar arquivo novo em `supabase/functions/generate-content/adapters/`, não alterar os existentes.
9. **Templates JSON versionados** — se o formato de `layout_json` mudar, manter backward compatibility.
10. **RLS é obrigatório** — nenhuma tabela nova sem RLS.
11. **Respostas de IA passam por Zod** antes de serem usadas no frontend.
12. **Editor é desktop-only** — exibir mensagem em telas < 1024px.
13. **Fontes customizadas via FontFace API** antes de renderizar o canvas.
14. **APIs externas (LLM, transcrição, Imagen) são sempre proxiadas via Edge Functions**. Frontend nunca chama provider direto.
15. **`pg_cron` executa SQL, não HTTP** — usar `pg_net` para invocar Edge Functions a partir de cron jobs.
16. **Uploads**: validar MIME via magic bytes (não extensão), limitar tamanho, buckets privados com signed URLs.
17. **CSP restritivo** na Vercel — bloquear scripts inline e de terceiros.
18. **Validação de canvas_json** com Zod no save e load. Limitar tamanho (5MB). Rejeitar URLs com protocolos não-HTTPS.
19. **Prompt injection** — usar delimitadores claros (`<user_content>...</user_content>`) e validar output com Zod.
20. **Rate limiting nas Edge Functions** (pendente, mas exigível para qualquer função pública).
21. **Concorrência no editor** — implementar lock simples (`editing_by` + timestamp) quando houver demanda de colaboração.
22. **Primeiro usuário vira admin** via trigger SQL — não duplicar essa lógica no frontend.
23. **Publicação no Instagram via Zernio** — além do ZIP/PNG, o produto publica/agenda carrosséis no Instagram pela **API do Zernio** (`https://zernio.com/api/v1`). A API key do Zernio é credencial da instância (`app_settings.zernio_api_key`, lida via `getCredential`); a conexão da conta IG (profile_id/account_id/username) vive em `instance_settings.zernio_connection`; posts publicados/agendados ficam em `scheduled_posts`. Toda chamada ao Zernio é server-side (Edge Functions `zernio-connect`/`zernio-sync-account`/`zernio-publish`) — a key nunca toca o browser. **A integração antiga via Meta/Facebook Login continua removida e não deve voltar** — a publicação é exclusivamente via Zernio. Campo de mídia confirmado: `mediaItems:[{type,url}]` (não `media`).

---

## Estado de Implementação (Snapshot)

**Pronto:**
- Auth (Login/Register/ForgotPassword + ProtectedRoute)
- Roles (`owner`/`member`) com promoção automática do primeiro usuário e self-signup fechado após o owner existir
- Convites (`invites` + Edge Functions `create-invite`/`revoke-invite`)
- Schema `content_hub` com todas as tabelas migradas
- Edge Functions: `generate-content` (4 adapters), `generate-image` (Gemini dual-model), `transcribe` (Gemini YouTube + Whisper Reels)
- Editor Konva: Texto, Imagem, Shapes, Undo/Redo, Zoom, Save, Download (PNG individual + ZIP)
- CarouselPreview com edição inline
- Geração de imagem com IA integrada no `PropertiesPanel`
- Download no Dashboard (ZIP por carrossel)
- Brand Kits CRUD

**Parcial / esqueleto:**
- LayersPanel (arquivo existe, integração completa pendente)
- Versionamento (save grava em `carousel_versions`, UI de restauração pendente)
- Templates (tabelas existem, seed e UI de variações pendentes)
- Rate limiting nas Edge Functions

**Não iniciado:**
- Ícone picker (Lucide), QR Code, Gráfico, Logo/Avatar do Brand Kit na toolbar
- Vídeo/GIF, máscaras de imagem, smart guides, agrupamento, copiar/colar entre slides
- Texto editável inline diretamente no canvas
- FontFace injection para fontes customizadas (tabela `custom_fonts` existe)
- Transcrição Twitter/X
- Salvar templates customizados
