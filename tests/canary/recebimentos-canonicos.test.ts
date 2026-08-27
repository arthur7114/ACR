import assert from "node:assert/strict"
import test from "node:test"

import { resolverRecebimento } from "../../lib/recebimentos-extraordinarios"

// Canário Grand Castelão I — julho/2026 (docs/06-acceptance-criteria.md, valores-canário)
// Base comissionável = componentes comissionáveis (aluguel + garagem); encargos compõem
// total e repasse, não a base. Valores explícitos do documento são preservados e validados.
test("Grand Castelão: intermediação usa aluguel + garagem como base comissionável", () => {
  const resolucao = resolverRecebimento({
    tipo: "intermediacao",
    imovelId: null,
    apto: "204",
    inquilino: "NOVO LOCATÁRIO",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    componentes: { aluguel: 650, garagem: 25, iptu: 51.44, seguro: null, outrosEncargos: null },
    percentualInformado: null,
    totalRecebidoInformado: 726.44,
    comissaoInformada: 405,
    repasseInformado: 321.44,
    evidencia: { documentoId: null, secao: "INTERMEDIAÇÃO DE JUNHO DE 2026 RECEBIDA EM JULHO", linhaOuTrecho: "204", confianca: 0.95 },
  })

  assert.equal(resolucao.status, "resolvido")
  if (resolucao.status !== "resolvido") return
  assert.equal(resolucao.baseComissionavel, 675)
  assert.equal(resolucao.percentualRealizado, 60)
  assert.equal(resolucao.totalRecebido, 726.44)
  assert.equal(resolucao.comissao, 405)
  assert.equal(resolucao.repasse, 321.44)
  assert.equal(resolucao.reconciliado, true)
})
