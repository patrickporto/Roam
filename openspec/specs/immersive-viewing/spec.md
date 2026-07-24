# immersive-viewing Specification

## Purpose
TBD - created by archiving change add-local-media-explorer. Update Purpose after archive.
## Requirements
### Requirement: Feed vertical imersivo com scroll infinito
O sistema SHALL exibir o consumo de mídia em um feed vertical em tela cheia/sem bordas, com um item de mídia por viewport e carregamento infinito. O feed SHALL ser virtualizado: o DOM renderiza apenas os itens próximos ao ativo (janela limitada), a memória do renderer mantém no máximo uma janela deslizante de itens (descartando os mais antigos com compensação de rolagem), e o snap por item é garantido por ancoragem programática ao final da rolagem.

#### Scenario: DOM limitado durante rolagem longa
- **WHEN** o usuário rola centenas de itens do feed
- **THEN** o número de cards montados no DOM permanece limitado (janela ao redor do item ativo), sem degradar a fluidez

#### Scenario: Memória limitada do renderer
- **WHEN** a lista de itens carregados ultrapassa o limite da janela deslizante
- **THEN** os itens mais antigos são descartados do estado do renderer e a posição visual de rolagem é preservada

#### Scenario: Snap por item mantido
- **WHEN** o usuário rola o feed e para entre dois itens
- **THEN** a rolagem ancora automaticamente no item mais próximo, um por viewport

### Requirement: Abas na tela principal
O sistema SHALL exibir as abas "Para Você" (padrão e visualmente destacada) e "Perfis" como navegação minimalista centralizada no topo, sobreposta ao conteúdo em estilo overlay, sem ocupar uma barra de layout separada.

#### Scenario: App abre na aba Para Você
- **WHEN** o usuário abre o aplicativo
- **THEN** a aba "Para Você" está ativa em destaque e o feed começa a carregar imediatamente

#### Scenario: Alternar para aba Perfis
- **WHEN** o usuário seleciona a aba "Perfis"
- **THEN** a biblioteca de perfis é exibida e o estado/posição do feed "Para Você" é preservado ao retornar

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

### Requirement: Barra de título customizada com controles de janela
O sistema SHALL exibir uma barra de título overlay com região de arrasto da janela e botões de minimizar, maximizar/restaurar e fechar, dado que a janela é frameless.

#### Scenario: Fechar a janela
- **WHEN** o usuário clica no botão de fechar da barra de título
- **THEN** a janela é fechada

#### Scenario: Arrastar a janela
- **WHEN** o usuário arrasta a região vazia da barra de título
- **THEN** a janela se move conforme o arrasto

### Requirement: Action rail estilo TikTok
O sistema SHALL exibir, sobreposto à direita de cada item do feed, um rail vertical de ações com: avatar do perfil de origem (atalho para a página do perfil), botão de curtir o arquivo, botão de favoritar a pasta de origem e, para vídeos, botão de mudo/desmudo.

#### Scenario: Curtir pelo rail
- **WHEN** o usuário clica no botão de coração do rail
- **THEN** o arquivo é favoritado/desfavoritado com feedback visual imediato

#### Scenario: Avatar leva ao perfil
- **WHEN** o usuário clica no avatar do rail
- **THEN** a página do perfil de origem da mídia é aberta

### Requirement: Interações avançadas de vídeo
O sistema SHALL, para itens de vídeo: alternar play/pause ao clicar no vídeo, exibir barra de progresso inferior com seek por clique, e registrar curtida com animação de coração ao dar double-click em qualquer item.

#### Scenario: Clique pausa e retoma
- **WHEN** o usuário clica uma vez sobre um vídeo em reprodução
- **THEN** o vídeo pausa; ao clicar novamente, retoma

#### Scenario: Double-click curte com animação
- **WHEN** o usuário dá double-click em um item não favoritado
- **THEN** o item é favoritado e uma animação de coração é exibida no centro da tela

#### Scenario: Seek pela barra de progresso
- **WHEN** o usuário clica em um ponto da barra de progresso do vídeo
- **THEN** a reprodução salta para a posição proporcional correspondente

### Requirement: Navegação por teclado
O sistema SHALL navegar entre itens do feed ao pressionar seta para baixo (próximo) e seta para cima (anterior), com rolagem suave ancorada por item.

#### Scenario: Seta para baixo avança
- **WHEN** o usuário pressiona a seta para baixo com o feed visível
- **THEN** o feed rola suavemente para o próximo item

### Requirement: Abertura do feed a partir de uma grade
O sistema SHALL abrir o feed imersivo na posição exata do item clicado em uma grade (perfil ou favoritos), permitindo rolagem contínua para itens anteriores e posteriores.

#### Scenario: Clicar no quinto item da grade
- **WHEN** o usuário clica no quinto item da grade de um perfil
- **THEN** o feed abre exibindo esse item e permite rolar para os demais sem recarregar

