# Change: Zoom e pan na mídia do feed

## Why
Hoje o feed exibe imagens e vídeos sempre em ajuste `contain`, sem forma de ampliar detalhes. O usuário quer a capacidade de dar zoom na mídia que está assistindo.

## What Changes
- Ctrl + scroll sobre a mídia amplia/reduz o zoom, centrado na posição do cursor.
- Com zoom > 1x, arrastar com o mouse move (pan) a mídia ampliada.
- Esc ou Ctrl+0 restaura o zoom para 1x (fit original).
- Zoom é resetado automaticamente ao trocar de item do feed.
- Aplica-se a imagens e vídeos no `MediaCard`; interações existentes (scroll do feed, clique play/pause, double-click curtir) são preservadas.

## Impact
- Affected specs: immersive-viewing
- Affected code: `src/components/feed/MediaCard.tsx`, `src/styles.css`, novo helper `src/shared/zoom.ts` (matemática de zoom pura, testável), `tests/zoom.test.ts`
