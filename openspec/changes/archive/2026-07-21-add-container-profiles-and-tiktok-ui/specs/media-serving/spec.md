## ADDED Requirements

### Requirement: Servir mídia local via protocolo customizado
O sistema SHALL servir arquivos de mídia ao renderer exclusivamente pelo protocolo `media://`, com URLs no formato `media://file/<caminho-absoluto-codificado-por-segmento>`, resolvendo o caminho absoluto e rejeitando qualquer arquivo fora das pastas raiz registradas (validação anti-traversal).

#### Scenario: Arquivo dentro de raiz registrada
- **WHEN** o renderer requisita `media://file/...` correspondente a um arquivo dentro de uma raiz registrada
- **THEN** o arquivo é servido com o Content-Type correto para sua extensão

#### Scenario: Arquivo fora de qualquer raiz
- **WHEN** o renderer requisita uma URL `media://` cujo caminho resolvido não pertence a nenhuma raiz registrada
- **THEN** a resposta é 404 e nenhum byte do disco é servido

### Requirement: Streaming de vídeo com Range
O sistema SHALL suportar requisições HTTP Range no protocolo `media://`, respondendo 206 com `Content-Range` e o fatiamento correto do arquivo, incluindo suffix-range (`bytes=-N`), e respondendo 416 para intervalos inválidos, de modo a permitir seek em vídeos no renderer.

#### Scenario: Seek em vídeo
- **WHEN** o renderer requisita um vídeo com header `Range: bytes=1000000-1999999`
- **THEN** a resposta é 206 com exatamente os bytes do intervalo e o header `Content-Range` correspondente

#### Scenario: Intervalo inválido
- **WHEN** o renderer requisita um intervalo que começa além do tamanho do arquivo
- **THEN** a resposta é 416 com `Content-Range: bytes */<tamanho>`
