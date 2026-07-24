## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Abertura do feed a partir de uma grade
O sistema SHALL abrir o feed imersivo na posição exata do item clicado em uma grade (perfil ou favoritos), permitindo rolagem contínua para itens anteriores e posteriores.

#### Scenario: Clicar no quinto item da grade
- **WHEN** o usuário clica no quinto item da grade de um perfil
- **THEN** o feed abre exibindo esse item e permite rolar para os demais sem recarregar
