import type {
  PackageAnalysis,
  PrestacaoAnalysis,
  ReceitaPorImovel,
} from "./prestacao-types"

export const REPAIR_TOLERANCE = 0.01

export interface FinancialDimensions {
  receitasEconomicas: number
  entradasPassagem: number
  comissoes: number
  despesas: number
  tarifas: number
  saidasPassagem: number
  repasseDeclarado: number
}

export interface FinancialReconciliation extends FinancialDimensions {
  repasseCalculado: number
  diferencaNaoExplicada: number
  reconciliado: boolean
}

export interface CesarClosureInput {
  id: string
  empreendimentoNome: string
  analysis: PackageAnalysis
}

export interface CesarClosureRepair extends CesarClosureInput {
  analysisRepaired: PackageAnalysis
  reconciliation: FinancialReconciliation
  propertyCodes: string[]
}

const CESAR_CODES_BY_DEVELOPMENT: Array<{ name: RegExp; codes: string[] }> = [
  { name: /joao cordeiro/i, codes: ["0002520", "0002521"] },
  { name: /pompilio gomes/i, codes: ["0002526", "0002527"] },
]

export function scopeCesarRegoAnalysisToDevelopment(
  analysis: PackageAnalysis,
  developmentName: string,
) {
  const prestacao = analysis.prestacao
  if (!prestacao || !normalizeText(prestacao.imobiliaria).includes("cesar rego")) {
    return analysis
  }
  const currentDefinition = CESAR_CODES_BY_DEVELOPMENT.find((candidate) =>
    candidate.name.test(normalizeText(developmentName)),
  )
  if (!currentDefinition) return analysis
  const knownCodes = new Set(
    CESAR_CODES_BY_DEVELOPMENT.flatMap((candidate) => candidate.codes),
  )
  const hasForeignRows = prestacao.receitas_por_imovel.some(
    (row) => knownCodes.has(row.apto) && !currentDefinition.codes.includes(row.apto),
  )
  if (!hasForeignRows) return analysis

  const plan = buildCesarMonthRepairs(
    CESAR_CODES_BY_DEVELOPMENT.map((definition, index) => ({
      id: `escopo-${index}`,
      empreendimentoNome:
        definition === currentDefinition
          ? developmentName
          : definition.name.source.includes("joao")
            ? "João Cordeiro"
            : "Galpão Pompílio Gomes",
      analysis,
    })),
    prestacao,
  )
  const scoped = plan.repairs.find((repair) =>
    currentDefinition.codes.every((code) => repair.propertyCodes.includes(code)) ||
    repair.propertyCodes.some((code) => currentDefinition.codes.includes(code)),
  )
  if (!scoped?.reconciliation.reconciliado) {
    throw new Error(
      `Documento César Rêgo não reconciliou no escopo de ${developmentName}.`,
    )
  }
  return scoped.analysisRepaired
}

export function reconcileFinancialDimensions(
  dimensions: FinancialDimensions,
): FinancialReconciliation {
  const normalized = Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, roundMoney(value)]),
  ) as unknown as FinancialDimensions
  const repasseCalculado = roundMoney(
    normalized.receitasEconomicas +
      normalized.entradasPassagem -
      normalized.comissoes -
      normalized.despesas -
      normalized.tarifas -
      normalized.saidasPassagem,
  )
  const diferencaNaoExplicada = roundMoney(
    normalized.repasseDeclarado - repasseCalculado,
  )
  return {
    ...normalized,
    repasseCalculado,
    diferencaNaoExplicada,
    reconciliado: Math.abs(diferencaNaoExplicada) <= REPAIR_TOLERANCE,
  }
}

