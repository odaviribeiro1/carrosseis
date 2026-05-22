# Known Issues

Registro de problemas conhecidos e pré-existentes, com causa e workaround. Não são
corrigidos no contexto onde foram detectados — cada um tem um caminho de correção próprio.

---

## KI-001 — Bootstrap não dispara redeploy na Vercel (envs core só ativam no próximo deploy)

- **Severidade:** 🟡 Alta (bloqueia o caminho feliz do wizard no primeiro run)
- **Origem:** pré-existente (introduzido no Prompt 2)
- **Correção planejada:** **Prompt 6** (não corrigir antes disso)
- **Detectado em:** auditoria do Prompt 3; reconfirmado no Prompt 4

### Localização

- **Arquivo:** `api/bootstrap.ts`
- **Função:** `configureVercel(token, envs)` — aprox. linhas 225-241
- **Checkpoint afetado:** `redeploy_triggered` — `api/bootstrap.ts:75-80` (gravado apenas se `vercel.deployment_id` for verdadeiro)

### Comportamento esperado

Após gravar as envs core na Vercel (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRYPTO_KEY`),
o bootstrap deveria **disparar um novo deployment** (ex.: `POST /v13/deployments` ou um
Deploy Hook), retornar `deployment_id`/`deployment_url`, gravar o checkpoint
`redeploy_triggered` e então a aplicação reiniciar já com as envs ativas.

### Comportamento atual

- `configureVercel` grava as envs via `POST /v10/projects/{id}/env?upsert=true`, mas
  **sempre retorna `{ deployment_id: '', deployment_url: '' }`** — nunca chama a API de
  deployments. Logo o checkpoint `redeploy_triggered` nunca é criado e **nenhum redeploy
  é acionado**.
- Além disso, `configureVercel` depende de `process.env.VERCEL_PROJECT_ID`; se essa env
  estiver ausente, a função faz **early-return e nem grava as envs** (`api/bootstrap.ts:226-229`).

### Impacto

As envs core gravadas pelo wizard **só passam a valer no próximo deploy manual**. Até lá:

1. **Frontend:** `isSupabaseConfigured` é `false` (as `VITE_*` não estão no bundle servido),
   então o app continua redirecionando para `/setup`.
2. **Serverless Functions:** `/api/credentials` (e qualquer rota que use
   `getSupabaseAdmin()`) não têm `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `CRYPTO_KEY`
   no runtime e falham com `Supabase core ausente no servidor`. Isso faz o **Step 4 do
   wizard falhar no primeiro run** (antes de qualquer redeploy), mesmo com o login do owner
   funcionando (o login fala direto com o Auth do Supabase e não depende dessas envs).
3. **UX enganosa:** a timeline do Step 3 mostra "Configurando Vercel", "Disparando redeploy"
   e "Aguardando aplicação reiniciar" como **concluídos** (otimismo no client em
   `SetupPage.tsx`), mascarando o fato de que o redeploy não aconteceu.

### Workaround atual

Após o bootstrap, fazer um **redeploy manual** na Vercel (ou um novo push). Depois reabrir
`/setup?step=4` para finalizar as credenciais de aplicação — nesse ponto o
`finishSetup` usa a sessão global do Supabase como fallback de token.

### Notas para a correção (Prompt 6)

- Disparar o deployment de fato e propagar `deployment_id`/`deployment_url` para o checkpoint.
- Tratar `VERCEL_PROJECT_ID` ausente como erro explícito (não early-return silencioso) ou
  derivar o project id de outra fonte.
- Considerar fazer a timeline do Step 3 refletir o estado real lido de `_bootstrap_state`
  em vez de marcar os passos como concluídos de forma otimista (cruza com o achado E.7 da
  auditoria do Prompt 3).

---

## KI-002 — Proxy de Management API aberto no `vercel.json`

- **Severidade:** 🔴 Bloqueador de distribuição
- **Origem:** pré-existente (Prompt 2) · **Detectado em:** auditoria do Prompt 3 (item B.5)
- **Arquivo:** `apps/web/vercel.json` (bloco `rewrites`, ~L25-29)

**Atual:** rewrite `"/api/supabase-mgmt/:path*"` → `"https://api.supabase.com/:path*"`. É um
proxy **órfão** (nenhum código em `src/`/`api/` o usa) que expõe um relay público para a
Management API a partir do domínio do app.
**Esperado:** zero proxies de Management API — toda chamada deve viver dentro de
`api/bootstrap.ts`.
**Impacto:** superfície de ataque desnecessária e violação do modelo arquitetural. Não vaza
credenciais da instância (não injeta token).
**Correção:** remover o rewrite. Independente de KI-001.

---

## KI-003 — Deploy de Edge Functions não empacota `_shared/` nem `adapters/`

- **Severidade:** 🔴 Bloqueador de distribuição (quebra todas as EFs em runtime)
- **Origem:** pré-existente (Prompt 2) · **Detectado em:** auditoria do Prompt 3 (achado crítico #2)
- **Arquivo/função:** `api/bootstrap.ts` → `readFunctionBody` (~L165-171) e `listEdgeFunctions` (~L158-163)

**Atual:** lê apenas os `.ts` do nível raiz de cada função (`index.ts`); ignora
`../_shared/*.ts` e `./adapters/*.ts`. O deploy single-`body` via Management API não resolve
esses imports relativos a arquivos não enviados.
**Esperado:** o body deployado deve conter/resolver `_shared/credentials.ts`,
`_shared/cors.ts` e `adapters/*.ts`.
**Impacto:** após o bootstrap, `getCredential()`/`getCorsHeaders()` apontam para módulos
inexistentes → as 5 EFs (geração de conteúdo/imagem, transcrição, convites) falham. Anula na
prática a refatoração de credenciais. *(Confirmação estática de alta confiança; validar em runtime.)*
**Correção:** deploy multi-arquivo/eszip, ou inline dos módulos compartilhados no body.

---

## KI-004 — Timeline do Step 3 não hidrata de `_bootstrap_state`

- **Severidade:** 🟡 · **Detectado em:** auditoria do Prompt 3 (item E.7) · cruza com KI-001
- **Arquivo:** `apps/web/src/pages/setup/SetupPage.tsx` (`BootstrapStep` / `runBootstrap`)

**Atual:** a timeline é estado React otimista; não há fetch que leia `_bootstrap_state`. Após
refresh no Step 3, os checkpoints já concluídos não aparecem e o retry re-dispara do zero (o
backend é idempotente, mas a UI não reflete o progresso).
**Esperado:** ler `_bootstrap_state` ao montar o Step 3 e mostrar ✓ nos passos concluídos.
**Impacto:** "retomada após refresh" não funciona como especificado.
**Correção:** expor `_bootstrap_state` (endpoint) e hidratar a timeline.

---

## KI-005 — Referência pendente a `UPDATE.md`

- **Severidade:** 🟢 · **Detectado em:** auditoria do Prompt 3 (item B.2)
- **Arquivo:** `apps/web/src/customizations/README.md:7`

**Atual:** o texto cita `UPDATE.md`, arquivo de instruções legacy que foi removido.
**Impacto:** documentação enganosa; sem impacto funcional.
**Correção:** atualizar ou remover a referência.
