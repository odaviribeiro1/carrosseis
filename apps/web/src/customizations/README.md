# Customizations

Este diretório é o local **único e seguro** para customizações de código que você quer fazer na sua instância sem causar conflitos com atualizações do upstream.

## Por que existe

Quando você puxa atualizações do upstream (via `UPDATE.md`), o Git tenta mesclar as mudanças do projeto principal com seu código local. Se você editar arquivos fora deste diretório, vai conflitar quando puxar atualizações.

**Regra simples:** o upstream nunca edita arquivos dentro de `apps/web/src/customizations/`. Tudo aqui é seu.

## Como usar

- Crie hooks, componentes, helpers próprios aqui dentro.
- Importe-os no resto da aplicação normalmente: `import { meuHook } from '@/customizations/hooks/meuHook'`.
- Para sobrescrever comportamento, exporte uma versão custom daqui e importe onde for usar (em vez de importar a versão do core).

## Limites

Customizações que exigem editar arquivos de domínio (ex.: alterar lógica de uma Edge Function existente, mudar comportamento de um componente core do editor Konva) **não cabem aqui** — vão precisar de merge manual quando atualizar.

Para essas, recomendado: abra issue ou PR no upstream sugerindo a customização como feature opcional.

## Exemplos do que cabe aqui

- Componente novo com sua marca: `apps/web/src/customizations/components/NossaCabecalho.tsx`
- Hook próprio: `apps/web/src/customizations/hooks/use-meu-recurso.ts`
- Wrapper que chama uma Edge Function própria: `apps/web/src/customizations/lib/minha-api.ts`
- Páginas extras adicionadas a rotas próprias: `apps/web/src/customizations/pages/MinhaPage.tsx`
