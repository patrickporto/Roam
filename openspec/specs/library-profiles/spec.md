# library-profiles Specification

## Purpose
TBD - created by archiving change add-local-media-explorer. Update Purpose after archive.
## Requirements
### Requirement: Pasta raiz como Perfil
O sistema SHALL derivar perfis a partir das pastas raiz registradas conforme o tipo da raiz: raízes `container` geram um perfil por subpasta direta (mais um perfil implícito para mídias soltas no primeiro nível, quando houver); raízes `profile` geram exatamente um perfil correspondente à própria pasta. Cada perfil SHALL ser renderizado com layout de "Perfil de Usuário": nome da pasta como username e foto de capa derivada das mídias contidas (recursivamente). O sistema SHALL permitir remover a raiz, removendo todos os perfis derivados sem apagar arquivos do disco.

#### Scenario: Container gera múltiplos perfis
- **WHEN** a raiz `D:\Criadores` do tipo `container` contém as subpastas `Ana` e `Bruno`
- **THEN** a biblioteca exibe os perfis `Ana` e `Bruno`, cada um com capa derivada de suas mídias

#### Scenario: Perfil implícito de mídias soltas
- **WHEN** a raiz do tipo `container` contém mídias no primeiro nível além de subpastas
- **THEN** a biblioteca exibe também um perfil com o nome da própria raiz contendo apenas as mídias soltas

#### Scenario: Remover raiz container
- **WHEN** o usuário remove a raiz `D:\Criadores`
- **THEN** todos os perfis derivados dela deixam de aparecer na biblioteca e no feed, sem apagar arquivos do disco

### Requirement: Subpastas diretas como Álbuns
O sistema SHALL exibir como "Álbum/Coleção", na página de cada perfil, cada subpasta direta desse perfil, com capa derivada de suas mídias e contagem total de mídias achatadas (incluindo aninhados). Perfis implícitos de raízes `container` (mídias soltas) não exibem álbuns.

#### Scenario: Perfil com três subpastas
- **WHEN** o perfil `Viagens` contém as subpastas diretas `Praia`, `Montanha` e `Cidade`
- **THEN** a página do perfil exibe três álbuns, cada um com capa e contagem total incluindo subpastas aninhadas

#### Scenario: Perfil sem subpastas
- **WHEN** o perfil contém apenas arquivos no primeiro nível
- **THEN** a página do perfil não exibe seção de álbuns e todo o conteúdo aparece no feed do perfil

### Requirement: Feed achatado de perfil e álbum
O sistema SHALL exibir, ao abrir um perfil ou um álbum, um feed contínuo com todas as mídias achatadas daquele escopo (incluindo profundidade N), sem exigir que o usuário navegue por subpastas.

#### Scenario: Abrir álbum com mídia aninhada
- **WHEN** o usuário abre o álbum `Praia` que contém `2023/reveillon/foto.jpg`
- **THEN** `foto.jpg` aparece diretamente no feed do álbum, sem navegação por `2023/reveillon`

#### Scenario: Abrir perfil agrega todos os álbuns
- **WHEN** o usuário abre o perfil `Viagens`
- **THEN** o feed do perfil contém a união achatada das mídias de todos os seus álbuns e arquivos de primeiro nível

### Requirement: Menu contextual de perfis
O sistema SHALL exibir, ao acionar o menu contextual (botão direito) sobre um perfil, ações de: abrir o perfil, abrir a pasta no explorador de arquivos, reindexar a raiz, editar o tipo da raiz (container ↔ profile, com reindexação) e remover a raiz da biblioteca.

#### Scenario: Editar tipo da raiz
- **WHEN** o usuário escolhe "Editar tipo" no menu contextual e troca a raiz de `profile` para `container`
- **THEN** a raiz é reindexada com o novo tipo e os perfis derivados são atualizados na biblioteca

#### Scenario: Abrir no explorador
- **WHEN** o usuário escolhe "Abrir no Explorador" no menu contextual de um perfil
- **THEN** o sistema operacional abre a pasta correspondente no gerenciador de arquivos

#### Scenario: Remover pelo menu contextual
- **WHEN** o usuário escolhe "Remover" no menu contextual e confirma
- **THEN** a raiz e seus perfis derivados saem da biblioteca e do feed, sem apagar arquivos do disco

### Requirement: Grade de mídia do perfil com ordenação
O sistema SHALL exibir na página do perfil uma grade de miniaturas de todas as mídias achatadas do escopo (perfil ou álbum), com ordenação alternável entre mais recentes primeiro e mais antigas primeiro, e carregamento incremental ao rolar.

#### Scenario: Alternar ordenação
- **WHEN** o usuário alterna a ordenação de "Mais recentes" para "Mais antigas"
- **THEN** a grade é recarregada exibindo as mídias mais antigas primeiro

#### Scenario: Grade carrega incrementalmente
- **WHEN** o usuário rola a grade até próximo do fim
- **THEN** a próxima página de mídias é carregada e anexada sem recarregar a página

