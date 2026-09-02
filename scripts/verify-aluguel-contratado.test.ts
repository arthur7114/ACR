import assert from "node:assert/strict"
import test from "node:test"
import { verificarAluguelContratado, type LinhaContratada } from "./verify-aluguel-contratado.ts"

function linha(overrides: Partial<LinhaContratada> = {}): LinhaContratada {
  return {
    competencia: "2026-07-01",
    empreendimento: "Grand Messejana II",
    unidade: "2",
    statusOcupacao: "ocupado",
    modeloReceita: "fixo",
    aluguelContratado: 690.63,
    aluguelRecebido: 690.63,
    atrasosRecuperados: 0,
    ...overrides,
  }
}

test("aluguel contratado abaixo do recebido da competencia acusa defasagem", () => {
  // Caso real de GM II jul/26 antes do reparo: o reajuste de julho nunca chegou
  // ao cadastro, entao a unidade recebia 690,63 com 660,00 contratados.
  const divergencias = verificarAluguelContratado([
    linha({ aluguelContratado: 660, aluguelRecebido: 690.63, atrasosRecuperados: 0 }),
  ])

  assert.equal(divergencias.length, 1)
  assert.equal(divergencias[0]?.motivo, "contratado_defasado")
  assert.equal(divergencias[0]?.recebidoDaCompetencia, 690.63)
  assert.equal(divergencias[0]?.diferenca, 30.63)
})

test("quitacao integral de atraso nao acusa nada", () => {
  // João Cordeiro 0002521 em junho: recebeu 1.576,18 com 788,22 contratados,
  // exatamente dois meses de uma vez. O proxy ingenuo acusava; descontando o
  // atraso, a competencia recebeu zero.
  const divergencias = verificarAluguelContratado([
    linha({ unidade: "0002521", aluguelContratado: 788.22, aluguelRecebido: 1576.18, atrasosRecuperados: 1576.18 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("atraso parcial mantem a competencia dentro do contratado", () => {
  // Grand Messejana I apto 1 em junho: 650,00 do mes + 748,93 de atraso.
  const divergencias = verificarAluguelContratado([
    linha({ unidade: "1", aluguelContratado: 650, aluguelRecebido: 1398.93, atrasosRecuperados: 748.93 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("atraso que ainda deixa a competencia acima do contratado acusa", () => {
  // Descontar o atraso nao pode virar desculpa universal: o que sobra da
  // competencia continua sendo comparado com o contrato.
  const divergencias = verificarAluguelContratado([
    linha({ aluguelContratado: 600, aluguelRecebido: 1400, atrasosRecuperados: 700 }),
  ])

  assert.equal(divergencias.length, 1)
  assert.equal(divergencias[0]?.recebidoDaCompetencia, 700)
  assert.equal(divergencias[0]?.diferenca, 100)
})

test("contrato ativo com aluguel zerado acusa mesmo sem defasagem", () => {
  // GM II apto 3 antes do reparo: contrato ativo e cadastro com zero.
  const divergencias = verificarAluguelContratado([
    linha({ unidade: "3", aluguelContratado: 0, aluguelRecebido: 361.29, atrasosRecuperados: 0 }),
  ])

  assert.equal(divergencias.length, 1)
  assert.equal(divergencias[0]?.motivo, "contratado_zerado")
})

test("receita variavel e unidade sem vigencia ficam de fora", () => {
  // Airbnb nao tem aluguel fixo: comparar inventaria divergencia todo mes.
  const divergencias = verificarAluguelContratado([
    linha({ modeloReceita: "variavel", aluguelContratado: null, aluguelRecebido: 1200 }),
    linha({ modeloReceita: null, aluguelContratado: null, aluguelRecebido: 900 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("status desconhecido nao acusa: falta de dado nao e defeito de contrato", () => {
  const divergencias = verificarAluguelContratado([
    linha({ statusOcupacao: "desconhecido", aluguelContratado: 400, aluguelRecebido: 900 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("mes proporcional recebe menos que o contratado e nao acusa", () => {
  // Contrato novo iniciado no dia 16: recebido menor que o contratado e o
  // esperado, nao divergencia.
  const divergencias = verificarAluguelContratado([
    linha({ unidade: "3", aluguelContratado: 700, aluguelRecebido: 361.29 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("diferenca de centavo fica dentro da tolerancia", () => {
  const divergencias = verificarAluguelContratado([
    linha({ aluguelContratado: 690.63, aluguelRecebido: 690.64 }),
  ])

  assert.deepEqual(divergencias, [])
})

test("relata cada unidade divergente uma vez, preservando competencia e empreendimento", () => {
  const divergencias = verificarAluguelContratado([
    linha({ competencia: "2026-05-01", empreendimento: "LOCMAIS", unidade: "SALA 02", aluguelContratado: 900, aluguelRecebido: 937.29 }),
    linha({ competencia: "2026-06-01", empreendimento: "LOCMAIS", unidade: "SALA 02", aluguelContratado: 900, aluguelRecebido: 937.29 }),
    linha({ aluguelContratado: 690.63, aluguelRecebido: 690.63 }),
  ])

  assert.equal(divergencias.length, 2)
  assert.deepEqual(
    divergencias.map((item) => `${item.competencia} ${item.empreendimento} ${item.unidade}`),
    ["2026-05-01 LOCMAIS SALA 02", "2026-06-01 LOCMAIS SALA 02"],
  )
})
