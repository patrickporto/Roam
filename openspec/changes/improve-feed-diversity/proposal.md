# Change: Anti-repetição com cooldown e faixas de idade no feed

## Why
O feed "For You" repete os mesmos itens entre sessões e ao reiniciar o ciclo (não há memória do que já foi exibido), e itens muito antigos (>180 dias) praticamente nunca aparecem porque o decaimento exponencial de recência zera seu score antes mesmo de entrarem no pool de candidatos.

## What Changes
- Nova tabela `shown_history(media_path, shown_at)` (migração v6) registrando cada item servido.
- Score ganha penalidade de cooldown: itens exibidos nas últimas ~24h perdem até 0.6 de score, decaindo linearmente — resolve repetição entre sessões, reinícios do app e reinícios de ciclo, sem excluir itens (feed infinito preservado).
- Recência passa de decaimento exponencial para faixas (recente <30d = 1.0, antigo 30–180d = 0.5, muito antigo >180d = 0.3), dando piso não-zero a itens de anos atrás.
- Pool de candidatos ganha amostra aleatória garantida de itens muito antigos (~15 slots), para que a cota deles seja de fato preenchida.
- `applyDiversity` passa a três faixas com cotas ~60%/~25%/~15% e redistribuição de slots quando uma faixa esgota.
- `shown_history` é limpa quando raiz/perfil é removido (mesmo padrão de favoritos/tags).

## Impact
- Affected specs: `for-you-feed`
- Affected code: `electron/services/db.ts`, `electron/services/recommendation.ts`, `electron/ipc/handlers.ts` (limpeza em remoção), `tests/recommendation.test.ts`
