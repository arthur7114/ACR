import { competenciaMesToDatabase } from "./competencia-fechamento"
import { roundMoney, type OccupancyStatus } from "./indicadores-domain"
import type {
  IndicadoresAttentionItem,
  IndicadoresCoverage,
  IndicadoresData,
  IndicadoresFinancialBridge,
  IndicadoresFiltroOption,
  IndicadoresHeatCell,
  IndicadoresOccupancy,
  IndicadoresPropertyRevenue,
  IndicadoresRentRealization,
  IndicadoresSnapshotOrigin,
  IndicadoresSnapshotQuality,
  IndicadoresSummary,
} from "./indicadores-types"

const ELIGIBLE_STATUSES = new Set([
  "pendente_revisao",
  "processado_com_sucesso",
  "processado_com_alertas",
  "aprovado",
  "preparado_egestor",
  "lancado_egestor",
  "erro_egestor",
])
const APPROVED_STATUSES = new Set([
  "aprovado",
  "preparado_egestor",
  "lancado_egestor",
  "erro_egestor",
])
const DRAFT_STATUSES = new Set(["rascunho", "arquivos_enviados"])
const FINANCIAL_TOLERANCE = 0.01
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

export interface IndicadoresPairInput {
  empresaId: string
  empresaNome?: string
  imobiliariaId: string
  imobiliariaNome?: string
  empreendimentoId: string
  empreendimentoNome?: string
}

export interface IndicadoresRuleInput extends IndicadoresPairInput {
  ativo: boolean
}

export interface IndicadoresPropertyInput extends IndicadoresPairInput {
  id: string
  unidade: string
  inquilinoNome: string | null
  statusAtual: OccupancyStatus
  aluguelEsperadoAtual: number | null
  ativo: boolean
}

export interface IndicadoresAnalysisInput {
  totals: {
    total_receitas: number
    total_comissoes: number
    total_despesas: number
    total_a_repassar: number
    valor_comprovado: number | null
    total_agua: number | null
    total_iptu: number | null
    total_seguro_incendio: number | null
    repasse_embutido?: boolean
  }
  prestacao: {
    receitas_por_imovel: Array<{
      apto: string
      imovel_id?: string | null
      competencia_original?: string | null
      aluguel?: number | null
      aluguel_com_desconto?: number | null
      total?: number
    }>
    acordos_rescisoes_recebidos: Array<{
      tipo: "intermediacao" | "acordo" | "rescisao" | "atraso" | "outro"
      comissao: number | null
      apto?: string | null
      valor?: number | null
      competencia_original?: string | null
    }> | null
    inadimplencias_acumuladas: Array<{ valor: number }> | null
  } | null
}

export interface IndicadoresClosingInput extends IndicadoresPairInput {
  id: string
  competencia: string
  status: string
  arquivado: boolean
  processamentoStatus: string | null
  analiseCompleta: IndicadoresAnalysisInput | null
}

export interface IndicadoresSnapshotInput {
  imovelId: string
  fechamentoId: string
  competencia: string
  statusOcupacao: OccupancyStatus
  statusOrigem: string
  inquilinoNome?: string | null
  aluguelEsperado: number | null
  aluguelRecebido: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  vencimentoReferencia?: string | null
  origem: IndicadoresSnapshotOrigin
  qualidade: IndicadoresSnapshotQuality
}

export interface IndicadoresAggregationInput {
  calculoVersao: string
  competencia: string
  atualizadoEm: string
  filtros: {
    empresaId: string | null
    empreendimentoId: string | null
    imovelId: string | null
  }
  regrasAtivas: IndicadoresRuleInput[]
  imoveisAtivos: IndicadoresPropertyInput[]
  fechamentos: IndicadoresClosingInput[]
  snapshots: IndicadoresSnapshotInput[]
  linhasNaoVinculadas: Array<{
    fechamentoId: string
    quantidade: number
    detalhes?: string[]
  }>
}

interface AggregationScope {
  rules: IndicadoresRuleInput[]
  properties: IndicadoresPropertyInput[]
  closings: IndicadoresClosingInput[]
  snapshots: IndicadoresSnapshotInput[]
}

