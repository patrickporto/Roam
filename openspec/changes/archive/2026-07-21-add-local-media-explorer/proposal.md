# Change: Fundação do explorador de mídia local estilo TikTok

## Why

Não existe hoje uma forma rápida e imersiva de consumir coleções locais de imagens e vídeos no Windows: o explorador de arquivos tradicional exige navegação pasta a pasta e não oferece descoberta. Vamos construir um app desktop (Electron + React + TypeScript) que transforma diretórios locais em uma experiência de feed vertical estilo TikTok, com descoberta via feed "For You" baseado em metadados reais.

## What Changes

- **Nova capability `media-indexing`**: serviço de varredura recursiva de diretórios (Deep Resolving) executado de forma assíncrona no processo principal do Electron, extraindo metadados (datas, tamanho, formato, palavras-chave do nome) e achatando (flatten) mídias de subpastas em profundidade N para exibição contínua.
- **Nova capability `library-profiles`**: pastas raiz adicionadas pelo usuário renderizadas como "Perfis" (foto de capa derivada dos arquivos + nome da pasta como username); subpastas diretas renderizadas como "Álbuns/Coleções" dentro da página do perfil.
- **Nova capability `for-you-feed`**: algoritmo de recomendação v1 que mistura arquivos recentes e antigos com base em metadados e prioriza formatos e pastas favoritados pelo usuário.
- **Nova capability `immersive-viewing`**: feed vertical infinito em tela cheia/sem bordas com snap por item, abas na tela principal (destaque para "For You"), autoplay de vídeo do item ativo e preload dos itens adjacentes.
- **Nova capability `favorites`**: curtir/favoritar arquivos individuais e pastas, com persistência local em SQLite, alimentando o algoritmo do feed.

## Impact

- **Affected specs**: `media-indexing`, `library-profiles`, `for-you-feed`, `immersive-viewing`, `favorites` (todas novas).
- **Affected code**: scaffold completo do app — `electron/` (main process, serviços de indexação e persistência, camada IPC) e `src/` (renderer React: componentes de feed, perfis, álbuns, abas).
- **Novas dependências**: `electron`, `vite`, `react`, `typescript`, `better-sqlite3`, `zustand`, `react-window` (virtualização do feed).
- **Plataforma alvo**: Windows 10/11 (x64).
