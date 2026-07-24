## 1. Scaffold do Projeto
- [x] 1.1 Inicializar projeto Electron + Vite + React + TypeScript com estrutura `electron/` (main/preload) e `src/` (renderer)
- [x] 1.2 Configurar `contextIsolation: true`, `nodeIntegration: false` e protocolo customizado `media://` para servir arquivos locais com segurança ao renderer
- [x] 1.3 Definir camada de IPC tipada (`contextBridge`) com contratos compartilhados em `src/shared/types.ts`

## 2. Indexação de Mídia (media-indexing)
- [x] 2.1 Implementar `electron/services/mediaScanner.ts`: deep resolving recursivo assíncrono (BFS com yielding em batches), flatten de mídias em profundidade N, proteção contra ciclos de symlink e tolerância a diretórios ilegíveis
- [x] 2.2 Implementar extração de metadados: data de criação, data de modificação, tamanho, formato, tipo (imagem/vídeo) e palavras-chave extraídas do nome do arquivo
- [x] 2.3 Implementar whitelist de formatos suportados (jpg, jpeg, png, gif, webp, avif, bmp, mp4, webm, mov, mkv, avi)
- [x] 2.4 Emitir eventos de progresso de varredura via IPC (`scan:progress`) e suportar cancelamento (`scan:cancel`)

## 3. Persistência Local (favorites)
- [x] 3.1 Configurar `better-sqlite3` no main process com migração inicial (tabelas `roots`, `media_index`, `favorites`)
- [x] 3.2 Implementar `electron/services/favoritesStore.ts`: favoritar/desfavoritar arquivos e pastas, consulta de favoritos, sobrevivência a reinício do app

## 4. Biblioteca de Perfis e Álbuns (library-profiles)
- [x] 4.1 Implementar IPC `library:pickAndAddRoot` / `library:removeRoot` / `library:list` para gerenciar pastas raiz (perfis)
- [x] 4.2 Implementar derivação de capa do perfil a partir das mídias contidas e username a partir do nome da pasta
- [x] 4.3 Implementar listagem de subpastas diretas como álbuns, com contagem de mídias achatadas por álbum
- [x] 4.4 Criar componentes `ProfileCard`, `ProfilePage` e `AlbumGrid` no renderer

## 5. Feed "For You" (for-you-feed)
- [x] 5.1 Implementar `electron/services/recommendation.ts`: scoring ponderado por metadados (recência, formato, palavras-chave) com boost para pastas/formatos favoritados
- [x] 5.2 Implementar mistura de recência (intercalação de janelas recentes/antigas) e deduplicação por sessão
- [x] 5.3 Expor IPC `feed:forYou` com paginação por cursor para scroll infinito

## 6. Visualização Imersiva (immersive-viewing)
- [x] 6.1 Criar componente `FeedView`: scroll vertical com snap obrigatório por item, windowing de renderização, layout tela cheia/sem bordas
- [x] 6.2 Criar componente `MediaCard`: renderização de imagem/vídeo com autoplay do vídeo ativo, pausa dos demais e mute padrão
- [x] 6.3 Implementar preload dos itens adjacentes (N±1, N±2) durante o scroll
- [x] 6.4 Criar `TabShell` com abas "Para Você" (padrão/destaque) e "Perfis"

## 7. Interações e Integração
- [x] 7.1 Adicionar ação de curtir em `MediaCard` (arquivo) e em `ProfileCard`/álbuns (pasta), conectadas ao `favoritesStore` via IPC
- [x] 7.2 Conectar favoritos ao algoritmo de recomendação (boost) e refletir mudança em requisições subsequentes do feed
- [x] 7.3 Estado do renderer com Zustand (feed, aba ativa, favoritos otimistas)

## 8. Verificação
- [x] 8.1 Testes unitários do `mediaScanner` (deep resolving, flatten, ciclos, formatos) — 12 tests
- [x] 8.2 Testes unitários do `recommendation` (mistura, paginação, cursor, boost) — 6 tests
- [x] 8.3 TypeScript strict mode typecheck em ambos tsconfig (renderer + electron) — zero errors