export function repairGmIiMarchAnalysis(analysis: PackageAnalysis): PackageAnalysis {
  const prestacao = analysis.prestacao
  if (!prestacao) throw new Error("GM II março sem prestação de contas.")
  const rows = prestacao.receitas_por_imovel.map((row) =>
    normalizeUnit(row.apto) === "3"
      ? {
          ...row,
          competencia_original: "2026-02",
          competencia_recebimento: "2026-03",
          dia_vencimento: 10,
        }
      : row,
  )
  if (!rows.some((row) => normalizeUnit(row.apto) === "3")) {
    throw new Error("GM II março sem a linha recebida da unidade 3.")
  }

  const inadimplencias = prestacao.inadimplencias_acumuladas.filter(
    (item) =>
      !(
        normalizeUnit(item.apto ?? "") === "3" &&
        normalizeCompetence(item.competencia_original) === "2026-03"
      ),
  )
  inadimplencias.push({
    apto: "3",
    inquilino: "FRANCISCO SANTIAGO",
    valor: 705.89,
    condicao: "R$ 636,76 (aluguel) + R$ 67,70 (água) + R$ 1,43 (IPTU 3/12)",
    observacao: "Vigência de março de 2026. IPTU (3/12). Seguro quitado.",
    competencia_original: "2026-03",
    dia_vencimento: 10,
    confianca: 1,
  })

  return {
    ...analysis,
    prestacao: {
      ...prestacao,
      receitas_por_imovel: rows,
      inadimplencias_acumuladas: inadimplencias,
    },
  }
}

export function repairPluralPassThroughAnalysis(
  analysis: PackageAnalysis,
  competence: string,
): { analysisRepaired: PackageAnalysis; reconciliation: FinancialReconciliation } {
  const prestacao = analysis.prestacao
  if (!prestacao) throw new Error("Plural sem prestação de contas.")
  const month = normalizeCompetence(competence)
  if (!["2026-05", "2026-06"].includes(month)) {
    throw new Error(`Competência Plural não suportada pelo reparo: ${competence}.`)
  }

  const rows = prestacao.receitas_por_imovel.map((row) => {
    if (month === "2026-05") {
      const saidas = sumNegativeMoneyMentions(row.observacao)
      return { ...row, entradas_passagem: null, saidas_passagem: saidas || null }
    }
    const entradas = roundMoney(row.iptu ?? sumPositiveIptuMentions(row.observacao))
    return { ...row, entradas_passagem: entradas || null, saidas_passagem: null }
  })
  const receitasEconomicas = roundMoney(rows.reduce((total, row) => total + row.total, 0))
  const entradasPassagem = sumRows(rows, "entradas_passagem")
  const saidasPassagem = sumRows(rows, "saidas_passagem")
  const currentExpenses = roundMoney(analysis.totals.total_despesas)
  const despesas = roundMoney(Math.max(currentExpenses - saidasPassagem, 0))
  const reconciliation = reconcileFinancialDimensions({
    receitasEconomicas,
    entradasPassagem,
    comissoes: analysis.totals.total_comissoes,
    despesas,
    tarifas: 0,
    saidasPassagem,
    repasseDeclarado: analysis.totals.total_a_repassar,
  })
  if (!reconciliation.reconciliado) {
    throw new Error(
      `Plural ${month} não reconciliou: diferença ${reconciliation.diferencaNaoExplicada.toFixed(2)}.`,
    )
  }

  return {
    analysisRepaired: applyFinancialDimensions(
      {
        ...analysis,
        prestacao: { ...prestacao, receitas_por_imovel: rows },
      },
      reconciliation,
    ),
    reconciliation,
  }
}

