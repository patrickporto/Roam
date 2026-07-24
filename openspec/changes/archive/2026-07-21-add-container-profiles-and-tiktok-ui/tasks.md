## 1. Modelo de dados
- [x] 1.1 Adicionar `RootKind = 'container' | 'profile'` e `MediaItem.profilePath` em `src/shared/types.ts`
- [x] 1.2 Migração DB `user_version` 2: `roots.kind`, `media_index.profile_path`, recriar índice (cache derivado)
- [x] 1.3 Rescan automático de todas as raízes na inicialização do app

## 2. Media serving (media-serving)
- [x] 2.1 Novo esquema de URL: `media://file/<caminho-absoluto-codificado-por-segmento>` (util `toMediaUrl` sem dependência de electron)
- [x] 2.2 Reescrever `mediaProtocol.ts`: parse da URL, validação anti-traversal contra raízes registradas, MIME por extensão
- [x] 2.3 Streaming com Range: resposta 206 com `Content-Range`, suporte a suffix-range e 416

## 3. Scanner e perfis
- [x] 3.1 `mediaScanner.ts`: parâmetro `kind`, cálculo de `profilePath`/`albumPath` conforme tipo da raiz
- [x] 3.2 `favoritesStore.getProfiles()`: agrupar por `profile_path` através das raízes; álbuns por perfil
- [x] 3.3 `listMedia` por escopo `{ profilePath | albumPath }`; boost do feed considera `profile_path`

## 4. IPC
- [x] 4.1 `library:pickFolder` + `library:addRoot(path, kind)` (substitui pickAndAddRoot)
- [x] 4.2 `win:minimize` / `win:toggleMaximize` / `win:close` expostos no preload como `roam.win`
- [x] 4.3 Handlers persistem `profile_path`; scanner recebe `kind` da raiz

## 5. UI TikTok
- [x] 5.1 `TitleBar`: logo, tabs centralizadas overlay, controles de janela (— ▢ ✕) com drag region
- [x] 5.2 `MediaCard`: action rail direita (avatar→perfil, curtir SVG, favoritar pasta, mute), info overlay, dblclick curtir com heart burst, progress bar com seek, click play/pause
- [x] 5.3 `FeedView`: re-render do item ativo (fix autoplay), navegação por setas do teclado, scrollbar oculta
- [x] 5.4 `ProfileList`: modal de seleção do tipo de pasta (coleção de perfis vs perfil único)
- [x] 5.5 `styles.css`: reescrita visual completa (preto puro, gradientes, rail 48px, heart #fe2c55)
- [x] 5.6 Mock de dev em `src/api.ts` atualizado (perfis via container, win no-op)

## 6. Verificação
- [x] 6.1 Teste novo: scanner em modo `container` (perfil/álbum/implícito)
- [x] 6.2 Mock do recommendation atualizado com `profile_path`; 18+ testes passando
- [x] 6.3 Typecheck zero erros; `dist-electron` recompilado