export function aggregateIndicadores(input: IndicadoresAggregationInput): IndicadoresData {
  const scope = applyScope(input)
  const currentClosings = scope.closings.filter(
    (closing) => closing.competencia === input.competencia,
  )
  const eligibleClosings = currentClosings.filter(isEligibleClosing)
  const eligibleIds = new Set(eligibleClosings.map((closing) => closing.id))
  const currentSnapshots = scope.snapshots.filter(
    (snapshot) =>
      snapshot.competencia === input.competencia && eligibleIds.has(snapshot.fechamentoId),
  )
  const coverage = buildCoverage(input, scope, currentClosings, eligibleClosings, currentSnapshots)
  const summary = buildSummary(input, scope.properties, eligibleClosings, currentSnapshots)
  const bridge = buildFinancialBridge(summary)
  const realization = buildRentRealization(currentSnapshots)
  const eligibleHistoricalIds = new Set(
    scope.closings
      .filter(
        (closing) => closing.competencia <= input.competencia && isEligibleClosing(closing),
      )
      .map((closing) => closing.id),
  )
  const relevantSnapshots = scope.snapshots.filter(
    (snapshot) =>
      snapshot.competencia <= input.competencia &&
      eligibleHistoricalIds.has(snapshot.fechamentoId),
  )

  return {
    meta: {
      calculoVersao: input.calculoVersao,
      competencia: input.competencia,
      competenciaLabel: formatCompetence(input.competencia, "long"),
      atualizadoEm: input.atualizadoEm,
      qualidade: isComplete(coverage) ? "completa" : "preliminar",
      naturezaBase: "fechamentos_e_snapshots",
      historicoRecomposto: relevantSnapshots.some((snapshot) => snapshot.origem === "backfill"),
    },
    cobertura: coverage,
    resumo: summary,
    ponteFinanceira: bridge,
    realizacaoAluguel: realization,
    serieMensal: buildMonthlySeries(input, scope),
    rankingAtencao: buildAttentionRanking(scope.properties, currentSnapshots),
    heat: buildHeat(scope.properties, relevantSnapshots),
    receitasPorImovel: buildPropertyRevenues(scope.properties, currentSnapshots),
    filtros: buildFilters(input),
  }
}

function applyScope(input: IndicadoresAggregationInput): AggregationScope {
  const directMatch = (item: IndicadoresPairInput) =>
    (!input.filtros.empresaId || item.empresaId === input.filtros.empresaId) &&
    (!input.filtros.empreendimentoId ||
      item.empreendimentoId === input.filtros.empreendimentoId)
  const properties = input.imoveisAtivos.filter(
    (property) =>
      property.ativo &&
      directMatch(property) &&
      (!input.filtros.imovelId || property.id === input.filtros.imovelId),
  )
  const selectedPairs = new Set(properties.map(pairKey))
  const pairMatch = (item: IndicadoresPairInput) =>
    directMatch(item) && (!input.filtros.imovelId || selectedPairs.has(pairKey(item)))
  const propertyIds = new Set(properties.map((property) => property.id))

  return {
    rules: input.regrasAtivas.filter((rule) => rule.ativo && pairMatch(rule)),
    properties,
    closings: input.fechamentos.filter(pairMatch),
    snapshots: input.snapshots.filter((snapshot) => propertyIds.has(snapshot.imovelId)),
  }
}

