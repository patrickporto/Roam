## ADDED Requirements

### Requirement: Zoom e pan na mídia do feed
O sistema SHALL permitir ampliar a mídia do item ativo do feed (imagem ou vídeo) via Ctrl + scroll do mouse, com zoom centrado na posição do cursor, escala mínima de 1x (ajuste original) e máxima de 8x. Com escala maior que 1x, o sistema SHALL permitir mover a mídia por arrasto do mouse (pan). O sistema SHALL restaurar o zoom para 1x ao pressionar Esc ou Ctrl+0, e SHALL resetar o zoom automaticamente ao trocar de item do feed. O zoom com Ctrl + scroll MUST NOT disparar a rolagem do feed.

#### Scenario: Zoom centrado no cursor
- **WHEN** o usuário pressiona Ctrl e rola o scroll para cima sobre um ponto da mídia
- **THEN** a mídia amplia mantendo o ponto sob o cursor visualmente estacionário

#### Scenario: Pan com arrasto
- **WHEN** a mídia está ampliada (escala > 1x) e o usuário arrasta com o mouse
- **THEN** a mídia se move acompanhando o arrasto e o cursor indica o estado de arrasto

#### Scenario: Reset por teclado
- **WHEN** a mídia está ampliada e o usuário pressiona Esc ou Ctrl+0
- **THEN** a mídia retorna à escala 1x e posição original

#### Scenario: Reset ao trocar de item
- **WHEN** o usuário rola para outro item do feed com a mídia ampliada
- **THEN** o item anterior perde o zoom e o novo item é exibido em escala 1x

#### Scenario: Scroll do feed preservado
- **WHEN** o usuário rola o scroll sem pressionar Ctrl sobre a mídia
- **THEN** o feed rola normalmente entre os itens, sem alterar o zoom

#### Scenario: Sem zoom abaixo de 1x
- **WHEN** o usuário pressiona Ctrl e rola o scroll para baixo com a mídia em escala 1x
- **THEN** a escala permanece em 1x e nenhuma transformação é aplicada
