# for-you-feed Specification Delta

## MODIFIED Requirements

### Requirement: Sinais de curtidas no algoritmo
O sistema SHALL incorporar no score dos itens, calculado a cada página: favoritos explícitos de pastas (perfil/álbum), formatos/tipos derivados de arquivos curtidos, perfis de origem de arquivos curtidos, palavras-chave extraídas dos nomes de arquivos e pastas curtidas e tags aplicadas pelo usuário (boost para itens tageados e para itens contidos em pastas tageadas). Mudanças nos likes e nas tags SHALL valer já na próxima página solicitada, sem reiniciar o app.

#### Scenario: Curtir vídeos aumenta vídeos no feed
- **WHEN** o usuário curte vários arquivos de vídeo e solicita a página seguinte do feed
- **THEN** a nova página tende a conter proporção maior de vídeos e de itens dos mesmos perfis/palavras-chave

#### Scenario: Itens tageados ganham prioridade
- **WHEN** o usuário aplica a tag `Praia` a arquivos e a uma pasta e solicita uma nova página do feed "For You"
- **THEN** itens com a tag `Praia` e itens contidos na pasta tageada aparecem com frequência significativamente maior que itens sem tags

#### Scenario: Remover tag reduz prioridade
- **WHEN** o usuário remove todas as tags de um perfil e solicita a página seguinte do feed
- **THEN** o boost correspondente deixa de ser aplicado já na página seguinte
