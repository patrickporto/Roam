## ADDED Requirements

### Requirement: Amostragem escalável do índice
O sistema SHALL compor páginas do feed "For You" por amostragem aleatória com custo sublinear (ex.: seleção por `rowid` aleatório ou partição pequena materializada), sem carregar o índice inteiro em memória, de modo a suportar índices com milhões de itens.

#### Scenario: Índice com um milhão de itens
- **WHEN** o índice contém mais de um milhão de mídias e o usuário solicita uma página do feed
- **THEN** a página é composta sem varredura completa do índice e sem alocação proporcional ao tamanho total do índice

### Requirement: Sinais de curtidas no algoritmo
O sistema SHALL incorporar no score dos itens, calculado a cada página: favoritos explícitos de pastas (perfil/álbum), formatos/tipos derivados de arquivos curtidos, perfis de origem de arquivos curtidos e palavras-chave extraídas dos nomes de arquivos e pastas curtidas. Mudanças nos likes SHALL valer já na próxima página solicitada, sem reiniciar o app.

#### Scenario: Curtir vídeos aumenta vídeos no feed
- **WHEN** o usuário curte vários arquivos de vídeo e solicita a página seguinte do feed
- **THEN** a nova página tende a conter proporção maior de vídeos e de itens dos mesmos perfis/palavras-chave

### Requirement: Invalidação do feed ao mudar a biblioteca
O sistema SHALL descartar as sessões ativas do feed "For You" sempre que uma raiz for adicionada, removida ou tiver seu tipo alterado, de modo que o feed reflita imediatamente a nova biblioteca na próxima visita.

#### Scenario: Novo perfil aparece no feed
- **WHEN** o usuário adiciona uma pasta raiz e retorna à aba "Para Você"
- **THEN** o feed é reconstruído incluindo mídias da nova raiz

### Requirement: Ciclo infinito do feed
O sistema SHALL, ao esgotar os itens elegíveis não exibidos da sessão, reiniciar o ciclo de exibição (permitindo repetição entre ciclos, nunca dentro do mesmo ciclo), garantindo feed infinito mesmo com índice pequeno.

#### Scenario: Índice pequeno não trava o feed
- **WHEN** o índice possui menos itens que o tamanho de uma página e o usuário rola o feed continuamente
- **THEN** novas páginas continuam sendo entregues indefinidamente, sem duplicatas dentro do mesmo ciclo
