## ADDED Requirements

### Requirement: Memória de exibição com cooldown
O sistema SHALL registrar persistentemente o timestamp de exibição de cada item servido pelo feed e SHALL penalizar no score os itens exibidos dentro de uma janela de cooldown (~24h), com penalidade decaindo linearmente até zero. Itens em cooldown SHALL permanecer elegíveis quando não houver alternativas suficientes, preservando o feed infinito. O sistema SHALL descartar registros de exibição de mídias removidas da biblioteca.

#### Scenario: Item servido não reaparece em nova sessão
- **WHEN** um item é servido em uma sessão e o usuário inicia uma nova sessão dentro da janela de cooldown
- **THEN** o item tem score penalizado e outras mídias não exibidas tendem a aparecer primeiro

#### Scenario: Cooldown expira
- **WHEN** um item foi exibido há mais tempo que a janela de cooldown
- **THEN** ele volta a competir sem penalidade

#### Scenario: Biblioteca pequena não trava o feed
- **WHEN** todos os itens do índice estão em cooldown e o usuário continua rolando
- **THEN** novas páginas continuam sendo entregues com os itens penalizados

## MODIFIED Requirements

### Requirement: Mistura de recência
O sistema SHALL misturar mídias de faixas de idade distintas em cada página do feed — recentes (<30 dias), antigas (30–180 dias) e muito antigas (>180 dias) — em proporções configuráveis e decrescentes (padrão ~60%/~25%/~15%), garantindo que nenhuma página seja composta exclusivamente por uma única faixa quando houver itens elegíveis em múltiplas faixas. Quando uma faixa não preenche sua cota, os slots restantes SHALL ser redistribuídos às demais faixas.

#### Scenario: Página mistura faixas de idade
- **WHEN** o índice contém mídias recentes, antigas e muito antigas e o usuário solicita uma página do feed
- **THEN** a página retornada contém itens de cada faixa respeitando as proporções configuradas

#### Scenario: Faixa esgotada cede slots
- **WHEN** o índice não possui itens recentes suficientes para preencher a cota
- **THEN** os slots restantes são preenchidos por itens das faixas mais antigas

### Requirement: Paginação sem repetição imediata
O sistema SHALL paginar o feed por cursor e SHALL evitar reexibir na mesma sessão do feed itens já entregues em páginas anteriores, enquanto houver itens não exibidos no índice. Entre sessões, o sistema SHALL evitar reexibir itens ainda dentro da janela de cooldown de exibição, enquanto houver alternativas elegíveis.

#### Scenario: Scroll infinito sem duplicatas
- **WHEN** o usuário rola o feed "For You" por múltiplas páginas
- **THEN** nenhum item é reexibido até que todo o índice elegível tenha sido consumido

#### Scenario: Nova sessão evita itens em cooldown
- **WHEN** o usuário encerra a sessão (troca de aba ou reabre o app) e inicia outra dentro da janela de cooldown
- **THEN** os itens recém-exibidos são depriorizados em favor de mídias ainda não vistas