function buildCoverage(
  input: IndicadoresAggregationInput,
  scope: AggregationScope,
  currentClosings: IndicadoresClosingInput[],
  eligibleClosings: IndicadoresClosingInput[],
  currentSnapshots: IndicadoresSnapshotInput[],
): IndicadoresCoverage {
  const expectedPairs = new Set([
    ...scope.rules.map(pairKey),
    ...scope.properties.map(pairKey),
  ])
  const processedPairs = expectedPairSet(eligibleClosings, expectedPairs)
  const approvedPairs = expectedPairSet(
    eligibleClosings.filter((closing) => APPROVED_STATUSES.has(closing.status)),
    expectedPairs,
  )
  const updatingPairs = expectedPairSet(
    eligibleClosings.filter((closing) => closing.processamentoStatus === "processando"),
    expectedPairs,
  )
  const draftPairs = expectedPairSet(
    currentClosings.filter(
      (closing) => !closing.arquivado && DRAFT_STATUSES.has(closing.status),
    ),
    expectedPairs,
  )
  const absentPairKeys = [...expectedPairs].filter(
    (key) => !processedPairs.has(key) && !draftPairs.has(key),
  )
  const snapshotPropertyIds = new Set(currentSnapshots.map((snapshot) => snapshot.imovelId))
  const missingSnapshotProperties = scope.properties.filter(
    (property) => !snapshotPropertyIds.has(property.id),
  )
  const unknownSnapshotRows = currentSnapshots.filter(
    (snapshot) => snapshot.statusOcupacao === "desconhecido",
  )
  const missingExpectedRentRows = currentSnapshots.filter(
    (snapshot) => snapshot.aluguelEsperado === null,
  )
  const eligibleIds = new Set(eligibleClosings.map((closing) => closing.id))
  const eligibleUnlinkedLines = input.linhasNaoVinculadas.filter((item) =>
    eligibleIds.has(item.fechamentoId),
  )
  const unlinkedLines = eligibleUnlinkedLines
    .reduce((total, item) => total + item.quantidade, 0)
  const gaps: IndicadoresCoverage["lacunas"] = []
  const pairByKey = new Map(
    [...scope.rules, ...scope.properties, ...currentClosings].map((item) => [pairKey(item), item]),
  )
  const propertyById = new Map(scope.properties.map((property) => [property.id, property]))
  const absentPairDetails = absentPairKeys
    .flatMap((key) => {
      const item = pairByKey.get(key)
      return item ? [formatPairLabel(item)] : []
    })
  const missingSnapshotDetails = missingSnapshotProperties.map(formatPropertyLabel)
  const unknownSnapshotDetails = unknownSnapshotRows
    .map((snapshot) => propertyById.get(snapshot.imovelId))
    .filter((property): property is IndicadoresPropertyInput => property !== undefined)
    .map(formatPropertyLabel)
  const missingExpectedRentDetails = missingExpectedRentRows
    .map((snapshot) => propertyById.get(snapshot.imovelId))
    .filter((property): property is IndicadoresPropertyInput => property !== undefined)
    .map(formatPropertyLabel)
  const unlinkedLineDetails = eligibleUnlinkedLines.flatMap((item) => item.detalhes ?? [])

  addGap(
    gaps,
    "par_ausente",
    absentPairKeys.length,
    "Pares esperados sem fechamento processado.",
    absentPairDetails,
  )
  addGap(
    gaps,
    "snapshot_ausente",
    missingSnapshotProperties.length,
    "Imóveis esperados sem snapshot mensal.",
    missingSnapshotDetails,
  )
  addGap(
    gaps,
    "snapshot_desconhecido",
    unknownSnapshotRows.length,
    "Snapshots sem evidência suficiente de ocupação.",
    unknownSnapshotDetails,
  )
  addGap(
    gaps,
    "aluguel_esperado_ausente",
    missingExpectedRentRows.length,
    "Snapshots sem aluguel esperado conhecido.",
    missingExpectedRentDetails,
  )
  addGap(
    gaps,
    "linha_nao_vinculada",
    unlinkedLines,
    "Linhas da prestação sem vínculo com o cadastro.",
    unlinkedLineDetails,
  )
  if (input.filtros.imovelId) {
    addGap(
      gaps,
      "nao_atribuivel_ao_imovel",
      1,
      "Valores do fechamento sem atribuição segura ao imóvel foram omitidos.",
      scope.properties.map(formatPropertyLabel),
    )
  }

  const expectedPairCount = expectedPairs.size
  const expectedPropertyCount = scope.properties.length

  return {
    pares: {
      esperados: expectedPairCount,
      processados: processedPairs.size,
      aprovados: approvedPairs.size,
      pendentes: Math.max(0, processedPairs.size - approvedPairs.size),
      rascunhos: draftPairs.size,
      emAtualizacao: updatingPairs.size,
      ausentes: absentPairKeys.length,
      percentual: percentage(processedPairs.size, expectedPairCount),
    },
    imoveis: {
      esperados: expectedPropertyCount,
      snapshotsDisponiveis: currentSnapshots.length,
      snapshotsDesconhecidos: unknownSnapshotRows.length,
      semAluguelEsperado: missingExpectedRentRows.length,
      percentual: percentage(currentSnapshots.length, expectedPropertyCount),
    },
    linhasNaoVinculadas: unlinkedLines,
    lacunas: gaps,
  }
}

