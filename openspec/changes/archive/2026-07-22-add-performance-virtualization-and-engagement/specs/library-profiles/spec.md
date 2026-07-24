## ADDED Requirements

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
