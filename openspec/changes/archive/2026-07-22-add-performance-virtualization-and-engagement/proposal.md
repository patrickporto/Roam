# Change: Performance em escala, menu contextual de perfis, grade estilo TikTok e likes no For You

## Why

Quatro problemas reportados: (1) o feed "For You" está completamente vazio — o cursor inicial da store é `null` ("fim do feed"), impedindo a primeira página de carregar, e a sessão do feed não é invalidada quando novos perfis são adicionados; (2) o algoritmo materializa todos os caminhos em memória e o DOM cresce sem limite — inviável para milhões de arquivos; (3) não há como gerenciar perfis (editar/remover) nem navegar para um perfil e ver álbuns/mídias em grade como no TikTok; (4) likes não influenciam o algoritmo na prática e não há onde ver os favoritados.

## What Changes

- **Fix For You vazio**: cursor inicial `undefined`; sessões do feed invalidadas no main ao adicionar/remover/editar raízes; store local recarrega.
- **MODIFIED `for-you-feed`**: amostragem escalável O(log n) via `rowid` aleatório (sem materializar o índice inteiro), scoring calculado por página (likes passam a valer na página seguinte), novo sinal de palavras-chave extraídas de arquivos curtidos, ciclo infinito com reset de servidos ao esgotar o índice.
- **MODIFIED `immersive-viewing`**: virtualização real — DOM limitado a ~5 cards com snap programático (scrollend/debounce) e janela deslizante de memória (máx. 500 itens) com compensação de scroll.
- **ADDED `library-profiles`**: menu contextual por perfil (abrir, abrir no Explorador, reindexar, editar tipo de raiz com rescan, remover); visualização do perfil em grade estilo TikTok com ordenação recentes/antigas e abertura do feed na posição clicada.
- **ADDED `favorites`**: aba "Favoritos" com grade de arquivos curtidos (feed na posição clicada) e atalhos de pastas favoritas.

## Impact

- **Affected specs**: `for-you-feed`, `immersive-viewing`, `library-profiles`, `favorites`.
- **Affected code**: `electron/services/recommendation.ts` (reescrever), `favoritesStore.ts`, `db.ts`, `ipc/handlers.ts`, `preload.ts`, `src/shared/types.ts`, `src/api.ts`, `src/store/index.ts`, `src/components/feed/FeedView.tsx` (reescrever), novos `MediaGrid.tsx`, `FavoritesPage.tsx`, `ProfileList.tsx` (menu), `ProfilePage.tsx` (grade), `TabShell.tsx`, `App.tsx`, `styles.css`.
- **Performance**: `PRAGMA synchronous = NORMAL`; consultas de amostragem por `rowid`; sem `ORDER BY RANDOM()`.