function buildSummary(
  input: IndicadoresAggregationInput,
  properties: IndicadoresPropertyInput[],
  eligibleClosings: IndicadoresClosingInput[],
  snapshots: IndicadoresSnapshotInput[],
): IndicadoresSummary {
  const byProperty = input.filtros.imovelId !== null
  const analyses = eligibleClosings
    .map((closing) => closing.analiseCompleta)
    .filter((analysis): analysis is IndicadoresAnalysisInput => analysis !== null)
  const receitaTotal = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.receitaTotal))
    : sumKnown(analyses.map((analysis) => analysis.totals.total_receitas))
  const administrationCommission = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.comissaoAdministracao))
    : sumKnown(analyses.map((analysis) => analysis.totals.total_comissoes))
  const assessedTransfer = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.repasseApurado))
    : sumKnown(analyses.map((analysis) => analysis.totals.total_a_repassar))
  const operational = byProperty ? null : sumOperationalExpenses(analyses)
  const transferEvidence = byProperty ? null : summarizeTransferEvidence(analyses)
  const confirmedTransfer = transferEvidence?.confirmed ?? null

  return {
    receitaTotal,
    aluguelContratado: sumKnown(snapshots.map((snapshot) => snapshot.aluguelEsperado)),
    aluguelRecebido: sumKnown(snapshots.map((snapshot) => snapshot.aluguelRecebido)),
    comissaoAdministracao: administrationCommission,
    comissaoIntermediacao: byProperty ? null : sumBrokerageCommission(analyses),
    despesasRetidas: byProperty
      ? null
      : sumKnown(analyses.map((analysis) => analysis.totals.total_despesas)),
    despesaOperacionalDetalhada: {
      agua: operational?.agua ?? null,
      iptu: operational?.iptu ?? null,
      seguro: operational?.seguro ?? null,
      total: operational?.total ?? null,
    },
    repasseApurado: assessedTransfer,
    repasseComprovado: confirmedTransfer,
    repasseInformadoExtrato: transferEvidence?.statement ?? null,
    diferencaRepasse:
      confirmedTransfer !== null && assessedTransfer !== null
        ? roundMoney(confirmedTransfer - assessedTransfer)
        : null,
    ocupacaoCompetencia: summarizeOccupancy(
      snapshots.map((snapshot) => snapshot.statusOcupacao),
    ),
    ocupacaoHoje: summarizeOccupancy(properties.map((property) => property.statusAtual)),
    inadimplenciaAcumulada: byProperty ? null : sumAccumulatedDelinquency(analyses),
  }
}

function buildFinancialBridge(summary: IndicadoresSummary): IndicadoresFinancialBridge {
  const values = [
    summary.receitaTotal,
    summary.comissaoAdministracao,
    summary.despesasRetidas,
    summary.comissaoIntermediacao,
    summary.repasseApurado,
  ]
  const canReconcile = values.every((value) => value !== null)
  const residual = canReconcile
    ? roundMoney(
        summary.receitaTotal! -
          summary.comissaoAdministracao! -
          summary.despesasRetidas! -
          summary.comissaoIntermediacao! -
          summary.repasseApurado!,
      )
    : null
  const reconciled = residual === null ? null : Math.abs(residual) <= FINANCIAL_TOLERANCE

  return {
    receitaTotal: summary.receitaTotal,
    comissaoAdministracao: summary.comissaoAdministracao,
    despesasRetidas: summary.despesasRetidas,
    comissaoIntermediacao: summary.comissaoIntermediacao,
    repasseApurado: summary.repasseApurado,
    residuo: residual,
    tolerancia: FINANCIAL_TOLERANCE,
    reconciliada: reconciled,
    alerta: reconciled === false,
  }
}

function buildRentRealization(snapshots: IndicadoresSnapshotInput[]): IndicadoresRentRealization {
  const contracted = sumKnown(snapshots.map((snapshot) => snapshot.aluguelEsperado))
  const received = sumKnown(snapshots.map((snapshot) => snapshot.aluguelRecebido))
  const vacancy = sumForStatus(snapshots, "vago", (snapshot) => snapshot.aluguelEsperado)
  const delinquency = sumForStatus(snapshots, "inadimplente", (snapshot) => {
    if (snapshot.aluguelEsperado === null || snapshot.aluguelRecebido === null) return null
    return Math.max(0, roundMoney(snapshot.aluguelEsperado - snapshot.aluguelRecebido))
  })
  const discounts = sumKnown(snapshots.map((snapshot) => snapshot.desconto))
  const canReconcile = [contracted, received, vacancy, delinquency, discounts].every(
    (value) => value !== null,
  )

  const otherAdjustments = canReconcile
    ? roundMoney(received! - (contracted! - vacancy! - delinquency! - discounts!))
    : null

  return {
    contratado: contracted,
    vacancia: vacancy,
    inadimplenciaMes: delinquency,
    descontos: discounts,
    outrosAjustes: otherAdjustments,
    outrosAjustesPercentualContratado:
      otherAdjustments !== null && contracted !== null && contracted !== 0
        ? (otherAdjustments / contracted) * 100
        : null,
    recebido: received,
  }
}

interface CompetenciaReallocation {
  receitaIn: number
  receitaOut: number
  aluguelIn: number
  aluguelOut: number
}

