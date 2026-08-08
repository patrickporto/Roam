## 1. Dados e serviços (main process)
- [x] 1.1 Adicionar tabelas `tags` e `item_tags` em `electron/services/db.ts` (CREATE TABLE IF NOT EXISTS)
- [x] 1.2 Criar `electron/services/tagsStore.ts`: CRUD de tags, add/remove tag em arquivo/pasta (normalização case-insensitive), listagem com contagem, tags por item
- [x] 1.3 Estender `recommendation.ts`: (a) filtro por tag para o feed da tag (resolvendo pastas tageadas via índice com dedup); (b) boost de score para itens com tags no For You
- [x] 1.4 Testes unitários (Vitest) de `tagsStore` e das extensões de `recommendation`

## 2. IPC e tipos compartilhados
- [x] 2.1 Adicionar tipos `Tag`, `TaggedItem` e contratos IPC em `src/shared/types.ts`
- [x] 2.2 Implementar handlers `tags:list`, `tags:forItem`, `tags:add`, `tags:remove`, `tags:feedPage` em `electron/ipc/handlers.ts`
- [x] 2.3 Expor API tipada no `electron/preload.ts` via contextBridge

## 3. UI de tagear (renderer)
- [x] 3.1 Criar componente `TagPopover` (input + chips com autocomplete, toggle de tag, remoção)
- [x] 3.2 Integrar ação de tagear nos itens do feed (`src/components/feed/`) ao lado da ação de curtir
- [x] 3.3 Integrar ação de tagear em cards/páginas de perfil e álbum (`src/components/profile/`)
- [x] 3.4 Estado Zustand de tags em `src/store/` (cache de tags do item, atualização otimista)

## 4. Navegação e feed por tag
- [x] 4.1 Nova aba "Tags" em `src/components/tabs/TabShell.tsx`: lista de tags com contagem de itens
- [x] 4.2 Página/feed imersivo da tag: abre o feed filtrado pela tag selecionada, com navegação de retorno à lista e troca rápida entre tags
- [x] 4.3 Chips de tag clicáveis no item do feed navegam para o feed daquela tag

## 5. Validação
- [x] 5.1 `openspec validate add-media-tags --strict` passa
- [x] 5.2 Testes unitários passam (`vitest run`)
- [ ] 5.3 Teste manual ponta a ponta: tagear arquivo e pasta, remover tag, abrir feed da tag (pasta achatada), verificar boost no For You, reiniciar app e confirmar persistência
