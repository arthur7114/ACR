import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizarItemLegado,
  resolverRecebimento,
  resolverRecebimentoLegado,
  type RecebimentoExtraordinario,
} from "./recebimentos-extraordinarios"

const evidenciaOk = { documentoId: null, secao: "ACORDOS", linhaOuTrecho: "linha 3", confianca: 0.95 }

function intermediacao(overrides: Partial<Extract<RecebimentoExtraordinario, { tipo: "intermediacao" }>> = {}) {
  return {
    tipo: "intermediacao" as const,
    imovelId: null,
    apto: "204",
    inquilino: "LOCATÁRIO",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    componentes: { aluguel: 650, garagem: 25, iptu: 51.44, seguro: null, outrosEncargos: null },
    percentualInformado: null,
    totalRecebidoInformado: null,
    comissaoInformada: null,
    repasseInformado: null,
    evidencia: evidenciaOk,
    ...overrides,
  }
}

function rescisao(overrides: Partial<Extract<RecebimentoExtraordinario, { tipo: "rescisao" }>> = {}) {
  return {
    tipo: "rescisao" as const,
    imovelId: null,
    apto: "12",
    inquilino: "EX-LOCATÁRIO",
    competenciaOrigem: null,
    competenciaRecebimento: "2026-07",
    principal: 1890,
    ajuste: -226.44,
    componentes: { garagem: null, encargos: null },
    totalRecebidoInformado: 1663.56,
    comissaoInformada: 116.45,
    repasseInformado: 1547.11,
    evidencia: evidenciaOk,
    ...overrides,
  }
}

test("intermediação: base comissionável soma aluguel e garagem, encargos ficam fora", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.baseComissionavel, 675)
  assert.equal(r.percentualRealizado, 60)
})

test("intermediação sem total informado deriva total = base + encargos", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 726.44)
  assert.equal(r.repasse, 321.44)
})

test("intermediação sem garagem usa só o aluguel como base", () => {
  const r = resolverRecebimento(
    intermediacao({
      componentes: { aluguel: 700, garagem: null, iptu: null, seguro: null, outrosEncargos: null },
      comissaoInformada: 350,
    }),
  )
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.baseComissionavel, 700)
  assert.equal(r.percentualRealizado, 50)
})

test("valores explícitos do documento são preservados e reconciliados", () => {
  const r = resolverRecebimento(rescisao())
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.comissao, 116.45)
  assert.equal(r.repasse, 1547.11)
  assert.equal(r.reconciliado, true)
  assert.equal(r.divergencias.length, 0)
})

test("rescisão sem total informado deriva total = principal + ajuste", () => {
  const r = resolverRecebimento(rescisao({ totalRecebidoInformado: null, repasseInformado: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.repasse, 1547.11)
})

test("equação inconsistente vira pendência, nunca recálculo silencioso", () => {
  const r = resolverRecebimento(rescisao({ repasseInformado: 1500 }))
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "equacao_inconsistente")
})

test("diferença de até um centavo na equação é tolerada", () => {
  const r = resolverRecebimento(rescisao({ repasseInformado: 1547.12 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.repasse, 1547.12)
  assert.equal(r.reconciliado, true)
})

test("comissão ausente é derivada de total − repasse quando ambos são informados", () => {
  const r = resolverRecebimento(rescisao({ comissaoInformada: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.comissao, 116.45)
})

test("comissão ausente e não derivável é zero documental, repasse = total", () => {
  const r = resolverRecebimento(rescisao({ comissaoInformada: null, repasseInformado: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.comissao, 0)
  assert.equal(r.repasse, 1663.56)
})

test("percentual informado tem precedência sobre o calculado", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405, percentualInformado: 59.5 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.percentualRealizado, 59.5)
})

test("item sem vínculo por unidade, inquilino ou imóvel fica pendente", () => {
  const r = resolverRecebimento(intermediacao({ apto: null, inquilino: null, comissaoInformada: 405 }))
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "vinculo_ausente")
})

test("confiança abaixo do mínimo fica pendente sem efeito financeiro", () => {
  const r = resolverRecebimento(
    intermediacao({ comissaoInformada: 405, evidencia: { ...evidenciaOk, confianca: 0.55 } }),
  )
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "evidencia_insuficiente")
})

test("item sem nenhum valor monetário fica pendente, nunca zero confirmado", () => {
  const r = resolverRecebimento(
    intermediacao({
      componentes: { aluguel: null, garagem: null, iptu: null, seguro: null, outrosEncargos: null },
    }),
  )
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "evidencia_insuficiente")
})

test("adaptador legado: intermediação mapeia valor para o componente aluguel", () => {
  const canonico = normalizarItemLegado({
    tipo: "intermediacao",
    apto: "204",
    inquilino: "LOCATÁRIO",
    valor: 650,
    garagem: 25,
    iptu: 51.44,
    total_recebido: 726.44,
    comissao: 405,
    repasse: 321.44,
    percentual: 60,
    competencia_original: "2026-06",
    competencia_recebimento: "2026-07",
    observacao: "IPTU (7/12)",
    confianca: 0.95,
  })
  assert.equal(canonico.tipo, "intermediacao")
  if (canonico.tipo !== "intermediacao") return
  assert.equal(canonico.componentes.aluguel, 650)
  assert.equal(canonico.componentes.garagem, 25)
  assert.equal(canonico.totalRecebidoInformado, 726.44)
})

test("adaptador legado: rescisão mapeia valor para principal", () => {
  const canonico = normalizarItemLegado({
    tipo: "rescisao",
    apto: null,
    inquilino: "EX-LOCATÁRIO",
    valor: 1890,
    ajuste: -226.44,
    total_recebido: 1663.56,
    comissao: 116.45,
    repasse: 1547.11,
    competencia_original: null,
    competencia_recebimento: "2026-07",
    observacao: null,
    confianca: 0.9,
  })
  assert.equal(canonico.tipo, "rescisao")
  if (canonico.tipo !== "rescisao") return
  assert.equal(canonico.principal, 1890)
  assert.equal(canonico.ajuste, -226.44)
})

test("resolvedor legado resolve rescisão LOCMAIS ponta a ponta", () => {
  const r = resolverRecebimentoLegado({
    tipo: "rescisao",
    apto: null,
    inquilino: "EX-LOCATÁRIO",
    valor: 1890,
    total_recebido: 1663.56,
    comissao: 116.45,
    repasse: 1547.11,
    competencia_original: null,
    competencia_recebimento: "2026-07",
    observacao: null,
    confianca: 0.9,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.comissao, 116.45)
  assert.equal(r.repasse, 1547.11)
})

test("adaptador legado trata campos ausentes como nulos e confiança ausente como zero", () => {
  const r = resolverRecebimentoLegado({
    tipo: "rescisao",
    valor: 1890,
    total_recebido: 1663.56,
  } as never)
  assert.equal(r.status, "pendente")
})

test("tipo outro usa o valor informado como total recebido", () => {
  const r = resolverRecebimento({
    tipo: "outro",
    imovelId: null,
    apto: "07",
    inquilino: null,
    competenciaOrigem: null,
    competenciaRecebimento: "2026-07",
    valorInformado: 320.5,
    totalRecebidoInformado: null,
    comissaoInformada: null,
    repasseInformado: null,
    evidencia: evidenciaOk,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 320.5)
  assert.equal(r.repasse, 320.5)
})