// Receita e aluguel recebido pertencem a competencia ORIGINAL do aluguel; o
// caixa (repasse e ponte financeira) permanece no mes do fechamento. A
// reatribuicao apenas move valores entre meses dentro da mesma metrica: linhas
// de receita movem receita e aluguel; acordos de atraso movem somente receita,
// pois nunca compuseram o aluguel recebido de nenhum mes.
function buildCompetenciaReallocations(
  closings: IndicadoresClosingInput[],
  imovelId: string | null,
) {
  const map = new Map<string, CompetenciaReallocation>()
  const entry = (month: string) => {
    let item = map.get(month)
    if (!item) {
      item = { receitaIn: 0, receitaOut: 0, aluguelIn: 0, aluguelOut: 0 }
      map.set(month, item)
    }
    return item
  }

  for (const closing of closings) {
    if (!isEligibleClosing(closing)) continue
    const current = closing.competencia
    for (const line of closing.analiseCompleta?.prestacao?.receitas_por_imovel ?? []) {
      if (imovelId && line.imovel_id !== imovelId) continue
      const original = competenciaMesToDatabase(line.competencia_original)
      if (!original || original === current) continue
      const aluguel = line.aluguel_com_desconto ?? line.aluguel ?? 0
      const receita = line.total ?? aluguel
      const from = entry(current)
      from.receitaOut = roundMoney(from.receitaOut + receita)
      from.aluguelOut = roundMoney(from.aluguelOut + aluguel)
      const to = entry(original)
      to.receitaIn = roundMoney(to.receitaIn + receita)
      to.aluguelIn = roundMoney(to.aluguelIn + aluguel)
    }
    // Acordos nao carregam imovel_id; no filtro por imovel ficam de fora.
    if (imovelId) continue
    for (const item of closing.analiseCompleta?.prestacao?.acordos_rescisoes_recebidos ?? []) {
      if (item.tipo !== "atraso") continue
      const original = competenciaMesToDatabase(item.competencia_original)
      if (!original || original === current) continue
      const valor = item.valor ?? 0
      if (valor === 0) continue
      const from = entry(current)
      from.receitaOut = roundMoney(from.receitaOut + valor)
      const to = entry(original)
      to.receitaIn = roundMoney(to.receitaIn + valor)
    }
  }
  return map
}

function applyReallocation(base: number | null, incoming = 0, outgoing = 0) {
  if (incoming === 0 && outgoing === 0) return base
  return roundMoney((base ?? 0) + incoming - outgoing)
}

function buildMonthlySeries(input: IndicadoresAggregationInput, scope: AggregationScope) {
  const reallocations = buildCompetenciaReallocations(scope.closings, input.filtros.imovelId)
  const months = uniqueSorted([
    ...scope.closings.map((closing) => closing.competencia),
    ...scope.snapshots.map((snapshot) => snapshot.competencia),
    ...reallocations.keys(),
  ]).filter((month) => month <= input.competencia)
  const expectedPairs = new Set([...scope.rules.map(pairKey), ...scope.properties.map(pairKey)])

  return months.map((competencia) => {
    const eligible = scope.closings.filter(
      (closing) => closing.competencia === competencia && isEligibleClosing(closing),
    )
    const eligibleIds = new Set(eligible.map((closing) => closing.id))
    const snapshots = scope.snapshots.filter(
      (snapshot) =>
        snapshot.competencia === competencia && eligibleIds.has(snapshot.fechamentoId),
    )
    const analyses = eligible.map((closing) => closing.analiseCompleta!)
    const occupancy = summarizeOccupancy(snapshots.map((snapshot) => snapshot.statusOcupacao))
    const processed = expectedPairSet(eligible, expectedPairs).size
    const approved = expectedPairSet(
      eligible.filter((closing) => APPROVED_STATUSES.has(closing.status)),
      expectedPairs,
    ).size
    const isUpdating = eligible.some(
      (closing) => closing.processamentoStatus === "processando",
    )
    const eligibleIdsWithUnlinkedLines = new Set(eligible.map((closing) => closing.id))
    const hasUnlinkedLines = input.linhasNaoVinculadas.some(
      (item) =>
        eligibleIdsWithUnlinkedLines.has(item.fechamentoId) && item.quantidade > 0,
    )
    const hasGap =
      processed !== expectedPairs.size ||
      approved !== expectedPairs.size ||
      isUpdating ||
      hasUnlinkedLines ||
      snapshots.length !== scope.properties.length ||
      snapshots.some(
        (snapshot) =>
          snapshot.statusOcupacao === "desconhecido" || snapshot.aluguelEsperado === null,
      )

    const reallocation = reallocations.get(competencia)
    const receitaBase = input.filtros.imovelId
      ? sumKnown(snapshots.map((snapshot) => snapshot.receitaTotal))
      : sumKnown(analyses.map((analysis) => analysis.totals.total_receitas))
    const aluguelBase = sumKnown(snapshots.map((snapshot) => snapshot.aluguelRecebido))

    return {
      competencia,
      label: formatCompetence(competencia, "short"),
      receitaTotal: applyReallocation(receitaBase, reallocation?.receitaIn, reallocation?.receitaOut),
      aluguelContratado: sumKnown(snapshots.map((snapshot) => snapshot.aluguelEsperado)),
      aluguelRecebido: applyReallocation(aluguelBase, reallocation?.aluguelIn, reallocation?.aluguelOut),
      repasseApurado: input.filtros.imovelId
        ? sumKnown(snapshots.map((snapshot) => snapshot.repasseApurado))
        : sumKnown(analyses.map((analysis) => analysis.totals.total_a_repassar)),
      ocupacaoPercentual: occupancy.percentual,
      coberturaPercentual: occupancy.coberturaPercentual,
      qualidade: hasGap || expectedPairs.size === 0 ? ("preliminar" as const) : ("completa" as const),
      competenciaAjusteReceita: roundMoney((reallocation?.receitaIn ?? 0) - (reallocation?.receitaOut ?? 0)),
      competenciaAjusteAluguel: roundMoney((reallocation?.aluguelIn ?? 0) - (reallocation?.aluguelOut ?? 0)),
    }
  })
}

