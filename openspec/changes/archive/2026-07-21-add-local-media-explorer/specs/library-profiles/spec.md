## ADDED Requirements

### Requirement: Pasta raiz como Perfil
O sistema SHALL renderizar cada pasta raiz adicionada pelo usuário com um layout de "Perfil de Usuário": o nome da pasta como username e uma foto de capa derivada das mídias contidas na pasta (recursivamente). O sistema SHALL permitir adicionar e remover pastas raiz.

#### Scenario: Adicionar pasta raiz
- **WHEN** o usuário adiciona a pasta `C:\Mídia\Viagens` como raiz
- **THEN** a biblioteca exibe um perfil com username `Viagens` e capa derivada de uma mídia contida nessa pasta ou em suas subpastas

#### Scenario: Remover pasta raiz
- **WHEN** o usuário remove a pasta raiz `C:\Mídia\Viagens`
- **THEN** o perfil e seus itens deixam de aparecer na biblioteca e no feed, sem apagar arquivos do disco

### Requirement: Subpastas diretas como Álbuns
O sistema SHALL exibir cada subpasta direta de uma pasta raiz como um "Álbum/Coleção" na página do perfil, com capa derivada de suas mídias e contagem total de mídias achatadas (incluindo aninhados).

#### Scenario: Perfil com três subpastas
- **WHEN** a pasta raiz `Viagens` contém as subpastas diretas `Praia`, `Montanha` e `Cidade`
- **THEN** a página do perfil `Viagens` exibe três álbuns, cada um com capa e contagem total de mídias incluindo subpastas aninhadas

#### Scenario: Pasta raiz sem subpastas
- **WHEN** a pasta raiz contém apenas arquivos no primeiro nível
- **THEN** a página do perfil não exibe seção de álbuns e todo o conteúdo aparece no feed do perfil

### Requirement: Feed achatado de perfil e álbum
O sistema SHALL exibir, ao abrir um perfil ou um álbum, um feed contínuo com todas as mídias achatadas daquele escopo (incluindo profundidade N), sem exigir que o usuário navegue por subpastas.

#### Scenario: Abrir álbum com mídia aninhada
- **WHEN** o usuário abre o álbum `Praia` que contém `2023/reveillon/foto.jpg`
- **THEN** `foto.jpg` aparece diretamente no feed do álbum, sem navegação por `2023/reveillon`

#### Scenario: Abrir perfil agrega todos os álbuns
- **WHEN** o usuário abre o perfil `Viagens`
- **THEN** o feed do perfil contém a união achatada das mídias de todos os seus álbuns e arquivos de primeiro nível
