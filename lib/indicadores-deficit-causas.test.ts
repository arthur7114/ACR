import assert from "node:assert/strict"
import test from "node:test"

import {
  diasDaCompetencia,
  diasProporcionaisDeclarados,
  esperadoDoMes,
  imoveisCobradosComoIntermediacao,
} from "./indicadores-deficit-causas"

// Canários GM II ago/2026 (feedback do cliente em 2026-09-17, tela de
// Indicadores): R$ 2.100,00 lidos como "ocupado sem recebimento" eram os três
// aptos de intermediação, e R$ 863,23 de "recebimento parcial" eram dois
// contratos novos com mês proporcional declarado no documento.

test("os três aptos da seção de intermediação são reconhecidos pelo inquilino", () => {
  const linhas = [
    { imovelId: "i3", inquilinoNome: "VITOR SOUSA PINTO", aluguelEsperado: 700, observacao: "INTERMEDIAÇÃO" },
    { imovelId: "i8", inquilinoNome: "PAULO WENDEL COSMO DE LIMA", aluguelEsperado: 700, observacao: "INTERMEDIAÇÃO" },
    {
      imovelId: "i23",
      inquilinoNome: "JAMILLE RODRIGUES DA PRATA",
      aluguelEsperado: 700,
      observacao: "IPTU (8/12). SEGURO QUITADO.",
    },
    { imovelId: "i25", inquilinoNome: "GEISA SILVA MOURA", aluguelEsperado: 700, observacao: "INADIMPLÊNCIA" },
  ]
  const intermediacoes = [
    { tipo: "intermediacao", apto: "3", inquilino: "VITOR SOUSA PINTO" },
    { tipo: "intermediacao", apto: "8", inquilino: "PAULO WENDEL COSMO DE LIMA" },
    { tipo: "intermediacao", apto: "23", inquilino: "JAMILLE RODRIGUES DA PRATA" },
    { tipo: "atraso", apto: "7", inquilino: "LUANA ALINE BATISTA" },
  ]

  const encontrados = imoveisCobradosComoIntermediacao(linhas, intermediacoes)

  assert.deepEqual([...encontrados].sort(), ["i23", "i3", "i8"])
  // A inadimplente de verdade continua fora.
  assert.equal(encontrados.has("i25"), false)
})

test("sem nome do inquilino, a unidade casa pelo número do apto", () => {
  const linhas = [{ imovelId: "abc", inquilinoNome: null, aluguelEsperado: 700, observacao: null }]
  const intermediacoes = [{ tipo: "intermediacao", apto: "23", inquilino: null }]

  const encontrados = imoveisCobradosComoIntermediacao(
    linhas,
    intermediacoes,
    new Map([["abc", "23"]]),
  )

  assert.deepEqual([...encontrados], ["abc"])
})

test("fechamento sem seção de intermediação não marca ninguém", () => {
  const linhas = [{ imovelId: "i1", inquilinoNome: "ALGUÉM", aluguelEsperado: 700, observacao: null }]

  assert.equal(imoveisCobradosComoIntermediacao(linhas, []).size, 0)
  assert.equal(
    imoveisCobradosComoIntermediacao(linhas, [{ tipo: "rescisao", apto: "1", inquilino: "ALGUÉM" }]).size,
    0,
  )
})

test("período proporcional só existe quando a linha declara", () => {
  assert.equal(diasProporcionaisDeclarados("PROPORCIONAL DE 21 DIAS (11/08 A 31/08)."), 21)
  assert.equal(diasProporcionaisDeclarados("PROPORCIONAL DE 01 DIAS (31/08)."), 1)
  assert.equal(diasProporcionaisDeclarados("IPTU (8/12). SEGURO QUITADO."), null)
  assert.equal(diasProporcionaisDeclarados(null), null)
})

test("agosto tem 31 dias e fevereiro bissexto tem 29", () => {
  assert.equal(diasDaCompetencia("2026-08-01"), 31)
  assert.equal(diasDaCompetencia("2024-02-01"), 29)
  assert.equal(diasDaCompetencia("nao-e-data"), null)
})

test("GM II ago/2026: o proporcional reproduz exatamente o que foi cobrado", () => {
  // Francisco, apto 12: 1 dia de agosto sobre R$ 700 = R$ 22,58 — o centavo
  // exato que o documento cobrou e ele pagou.
  assert.equal(esperadoDoMes(700, "PROPORCIONAL DE 01 DIAS (31/08).", "2026-08-01"), 22.58)
  // Samuel, apto 26: 21 dias.
  assert.equal(esperadoDoMes(660, "PROPORCIONAL DE 21 DIAS (11/08 A 31/08).", "2026-08-01"), 447.1)
})

test("sem declaração de período, o esperado do mês é o contratado inteiro", () => {
  assert.equal(esperadoDoMes(700, "IPTU (8/12). SEGURO QUITADO.", "2026-08-01"), 700)
  assert.equal(esperadoDoMes(700, null, "2026-08-01"), 700)
  // Período que cobre o mês todo não reduz nada.
  assert.equal(esperadoDoMes(700, "PROPORCIONAL DE 31 DIAS", "2026-08-01"), 700)
})

test("esperado desconhecido continua desconhecido, nunca zero", () => {
  assert.equal(esperadoDoMes(null, "PROPORCIONAL DE 10 DIAS", "2026-08-01"), null)
})
