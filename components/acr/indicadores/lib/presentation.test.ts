import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { IndicadoresHeatRow } from "@/lib/indicadores-types"
import {
  buildDelinquencySummary,
  buildHeatGroups,
  describeHeatCellDetail,
  formatContractedRent,
  formatCurrency,
  formatHistoryCoverage,
  formatPortfolioContractedRent,
  formatReference,
  filterMonthlySeriesPeriod,
  getFinancialReferences,
} from "./presentation.ts"

const MESES = [
  { competencia: "2026-04-01", label: "Abr/26" },
  { competencia: "2026-05-01", label: "Mai/26" },
  { competencia: "2026-06-01", label: "Jun/26" },
]

test("filtra a evolução mensal por atalhos e intervalo personalizado inclusivo", () => {
  const series = Array.from({ length: 14 }, (_, index) => ({
    competencia: `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`,
  }))

  assert.deepEqual(
    filterMonthlySeriesPeriod(series, "3").map((point) => point.competencia),
    ["2025-12-01", "2026-01-01", "2026-02-01"],
  )
  assert.equal(filterMonthlySeriesPeriod(series, "6").length, 6)
  assert.equal(filterMonthlySeriesPeriod(series, "12").length, 12)
  assert.deepEqual(
    filterMonthlySeriesPeriod(series, "custom", {
      start: "2025-03-01",
      end: "2025-05-01",
    }).map((point) => point.competencia),
    ["2025-03-01", "2025-04-01", "2025-05-01"],
  )
})