function buildAttentionRanking(
  properties: IndicadoresPropertyInput[],
  snapshots: IndicadoresSnapshotInput[],
): IndicadoresAttentionItem[] {
  const propertyById = new Map(properties.map((property) => [property.id, property]))

  return snapshots
    .map((snapshot) => {
      const property = propertyById.get(snapshot.imovelId)
      if (!property) return null
      const gap =
        snapshot.aluguelEsperado === null || snapshot.aluguelRecebido === null
          ? null
          : Math.max(0, roundMoney(snapshot.aluguelEsperado - snapshot.aluguelRecebido))
      return {
        imovelId: property.id,
        unidade: property.unidade,
        inquilinoNome: snapshot.inquilinoNome ?? null,
        empreendimentoId: property.empreendimentoId,
        empreendimentoNome: property.empreendimentoNome ?? property.empreendimentoId,
        esperado: snapshot.aluguelEsperado,
        recebido: snapshot.aluguelRecebido,
        gapValor: gap,
        statusOcupacao: snapshot.statusOcupacao,
      }
    })
    .filter((item): item is IndicadoresAttentionItem => item !== null)
    .filter(
      (item) =>
        (item.gapValor !== null && item.gapValor > 0) ||
        item.statusOcupacao === "inadimplente" ||
        item.statusOcupacao === "vago",
    )
    .sort((left, right) => {
      if (left.gapValor === null) return right.gapValor === null ? 0 : 1
      if (right.gapValor === null) return -1
      return right.gapValor - left.gapValor || collator.compare(left.unidade, right.unidade)
    })
}

function buildHeat(
  properties: IndicadoresPropertyInput[],
  snapshots: IndicadoresSnapshotInput[],
): IndicadoresData["heat"] {
  const months = uniqueSorted(snapshots.map((snapshot) => snapshot.competencia))
  const snapshotByPropertyMonth = new Map(
    snapshots.map((snapshot) => [`${snapshot.imovelId}::${snapshot.competencia}`, snapshot]),
  )
  const sortedProperties = [...properties].sort(compareProperties)

  return {
    meses: months.map((competencia) => ({
      competencia,
      label: formatCompetence(competencia, "short"),
    })),
    linhas: sortedProperties.map((property) => ({
      imovelId: property.id,
      unidade: property.unidade,
      inquilinoNome: property.inquilinoNome,
      empreendimentoId: property.empreendimentoId,
      empreendimentoNome: property.empreendimentoNome ?? property.empreendimentoId,
      hoje: property.statusAtual,
      celulas: months.map((competencia) =>
        buildHeatCell(snapshotByPropertyMonth.get(`${property.id}::${competencia}`), competencia),
      ),
    })),
  }
}

function buildHeatCell(
  snapshot: IndicadoresSnapshotInput | undefined,
  competencia: string,
): IndicadoresHeatCell {
  if (!snapshot) {
    return {
      competencia,
      statusOcupacao: null,
      valor: null,
      inadimplenciaPercentual: null,
      vacanciaPercentual: null,
      origem: null,
      qualidade: null,
    }
  }

  const hasKnownStatus = snapshot.statusOcupacao !== "desconhecido"
  const gap =
    snapshot.aluguelEsperado === null || snapshot.aluguelRecebido === null
      ? null
      : Math.max(0, roundMoney(snapshot.aluguelEsperado - snapshot.aluguelRecebido))
  const delinquencyPercentage =
    !hasKnownStatus || snapshot.aluguelEsperado === null
      ? null
      : snapshot.statusOcupacao === "inadimplente"
        ? snapshot.aluguelEsperado === 0
          ? gap && gap > 0
            ? 100
            : 0
          : ((gap ?? 0) / snapshot.aluguelEsperado) * 100
        : 0

  return {
    competencia,
    statusOcupacao: snapshot.statusOcupacao,
    valor: gap,
    inadimplenciaPercentual: delinquencyPercentage,
    vacanciaPercentual: hasKnownStatus ? (snapshot.statusOcupacao === "vago" ? 100 : 0) : null,
    origem: snapshot.origem,
    qualidade: snapshot.qualidade,
  }
}

