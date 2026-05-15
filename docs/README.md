# Docs - ACR Fechamentos

Esta pasta e o caminho oficial de leitura para qualquer trabalho no modulo de fechamento imobiliario.

## Ordem de leitura

1. `PRD_Modulo_Fechamento_Imobiliario_v0.3.md` - PRD completo e fonte historica/canonica.
2. `01-product-brief.md` - resumo do produto, escopo e decisoes principais.
3. `02-mock-contract.md` - contrato obrigatorio do mock em `acr-fechamentos-app`.
4. `03-domain-model.md` - entidades, status, permissoes e regras de dominio.
5. `04-user-flows.md` - fluxos de usuario e estados do fechamento.
6. `05-development-phases.md` - etapas pequenas de desenvolvimento.
7. `06-acceptance-criteria.md` - criterios CA01-CA14 organizados por etapa.
8. `07-risks-open-questions.md` - riscos, mitigacoes e perguntas abertas.
9. `11-jtbd-gsd-methodology.md` - metodologia operacional JTBD + GSD.
10. `12-execution-roadmap.md` - status geral, progresso e proxima acao.
11. `13-current-state-audit.md` - estado atual do repositorio e lacunas.

## Regra de uso

Antes de implementar qualquer etapa, leia:

- `02-mock-contract.md`
- `12-execution-roadmap.md`
- o doc numerado da etapa em desenvolvimento
- `06-acceptance-criteria.md`, filtrando pelos criterios da etapa

Ao final de cada ciclo, atualize `12-execution-roadmap.md` com progresso, validacao, decisoes e proxima acao. Atualize tambem qualquer doc especifico cujo contrato tenha mudado.

