import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { IndicadoresHeatRow } from "@/lib/indicadores-types"
import {
  buildDelinquencySummary,
  formatContractedRent,
  formatCurrency,
  formatHistoryCoverage,
  formatPortfolioContractedRent,
  formatReference,
  getFinancialReferences,
} from "./presentation.ts"

const MESES = [
  { competencia: "2026-04-01", label: "Abr/26" },
  { competencia: "2026-05-01", label: "Mai/26" },
  { competencia: "2026-06-01", label: "Jun/26" },
]

function makeRow(overrides: Partial<IndicadoresHeatRow> & { imovelId: string }): IndicadoresHeatRow {
  return {
    unidade: overrides.imovelId,
    inquilinoNome: null,
    empreendimentoId: "emp-1",
    empreendimentoNome: "Grand Messejana I",
    hoje: "ocupado",
    celulas: MESES.map((mes) => ({
      competencia: mes.competencia,
      statusOcupacao: null,
      valor: null,
      inadimplenciaPercentual: null,
      vacanciaPercentual: null,
      origem: null,
      qualidade: null,
    })),
    ...overrides,
  }
}

test("resume inadimplência do mês, acumulada e total, listando só quem está inadimplente agora", () => {
  const inadimplenteRepetido = makeRow({
    imovelId: "apto-7",
    hoje: "inadimplente",
    celulas: [
      { competencia: "2026-04-01", statusOcupacao: "inadimplente", valor: 700, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", statusOcupacao: "inadimplente", valor: 810.44, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
    ],
  })
  const quitouNoPassado = makeRow({
    imovelId: "apto-3",
    hoje: "ocupado",
    celulas: [
      { competencia: "2026-04-01", statusOcupacao: "inadimplente", valor: 300, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
    ],
  })
  const inadimplenteAgoraSoAgora = makeRow({
    imovelId: "apto-9",
    hoje: "inadimplente",
    celulas: [
      { competencia: "2026-04-01", statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", statusOcupacao: "inadimplente", valor: 200, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
    ],
  })

  const summary = buildDelinquencySummary({
    competenciaAtual: "2026-06-01",
    meses: MESES,
    linhas: [inadimplenteRepetido, quitouNoPassado, inadimplenteAgoraSoAgora],
    inadimplenciaAcumulada: 1500,
  })

  // Mês atual soma só o valor de junho das unidades inadimplentes AGORA
  // (810.44 do apto-7 + 200 do apto-9); apto-3 não conta (quitou, não está mais inadimplente).
  assert.equal(summary.mesAtual, 1010.44)
  assert.equal(summary.acumulada, 1500)
  assert.equal(summary.totalEmAberto, 2510.44)

  // Só lista quem está inadimplente na competência atual; ordenado por valor em aberto desc.
  assert.equal(summary.unidades.length, 2)
  assert.equal(summary.unidades[0]?.imovelId, "apto-7")
  assert.equal(summary.unidades[0]?.valorEmAberto, 1510.44)
  assert.deepEqual(
    summary.unidades[0]?.meses.map((mes) => mes.competencia),
    ["2026-04-01", "2026-06-01"],
  )
  assert.equal(summary.unidades[1]?.imovelId, "apto-9")
  assert.equal(summary.unidades[1]?.valorEmAberto, 200)
})

test("mês atual fica indisponível (não zero) quando falta o valor esperado de alguma unidade inadimplente", () => {
  const semValorConhecido = makeRow({
    imovelId: "apto-12",
    hoje: "inadimplente",
    celulas: [
      { competencia: "2026-04-01", statusOcupacao: null, valor: null, inadimplenciaPercentual: null, vacanciaPercentual: null, origem: null, qualidade: null },
      { competencia: "2026-05-01", statusOcupacao: null, valor: null, inadimplenciaPercentual: null, vacanciaPercentual: null, origem: null, qualidade: null },
      { competencia: "2026-06-01", statusOcupacao: "inadimplente", valor: null, inadimplenciaPercentual: null, vacanciaPercentual: 0, origem: "processamento", qualidade: "parcial" },
    ],
  })

  const summary = buildDelinquencySummary({
    competenciaAtual: "2026-06-01",
    meses: MESES,
    linhas: [semValorConhecido],
    inadimplenciaAcumulada: 0,
  })

  assert.equal(summary.mesAtual, null)
  assert.equal(summary.totalEmAberto, null)
  assert.equal(summary.unidades[0]?.valorEmAberto, null)
})

test("nenhuma unidade inadimplente agora produz lista vazia sem quebrar os totais", () => {
  const semPendencia = makeRow({ imovelId: "apto-1", hoje: "ocupado" })
  const summary = buildDelinquencySummary({
    competenciaAtual: "2026-06-01",
    meses: MESES,
    linhas: [semPendencia],
    inadimplenciaAcumulada: 0,
  })
  assert.deepEqual(summary.unidades, [])
  assert.equal(summary.mesAtual, 0)
  assert.equal(summary.totalEmAberto, 0)
})

test("resume a cobertura histórica de cada unidade sem jargão técnico", () => {
  assert.equal(formatHistoryCoverage(0, 0, 6), "Sem histórico no período")
  assert.equal(formatHistoryCoverage(1, 1, 1), "1 de 1 mês com status")
  assert.equal(formatHistoryCoverage(5, 5, 6), "5 de 6 meses com status")
  assert.equal(formatHistoryCoverage(6, 1, 6), "6 de 6 registrados · 1 com status")
})

test("apresenta referência financeira mensal e dia isolado sem ambiguidade", () => {
  assert.equal(formatReference("2026-05"), "05/2026")
  assert.equal(formatReference("2026-05-10"), "05/2026")
  assert.equal(formatReference("10"), "Dia 10")
  assert.equal(formatReference("dia 08"), "Dia 8")
  assert.equal(formatReference(null), "—")
})

test("distingue dado ausente, zero confirmado e aluguel não aplicável", () => {
  assert.equal(formatCurrency(null), "—")
  assert.equal(formatCurrency(undefined), "—")
  assert.equal(formatCurrency(0), "R$ 0,00")
  assert.equal(formatContractedRent(0, "variavel"), "Não se aplica")
  assert.equal(formatContractedRent(null, "nao_aplicavel"), "Não se aplica")
  assert.equal(formatContractedRent(1250.5, "fixo"), "R$ 1.250,50")
  assert.equal(
    formatPortfolioContractedRent(null, {
      conhecidos: 0,
      naoAplicaveis: 1,
      ausentes: 0,
    }),
    "Não se aplica",
  )
  assert.equal(
    formatPortfolioContractedRent(null, {
      conhecidos: 0,
      naoAplicaveis: 0,
      ausentes: 1,
    }),
    "—",
  )
})

test("separa competência do aluguel, recebimento e vencimento", () => {
  assert.deepEqual(
    getFinancialReferences({
      competencia: "2026-05",
      vencimentoReferencia: "dia 08",
      competenciaAluguel: "2026-04",
      competenciaRecebimento: "2026-05",
    } as never),
    {
      rentCompetence: "04/2026",
      receiptCompetence: "05/2026",
      dueDay: "Dia 8",
    },
  )
  assert.deepEqual(
    getFinancialReferences({ competencia: "2026-05", vencimentoReferencia: null }),
    {
      rentCompetence: "—",
      receiptCompetence: "05/2026",
      dueDay: "—",
    },
  )
})

test("mantém a nomenclatura de negócio e remove termos técnicos da interface", () => {
  const files = [
    "../primitives/dashboard-ui.tsx",
    "../tabs/view-geral.tsx",
    "../tabs/view-receita.tsx",
    "../tabs/view-mapa.tsx",
    "../tabs/view-registro.tsx",
    "../../views/indicadores-view.tsx",
  ]
  const source = files
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n")

  for (const retiredTerm of [
    "PackageTotals",
    '"Receita total"',
    '"Receita & repasse"',
    '"Mapa de calor"',
    '"Receitas por imóvel"',
    '"Repasse apurado"',
    '"Resíduo da reconciliação"',
    '"Ref. financeira"',
    '"Snapshot nativo"',
    '"Histórico recomposto"',
    '"Histórico reconstruído"',
    "Reconstr.",
  ]) {
    assert.equal(source.includes(retiredTerm), false, `termo aposentado encontrado: ${retiredTerm}`)
  }

  for (const requiredTerm of [
    "Como ler este painel",
    "Conciliação financeira",
    "Riscos por imóvel",
    "Detalhamento por imóvel",
    "Repasse confirmado pelo banco",
    "Diferença não explicada",
  ]) {
    assert.equal(source.includes(requiredTerm), true, `termo obrigatório ausente: ${requiredTerm}`)
  }

  assert.equal(
    source.includes("motivosConfianca"),
    false,
    "motivos técnicos de confiança não devem aparecer no banner",
  )
  assert.equal(source.includes("Sem dados no mês"), true, "o mapa deve explicar células sem histórico")
  assert.equal(source.includes("formatHistoryCoverage"), true, "o mapa deve resumir a cobertura por unidade")
})
