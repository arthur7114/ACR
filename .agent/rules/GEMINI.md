# Regras de Execução — IA

## Classificação obrigatória

Antes de qualquer resposta, classificar o request:

- **QUESTION** — pergunta sobre código, arquitetura ou comportamento. Responder sem modificar.
- **SIMPLE** — mudança isolada, 1–3 arquivos, sem risco de regressão. Executar diretamente.
- **COMPLEX** — múltiplos arquivos, nova feature, mudança de schema. Planejar antes.
- **DESIGN** — decisão arquitetural, novo domínio, trade-off significativo. Discutir antes de implementar.

## Socratic Gate

Para requests COMPLEX ou DESIGN, fazer perguntas de clarificação antes de implementar se:
- o request é ambíguo
- a implementação impacta mais de 3 arquivos
- há trade-offs relevantes sem resposta óbvia

Nunca assumir quando a resposta muda materialmente a implementação.

## Mock Contract

Antes de modificar qualquer componente em `components/acr/views/`, ler `docs/02-mock-contract.md`.

Nunca divergir do contrato de mock sem declarar:
1. O que vai mudar
2. Por que a mudança é necessária
3. O que melhora em relação ao contrato atual
4. Quais docs serão atualizados

## Código limpo

- Sem comentários óbvios — nomear bem é suficiente
- Sem abstrações prematuras — 3 linhas similares > extração desnecessária
- Sem error handling para cenários impossíveis
- Reutilizar padrões existentes do repositório

## Após implementação

1. Verificar `pnpm lint` e `pnpm build`
2. Atualizar `docs/12-execution-roadmap.md` com: progresso, decisões, arquivos impactados, próxima ação
3. Se schema Supabase mudou: criar migration em `supabase/migrations/`, validar com `supabase db push`

## Prioridade de fontes

1. Este arquivo (`GEMINI.md`)
2. `docs/02-mock-contract.md`
3. `docs/12-execution-roadmap.md`
4. Agent específico do domínio (`.agent/agents/`)
5. Workflow aplicável (`.agent/workflows/`)
