# Workflow: Docs Maintenance

Usado para atualizar documentação após implementação ou decisão de design.

## Quando atualizar cada doc

| Doc | Atualizar quando |
|-----|-----------------|
| `docs/12-execution-roadmap.md` | Após qualquer implementação |
| `docs/02-mock-contract.md` | UI/UX divergiu do contrato original |
| `docs/03-domain-model.md` | Schema ou entidades mudaram |
| `docs/04-user-flows.md` | Fluxo de navegação mudou |
| `docs/06-acceptance-criteria.md` | Critérios de aceite foram ajustados |
| `docs/07-risks-open-questions.md` | Novo risco identificado ou questão resolvida |
| `.agent/ARCHITECTURE.md` | Arquitetura técnica mudou |

## Passos

1. Identificar qual(is) doc(s) foram impactados pela mudança
2. Ler a versão atual do doc
3. Fazer a atualização mínima necessária — não reescrever o doc inteiro
4. Manter consistência de tom e formato com o restante do doc
5. Registrar a atualização no item do roadmap correspondente

## Regras

- Não criar novos docs sem antes verificar se algum existente cobre o tema
- Docs numerados (`01-`, `02-`, etc.) seguem hierarquia de prioridade — os menores têm mais peso
- `PRD_Modulo_Fechamento_Imobiliario_v0.3.md` é referência, não deve ser editado no dia a dia
