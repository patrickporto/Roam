## ADDED Requirements

### Requirement: Seleção baseada em metadados
O sistema SHALL compor o feed "For You" a partir de mídias de todas as pastas raiz indexadas, utilizando metadados reais (data de criação, data de modificação, tamanho, formato e palavras-chave do nome do arquivo) como entradas do algoritmo de seleção e ordenação.

#### Scenario: Feed usa mídias de múltiplas raízes
- **WHEN** existem duas ou mais pastas raiz indexadas
- **THEN** o feed "For You" contém itens de todas as raízes, selecionados e ordenados pelo algoritmo baseado em metadados

### Requirement: Mistura de recência
O sistema SHALL misturar arquivos recentes e antigos em cada página do feed, garantindo que nenhuma página seja composta exclusivamente por itens da mesma janela de recência.

#### Scenario: Página mistura recentes e antigos
- **WHEN** o índice contém mídias de anos diferentes e o usuário solicita uma página do feed
- **THEN** a página retornada contém uma proporção configurável de itens recentes (padrão ~2/3) e de itens antigos (padrão ~1/3)

### Requirement: Priorização por favoritos
O sistema SHALL aumentar a probabilidade de exibição de mídias cujo formato ou pasta de origem (perfil/álbum) tenha sido favoritado pelo usuário, aplicando boost no score desses itens no algoritmo.

#### Scenario: Pasta favoritada ganha prioridade
- **WHEN** o usuário favorita a pasta `Viagens` e solicita uma nova página do feed
- **THEN** itens originados de `Viagens` aparecem com frequência significativamente maior que itens de pastas não favoritadas

#### Scenario: Formato favoritado ganha prioridade
- **WHEN** o usuário favorita arquivos de vídeo repetidamente
- **THEN** páginas subsequentes do feed priorizam itens do tipo/formato correspondente

### Requirement: Paginação sem repetição imediata
O sistema SHALL paginar o feed por cursor e SHALL evitar reexibir na mesma sessão do feed itens já entregues em páginas anteriores, enquanto houver itens não exibidos no índice.

#### Scenario: Scroll infinito sem duplicatas
- **WHEN** o usuário rola o feed "For You" por múltiplas páginas
- **THEN** nenhum item é reexibido até que todo o índice elegível tenha sido consumido
