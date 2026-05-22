# Content Hub

Editor self-hosted de carrosseis visuais em formato 4:5, com geracao assistida por IA, exportacao em PNG/ZIP e multiusuario interno.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui |
| Editor | Konva.js (`react-konva`) |
| Backend | Supabase Postgres, Auth, Edge Functions e Storage |
| Deploy | Vercel |
| Schema | `content_hub` para tabelas de dominio |

## Setup Para Alunos

1. Acesse o painel Agentise e siga o fluxo para criar sua copia do template.
2. Importe o projeto na Vercel.
3. Abra a URL deployada.
4. Siga o wizard em `/setup`.

O wizard coleta as credenciais, aplica migrations, publica Edge Functions, configura as envs core na Vercel e salva as credenciais de aplicacao criptografadas em `app_settings` no Supabase da propria instancia.

Mais detalhes ficam no painel Agentise.

Nao delete `CRYPTO_KEY` das Environment Variables da Vercel. Ela e necessaria para descriptografar as credenciais salvas em `app_settings`.

## Desenvolvimento Local

```bash
pnpm install
pnpm dev
```

Em desenvolvimento, use envs locais apenas para apontar para uma instancia Supabase ja configurada. Em producao, o caminho suportado para alunos e o wizard `/setup`.

## Estrutura

```text
content-hub/
├── api/                    # Vercel Serverless Functions
├── apps/web/               # Frontend React/Vite
├── packages/shared/        # Types compartilhados
├── supabase/
│   ├── migrations/         # SQL do produto e setup infra
│   └── functions/          # Edge Functions
├── setup.config.ts         # Manifesto de credenciais da ferramenta
└── README.md
```

## Credenciais

Credenciais core ficam em envs da Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRYPTO_KEY`

Credenciais de aplicacao ficam em `public.app_settings`, criptografadas com AES-256-GCM.

## Roles

Roles vivem em `content_hub.user_roles`:

| Role | Capacidades |
|---|---|
| `owner` | Administra a instancia, membros e credenciais |
| `member` | Cria e edita carrosseis |

O wizard cria a conta owner durante o bootstrap.

## Licenca

MIT, veja [LICENSE](LICENSE).
