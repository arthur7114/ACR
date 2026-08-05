import assert from "node:assert/strict"
import { test } from "node:test"
import {
  calcularAluguelContratado,
  calcularUnidadesVagas,
  compararIndicadores,
  contratoAtivoNaCompetencia,
  filtrarAluguelRecebidoCompetencia,
  filtrarCaixaDoMes,
  filtrarInadimplencia,
  filtrarRecuperacaoAtrasados,
  type ContratoRow,
  type ImovelRow,
  type LancamentoRow,
  type ValorRow,
} from "./verify-competencia"

// Fixtures sintéticas: ids e nomes fictícios, nenhum dado real.

function imovel(overrides: Partial<ImovelRow> & { id: string }): ImovelRow {
  return {
    tipo: "apartamento",
    inquilino_nome: "Fulano de Tal",
    ativo: true,
    empreendimento_id: "emp-1",
    ...overrides,
  }
}

function contrato(overrides: Partial<ContratoRow> & { id: string }): ContratoRow {
  return {
    imovel_id: "im-1",
    inicio: "2026-01-01",
    fim: null,
    ativo: true,
    ...overrides,
  }
}

function lancamento(overrides: Partial<LancamentoRow>): LancamentoRow {
  return {
    imovel_id: "im-1",
    rubrica: "aluguel",
    valor: 800,
    situacao: "recebido",
    competencia_origem: "2026-06-01",
    competencia_recebimento: "2026-06-01",
    ...overrides,
  }
}

// --- contratoAtivoNaCompetencia --------------------------------------------

test("contrato com fim inclusivo está ativo no próprio mês de fim", () => {
  const encerrado = contrato({ id: "ct-1", inicio: "2026-01-01", fim: "2026-06-01" })
  assert.equal(contratoAtivoNaCompetencia(encerrado, "2026-06-01"), true)
  assert.equal(contratoAtivoNaCompetencia(encerrado, "2026-07-01"), false)
})

test("contrato sem fim está ativo em qualquer competência a partir do início", () => {
  const aberto = contrato({ id: "ct-2", inicio: "2026-03-01", fim: null })
  assert.equal(contratoAtivoNaCompetencia(aberto, "2026-02-01"), false)
  assert.equal(contratoAtivoNaCompetencia(aberto, "2026-03-01"), true)
  assert.equal(contratoAtivoNaCompetencia(aberto, "2030-12-01"), true)
})

test("contrato desativado nunca conta como ativo, mesmo dentro do intervalo", () => {
  const desativado = contrato({ id: "ct-3", inicio: "2026-01-01", fim: null, ativo: false })
  assert.equal(contratoAtivoNaCompetencia(desativado, "2026-06-01"), false)
  assert.equal(contratoAtivoNaCompetencia(desativado, "2026-01-01"), false)
})

// --- Filtros de lançamento --------------------------------------------------

const COMPETENCIA = "2026-06-01"

const ALUGUEL_CORRENTE = lancamento({
  imovel_id: "im-1",
  valor: 800,
  competencia_origem: COMPETENCIA,
  competencia_recebimento: COMPETENCIA,
})
const ATRASO_RECUPERADO = lancamento({
  imovel_id: "im-2",
  valor: 500,
  competencia_origem: "2026-05-01",
  competencia_recebimento: COMPETENCIA,
})
const INADIMPLENTE = lancamento({
  imovel_id: "im-3",
  valor: 700,
  situacao: "em_aberto",
  competencia_origem: COMPETENCIA,
  competencia_recebimento: null,
})
const OUTROS_RECEBIMENTOS = lancamento({
  imovel_id: "im-1",
  rubrica: "outros",
  valor: 120,
  competencia_origem: COMPETENCIA,
  competencia_recebimento: COMPETENCIA,
})

const TODOS = [ALUGUEL_CORRENTE, ATRASO_RECUPERADO, INADIMPLENTE, OUTROS_RECEBIMENTOS]

test("filtrarAluguelRecebidoCompetencia pega só o aluguel do próprio mês", () => {
  assert.deepEqual(filtrarAluguelRecebidoCompetencia(TODOS, COMPETENCIA), [ALUGUEL_CORRENTE])
})

test("filtrarRecuperacaoAtrasados pega só o recebimento de competência anterior", () => {
  assert.deepEqual(filtrarRecuperacaoAtrasados(TODOS, COMPETENCIA), [ATRASO_RECUPERADO])
})

test("filtrarInadimplencia pega só o aluguel em aberto da competência", () => {
  assert.deepEqual(filtrarInadimplencia(TODOS, COMPETENCIA), [INADIMPLENTE])
})

test("filtrarCaixaDoMes pega todo recebido no mês, de qualquer rubrica, e nunca o em aberto", () => {
  assert.deepEqual(filtrarCaixaDoMes(TODOS, COMPETENCIA), [
    ALUGUEL_CORRENTE,
    ATRASO_RECUPERADO,
    OUTROS_RECEBIMENTOS,
  ])
})

// --- compararIndicadores ----------------------------------------------------