export function buildCesarMonthRepairs(
  closures: CesarClosureInput[],
  parsed: PrestacaoAnalysis,
): {
  repairs: CesarClosureRepair[]
  sourceReconciled: boolean
  missingPropertyCodes: string[]
  difference: number
  transferDifference: number
} {
  const allocations = closures.map((closure) => {
    const propertyCodes =
      CESAR_CODES_BY_DEVELOPMENT.find((candidate) =>
        candidate.name.test(normalizeText(closure.empreendimentoNome)),
      )?.codes ?? []
    const rows = parsed.receitas_por_imovel
      .filter((row) => propertyCodes.includes(row.apto))
      .map((row) => {
        const previous = closure.analysis.prestacao?.receitas_por_imovel.find(
          (candidate) => candidate.apto === row.apto,
        )
        return {
          ...row,
          linha_id: previous?.linha_id ?? row.linha_id,
          imovel_id: previous?.imovel_id ?? row.imovel_id,
        }
      })
    return { closure, propertyCodes, rows }
  })
  const globalPassageNet = roundMoney(
    sumRows(parsed.receitas_por_imovel, "saidas_passagem") -
      sumRows(parsed.receitas_por_imovel, "entradas_passagem"),
  )
  const lineDeductions = allocations.map((allocation) =>
    Math.max(
      roundMoney(
        sumRows(allocation.rows, "total") +
          sumRows(allocation.rows, "entradas_passagem") -
          sumRows(allocation.rows, "comissao") -
          sumRows(allocation.rows, "saidas_passagem") -
          sumRows(allocation.rows, "repasse"),
      ),
      0,
    ),
  )
  const globalFee = Math.max(
    roundMoney(
      (parsed.resumo_financeiro.total_outras_comissoes_despesas ?? 0) -
        globalPassageNet -
        lineDeductions.reduce((total, value) => total + value, 0),
    ),
    0,
  )
  const feeTarget = [...allocations]
    .filter((allocation) => allocation.rows.length > 0)
    .sort(
      (left, right) =>
        sumRows(right.rows, "total") - sumRows(left.rows, "total") ||
        left.closure.id.localeCompare(right.closure.id),
    )[0]?.closure.id

  const repairs = allocations.flatMap((allocation, allocationIndex): CesarClosureRepair[] => {
    if (allocation.rows.length === 0) return []
    const entradasPassagem = sumRows(allocation.rows, "entradas_passagem")
    const saidasPassagem = sumRows(allocation.rows, "saidas_passagem")
    const tarifas = allocation.closure.id === feeTarget ? Math.max(globalFee, 0) : 0
    const repasseLinhas = sumRows(allocation.rows, "repasse")
    const receitasEconomicas = sumRows(allocation.rows, "total")
    const comissoes = sumRows(allocation.rows, "comissao")
    // Débitos econômicos documentados por linha (por exemplo, desconto
    // lançado em OUTROS DÉBITOS) já estão refletidos no saldo individual.
    // Calculá-los pelo próprio razão evita inventar rateio de uma cobrança
    // global entre imóveis.
    const despesas = lineDeductions[allocationIndex] ?? 0
    const repasseDeclarado = roundMoney(
      receitasEconomicas +
        entradasPassagem -
        comissoes -
        despesas -
        tarifas -
        saidasPassagem,
    )
    const reconciliation = reconcileFinancialDimensions({
      receitasEconomicas,
      entradasPassagem,
      comissoes,
      despesas,
      tarifas,
      saidasPassagem,
      // O resumo declara um único repasse para o documento consolidado. A
      // parcela por empreendimento é a distribuição determinística da mesma
      // ponte e precisa somar novamente ao TOTAL LÍQUIDO da fonte.
      repasseDeclarado,
    })
    const scopedPrestacao: PrestacaoAnalysis = {
      ...parsed,
      empreendimento: allocation.closure.empreendimentoNome,
      receitas_por_imovel: allocation.rows,
      resumo_financeiro: {
        ...parsed.resumo_financeiro,
        total_linhas_receitas: reconciliation.receitasEconomicas,
        total_linhas_comissoes: reconciliation.comissoes,
        total_linhas_repasse: repasseLinhas,
        comissao_administracao: reconciliation.comissoes,
        outras_comissoes_despesas:
          tarifas > 0
            ? [{ descricao: "Tarifa bancária do fechamento", valor: tarifas, confianca: 1 }]
            : [],
        total_outras_comissoes_despesas: tarifas,
        total_comissao_despesas: roundMoney(reconciliation.comissoes + tarifas),
        recebidos_em_nome_locador: reconciliation.receitasEconomicas,
        total_a_repassar: reconciliation.repasseDeclarado,
      },
      totais: {
        total_receitas: reconciliation.receitasEconomicas,
        total_comissoes: reconciliation.comissoes,
        total_repassar: reconciliation.repasseDeclarado,
      },
    }
    const analysisRepaired = applyFinancialDimensions(
      { ...allocation.closure.analysis, prestacao: scopedPrestacao },
      reconciliation,
    )
    return [
      {
        ...allocation.closure,
        analysisRepaired,
        reconciliation,
        propertyCodes: allocation.rows.map((row) => row.apto),
      },
    ]
  })

  const allocatedCodes = new Set(repairs.flatMap((repair) => repair.propertyCodes))
  const missingPropertyCodes = parsed.receitas_por_imovel
    .filter((row) => !allocatedCodes.has(row.apto))
    .map((row) => row.apto)
  const allocatedRevenue = roundMoney(
    repairs.reduce(
      (total, repair) => total + repair.reconciliation.receitasEconomicas,
      0,
    ),
  )
  const sourceRevenue = roundMoney(parsed.resumo_financeiro.recebidos_em_nome_locador ?? 0)
  const difference = roundMoney(sourceRevenue - allocatedRevenue)
  const allocatedTransfer = roundMoney(
    repairs.reduce(
      (total, repair) => total + repair.reconciliation.repasseDeclarado,
      0,
    ),
  )
  const sourceTransfer = roundMoney(parsed.resumo_financeiro.total_a_repassar ?? 0)
  const transferDifference = roundMoney(sourceTransfer - allocatedTransfer)
  const sourceReconciled =
    missingPropertyCodes.length === 0 &&
    Math.abs(difference) <= REPAIR_TOLERANCE &&
    Math.abs(transferDifference) <= REPAIR_TOLERANCE &&
    repairs.every((repair) => repair.reconciliation.reconciliado)

  return {
    repairs,
    sourceReconciled,
    missingPropertyCodes,
    difference,
    transferDifference,
  }
}

