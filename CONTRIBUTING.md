# Contribuindo com o Content Hub

Obrigado pelo interesse! Este documento descreve o fluxo mínimo de contribuição.

## Branch model

- `main` — produção. Protegida; recebe merges via PR aprovado.
- `dev` — integração contínua de features prontas mas ainda não promovidas.
- Feature branches a partir de `dev`: `feat/<nome-curto>` ou `fix/<nome-curto>`.

## Conventional Commits

Mensagens seguem [Conventional Commits](https://www.conventionalcommits.org):

- `feat: adicionar suporte a vídeo no editor`
- `fix: corrigir export PNG quando fonte customizada está ausente`
- `chore: atualizar dependências shadcn/ui`
- `refactor: extrair lógica de upload de imagem`
- `docs: clarificar setup do Apify no README`

Commits que tocam migrations devem prefixar com `migration(faseN):` apenas em contextos de release/migração coordenada.

## Como rodar localmente

Veja a seção **Setup** do [README.md](README.md). Para desenvolvimento, use uma instancia Supabase ja configurada pelo wizard e rode:

```bash
pnpm install
pnpm dev
```

## Requisitos para PR

Antes de abrir o PR, garanta:

- [ ] Build limpo: `pnpm build` sem erro.
- [ ] Lint limpo: `pnpm lint` sem warnings novos.
- [ ] Mensagens de commit no padrão Conventional Commits.
- [ ] Se mudou schema: migration nova, idempotente (`IF NOT EXISTS` / `IF EXISTS`), com versão registrada em `schema_versions`.
- [ ] Se tocou Edge Function: validar o fluxo pelo wizard ou pela automacao de deploy do projeto.
- [ ] Se mudou env vars: atualizar `.env.example`.
- [ ] Strings de UI em pt-BR.
- [ ] Smoke test manual descrito (ver abaixo).

## Customizando sem conflitos

Toda customização que você fizer no seu fork deve ficar em `apps/web/src/customizations/`. Esse diretório é "zona livre" — o upstream nunca edita nada lá. Garante que `git pull` (ou *Sync fork*) não gere conflito quando você atualizar.

Para mais detalhes, leia [`apps/web/src/customizations/README.md`](apps/web/src/customizations/README.md).

## Smoke test manual obrigatório

**Não há testes automatizados neste repositório.** Todo PR que toque domínio (editor, geração de IA, export) precisa documentar no corpo do PR um smoke test manual que cubra o caminho feliz da feature, mais ao menos uma regressão adjacente.

Caminho mínimo recomendado:

1. Login com usuário existente (ou registrar primeiro usuário em ambiente limpo).
2. Criar um carrossel a partir de prompt de texto.
3. Editar pelo menos um slide no Konva (texto, imagem, shape).
4. Exportar slide atual em PNG e baixar todos em ZIP.

## Código de conduta

Seja respeitoso e direto. Ataques pessoais, assédio ou comentários discriminatórios não são tolerados.

## Licença

Ao contribuir, você concorda em licenciar suas contribuições sob a [MIT License](LICENSE).
