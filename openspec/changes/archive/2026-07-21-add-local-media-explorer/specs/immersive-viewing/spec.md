## ADDED Requirements

### Requirement: Feed vertical imersivo com scroll infinito
O sistema SHALL exibir o consumo de mídia em um feed vertical em tela cheia/sem bordas, com um item de mídia por viewport, snap obrigatório por item e carregamento infinito (próxima página buscada antes do fim da lista).

#### Scenario: Scroll com snap por item
- **WHEN** o usuário rola o feed com roda do mouse ou touchpad
- **THEN** a rolagem ancora exatamente um item de mídia por viewport, sem posições intermediárias

#### Scenario: Carregamento infinito
- **WHEN** o usuário se aproxima do final dos itens carregados
- **THEN** a próxima página é requisitada automaticamente e anexada ao feed sem interromper a rolagem

### Requirement: Abas na tela principal
O sistema SHALL dividir a tela principal em abas, incluindo uma aba "For You" (Para Você) como aba padrão e visualmente destacada, e uma aba de "Perfis" para a biblioteca.

#### Scenario: App abre na aba For You
- **WHEN** o usuário abre o aplicativo
- **THEN** a aba "For You" está ativa e o feed começa a carregar imediatamente

#### Scenario: Alternar para aba Perfis
- **WHEN** o usuário seleciona a aba "Perfis"
- **THEN** a biblioteca de perfis é exibida e o estado/posição do feed "For You" é preservado ao retornar

### Requirement: Reprodução de vídeo do item ativo
O sistema SHALL reproduzir automaticamente o vídeo do item visível no viewport, pausar e descarregar a reprodução dos demais itens, e iniciar vídeos sem som por padrão até interação do usuário.

#### Scenario: Autoplay ao ancorar item
- **WHEN** um item de vídeo se torna o item ativo após o snap
- **THEN** o vídeo inicia reprodução automaticamente em loop e o vídeo do item anterior é pausado

### Requirement: Preload de itens adjacentes
O sistema SHALL pré-carregar a mídia dos itens adjacentes ao item ativo (pelo menos N±1) para garantir transição imediata durante a rolagem.

#### Scenario: Transição sem loading
- **WHEN** o usuário rola para o próximo item
- **THEN** a mídia desse item já está carregada e é exibida sem indicador de carregamento
