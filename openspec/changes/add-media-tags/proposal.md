# Change: Adicionar tags em arquivos e pastas com feed por tag

## Why
Hoje a única forma de organizar e reencontrar conteúdo é via favoritos, que são binários e não permitem categorização. O usuário quer classificar mídias e pastas com tags livres, navegar facilmente entre elas e consumir todo o conteúdo de uma tag em um feed recomendado.

## What Changes
- Nova capability `tagging`: criar, aplicar e remover tags em arquivos individuais e em pastas (perfis/álbuns), com UI simples e intuitiva no feed e nas páginas de perfil/álbum; persistência local em SQLite.
- Nova capability `tag-feed`: aba/página de tags com navegação entre tags e feed imersivo filtrado por tag (tag de pasta inclui todo o conteúdo contido, achatado como no deep resolving).
- MODIFIED em `for-you-feed`: tags passam a ser sinal de boost no algoritmo do feed "For You" (itens com tags do usuário ganham prioridade), consistente com o comportamento de favoritos.

## Impact
- Affected specs: `tagging` (nova), `tag-feed` (nova), `for-you-feed` (modificada)
- Affected code:
  - `electron/services/db.ts` (schema: tabelas `tags`, `item_tags`)
  - `electron/services/` (novo `tagsStore.ts`, mudanças em `recommendation.ts`)
  - `electron/ipc/handlers.ts` e `electron/preload.ts` (contratos IPC tipados)
  - `src/shared/types.ts` (tipos `Tag`, `TaggedItem`)
  - `src/components/feed/` (UI de tagear no item do feed), `src/components/profile/` (tagear álbuns/perfis), `src/components/tabs/TabShell.tsx` (nova aba Tags), `src/store/` (estado Zustand de tags)
