# tagging Specification Delta

## ADDED Requirements

### Requirement: Tagear arquivos individuais
O sistema SHALL permitir aplicar e remover tags em qualquer item de mídia individual a partir do feed (For You, perfil ou álbum), com criação de tag inline (digitar e confirmar) e atualização visual imediata.

#### Scenario: Aplicar tag existente a um arquivo
- **WHEN** o usuário abre a ação de tags em um item do feed e seleciona a tag `Praia`
- **THEN** o item passa a exibir o chip da tag `Praia` imediatamente (atualização otimista) e a associação é registrada

#### Scenario: Criar e aplicar nova tag inline
- **WHEN** o usuário digita um nome de tag inexistente e confirma
- **THEN** a tag é criada, aplicada ao item e passa a constar na lista de tags do app

#### Scenario: Remover tag de um arquivo
- **WHEN** o usuário aciona a remoção de uma tag aplicada a um item (chip ativo ou ação de remover no chip)
- **THEN** a associação é removida e o chip deixa de ser exibido no item

### Requirement: Tagear pastas
O sistema SHALL permitir aplicar e remover tags em pastas (perfis e álbuns) a partir de seus respectivos cards/páginas, com a mesma interação de tagear arquivos.

#### Scenario: Tagear álbum
- **WHEN** o usuário aplica a tag `Verão` ao álbum `Praia` na página do perfil
- **THEN** a pasta correspondente é registrada com a tag e o card do álbum reflete a tag aplicada

#### Scenario: Remover tag de pasta
- **WHEN** o usuário remove a tag de uma pasta tageada
- **THEN** a pasta deixa de ser associada à tag e o conteúdo da pasta deixa de entrar no feed daquela tag

### Requirement: Autocomplete e simplicidade de tagear
O sistema SHALL oferecer, na ação de tagear, um único campo de texto com sugestões das tags existentes filtradas conforme a digitação, permitindo aplicar/criar com Enter e remover com um clique, de modo que tagear e remover exijam no máximo dois cliques (ou um clique + Enter) a partir do item.

#### Scenario: Sugestões ao digitar
- **WHEN** o usuário abre a ação de tags e digita `pra`
- **THEN** as tags existentes que contêm `pra` (ex.: `Praia`) são sugeridas para aplicação com um clique ou Enter

### Requirement: Normalização de nomes de tag
O sistema SHALL normalizar nomes de tag (trim e comparação case-insensitive) de modo que variações de maiúsculas/minúsculas e espaços não criem tags duplicadas.

#### Scenario: Tag duplicada por capitalização
- **WHEN** existe a tag `Praia` e o usuário tenta criar a tag `praia`
- **THEN** o sistema reutiliza a tag existente em vez de criar duplicata

### Requirement: Persistência local de tags
O sistema SHALL persistir tags e suas associações (arquivos e pastas) localmente em SQLite no dispositivo, de modo que sobrevivam ao fechamento e reabertura do aplicativo, sem depender de serviços externos e sem modificar os arquivos do usuário.

#### Scenario: Tags sobrevivem a reinício
- **WHEN** o usuário tageia arquivos e pastas, fecha completamente o app e o reabre
- **THEN** todas as tags e associações são restauradas e exibidas corretamente na UI
