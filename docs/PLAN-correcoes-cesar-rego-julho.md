# Plano — Correções César Rêgo e reparo de julho

## Objetivo

Corrigir a classificação de inadimplência, o escopo financeiro por empreendimento, o rateio igual da TED, as datas do eGestor e a inclusão de lançamentos manuais repetidos. Depois, reparar com auditoria os fechamentos César Rêgo de `07/2026`.

## Entregas

1. Marcar `SIT=ALUG` sem lançamento como inadimplência explícita.
2. Recalcular cada fechamento apenas com as linhas do seu empreendimento e dividir a TED global igualmente entre os empreendimentos.
3. Extrair vencimento/emissão do cabeçalho e usar o vencimento no payload eGestor.
4. Trocar a unicidade por tipo/categoria por uma chave de origem estável para automáticos e única para manuais.
5. Executar reparo de julho primeiro em `dry-run`, depois em modo de escrita somente se a reconciliação for exata.
6. Preservar lançamentos eGestor já enviados; o código `9041` será corrigido manualmente no eGestor.

## Validação

- Testes focados e suíte completa.
- TypeScript, lint e build.
- Validação da migration Supabase e checklist do projeto.
- Conferência antes/depois do reparo, idempotência e auditoria.
