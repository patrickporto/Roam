## ADDED Requirements

### Requirement: Deep Resolving recursivo de diretórios
O sistema SHALL varrer recursivamente cada pasta raiz registrada até profundidade arbitrária N, extraindo todos os arquivos de mídia suportados e achatando (flatten) o resultado em uma lista única de itens, preservando a referência da pasta raiz e da subpasta direta de origem de cada item.

#### Scenario: Subpastas aninhadas em profundidade N
- **WHEN** uma pasta raiz contém `album/a/b/c/foto.jpg` (profundidade 4)
- **THEN** o índice contém `foto.jpg` achatado, associado à pasta raiz e à subpasta direta `album`

#### Scenario: Pasta sem subpastas
- **WHEN** uma pasta raiz contém apenas arquivos de mídia no primeiro nível
- **THEN** todos os arquivos são indexados e associados à raiz, sem álbum intermediário

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
