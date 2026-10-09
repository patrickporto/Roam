## 1. Backend
- [x] 1.1 Migração v6: tabela `shown_history(media_path PRIMARY KEY, shown_at)` em `db.ts`
- [x] 1.2 Score em `recommendation.ts`: recência por faixas (1.0/0.5/0.3) + penalidade de cooldown via LEFT JOIN em `shown_history`
- [x] 1.3 Pool de candidatos: amostra aleatória garantida de muito antigos além do top-K e do resto
- [x] 1.4 `applyDiversity` com três faixas, cotas ~60/25/15 e redistribuição de slots
- [x] 1.5 Registrar `shown_at` ao servir página (upsert em batch) + poda de linhas expiradas
- [x] 1.6 Limpar `shown_history` ao remover raiz e quando pasta de raiz/perfil some do disco (`handlers.ts`)

## 2. Verificação
- [x] 2.1 Testes: faixa muito antiga aparece, redistribuição de slots, registro em `shown_history`
- [x] 2.2 Rodar suite de testes e typecheck