function buildPropertyRevenues(
  properties: IndicadoresPropertyInput[],
  snapshots: IndicadoresSnapshotInput[],
): IndicadoresPropertyRevenue[] {
  const propertyById = new Map(properties.map((property) => [property.id, property]))

  return snapshots
    .map((snapshot) => {
      const property = propertyById.get(snapshot.imovelId)
      if (!property) return null
      return {
        imovelId: property.id,
        competencia: snapshot.competencia,
        unidade: property.unidade,
        inquilinoNome: snapshot.inquilinoNome ?? null,
        empreendimentoId: property.empreendimentoId,
        empreendimentoNome: property.empreendimentoNome ?? property.empreendimentoId,
        statusOcupacao: snapshot.statusOcupacao,
        aluguelEsperado: snapshot.aluguelEsperado,
        aluguelRecebido: snapshot.aluguelRecebido,
        receitaTotal: snapshot.receitaTotal,
        desconto: snapshot.desconto,
        comissaoAdministracao: snapshot.comissaoAdministracao,
        repasseApurado: snapshot.repasseApurado,
        vencimentoReferencia: snapshot.vencimentoReferencia ?? null,
        origem: snapshot.origem,
        qualidade: snapshot.qualidade,
      }
    })
    .filter((item): item is IndicadoresPropertyRevenue => item !== null)
    .sort((left, right) =>
      collator.compare(left.empreendimentoNome, right.empreendimentoNome) ||
      collator.compare(left.unidade, right.unidade),
    )
}

function buildFilters(input: IndicadoresAggregationInput): IndicadoresData["filtros"] {
  const activeProperties = input.imoveisAtivos.filter((property) => property.ativo)
  const activeRules = input.regrasAtivas.filter((rule) => rule.ativo)
  const pairs = [...activeRules, ...activeProperties]
  const selectedProperties = activeProperties.filter(
    (property) =>
      (!input.filtros.empresaId || property.empresaId === input.filtros.empresaId) &&
      (!input.filtros.empreendimentoId ||
        property.empreendimentoId === input.filtros.empreendimentoId),
  )

  return {
    selecionados: input.filtros,
    competencias: uniqueSorted([
      ...input.fechamentos.filter((closing) => !closing.arquivado).map((closing) => closing.competencia),
      ...input.snapshots.map((snapshot) => snapshot.competencia),
    ])
      .reverse()
      .map((competencia) => ({ value: competencia, label: formatCompetence(competencia, "long") })),
    empresas: uniqueOptions(
      pairs.map((item) => ({
        value: item.empresaId,
        label: item.empresaNome ?? item.empresaId,
      })),
    ),
    empreendimentos: uniqueOptions(
      pairs
        .filter((item) => !input.filtros.empresaId || item.empresaId === input.filtros.empresaId)
        .map((item) => ({
          value: item.empreendimentoId,
          label: item.empreendimentoNome ?? item.empreendimentoId,
        })),
    ),
    imoveis: selectedProperties
      .map((property) => ({
        value: property.id,
        label: `${property.empreendimentoNome ?? property.empreendimentoId} · ${property.unidade}`,
      }))
      .sort((left, right) => collator.compare(left.label, right.label)),
  }
}

function summarizeOccupancy(statuses: OccupancyStatus[]): IndicadoresOccupancy {
  const ocupados = count(statuses, "ocupado")
  const inadimplentes = count(statuses, "inadimplente")
  const emRescisao = count(statuses, "em_rescisao")
  const vagos = count(statuses, "vago")
  const desconhecidos = count(statuses, "desconhecido")
  const numerador = ocupados + inadimplentes + emRescisao
  const denominador = numerador + vagos

  return {
    ocupados,
    inadimplentes,
    emRescisao,
    vagos,
    desconhecidos,
    numerador,
    denominador,
    percentual: percentage(numerador, denominador),
    coberturaPercentual: percentage(denominador, statuses.length),
  }
}

function summarizeTransferEvidence(analyses: IndicadoresAnalysisInput[]) {
  if (analyses.length === 0) return null
  const external = analyses.filter((analysis) => !analysis.totals.repasse_embutido)
  const embedded = analyses.filter((analysis) => analysis.totals.repasse_embutido)
  const confirmed = sumKnown(external.map((analysis) => analysis.totals.valor_comprovado))
  const statement = sumKnown(embedded.map((analysis) => analysis.totals.valor_comprovado))

  return {
    confirmed,
    statement,
  }
}

