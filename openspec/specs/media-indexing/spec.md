# media-indexing Specification

## Purpose
TBD - created by archiving change add-local-media-explorer. Update Purpose after archive.
## Requirements
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

### Requirement: Varredura assíncrona não bloqueante
O sistema SHALL executar a varredura de diretórios de forma assíncrona no processo principal, em batches com yielding, sem bloquear o event loop, e SHALL emitir eventos de progresso incrementais (`scan:progress`) com os lotes de mídia já encontrados, permitindo que a UI exiba conteúdo antes da conclusão. O sistema SHALL suportar cancelamento da varredura em andamento.

#### Scenario: UI permanece responsiva durante varredura grande
- **WHEN** o usuário indexa uma pasta raiz com mais de 10.000 arquivos
- **THEN** o event loop do main process não bloqueia e o renderer recebe lotes incrementais de mídia via `scan:progress`

#### Scenario: Cancelamento da varredura
- **WHEN** o usuário solicita `scan:cancel` durante uma varredura em andamento
- **THEN** a varredura é interrompida no batch atual e os itens já emitidos permanecem válidos

### Requirement: Extração de metadados reais
O sistema SHALL extrair para cada arquivo de mídia: data de criação, data de modificação, tamanho em bytes, formato (extensão normalizada), tipo de mídia (`image` ou `video`) e palavras-chave derivadas do nome do arquivo (split por separadores comuns).

#### Scenario: Metadados completos de um vídeo
- **WHEN** a varredura encontra `viagem-praia_2024.mp4`
- **THEN** o item indexado contém `type: video`, `format: mp4`, `size`, `createdAt`, `modifiedAt` e palavras-chave incluindo `viagem` e `praia`

### Requirement: Whitelist de formatos suportados
O sistema SHALL indexar apenas arquivos com extensões suportadas: imagens (`jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`, `bmp`) e vídeos (`mp4`, `webm`, `mov`, `mkv`, `avi`), ignorando todos os demais arquivos de forma case-insensitive.

#### Scenario: Arquivos não suportados ignorados
- **WHEN** uma pasta contém `foto.JPG`, `notas.txt` e `planilha.xlsx`
- **THEN** apenas `foto.JPG` é indexado

### Requirement: Segurança e tolerância a falhas da varredura
O sistema SHALL proteger a varredura contra ciclos de symlink/junction (mantendo conjunto de caminhos reais visitados) e SHALL tolerar diretórios ilegíveis ou arquivos removidos em corrida, contabilizando erros sem abortar a varredura.

#### Scenario: Junction cíclica no Windows
- **WHEN** uma subpasta contém uma junction que aponta para um diretório ancestral
- **THEN** o ciclo é detectado, o ramo é ignorado e a varredura continua nos demais ramos

#### Scenario: Diretório sem permissão
- **WHEN** a varredura encontra uma subpasta sem permissão de leitura
- **THEN** o erro é registrado, a subpasta é pulada e a varredura prossegue

### Requirement: Tipos de pasta raiz
O sistema SHALL permitir que o usuário escolha, ao adicionar uma pasta, entre os tipos `container` (subpastas diretas viram perfis) e `profile` (a própria pasta é um perfil e subpastas diretas viram álbuns), persistindo o tipo junto ao registro da raiz.

#### Scenario: Adicionar coleção de perfis
- **WHEN** o usuário adiciona a pasta `D:\Criadores` escolhendo o tipo `container`
- **THEN** cada subpasta direta de `D:\Criadores` aparece como um perfil na biblioteca

#### Scenario: Adicionar perfil único
- **WHEN** o usuário adiciona a pasta `D:\Fotos\Viagens` escolhendo o tipo `profile`
- **THEN** a biblioteca exibe o perfil `Viagens` e suas subpastas diretas como álbuns

