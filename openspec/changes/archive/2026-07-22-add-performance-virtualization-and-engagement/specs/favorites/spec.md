## ADDED Requirements

### Requirement: Visualização de itens favoritados
O sistema SHALL oferecer uma aba "Favoritos" exibindo: (a) grade paginada dos arquivos curtidos, ordenados pela data da curtida (mais recentes primeiro), com abertura do feed na posição clicada; (b) lista de pastas favoritadas com atalho para o perfil correspondente quando aplicável.

#### Scenario: Grade de arquivos curtidos
- **WHEN** o usuário abre a aba "Favoritos" após curtir três arquivos
- **THEN** a grade exibe os três arquivos, o mais recentemente curtido primeiro

#### Scenario: Feed a partir da grade de favoritos
- **WHEN** o usuário clica em um arquivo na grade de favoritos
- **THEN** o feed imersivo abre naquele item e rola pelos demais favoritos

#### Scenario: Atalho de pasta favorita
- **WHEN** o usuário clica em uma pasta favoritada que corresponde a um perfil
- **THEN** a página do perfil é aberta
