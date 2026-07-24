## MODIFIED Requirements

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
