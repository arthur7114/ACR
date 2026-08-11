# Hardening do OCR e dos fechamentos

## Objetivo

Eliminar os bugs encontrados na auditoria do corpus real de março e nos
fechamentos César Rêgo de julho, sem alterar lançamentos já enviados ao eGestor.

## Escopo

1. Corrigir o JSON Schema estrito da prestação e exigir sinal explícito para
   repasse embutido.
2. Fazer o parser Excel reconhecer layouts por cabeçalho, falhar fechado quando
   a competência/layout não forem encontrados e ler todas as seções financeiras.
3. Remover campos consolidados residuais do escopo César Rêgo.
4. Aplicar RBAC no servidor para visualizador, operador, aprovador e admin.
5. Validar o contexto do fechamento no banco e adquirir o job de forma atômica.
6. Persistir análise, movimentos, validações e snapshots na mesma transação.
7. Integrar remessas adicionais ao estado anterior, preservar correções manuais,
   numerar remessas e processar todos os documentos suportados.
8. Aplicar gate de confiança/classificação e identificar documentos por índice,
   não por nome de arquivo.
9. Reparar os campos residuais dos fechamentos César Rêgo de julho com auditoria.

## Restrições

- O mock continua sendo o contrato visual.
- Documento e lançamento eGestor já enviados são imutáveis.
- Upload de fonte documental permanece append-only e idempotente por SHA-256.
- Falha de persistência não pode apagar o último fechamento válido.
- Migrações devem ser aplicadas antes do código que depende das RPCs/roles.

## Validação

- Testes RED/GREEN para cada regressão.
- Corpus real: seis planilhas e os PDFs representativos das sete administrações.
- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- Validação de schema/migrations e `.agent/scripts/checklist.py`.
- Segunda execução do reparo deve ser idempotente.
