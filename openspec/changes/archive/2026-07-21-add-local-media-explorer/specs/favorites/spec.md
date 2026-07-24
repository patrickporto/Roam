## ADDED Requirements

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
