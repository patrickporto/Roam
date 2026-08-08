# tag-feed Specification Delta

## ADDED Requirements

### Requirement: Navegação entre tags
O sistema SHALL oferecer uma aba "Tags" listando todas as tags existentes com a contagem de itens associados (arquivos tageados + conteúdo de pastas tageadas), permitindo abrir o feed de qualquer tag com um clique e retornar à lista ou trocar de tag facilmente.

#### Scenario: Lista de tags com contagem
- **WHEN** o usuário abre a aba "Tags" após tagear conteúdo com as tags `Praia` e `Verão`
- **THEN** ambas as tags são exibidas com a contagem de itens de cada uma

#### Scenario: Abrir feed a partir da lista
- **WHEN** o usuário clica na tag `Praia` na aba "Tags"
- **THEN** o feed imersivo da tag `Praia` é aberto

#### Scenario: Navegar por chip no feed
- **WHEN** o usuário clica em um chip de tag exibido em um item do feed
- **THEN** o feed daquela tag é aberto

### Requirement: Feed filtrado por tag
O sistema SHALL compor um feed imersivo por tag contendo a união (sem duplicatas) de: (a) arquivos tageados individualmente com a tag; e (b) todas as mídias contidas em pastas tageadas com a tag, resolvidas em profundidade e achatadas como no deep resolving. O feed da tag SHALL usar a ordenação algorítmica do For You (mistura de recência e scoring), com paginação sem repetição imediata dentro da sessão.

#### Scenario: Tag de pasta inclui conteúdo achatado
- **WHEN** a pasta `Viagens` (com subpastas) está tageada com `Verão` e o usuário abre o feed da tag `Verão`
- **THEN** o feed contém todas as mídias de `Viagens` e suas subpastas, achatadas, sem navegação manual por pastas

#### Scenario: União sem duplicatas
- **WHEN** um arquivo está dentro de uma pasta tageada e também foi tageado individualmente com a mesma tag
- **THEN** o arquivo aparece uma única vez no feed da tag

#### Scenario: Tag sem itens
- **WHEN** o usuário abre o feed de uma tag sem nenhum item associado
- **THEN** uma mensagem de estado vazio é exibida com atalho para a lista de tags

### Requirement: Atualização do feed ao mudar tags
O sistema SHALL refletir adições e remoções de tags na próxima página/visita ao feed da tag, sem exigir reinício do app.

#### Scenario: Remover tag atualiza o feed
- **WHEN** o usuário remove a tag `Praia` de uma pasta e retorna ao feed da tag `Praia`
- **THEN** o conteúdo daquela pasta não é mais exibido no feed da tag