function makeRow(overrides: Partial<IndicadoresHeatRow> & { imovelId: string }): IndicadoresHeatRow {
  return {
    unidade: overrides.imovelId,
    inquilinoNome: null,
    empreendimentoId: "emp-1",
    empreendimentoNome: "Grand Messejana I",
    hoje: "ocupado",
    celulas: MESES.map((mes) => ({
      competencia: mes.competencia,
      inquilinoNome: null,
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
      { competencia: "2026-04-01", inquilinoNome: null, statusOcupacao: "inadimplente", valor: 700, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", inquilinoNome: null, statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", inquilinoNome: null, statusOcupacao: "inadimplente", valor: 810.44, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
    ],
  })
  const quitouNoPassado = makeRow({
    imovelId: "apto-3",
    hoje: "ocupado",
    celulas: [
      { competencia: "2026-04-01", inquilinoNome: null, statusOcupacao: "inadimplente", valor: 300, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", inquilinoNome: null, statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", inquilinoNome: null, statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
    ],
  })
  const inadimplenteAgoraSoAgora = makeRow({
    imovelId: "apto-9",
    hoje: "inadimplente",
    celulas: [
      { competencia: "2026-04-01", inquilinoNome: null, statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-05-01", inquilinoNome: null, statusOcupacao: "ocupado", valor: 0, inadimplenciaPercentual: 0, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
      { competencia: "2026-06-01", inquilinoNome: null, statusOcupacao: "inadimplente", valor: 200, inadimplenciaPercentual: 100, vacanciaPercentual: 0, origem: "processamento", qualidade: "completo" },
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
      { competencia: "2026-04-01", inquilinoNome: null, statusOcupacao: null, valor: null, inadimplenciaPercentual: null, vacanciaPercentual: null, origem: null, qualidade: null },
      { competencia: "2026-05-01", inquilinoNome: null, statusOcupacao: null, valor: null, inadimplenciaPercentual: null, vacanciaPercentual: null, origem: null, qualidade: null },
      { competencia: "2026-06-01", inquilinoNome: null, statusOcupacao: "inadimplente", valor: null, inadimplenciaPercentual: null, vacanciaPercentual: 0, origem: "processamento", qualidade: "parcial" },
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

test("mapa de riscos: sem cálculo quando falta status e valor", () => {
  const detail = describeHeatCellDetail({ metric: "inad", percentage: null, valor: null })
  assert.equal(detail.kind, "sem_calculo")
  assert.equal(detail.percentualLabel, null)
  assert.equal(detail.valorLabel, null)
})

test("mapa de riscos: vacância nunca mostra percentual (é binária, o status já diz tudo)", () => {
  const ocupado = describeHeatCellDetail({ metric: "vac", percentage: 0, valor: 0 })
  assert.equal(ocupado.kind, "oculto")
  const vago = describeHeatCellDetail({ metric: "vac", percentage: 100, valor: 0 })
  assert.equal(vago.kind, "oculto")
})

test("mapa de riscos: inadimplência em dia (0% e nada em aberto) não mostra número", () => {
  const detail = describeHeatCellDetail({ metric: "inad", percentage: 0, valor: 0 })
  assert.equal(detail.kind, "oculto")
})

test("mapa de riscos: inadimplência parcial mostra percentual e valor não recebido", () => {
  const detail = describeHeatCellDetail({ metric: "inad", percentage: 45, valor: 500 })
  assert.equal(detail.kind, "detalhado")
  assert.equal(detail.percentualLabel, "45% de inadimplência")
  assert.equal(detail.valorLabel, "R$ 500,00 não recebido")
})

test("mapa de riscos: 0% com diferença residual ainda mostra o valor (não é 'em dia')", () => {
  const detail = describeHeatCellDetail({ metric: "inad", percentage: 0, valor: 50 })
  assert.equal(detail.kind, "detalhado")
  assert.equal(detail.percentualLabel, "0% de inadimplência")
  assert.equal(detail.valorLabel, "R$ 50,00 de diferença")
})

const JUNHO = [{ competencia: "2026-06-01", label: "Jun/26" }]

function junhoCell(
  statusOcupacao: IndicadoresHeatRow["celulas"][number]["statusOcupacao"],
  valor: number | null,
): IndicadoresHeatRow["celulas"][number] {
  return {
    competencia: "2026-06-01",
    inquilinoNome: null,
    statusOcupacao,
    valor,
    inadimplenciaPercentual: null,
    vacanciaPercentual: null,
    origem: null,
    qualidade: null,
  }
}

test("mapa por empreendimento: conta unidades em risco entre as que têm dado, não média de percentual", () => {
  const groups = buildHeatGroups({
    meses: JUNHO,
    linhas: [
      makeRow({ imovelId: "a", unidade: "Apto 1", celulas: [junhoCell("inadimplente", 900)] }),
      makeRow({ imovelId: "b", unidade: "Apto 2", celulas: [junhoCell("ocupado", 0)] }),
      // Sem status no mês: fora do denominador, senão mês sem informação viraria
      // "0% de risco".
      makeRow({ imovelId: "c", unidade: "Apto 3", celulas: [junhoCell(null, null)] }),
    ],
    metric: "inad",
  })

  assert.equal(groups.length, 1)
  const cell = groups[0].celulas[0]
  assert.equal(cell.unidadesEmRisco, 1)
  assert.equal(cell.unidadesComDado, 2)
  assert.equal(cell.percentual, 50)
  assert.equal(cell.valor, 900)
  assert.equal(groups[0].linhas.length, 3)
})

test("mapa por empreendimento: mês sem nenhum dado fica indisponível, nunca risco zero", () => {
  const groups = buildHeatGroups({
    meses: JUNHO,
    linhas: [makeRow({ imovelId: "a", celulas: [junhoCell(null, null)] })],
    metric: "inad",
  })

  const cell = groups[0].celulas[0]
  assert.equal(cell.unidadesComDado, 0)
  assert.equal(cell.percentual, null)
  assert.equal(cell.valor, null)
})

test("mapa por empreendimento: vacância usa o próprio status de risco e ordena por nome", () => {
  const groups = buildHeatGroups({
    meses: JUNHO,
    linhas: [
      makeRow({
        imovelId: "a",
        empreendimentoId: "emp-2",
        empreendimentoNome: "Zona Sul",
        hoje: "vago",
        celulas: [junhoCell("vago", null)],
      }),
      makeRow({
        imovelId: "b",
        empreendimentoId: "emp-1",
        empreendimentoNome: "Grand A",
        celulas: [junhoCell("inadimplente", 500)],
      }),
    ],
    metric: "vac",
  })

  assert.deepEqual(groups.map((group) => group.empreendimentoNome), ["Grand A", "Zona Sul"])
  // Inadimplente não é risco de vacância.
  assert.equal(groups[0].celulas[0].unidadesEmRisco, 0)
  assert.equal(groups[1].celulas[0].unidadesEmRisco, 1)
  assert.equal(groups[1].unidadesEmRiscoHoje, 1)
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
    // D24 — jargão do motor de conciliação que não pode voltar para a tela.
    '"Entradas de passagem"',
    '"Saídas de passagem"',
    '"Diferença não explicada"',
    '"Ajustes classificados"',
    '"Valores ainda sem classificação"',
    // D25 — rótulos do antigo bloco de repasse.
    '"Repasse e evidências"',
    '"Diferença no universo comprovado"',
  ]) {
    assert.equal(source.includes(retiredTerm), false, `termo aposentado encontrado: ${retiredTerm}`)
  }

  for (const requiredTerm of [
    "Conciliação financeira",
    "Riscos por imóvel",
    "Detalhamento por imóvel",
    // D25 — o par comparável e o veredito ficam explícitos; comprovante ausente
    // nunca deve voltar a ser lido como divergência.
    "Confirmado pelo banco",
    "Calculado com comprovante",
    "Confere com o banco",
  ]) {
    assert.equal(source.includes(requiredTerm), true, `termo obrigatório ausente: ${requiredTerm}`)
  }

  assert.equal(
    source.includes("motivosConfianca"),
    false,
    "motivos técnicos de confiança não devem aparecer no banner",
  )
  assert.equal(source.includes("sem dado"), true, "ausência de dado precisa ser rotulada, nunca lida como zero")
  assert.equal(source.includes("buildHeatGroups"), true, "o mapa abre por empreendimento, não uma linha por unidade")
  assert.equal(source.includes("cell.inquilinoNome"), true, "cada competência precisa exibir seu próprio inquilino")
  assert.equal(source.includes("Inquilino não informado"), true, "nome ausente não pode usar o cadastro atual como fallback")
})
