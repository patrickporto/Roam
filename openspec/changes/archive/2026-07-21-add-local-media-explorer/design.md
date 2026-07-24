# Design: Explorador de mídia local estilo TikTok

## Context

App desktop Windows para consumo imersivo de mídia local. O desafio central é ler sistemas de arquivos potencialmente grandes e profundos sem travar a UI, e entregar um feed vertical fluido (60fps) com vídeos. A arquitetura separa todo trabalho de I/O e CPU no main process do Electron, deixando o renderer React apenas com apresentação.

## Goals / Non-Goals

- **Goals**: varredura recursiva assíncrona com flatten; feed vertical infinito com snap; perfis/álbuns derivados da estrutura de pastas; recomendação v1 por metadados + favoritos; favoritos persistidos localmente.
- **Non-Goals**: edição de mídia, upload/sync em nuvem, thumbnails transcodificadas (v1 usa o arquivo original via protocolo customizado), recomendação por ML/conteúdo, suporte a macOS/Linux (a arquitetura não deve impedir, mas só Windows é validado).

## Decisions

### Estrutura de pastas do projeto

```
roam/
├── electron/
│   ├── main.ts                  # bootstrap do app, BrowserWindow frameless
│   ├── preload.ts               # contextBridge com API tipada
│   ├── ipc/
│   │   └── handlers.ts          # registro dos canais IPC
│   └── services/
│       ├── mediaScanner.ts      # deep resolving assíncrono + metadados
│       ├── recommendation.ts    # algoritmo do feed For You
│       ├── favoritesStore.ts    # SQLite (better-sqlite3)
│       └── mediaProtocol.ts     # protocolo media://
├── src/
│   ├── shared/types.ts          # contratos MediaItem, Profile, Album, IPC
│   ├── components/
│   │   ├── feed/FeedView.tsx    # scroll vertical snap + virtualização
│   │   ├── feed/MediaCard.tsx   # imagem/vídeo + ações (curtir)
│   │   ├── tabs/TabShell.tsx    # abas For You / Perfis
│   │   └── profile/ProfileCard.tsx, ProfilePage.tsx, AlbumGrid.tsx
│   ├── hooks/useFeed.ts, useFavorites.ts
│   ├── store/ (Zustand)
│   └── App.tsx
```

### Deep Resolving assíncrono (mediaScanner)

- **Decisão**: BFS iterativo com `fs.promises.readdir(..., { withFileTypes: true })`, processando diretórios em batches (ex.: 50 entradas) com `await setImmediate()` entre batches para nunca bloquear o event loop do main process. Resultados emitidos em lotes via `scan:progress` para a UI exibir mídia assim que disponível (streaming), sem esperar a varredura completa.
- **Alternativas consideradas**: (a) `worker_threads` — adiado: BFS assíncrono com yielding já não bloqueia; workers viram opção se profiling mostrar gargalo em volumes >100k arquivos. (b) bibliotecas de glob (`fast-glob`) — rejeitado para manter controle fino de progresso, cancelamento e flatten incremental.
- **Segurança**: resolver `realpath` e manter conjunto de inodes/caminhos visitados para impedir ciclos de symlink/junction (comum no Windows); erros de leitura (`EPERM`, `ENOENT` em corrida) são contabilizados e ignorados, nunca abortam a varredura.

### Servir mídia ao renderer

- **Decisão**: protocolo customizado privilegiado `media://` registrado via `protocol.handle`, mapeando para caminhos locais somente dentro das pastas raiz registradas (validação de prefixo contra path traversal). Evita expor `file://` e permite streaming de vídeo com range requests.
- **Segurança**: `contextIsolation: true`, `nodeIntegration: false`, renderer acessa apenas a API do `contextBridge`.

### Persistência

- **Decisão**: `better-sqlite3` (síncrono, transações, zero servidor) no main process. Tabelas: `roots(id, path, added_at)`, `media_index(path PK, root_id, album_path, type, format, size, created_at, modified_at, keywords, indexed_at)`, `favorites(target_type, target_path, created_at)` com `target_type ∈ {file, folder}`.
- **Alternativas consideradas**: JSON em disco — rejeitado por não escalar consultas de feed (filtros por formato/pasta favorita) e risco de corrupção em escrita concorrente.

### Algoritmo "For You" v1

- **Decisão**: scoring determinístico ponderado + intercalação por janelas de recência:
  - `score = w1·recência(normalizada) + w2·boost_favorito(pasta e/ou formato) + w3·match_keywords(palavras do nome vs. termos de favoritos) + ruído_pequeno_aleatório`.
  - Mistura: 2/3 dos itens de cada página vêm da metade mais recente do índice, 1/3 do restante (mistura recente/antiga obrigatória).
  - Deduplicação: cursor de paginação registra `path`s já entregues na sessão do feed; reposicionamento aleatório entre páginas evita repetição imediata.
- **Alternativas consideradas**: embaralhamento puro — rejeitado por ignorar o requisito de priorização por metadados/favoritos; ranking puramente por score — rejeitado por concentrar só itens recentes.

### Feed imersivo

- **Decisão**: scroll vertical com CSS `scroll-snap-type: y mandatory` (snap garantido por item) + virtualização via `react-window`; `IntersectionObserver` detecta o item ativo para autoplay/pausa de vídeo e dispara preload de N±1/N±2 e fetch da próxima página ao chegar no penúltimo item.
- **Alternativas consideradas**: transform-based paging (gestos customizados) — adiado; snap CSS nativo é mais simples e performático na v1.

### Estado do renderer

- **Decisão**: Zustand para estado global (páginas do feed, aba ativa, favoritos otimistas com reconciliação via IPC). Evita boilerplate de Redux para um app de escopo enxuto.

## Risks / Trade-offs

- **Vídeos pesados (4K/HEVC) podem engasgar no Chromium** → v1 aceita o risco; mitigação futura: transcodificação de thumbnails/preview com ffmpeg.
- **Varreduras muito grandes podem demorar** → streaming incremental via `scan:progress` + cache em `media_index` com revalidação por `modified_at` na abertura.
- **`better-sqlite3` é módulo nativo** → exige rebuild para a versão do Electron (`electron-rebuild`); aceito pelo ganho de simplicidade vs. banco embutido alternativo.
- **Junctions/symlinks no Windows** → proteção de ciclo obrigatória via conjunto de caminhos reais visitados.

## Migration Plan

Projeto novo — sem migração. O banco SQLite é criado na primeira execução com migração inicial versionada (`user_version`).

## Open Questions

- Cover do perfil: primeira imagem por ordem alfabética, mais recente, ou aleatória determinística? (Proposta: imagem mais recente; vídeo usa frame padrão/ícone na v1.)
- Palavras-chave: split do nome do arquivo por separadores comuns (`-_. `) é suficiente para a v1 ou precisamos de normalização (acentos, plural)?
- O feed "For You" deve incluir mídias de pastas recém-adicionadas antes da indexação completar (streaming) ou só após o primeiro scan completo?
