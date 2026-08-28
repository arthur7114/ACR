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

// Canário Grand Messejana II — julho/2026 (feedback de agosto, pasta de evidências).
// Comissão 450,00 a 60% força base comissionável 750,00; o encargo (69,13) compõe o
// total e o repasse sem alterar a base. Decomposição fina aluguel×garagem aguarda o
// fixture do documento; a base agregada é aritmética forçada.
test("Grand Messejana II: intermediação de junho recebida em julho a 60%", () => {
  const resolucao = resolverRecebimento({
    tipo: "intermediacao",
    imovelId: null,
    apto: null,
    inquilino: "NOVO LOCATÁRIO GM II",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    componentes: { aluguel: 750, garagem: null, iptu: 69.13, seguro: null, outrosEncargos: null },
    percentualInformado: null,
    totalRecebidoInformado: null,
    comissaoInformada: 450,
    repasseInformado: 369.13,
    evidencia: { documentoId: null, secao: "INTERMEDIAÇÃO DE JUNHO DE 2026 RECEBIDA EM JULHO", linhaOuTrecho: null, confianca: 0.95 },
  })

  assert.equal(resolucao.status, "resolvido")
  if (resolucao.status !== "resolvido") return
  assert.equal(resolucao.baseComissionavel, 750)
  assert.equal(resolucao.percentualRealizado, 60)
  assert.equal(resolucao.comissao, 450)
  assert.equal(resolucao.totalRecebido, 819.13)
  assert.equal(resolucao.repasse, 369.13)
  assert.equal(resolucao.reconciliado, true)
})

// Canário LOC MAIS — julho/2026: intermediação confirmada na fonte
// (base 800,00 a 60% = 480,00; encargo 28,19 compõe total e repasse).
test("LOC MAIS: intermediação de junho recebida em julho a 60%", () => {
  const resolucao = resolverRecebimento({
    tipo: "intermediacao",
    imovelId: null,
    apto: "SALA 01",
    inquilino: "LOCATARIO SALA 01",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    componentes: { aluguel: 800, garagem: null, iptu: 28.19, seguro: null, outrosEncargos: null },
    percentualInformado: null,
    totalRecebidoInformado: 828.19,
    comissaoInformada: 480,
    repasseInformado: 348.19,
    evidencia: { documentoId: null, secao: "INTERMEDIAÇÃO DE JUNHO DE 2026", linhaOuTrecho: "SALA 01", confianca: 0.95 },
  })

  assert.equal(resolucao.status, "resolvido")
  if (resolucao.status !== "resolvido") return
  assert.equal(resolucao.baseComissionavel, 800)
  assert.equal(resolucao.percentualRealizado, 60)
  assert.equal(resolucao.totalRecebido, 828.19)
  assert.equal(resolucao.repasse, 348.19)
})
