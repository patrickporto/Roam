## 1. For You funcional
- [x] 1.1 Fix: `feedCursor` inicial `undefined` na store (bug que esvaziava o feed)
- [x] 1.2 `clearFeedSessions()` no main chamado após add/remove/updateKind de raízes; renderer limpa feed local
- [x] 1.3 Reescrita do `recommendation.ts`: amostragem por `rowid` aleatório, scoring por página, sinais de likes (pasta, formato, keywords de arquivos curtidos), ciclo infinito com reset

## 2. Performance e virtualização
- [x] 2.1 `FeedView` virtualizado: DOM ~5 cards, spacer de altura total, snap programático por debounce
- [x] 2.2 Janela deslizante de 500 itens na store com compensação de `scrollTop`
- [x] 2.3 `PRAGMA synchronous = NORMAL`; sem queries que materializam o índice inteiro

## 3. Menu contextual de perfis
- [x] 3.1 Menu customizado (botão direito): Abrir, Abrir no Explorador, Reindexar, Editar tipo, Remover
- [x] 3.2 IPC `library:updateRootKind` (update + limpa índice da raiz + rescan) e `shell:openPath`
- [x] 3.3 Modal de edição de tipo de raiz (container ↔ profile)

## 4. Grade de perfil estilo TikTok
- [x] 4.1 `MediaGrid`: tiles lazy com capa, indicador de vídeo, clique abre feed na posição
- [x] 4.2 ProfilePage: modo Grade (padrão) ↔ Feed, toolbar com ordenação "Mais recentes/Mais antigas"
- [x] 4.3 `listMedia` com parâmetro `order`

## 5. Favoritos
- [x] 5.1 IPC `favorites:media` (JOIN media_index × favorites, paginado)
- [x] 5.2 Aba "Favoritos": grade de arquivos + chips de pastas; feed na posição clicada
- [x] 5.3 TabShell com 3 abas (Para Você, Perfis, Favoritos)

## 6. Verificação
- [x] 6.1 Mock do recommendation reescrito para as novas queries; dedup entre páginas reativado
- [x] 6.2 Testes verdes, typecheck zero, dist-electron recompilado