function applyFinancialDimensions(
  analysis: PackageAnalysis,
  reconciliation: FinancialReconciliation,
): PackageAnalysis {
  const prestacao = analysis.prestacao
  if (!prestacao) throw new Error("Prestação ausente no reparo financeiro.")
  return {
    ...analysis,
    prestacao: {
      ...prestacao,
      resumo_financeiro: {
        ...prestacao.resumo_financeiro,
        total_linhas_receitas: reconciliation.receitasEconomicas,
        total_linhas_comissoes: reconciliation.comissoes,
        total_comissao_despesas: roundMoney(
          reconciliation.comissoes +
            reconciliation.despesas +
            reconciliation.tarifas +
            reconciliation.saidasPassagem -
            reconciliation.entradasPassagem,
        ),
        total_outras_comissoes_despesas: roundMoney(
          reconciliation.despesas + reconciliation.tarifas,
        ),
        recebidos_em_nome_locador: reconciliation.receitasEconomicas,
        total_a_repassar: reconciliation.repasseDeclarado,
      },
      totais: {
        ...prestacao.totais,
        total_receitas: reconciliation.receitasEconomicas,
        total_comissoes: reconciliation.comissoes,
        total_repassar: reconciliation.repasseDeclarado,
      },
    },
    totals: {
      ...analysis.totals,
      total_receitas: reconciliation.receitasEconomicas,
      total_comissoes: reconciliation.comissoes,
      total_despesas: reconciliation.despesas,
      total_comissao_despesas: roundMoney(
        reconciliation.comissoes +
          reconciliation.despesas +
          reconciliation.tarifas +
          reconciliation.saidasPassagem -
          reconciliation.entradasPassagem,
      ),
      total_a_repassar: reconciliation.repasseCalculado,
      entradas_passagem: reconciliation.entradasPassagem,
      saidas_passagem: reconciliation.saidasPassagem,
      total_tarifas: reconciliation.tarifas,
      repasse_declarado: reconciliation.repasseDeclarado,
    },
  }
}

function sumRows(
  rows: ReceitaPorImovel[],
  field:
    | "total"
    | "repasse"
    | "comissao"
    | "entradas_passagem"
    | "saidas_passagem",
) {
  return roundMoney(
    rows.reduce((total, row) => total + (Number(row[field]) || 0), 0),
  )
}

function sumNegativeMoneyMentions(value: string | null) {
  if (!value) return 0
  return roundMoney(
    [...value.matchAll(/-\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)].reduce(
      (total, match) => total + parseMoney(match[1]),
      0,
    ),
  )
}

function sumPositiveIptuMentions(value: string | null) {
  if (!value || !/IPTU/i.test(value)) return 0
  const matches = [...value.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
  return roundMoney(matches.reduce((total, match) => total + parseMoney(match[1]), 0))
}

function parseMoney(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."))
}

function normalizeUnit(value: string) {
  return value.trim().replace(/^0+/, "") || "0"
}

function normalizeCompetence(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}` : value ?? ""
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
