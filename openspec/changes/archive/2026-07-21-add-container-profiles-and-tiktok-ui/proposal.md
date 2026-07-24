# Change: Pastas-coleção de perfis, media serving com streaming e UI TikTok

## Why

Três problemas reportados em uso real: (1) o protocolo `media://` está quebrado — o primeiro segmento do caminho relativo vira hostname na URL e não há suporte a Range requests, então nenhuma imagem/vídeo carrega; (2) a UI está longe do padrão TikTok — falta action rail, controles de janela no frameless, scrollbar visível, e vídeos não dão autoplay porque o índice ativo não dispara re-render; (3) o modelo de dados só suporta "pasta adicionada = perfil", impedindo adicionar uma pasta raiz que contém vários perfis.

## What Changes

- **MODIFIED `media-indexing`**: o índice passa a registrar `profile_path` e `album_path` resolvidos conforme o tipo da raiz; novo conceito de tipo de pasta raiz.
- **MODIFIED `library-profiles`**: raiz do tipo `container` gera um perfil por subpasta direta (+ perfil implícito para mídias soltas); raiz do tipo `profile` mantém comportamento atual (pasta = perfil, subpastas = álbuns).
- **NEW `media-serving`**: capability do protocolo `media://` com URLs de caminho absoluto codificado, streaming com Range (206), MIME correto e validação anti-traversal.
- **MODIFIED `immersive-viewing`**: action rail direita estilo TikTok (avatar, curtir, favoritar pasta, mute), info overlay inferior-esquerdo, barra de progresso de vídeo com seek, double-click para curtir com animação, navegação por teclado, scrollbar oculta, barra de título customizada com controles de janela (min/max/close) e tabs top-center sobrepostas.
- **Fix de bugs**: re-render do item ativo no scroll (autoplay de vídeo), esquema de URL `media://`.

## Impact

- **Affected specs**: `media-indexing`, `library-profiles`, `immersive-viewing` (modificadas); `media-serving` (nova).
- **Affected code**: `electron/services/{mediaProtocol,mediaScanner,db,favoritesStore,recommendation}.ts`, `electron/ipc/handlers.ts`, `electron/preload.ts`, `electron/main.ts`, `src/shared/types.ts`, `src/api.ts`, `src/store/index.ts`, `src/components/**`, `src/styles.css`.
- **Migração de dados**: `user_version` 2 — `media_index` recriada (cache derivado) e `roots` ganha coluna `kind`; rescan automático na inicialização repovoa o índice.
