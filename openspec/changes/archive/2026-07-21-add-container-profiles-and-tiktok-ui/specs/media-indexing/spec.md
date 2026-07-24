## MODIFIED Requirements

### Requirement: Deep Resolving recursivo de diretórios
O sistema SHALL varrer recursivamente cada pasta raiz registrada até profundidade arbitrária N, extraindo todos os arquivos de mídia suportados e achatando (flatten) o resultado. Para cada item, o sistema SHALL resolver e persistir `profile_path` e `album_path` conforme o tipo da raiz: em raízes `profile`, o perfil é a própria raiz e o álbum é a subpasta direta; em raízes `container`, o perfil é a subpasta direta da raiz (ou a própria raiz, para mídias soltas no primeiro nível) e o álbum é a subpasta direta do perfil.

#### Scenario: Raiz profile com subpastas aninhadas
- **WHEN** uma raiz do tipo `profile` contém `album/a/b/c/foto.jpg` (profundidade 4)
- **THEN** o item é indexado com `profile_path` igual à raiz e `album_path` igual a `album`

#### Scenario: Raiz container com perfis e álbuns
- **WHEN** uma raiz do tipo `container` contém `ana/fotos/f1.jpg` e `ana/f2.jpg`
- **THEN** `f1.jpg` é indexado com `profile_path = ana` e `album_path = ana/fotos`, e `f2.jpg` com `profile_path = ana` e `album_path` nulo

#### Scenario: Mídia solta em raiz container
- **WHEN** uma raiz do tipo `container` contém `foto.jpg` no primeiro nível
- **THEN** o item é indexado com `profile_path` igual à própria raiz e `album_path` nulo (perfil implícito)

## ADDED Requirements

### Requirement: Tipos de pasta raiz
O sistema SHALL permitir que o usuário escolha, ao adicionar uma pasta, entre os tipos `container` (subpastas diretas viram perfis) e `profile` (a própria pasta é um perfil e subpastas diretas viram álbuns), persistindo o tipo junto ao registro da raiz.

#### Scenario: Adicionar coleção de perfis
- **WHEN** o usuário adiciona a pasta `D:\Criadores` escolhendo o tipo `container`
- **THEN** cada subpasta direta de `D:\Criadores` aparece como um perfil na biblioteca

#### Scenario: Adicionar perfil único
- **WHEN** o usuário adiciona a pasta `D:\Fotos\Viagens` escolhendo o tipo `profile`
- **THEN** a biblioteca exibe o perfil `Viagens` e suas subpastas diretas como álbuns