function sumOperationalExpenses(analyses: IndicadoresAnalysisInput[]) {
  if (analyses.length === 0) return null
  const agua = sumKnown(analyses.map((analysis) => analysis.totals.total_agua))
  const iptu = sumKnown(analyses.map((analysis) => analysis.totals.total_iptu))
  const seguro = sumKnown(analyses.map((analysis) => analysis.totals.total_seguro_incendio))
  const known = [agua, iptu, seguro].filter((value): value is number => value !== null)
  return {
    agua,
    iptu,
    seguro,
    total: known.length === 0 ? null : roundMoney(known.reduce((total, value) => total + value, 0)),
  }
}

function sumBrokerageCommission(analyses: IndicadoresAnalysisInput[]) {
  if (analyses.length === 0) return null
  const sections = analyses.map(
    (analysis) => analysis.prestacao?.acordos_rescisoes_recebidos ?? null,
  )
  if (sections.some((section) => section === null)) return null
  const values = sections.flatMap((section) =>
    section!.filter((item) => item.tipo === "intermediacao").map((item) => item.comissao),
  )
  if (values.some((value) => value === null)) return null
  return values.length === 0 ? 0 : sumKnown(values)
}

function sumAccumulatedDelinquency(analyses: IndicadoresAnalysisInput[]) {
  if (analyses.length === 0) return null
  const sections = analyses.map(
    (analysis) => analysis.prestacao?.inadimplencias_acumuladas ?? null,
  )
  if (sections.some((section) => section === null)) return null
  const values = sections.flatMap((section) => section!.map((item) => item.valor))
  return values.length === 0 ? 0 : sumKnown(values)
}

function sumForStatus(
  snapshots: IndicadoresSnapshotInput[],
  status: OccupancyStatus,
  select: (snapshot: IndicadoresSnapshotInput) => number | null,
) {
  if (snapshots.length === 0) return null
  const classified = snapshots.filter((snapshot) => snapshot.statusOcupacao === status)
  if (classified.length === 0) return 0
  return sumKnown(classified.map(select))
}

function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  if (known.length === 0) return null
  return roundMoney(known.reduce((total, value) => total + value, 0))
}

function expectedPairSet(items: IndicadoresPairInput[], expected: Set<string>) {
  return new Set(items.map(pairKey).filter((key) => expected.has(key)))
}

function isEligibleClosing(closing: IndicadoresClosingInput) {
  return !closing.arquivado && Boolean(closing.analiseCompleta) && ELIGIBLE_STATUSES.has(closing.status)
}

function pairKey(item: IndicadoresPairInput) {
  return `${item.imobiliariaId}::${item.empreendimentoId}`
}

function formatPairLabel(item: IndicadoresPairInput) {
  return `${item.imobiliariaNome ?? item.imobiliariaId} · ${item.empreendimentoNome ?? item.empreendimentoId}`
}

function formatPropertyLabel(property: IndicadoresPropertyInput) {
  return `${property.imobiliariaNome ?? property.imobiliariaId} · ${property.empreendimentoNome ?? property.empreendimentoId} · Unidade ${property.unidade}`
}

function isComplete(coverage: IndicadoresCoverage) {
  return (
    coverage.pares.esperados > 0 &&
    coverage.pares.processados === coverage.pares.esperados &&
    coverage.pares.pendentes === 0 &&
    coverage.pares.emAtualizacao === 0 &&
    coverage.lacunas.length === 0
  )
}

function addGap(
  gaps: IndicadoresCoverage["lacunas"],
  codigo: IndicadoresCoverage["lacunas"][number]["codigo"],
  quantidade: number,
  mensagem: string,
  detalhes: string[] = [],
) {
  if (quantidade > 0) {
    gaps.push({
      codigo,
      quantidade,
      mensagem,
      detalhes: uniqueSorted(detalhes),
    })
  }
}

function count(statuses: OccupancyStatus[], status: OccupancyStatus) {
  return statuses.filter((item) => item === status).length
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? null : (numerator / denominator) * 100
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort()
}

function uniqueOptions(options: IndicadoresFiltroOption[]) {
  return [...new Map(options.map((option) => [option.value, option])).values()].sort((left, right) =>
    collator.compare(left.label, right.label),
  )
}

function compareProperties(left: IndicadoresPropertyInput, right: IndicadoresPropertyInput) {
  return (
    collator.compare(
      left.empreendimentoNome ?? left.empreendimentoId,
      right.empreendimentoNome ?? right.empreendimentoId,
    ) || collator.compare(left.unidade, right.unidade)
  )
}

function formatCompetence(value: string, style: "short" | "long") {
  const [year, month] = value.split("-").map(Number)
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: style === "long" ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  })
  return formatter.format(new Date(Date.UTC(year, month - 1, 1)))
}
