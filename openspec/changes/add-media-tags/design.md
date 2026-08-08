## Context
Tags são a segunda forma de organização do app (a primeira é favoritos). O modelo de favoritos (`favoritesStore.ts` + tabelas SQLite + boost no `recommendation.ts`) é o padrão de referência. Decisões confirmadas com o usuário: (1) tag de pasta inclui todo o conteúdo contido no feed da tag; (2) o feed da tag usa a ordenação algorítmica existente e tags também alimentam o boost do For You.

## Goals / Non-Goals
- Goals: tagear/remover tags em arquivos e pastas de forma simples (máx. 2 cliques a partir do item); feed imersivo por tag; navegação rápida entre tags (lista de tags com contagem); tags como sinal no algoritmo do For You.
- Non-Goals: hierarquia de tags, renomear/mesclar tags, cores de tags, importação/exportação, sync externo, autocompletar por IA.

## Decisions
- **Modelo de dados**: tabela `tags(id, name UNIQUE COLLATE NOCASE, created_at)` e `item_tags(tag_id, target_type ('file'|'folder'), target_path, created_at, PRIMARY KEY(tag_id, target_type, target_path))`, espelhando o padrão de `favoritesStore.ts`. Nomes de tag normalizados (trim, lowercase) e case-insensitive para evitar duplicatas ("Praia" = "praia").
- **Resolução de pasta → conteúdo**: no feed da tag, pastas tageadas são resolvidas via o índice de mídia existente (mesma lógica de flatten/deep resolving do `mediaScanner`), sem duplicar varredura de disco. Itens tageados individualmente são unidos (dedup por path) com o conteúdo das pastas tageadas.
- **Feed da tag**: reutiliza o `recommendation.ts` com um filtro `WHERE path IN (itens da tag)`; mantém paginação por cursor, mistura de recência e ciclo infinito do For You.
- **Boost no For You**: itens que possuem qualquer tag recebem boost de score; itens cujas tags aparecem em curtidas recentes recebem boost adicional (mesmo mecanismo de palavras-chave de favoritos).
- **UI de tagear**: popover ancorado no item (ícone de tag ao lado do de curtir) com input de texto + chips das tags existentes (autocomplete); Enter cria/aplica; clique no chip aplica/remove (toggle). Remover = clicar no chip ativo ou no "x" do chip.
- **IPC**: handlers `tags:list`, `tags:forItem`, `tags:add`, `tags:remove`, `tags:feedPage` em `electron/ipc/handlers.ts`, expostos via `contextBridge` com tipos em `src/shared/types.ts`.

## Risks / Trade-offs
- Tag de pasta em diretório muito grande → resolução pode ser custosa. Mitigação: resolução via índice SQLite (não disco), com `LIKE 'path/%'` indexado por prefixo.
- Tags renomeadas implícitamente ao mover pastas → paths ficam órfãos. Mitigação: mesma estratégia de favoritos (paths órfãos são ignorados na resolução); fora de escopo limpeza automática.
- Autocomplete com muitas tags → lista virtualizada simples; não esperado no v1 (limite prático de dezenas de tags).

## Migration Plan
- Adicionar tabelas `tags` e `item_tags` na inicialização do `db.ts` com `CREATE TABLE IF NOT EXISTS`; sem migração de dados existentes (schema aditivo, sem breaking change).

## Open Questions
- Nenhuma (defaults confirmados pelo usuário no pedido).
