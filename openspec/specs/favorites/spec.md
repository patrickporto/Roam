# favorites Specification

## Purpose
TBD - created by archiving change add-local-media-explorer. Update Purpose after archive.
## Requirements
### Requirement: Favoritar arquivos individuais
O sistema SHALL permitir curtir/favoritar e desfazer a ação em qualquer item de mídia individual a partir do feed (For You, perfil ou álbum), com feedback visual imediato.

#### Scenario: Curtir item no feed
- **WHEN** o usuário aciona a ação de curtir em um item do feed
- **THEN** o item é marcado como favorito com atualização visual imediata (otimista) e a ação é registrada

#### Scenario: Desfazer curtida
- **WHEN** o usuário aciona novamente a ação em um item já favoritado
- **THEN** o favorito é removido e o estado visual retorna ao não favoritado

### Requirement: Favoritar pastas
O sistema SHALL permitir favoritar e desfavoritar pastas (perfis e álbuns) a partir de seus respectivos cards/páginas.

#### Scenario: Favoritar álbum
- **WHEN** o usuário favorita o álbum `Praia` na página do perfil
- **THEN** a pasta correspondente é registrada como favorita e o card do álbum reflete o estado

### Requirement: Persistência local de favoritos
O sistema SHALL persistir favoritos de arquivos e pastas localmente em banco SQLite no dispositivo, de modo que o estado sobreviva ao fechamento e reabertura do aplicativo, sem depender de serviços externos.

#### Scenario: Favoritos sobrevivem a reinício
- **WHEN** o usuário favorita itens, fecha completamente o app e o reabre
- **THEN** todos os favoritos são restaurados e exibidos corretamente na UI

### Requirement: Favoritos alimentam o feed
O sistema SHALL disponibilizar os dados de favoritos (pastas e formatos/tipos favoritados) ao algoritmo do feed "For You" para priorização, refletindo mudanças em requisições subsequentes.

#### Scenario: Boost visível após favoritar
- **WHEN** o usuário favorita um perfil e recarrega o feed "For You"
- **THEN** páginas subsequentes exibem proporção maior de itens daquele perfil

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

