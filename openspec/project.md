# Project Context

## Purpose

Roam é um explorador de mídia local para Windows focado em consumo rápido e imersivo de imagens e vídeos. Ele transforma diretórios do sistema de arquivos em uma experiência estilo TikTok: pastas raiz viram "Perfis", subpastas viram "Álbuns", e o conteúdo é consumido em um feed vertical infinito com uma aba "For You" baseada em metadados e favoritos.

## Tech Stack

- Electron (main process em Node.js) + React 18 + TypeScript
- Vite (build/dev do renderer)
- better-sqlite3 (persistência local: índice de mídia e favoritos)
- Zustand (estado do renderer)
- react-window (virtualização do feed)

## Project Conventions

### Code Style
- TypeScript estrito em todo o projeto (main, preload e renderer)
- Contratos/compartilhados (tipos de IPC, `MediaItem`, `Profile`, `Album`) em `src/shared/types.ts`
- Componentes React em PascalCase; serviços do main em camelCase (`mediaScanner.ts`)

### Architecture Patterns
- Separação estrita: toda I/O de disco e SQLite no main process (`electron/`); renderer (`src/`) apenas apresentação
- Comunicação exclusivamente via IPC tipado com `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`)
- Mídia local servida ao renderer via protocolo customizado `media://` com validação de prefixo contra path traversal
- Varredura de diretórios assíncrona em batches com yielding e eventos de progresso incrementais

### Testing Strategy
- Testes unitários (Vitest) para serviços do main: `mediaScanner`, `recommendation`, `favoritesStore`
- Teste manual obrigatório de ponta a ponta: indexação profunda, scroll fluido com vídeo, persistência de favoritos

### Git Workflow
- Commits em Conventional Commits (`feat:`, `fix:`, `chore:`)
- Mudanças de comportamento exigem proposta OpenSpec antes da implementação

## Domain Context

- **Perfil**: pasta raiz adicionada pelo usuário; nome da pasta = username; capa derivada das mídias contidas
- **Álbum**: subpasta direta de um perfil; exibido como coleção na página do perfil
- **Deep Resolving / Flatten**: varredura recursiva em profundidade N que achata todas as mídias para exibição contínua, sem navegação manual por pastas
- **For You**: feed algorítmico v1 com scoring por metadados (recência, formato, palavras-chave) + boost de favoritos, misturando itens recentes e antigos

## Important Constraints

- Plataforma alvo: Windows 10/11 (x64); cuidado especial com junctions/symlinks (proteção contra ciclos)
- A UI nunca pode bloquear durante varredura de diretórios grandes
- Nenhum dado sai do dispositivo: sem telemetria, sem serviços externos
- Arquivos do usuário são somente leitura: o app nunca modifica/move/apaga mídia indexada

## External Dependencies

- Nenhuma dependência de serviço externo ou API remota
- Módulo nativo: `better-sqlite3` (requer `electron-rebuild` após instalação)