function esperadoBase() {
  return {
    caixaDoMes: 100,
    aluguelContratado: 100,
    aluguelRecebidoCompetencia: 100,
    inadimplenciaMes: 100,
    unidadesInadimplentes: 3,
    unidadesVagas: 3,
    recuperacaoAtrasados: 100,
    repasse: 100,
  }
}

test("campo monetário com diferença de R$ 0,015 fica dentro da tolerância", () => {
  const obtido = { ...esperadoBase(), caixaDoMes: 100.015 }
  const linhas = compararIndicadores(esperadoBase(), obtido)
  const caixa = linhas.find((linha) => linha.indicador === "caixaDoMes")
  assert.equal(caixa?.ok, true)
})

test("campo monetário com diferença de R$ 0,03 estoura a tolerância", () => {
  const obtido = { ...esperadoBase(), caixaDoMes: 100.03 }
  const linhas = compararIndicadores(esperadoBase(), obtido)
  const caixa = linhas.find((linha) => linha.indicador === "caixaDoMes")
  assert.equal(caixa?.ok, false)
  assert.equal(caixa?.diff, 0.03)
})

test("contagem de unidades exige igualdade exata (diferença de 1 já falha)", () => {
  const obtido = { ...esperadoBase(), unidadesVagas: 4, unidadesInadimplentes: 4 }
  const linhas = compararIndicadores(esperadoBase(), obtido)
  assert.equal(linhas.find((linha) => linha.indicador === "unidadesVagas")?.ok, false)
  assert.equal(linhas.find((linha) => linha.indicador === "unidadesInadimplentes")?.ok, false)
})

// --- calcularAluguelContratado ---------------------------------------------

test("aluguelContratado ignora imóvel inativo e imóvel Airbnb", () => {
  const imoveis: ImovelRow[] = [
    imovel({ id: "im-1" }),
    imovel({ id: "im-2", ativo: false }),
    imovel({ id: "im-3", tipo: null, inquilino_nome: "AIRBNB" }),
  ]
  const contratos: ContratoRow[] = [
    contrato({ id: "ct-1", imovel_id: "im-1" }),
    contrato({ id: "ct-2", imovel_id: "im-2" }),
    contrato({ id: "ct-3", imovel_id: "im-3" }),
  ]
  const valores: ValorRow[] = [
    { contrato_id: "ct-1", vigencia_inicio: "2026-01-01", valor: 800 },
    { contrato_id: "ct-2", vigencia_inicio: "2026-01-01", valor: 900 },
    { contrato_id: "ct-3", vigencia_inicio: "2026-01-01", valor: 1000 },
  ]
  // Todos os três contratos estão vigentes na competência...
  for (const ct of contratos) assert.equal(contratoAtivoNaCompetencia(ct, COMPETENCIA), true)
  // ...mas só o imóvel ativo e não-Airbnb entra na soma.
  assert.equal(calcularAluguelContratado(imoveis, contratos, valores, COMPETENCIA), 800)
})

test("aluguelContratado usa a vigência mais recente até a competência", () => {
  const imoveis: ImovelRow[] = [imovel({ id: "im-1" })]
  const contratos: ContratoRow[] = [contrato({ id: "ct-1", imovel_id: "im-1" })]
  const valores: ValorRow[] = [
    { contrato_id: "ct-1", vigencia_inicio: "2026-01-01", valor: 800 },
    { contrato_id: "ct-1", vigencia_inicio: "2026-04-01", valor: 850.5 },
    { contrato_id: "ct-1", vigencia_inicio: "2026-09-01", valor: 900 },
  ]
  assert.equal(calcularAluguelContratado(imoveis, contratos, valores, COMPETENCIA), 850.5)
})

test("aluguelContratado ignora contrato desativado", () => {
  const imoveis: ImovelRow[] = [imovel({ id: "im-1" })]
  const contratos: ContratoRow[] = [contrato({ id: "ct-1", imovel_id: "im-1", ativo: false })]
  const valores: ValorRow[] = [{ contrato_id: "ct-1", vigencia_inicio: "2026-01-01", valor: 800 }]
  assert.equal(calcularAluguelContratado(imoveis, contratos, valores, COMPETENCIA), 0)
})

// --- calcularUnidadesVagas --------------------------------------------------

test("unidadesVagas conta só imóvel ativo, não-Airbnb, sem contrato vigente", () => {
  const imoveis: ImovelRow[] = [
    imovel({ id: "im-1" }), // com contrato vigente → não vaga
    imovel({ id: "im-2" }), // sem contrato → vaga
    imovel({ id: "im-3", ativo: false }), // inativo → fora do escopo
    imovel({ id: "im-4", tipo: null, inquilino_nome: "AIRBNB" }), // Airbnb → fora do escopo
    imovel({ id: "im-5" }), // contrato encerrado antes da competência → vaga
  ]
  const contratos: ContratoRow[] = [
    contrato({ id: "ct-1", imovel_id: "im-1" }),
    contrato({ id: "ct-5", imovel_id: "im-5", inicio: "2026-01-01", fim: "2026-05-01" }),
  ]
  assert.equal(calcularUnidadesVagas(imoveis, contratos, COMPETENCIA), 2)
})
