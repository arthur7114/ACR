# Corrigir vigências de Pompílio em julho

## Objetivo

Fazer o indicador `Aluguel contratado` de julho/2026 refletir os valores
documentados na prestação César Rêgo: R$ 6.896,75 para o imóvel 0002526 e
R$ 5.517,41 para o imóvel 0002527.

## Execução

1. Validar os imóveis, o fechamento e o documento-fonte de julho.
2. Encerrar em junho as vigências migradas com valores anteriores.
3. Criar vigências a partir de 01/07/2026 com os valores documentados.
4. Registrar antes/depois na auditoria do fechamento.
5. Recalcular e verificar os snapshots de julho do empreendimento.

## Segurança

- A migration falha se os imóveis, valores anteriores ou documento-fonte não
  forem exatamente os esperados.
- O histórico anterior a julho é preservado.
- Nenhum fechamento financeiro ou lançamento eGestor é alterado.

## Rollback

Executar em uma única transação, somente após reconfirmar os dois imóveis e a
fonte: remover as vigências iniciadas em 01/07/2026 que apontam para a prestação
41460; reabrir (`vigencia_fim = null`) as vigências anteriores de R$ 6.684,85 e
R$ 5.347,89; e remover apenas as duas auditorias cujo `campo_alterado` identifica
0002526/0002527 e cuja justificativa cita esta correção. Recalcular os dois
snapshots de julho depois do rollback. A operação não toca o fechamento nem o
eGestor.

## Validação em cópia

Restaurar um dump lógico do schema `public` em PostgreSQL descartável, reverter
na cópia o estado para as vigências anteriores, aplicar a migration e executar
novamente. A primeira execução deve criar duas vigências e duas auditorias; a
segunda deve ser idempotente. Em seguida, alterar na cópia o vínculo da fonte e
confirmar que a migration falha fechada.
