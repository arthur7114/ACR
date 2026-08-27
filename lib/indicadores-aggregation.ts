import { competenciaMesToDatabase } from "./competencia-fechamento"
import { roundMoney, type OccupancyStatus } from "./indicadores-domain"
import { resolverRecebimentosLegados } from "./recebimentos-extraordinarios"
import type {
  IndicadoresAttentionItem,
  IndicadoresCoverage,
  IndicadoresData,
  IndicadoresFinancialBridge,
  IndicadoresFiltroOption,
  IndicadoresHeatCell,
  IndicadoresOccupancy,
  IndicadoresPropertyRevenue,
  IndicadoresRevenueModel,
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

export interface IndicadoresVigencyInput extends IndicadoresPairInput {
  id: string
  imovelId: string
  vigenciaInicio: string
  vigenciaFim: string | null
  modeloReceita: IndicadoresRevenueModel
  aluguelContratado: number | null
  fonte: string
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
    entradas_passagem?: number | null
    saidas_passagem?: number | null
    repasse_declarado?: number | null
    total_entradas_passagem?: number | null
    total_saidas_passagem?: number | null
    total_tarifas?: number | null
  }
  prestacao: {
    receitas_por_imovel: Array<{
      apto: string
      imovel_id?: string | null
      aluguel?: number | null
      aluguel_com_desconto?: number | null
      total?: number | null
      outros_recebimentos?: number | null
      competencia_original?: string | null
      competencia_recebimento?: string | null
      dia_vencimento?: number | null
      entradas_passagem?: number | null
      saidas_passagem?: number | null
    }>
    acordos_rescisoes_recebidos: Array<{
      tipo: "intermediacao" | "acordo" | "rescisao" | "atraso" | "outro"
      comissao: number | null
      apto?: string | null
      inquilino?: string | null
      valor?: number | null
      aluguel?: number | null
      garagem?: number | null
      ajuste?: number | null
      iptu?: number | null
      total_recebido?: number | null
      repasse?: number | null
      percentual?: number | null
      observacao?: string | null
      confianca?: number
      competencia_original?: string | null
      competencia_recebimento?: string | null
    }> | null
    inadimplencias_acumuladas: Array<{ valor: number }> | null
    outras_comissoes_despesas?: Array<{ descricao: string; valor: number }> | null
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
  cobrancaEsperada?: number | null
  eventos?: string[] | null
  aluguelRecebido: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  vencimentoReferencia?: string | null
  aluguelRecebidoCompetencia?: number | null
  atrasosRecuperados?: number | null
  outrosRecebimentos?: number | null
  entradasPassagem?: number | null
  saidasPassagem?: number | null
  competenciaOriginal?: string | null
  competenciaRecebimento?: string | null
  diaVencimento?: number | null
  modeloReceita?: IndicadoresRevenueModel
  statusMensalExplicito?: OccupancyStatus | null
  origem: IndicadoresSnapshotOrigin
  qualidade: IndicadoresSnapshotQuality
}

export interface IndicadoresAggregationInput {
  calculoVersao: string
  competencia: string
  atualizadoEm: string
  vigenciasDisponiveis?: boolean
  filtros: {
    empresaId: string | null
    empreendimentoId: string | null
    imovelId: string | null
  }
  regrasAtivas: IndicadoresRuleInput[]
  imoveisAtivos: IndicadoresPropertyInput[]
  vigencias?: IndicadoresVigencyInput[]
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
  vigencies: IndicadoresVigencyInput[]
  closings: IndicadoresClosingInput[]
  snapshots: IndicadoresSnapshotInput[]
}

export function aggregateIndicadores(input: IndicadoresAggregationInput): IndicadoresData {
  const scope = applyContractTruth(input, applyScope(input))
  const expectedProperties = propertiesAtCompetence(
    scope.properties,
    scope.vigencies,
    input.competencia,
  )
  const currentClosings = scope.closings.filter(
    (closing) => closing.competencia === input.competencia,
  )
  const eligibleClosings = currentClosings.filter(isEligibleClosing)
  const eligibleIds = new Set(eligibleClosings.map((closing) => closing.id))
  const expectedPropertyIds = new Set(expectedProperties.map((property) => property.id))
  const currentSnapshots = scope.snapshots.filter(
    (snapshot) =>
      snapshot.competencia === input.competencia &&
      eligibleIds.has(snapshot.fechamentoId) &&
      expectedPropertyIds.has(snapshot.imovelId),
  )
  const coverage = buildCoverage(
    input,
    scope,
    expectedProperties,
    currentClosings,
    eligibleClosings,
    currentSnapshots,
  )
  const contractedRent = contractedRentAtCompetence(
    input,
    scope,
    expectedProperties,
    currentSnapshots,
    input.competencia,
  )
  const appPropertyIds = new Set(
    vigenciesAtCompetence(scope.vigencies, input.competencia)
      .filter((vigency) => vigency.modeloReceita === "variavel")
      .map((vigency) => vigency.imovelId),
  )
  const summary = buildSummary(
    input,
    expectedProperties,
    eligibleClosings,
    currentSnapshots,
    coverage,
    contractedRent,
    appPropertyIds,
  )
  const bridge = buildFinancialBridge(summary)
  const realization = buildRentRealization(currentSnapshots, contractedRent)
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
  const confidence = buildConfidenceStatus(
    coverage,
    eligibleClosings,
    bridge,
    summary,
    realization,
  )

  return {
    meta: {
      calculoVersao: input.calculoVersao,
      competencia: input.competencia,
      competenciaLabel: formatCompetence(input.competencia, "long"),
      atualizadoEm: input.atualizadoEm,
      statusConfianca: confidence.status,
      motivosConfianca: confidence.reasons,
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

function applyContractTruth(
  input: IndicadoresAggregationInput,
  scope: AggregationScope,
): AggregationScope {
  if (input.vigenciasDisponiveis === undefined) return scope

  return {
    ...scope,
    snapshots: scope.snapshots.map((snapshot) => {
      if (!input.vigenciasDisponiveis) {
        return { ...snapshot, aluguelEsperado: null }
      }
      const vigency = scope.vigencies.find(
        (item) =>
          item.imovelId === snapshot.imovelId &&
          item.vigenciaInicio <= snapshot.competencia &&
          (item.vigenciaFim === null || item.vigenciaFim >= snapshot.competencia),
      )
      if (!vigency) return { ...snapshot, aluguelEsperado: null }
      return {
        ...snapshot,
        modeloReceita: vigency.modeloReceita,
        aluguelEsperado:
          vigency.modeloReceita === "fixo" ? vigency.aluguelContratado : null,
      }
    }),
  }
}

function applyScope(input: IndicadoresAggregationInput): AggregationScope {
  const directMatch = (item: IndicadoresPairInput) =>
    (!input.filtros.empresaId || item.empresaId === input.filtros.empresaId) &&
    (!input.filtros.empreendimentoId ||
      item.empreendimentoId === input.filtros.empreendimentoId)
  const sourceVigencies = (input.vigencias ?? []).filter((vigency) => vigency.ativo)
  const vigencyPropertyIds = new Set(sourceVigencies.map((vigency) => vigency.imovelId))
  const properties = input.imoveisAtivos.filter(
    (property) =>
      (property.ativo || vigencyPropertyIds.has(property.id)) &&
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
    vigencies: sourceVigencies.filter(
      (vigency) =>
        directMatch(vigency) &&
        propertyIds.has(vigency.imovelId) &&
        (!input.filtros.imovelId || vigency.imovelId === input.filtros.imovelId),
    ),
    closings: input.fechamentos.filter(pairMatch),
    snapshots: input.snapshots.filter((snapshot) => propertyIds.has(snapshot.imovelId)),
  }
}

function buildCoverage(
  input: IndicadoresAggregationInput,
  scope: AggregationScope,
  expectedProperties: IndicadoresPropertyInput[],
  currentClosings: IndicadoresClosingInput[],
  eligibleClosings: IndicadoresClosingInput[],
  currentSnapshots: IndicadoresSnapshotInput[],
): IndicadoresCoverage {
  // A carteira histórica é a fonte de verdade da cobertura. Regras comerciais
  // definem operação, não comprovam que havia imóvel sob gestão na competência.
  const expectedPairs = new Set(expectedProperties.map(pairKey))
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
  const missingSnapshotProperties = expectedProperties.filter(
    (property) => !snapshotPropertyIds.has(property.id),
  )
  const unknownSnapshotRows = currentSnapshots.filter(
    (snapshot) => snapshot.statusOcupacao === "desconhecido",
  )
  const missingExpectedRentRows = currentSnapshots.filter(
    (snapshot) =>
      snapshot.aluguelEsperado === null &&
      (snapshot.modeloReceita ?? "fixo") === "fixo",
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
  const propertyById = new Map(expectedProperties.map((property) => [property.id, property]))
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
    "Fechamentos esperados sem processamento.",
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
      expectedProperties.map(formatPropertyLabel),
    )
  }

  const expectedPairCount = expectedPairs.size
  const expectedPropertyCount = expectedProperties.length
  const currentVigencies = vigenciesAtCompetence(scope.vigencies, input.competencia)
  const modelByProperty = new Map(
    currentVigencies.map((vigency) => [vigency.imovelId, vigency]),
  )
  const usesHistoricalContracts = input.vigenciasDisponiveis !== undefined
  const historicalCoverageAvailable = input.vigenciasDisponiveis === true
  const knownContracts = expectedProperties.filter((property) => {
    const vigency = modelByProperty.get(property.id)
    if (usesHistoricalContracts) {
      return (
        historicalCoverageAvailable &&
        vigency?.modeloReceita === "fixo" &&
        vigency.aluguelContratado !== null
      )
    }
    if (!vigency) return property.aluguelEsperadoAtual !== null
    return vigency.modeloReceita === "fixo" && vigency.aluguelContratado !== null
  }).length
  const notApplicableContracts = expectedProperties.filter((property) => {
    const model = modelByProperty.get(property.id)?.modeloReceita
    return (
      (!usesHistoricalContracts || historicalCoverageAvailable) &&
      (model === "variavel" || model === "nao_aplicavel")
    )
  }).length
  const missingContracts = Math.max(
    0,
    expectedPropertyCount - knownContracts - notApplicableContracts,
  )
  const proofCoverage = summarizeProofCoverage(eligibleClosings)

  addGap(
    gaps,
    "contrato_ausente",
    missingContracts,
    "Imóveis sem contrato conhecido ou classificação como não aplicável.",
    expectedProperties
      .filter((property) => {
        const vigency = modelByProperty.get(property.id)
        if (usesHistoricalContracts) {
          if (!historicalCoverageAvailable || !vigency) return true
          return vigency.modeloReceita === "fixo" && vigency.aluguelContratado === null
        }
        return vigency
          ? vigency.modeloReceita === "fixo" && vigency.aluguelContratado === null
          : property.aluguelEsperadoAtual === null
      })
      .map(formatPropertyLabel),
  )

  const fechamentos = {
    esperados: expectedPairCount,
    processados: processedPairs.size,
    aprovados: approvedPairs.size,
    pendentes: Math.max(0, processedPairs.size - approvedPairs.size),
    rascunhos: draftPairs.size,
    emAtualizacao: updatingPairs.size,
    ausentes: absentPairKeys.length,
    percentual: percentage(processedPairs.size, expectedPairCount),
  }
  return {
    fechamentos,
    pares: fechamentos,
    imoveis: {
      esperados: expectedPropertyCount,
      snapshotsDisponiveis: currentSnapshots.length,
      snapshotsDesconhecidos: unknownSnapshotRows.length,
      semAluguelEsperado: missingExpectedRentRows.length,
      percentual: percentage(currentSnapshots.length, expectedPropertyCount),
    },
    contratos: {
      conhecidos: knownContracts,
      naoAplicaveis: notApplicableContracts,
      ausentes: missingContracts,
    },
    comprovantes: proofCoverage,
    linhasNaoVinculadas: unlinkedLines,
    lacunas: gaps,
  }
}

function buildSummary(
  input: IndicadoresAggregationInput,
  properties: IndicadoresPropertyInput[],
  eligibleClosings: IndicadoresClosingInput[],
  snapshots: IndicadoresSnapshotInput[],
  coverage: IndicadoresCoverage,
  contractedRent: number | null,
  appPropertyIds: Set<string>,
): IndicadoresSummary {
  const byProperty = input.filtros.imovelId !== null
  const analyses = eligibleClosings
    .map((closing) => closing.analiseCompleta)
    .filter((analysis): analysis is IndicadoresAnalysisInput => analysis !== null)
  const economicRevenue = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.receitaTotal))
    : sumKnown(analyses.map((analysis) => analysis.totals.total_receitas))
  const administrationCommission = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.comissaoAdministracao))
    : sumKnown(analyses.map((analysis) => analysis.totals.total_comissoes))
  const brokerageCommission = byProperty ? null : sumBrokerageCommission(analyses)
  const passageEntries = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.entradasPassagem))
    : sumAnalysisMetric(analyses, "entradas")
  const passageExits = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.saidasPassagem))
    : sumAnalysisMetric(analyses, "saidas")
  const fees = byProperty ? null : sumAnalysisMetric(analyses, "tarifas")
  const retainedExpenses = byProperty ? null : sumRetainedExpenses(analyses)
  const declaredTransfer = byProperty
    ? sumKnown(snapshots.map((snapshot) => snapshot.repasseApurado))
    : sumKnown(
        analyses.map(
          (analysis) =>
            analysis.totals.repasse_declarado ?? analysis.totals.total_a_repassar,
        ),
      )
  const calculatedTransfer = calculateBridgeTransfer({
    economicRevenue,
    passageEntries,
    administrationCommission,
    brokerageCommission,
    retainedExpenses,
    fees,
    passageExits,
  })
  const operational = byProperty ? null : sumOperationalExpenses(analyses)
  const transferEvidence = byProperty ? null : summarizeTransferEvidence(eligibleClosings)
  const confirmedTransfer = transferEvidence?.confirmed ?? null
  const receivedCurrent = sumKnown(
    snapshots.map(currentRent),
  )
  const recoveredLate = sumKnown(snapshots.map((snapshot) => snapshot.atrasosRecuperados))
  const otherReceipts = sumKnown(snapshots.map((snapshot) => snapshot.outrosRecebimentos))

  return {
    receitasEconomicas: economicRevenue,
    aluguelRecebidoCompetencia: receivedCurrent,
    atrasosRecuperados: recoveredLate,
    outrosRecebimentos: otherReceipts,
    entradasPassagem: passageEntries,
    saidasPassagem: passageExits,
    tarifas: fees,
    repasseCalculado: calculatedTransfer,
    repasseDeclarado: declaredTransfer,
    repasseConfirmadoBanco: confirmedTransfer,
    repasseCalculadoComprovado: transferEvidence?.comparableCalculated ?? null,
    coberturaComprovantesPercentual: coverage.comprovantes.percentual,
    receitaTotal: economicRevenue,
    aluguelContratado: contractedRent,
    aluguelRecebido: sumNullableMoney(receivedCurrent, recoveredLate),
    comissaoAdministracao: administrationCommission,
    comissaoIntermediacao: brokerageCommission,
    despesasRetidas: retainedExpenses,
    despesaOperacionalDetalhada: {
      agua: operational?.agua ?? null,
      iptu: operational?.iptu ?? null,
      seguro: operational?.seguro ?? null,
      total: operational?.total ?? null,
    },
    repasseApurado: calculatedTransfer,
    repasseComprovado: confirmedTransfer,
    repasseInformadoExtrato: transferEvidence?.statement ?? null,
    diferencaRepasse:
      confirmedTransfer !== null && transferEvidence?.comparableCalculated !== null
        ? roundMoney(confirmedTransfer - transferEvidence!.comparableCalculated!)
        : null,
    ocupacaoCompetencia: summarizeOccupancy(
      snapshots.map((snapshot) =>
        presentOccupancyStatus(snapshot.statusOcupacao, snapshot.modeloReceita === "variavel"),
      ),
    ),
    ocupacaoHoje: summarizeOccupancy(
      properties.map((property) =>
        presentOccupancyStatus(property.statusAtual, appPropertyIds.has(property.id)),
      ),
    ),
    inadimplenciaAcumulada: byProperty ? null : sumAccumulatedDelinquency(analyses),
  }
}

function buildFinancialBridge(summary: IndicadoresSummary): IndicadoresFinancialBridge {
  const values = [
    summary.receitasEconomicas,
    summary.entradasPassagem,
    summary.comissaoAdministracao,
    summary.despesasRetidas,
    summary.tarifas,
    summary.comissaoIntermediacao,
    summary.saidasPassagem,
    summary.repasseDeclarado,
  ]
  const canReconcile = values.every((value) => value !== null)
  const residual = canReconcile
    ? roundMoney(
        summary.receitasEconomicas! +
          summary.entradasPassagem! -
          summary.comissaoAdministracao! -
          summary.despesasRetidas! -
          summary.tarifas! -
          summary.comissaoIntermediacao! -
          summary.saidasPassagem! -
          summary.repasseDeclarado!,
      )
    : null
  const reconciled = residual === null ? null : Math.abs(residual) <= FINANCIAL_TOLERANCE
  const commissions =
    summary.comissaoAdministracao === null || summary.comissaoIntermediacao === null
      ? null
      : roundMoney(summary.comissaoAdministracao + summary.comissaoIntermediacao)

  return {
    receitasEconomicas: summary.receitasEconomicas,
    entradasPassagem: summary.entradasPassagem,
    comissoes: commissions,
    despesas: summary.despesasRetidas,
    tarifas: summary.tarifas,
    saidasPassagem: summary.saidasPassagem,
    repasseCalculado: summary.repasseCalculado,
    repasseDeclarado: summary.repasseDeclarado,
    diferencaNaoExplicada: residual,
    receitaTotal: summary.receitaTotal,
    comissaoAdministracao: summary.comissaoAdministracao,
    despesasRetidas: summary.despesasRetidas,
    comissaoIntermediacao: summary.comissaoIntermediacao,
    repasseApurado: summary.repasseCalculado,
    residuo: residual,
    tolerancia: FINANCIAL_TOLERANCE,
    reconciliada: reconciled,
    alerta: reconciled === false,
  }
}

function buildRentRealization(
  snapshots: IndicadoresSnapshotInput[],
  contracted: number | null,
): IndicadoresRentRealization {
  const received = sumKnown(
    snapshots.map(currentRent),
  )
  const recoveredLate = sumKnown(snapshots.map((snapshot) => snapshot.atrasosRecuperados))
  const vacancy =
    contracted === null
      ? null
      : sumForStatus(snapshots, "vago", (snapshot) => snapshot.aluguelEsperado)
  // CA-IND23: toda unidade vaga com vigência aplicável contribui com sua
  // cobrança esperada; snapshots antigos sem a coluna caem no aluguel esperado.
  const vacanciaFinanceira = sumForStatus(
    snapshots,
    "vago",
    (snapshot) => snapshot.cobrancaEsperada ?? snapshot.aluguelEsperado,
  )
  const delinquency =
    contracted === null
      ? null
      : sumForStatus(snapshots, "inadimplente", (snapshot) => {
          const receivedCurrent = currentRent(snapshot)
          if (snapshot.aluguelEsperado === null) return null
          // O status mensal explícito de inadimplência comprova a ausência do
          // pagamento da competência mesmo quando o documento não traz uma
          // linha de recebimento que pudesse materializar R$ 0,00.
          return Math.max(
            0,
            roundMoney(snapshot.aluguelEsperado - (receivedCurrent ?? 0)),
          )
        })
  const discounts = sumKnown(snapshots.map((snapshot) => snapshot.desconto))
  const classifiedAdjustments =
    snapshots.length === 0 || contracted === null
      ? null
      : sumForStatus(snapshots, "em_rescisao", (snapshot) => {
          const receivedCurrent = currentRent(snapshot)
          if (snapshot.aluguelEsperado === null || receivedCurrent === null) return null
          return roundMoney(
            receivedCurrent - snapshot.aluguelEsperado + (snapshot.desconto ?? 0),
          )
        })
  const canReconcile = [contracted, received, vacancy, delinquency, discounts].every(
    (value) => value !== null,
  )

  const unclassifiedValues = canReconcile
    ? roundMoney(
        received! -
          (contracted! -
            vacancy! -
            delinquency! -
            discounts! +
            (classifiedAdjustments ?? 0)),
      )
    : null
  const rentsReceivedInMonth = sumNullableMoney(received, recoveredLate)

  return {
    contratado: contracted,
    vacancia: vacancy,
    vacanciaFinanceira,
    inadimplenciaMes: delinquency,
    descontos: discounts,
    ajustesClassificados: classifiedAdjustments,
    valoresSemClassificacao: unclassifiedValues,
    recebidoCompetencia: received,
    atrasosRecuperados: recoveredLate,
    alugueisRecebidosMes: rentsReceivedInMonth,
    outrosAjustes: unclassifiedValues,
    outrosAjustesPercentualContratado:
      unclassifiedValues !== null && contracted !== null && contracted !== 0
        ? (unclassifiedValues / contracted) * 100
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
  eligibleMonths: Set<string>,
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
      // A competencia de origem so recebe a reatribuicao quando ela mesma existe
      // no historico exibivel. Origem fora da janela (sem fechamento/snapshot)
      // manteria o valor no mes do recebimento em vez de inventar um mes solto.
      if (!eligibleMonths.has(original)) continue
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
    for (const { item, financeiro } of resolverRecebimentosLegados(
      closing.analiseCompleta?.prestacao?.acordos_rescisoes_recebidos ?? [],
    )) {
      if (item.tipo !== "atraso") continue
      const original = competenciaMesToDatabase(item.competencia_original)
      if (!original || original === current) continue
      if (!eligibleMonths.has(original)) continue
      // CA27: a realocação move o que foi efetivamente recebido, nunca o
      // principal bruto; item pendente não realoca nada.
      const valor = financeiro.totalRecebido
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
  // O historico exibivel sao as competencias com lastro (fechamento ou snapshot)
  // ate o mes de referencia. A serie nao materializa meses que existiriam apenas
  // por reatribuicao de competencia original.
  const months = uniqueSorted([
    ...scope.closings.map((closing) => closing.competencia),
    ...scope.snapshots.map((snapshot) => snapshot.competencia),
  ]).filter((month) => month <= input.competencia)
  const eligibleMonths = new Set(months)
  const reallocations = buildCompetenciaReallocations(
    scope.closings,
    input.filtros.imovelId,
    eligibleMonths,
  )

  return months.map((competencia) => {
    const expectedProperties = propertiesAtCompetence(
      scope.properties,
      scope.vigencies,
      competencia,
    )
    const expectedPropertyIds = new Set(expectedProperties.map((property) => property.id))
    const expectedPairs = new Set(expectedProperties.map(pairKey))
    const eligible = scope.closings.filter(
      (closing) => closing.competencia === competencia && isEligibleClosing(closing),
    )
    const eligibleIds = new Set(eligible.map((closing) => closing.id))
    const snapshots = scope.snapshots.filter(
      (snapshot) =>
        snapshot.competencia === competencia &&
        eligibleIds.has(snapshot.fechamentoId) &&
        expectedPropertyIds.has(snapshot.imovelId),
    )
    const monthlyContractedRent = contractedRentAtCompetence(
      input,
      scope,
      expectedProperties,
      snapshots,
      competencia,
    )
    const analyses = eligible.map((closing) => closing.analiseCompleta!)
    const occupancy = summarizeOccupancy(
      snapshots.map((snapshot) =>
        presentOccupancyStatus(snapshot.statusOcupacao, snapshot.modeloReceita === "variavel"),
      ),
    )
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
      snapshots.length !== expectedProperties.length ||
      snapshots.some(
        (snapshot) =>
          snapshot.statusOcupacao === "desconhecido" ||
          (snapshot.aluguelEsperado === null &&
            (snapshot.modeloReceita ?? "fixo") === "fixo"),
      )

    const reallocation = reallocations.get(competencia)
    const receitaBase = input.filtros.imovelId
      ? sumKnown(snapshots.map((snapshot) => snapshot.receitaTotal))
      : sumKnown(analyses.map((analysis) => analysis.totals.total_receitas))
    const aluguelBase = sumKnown(snapshots.map(currentRent))
    const proofCoverage = summarizeProofCoverage(eligible)
    const monthlyFees = sumAnalysisMetric(analyses, "tarifas")
    const monthlyCalculatedTransfer = calculateBridgeTransfer({
      economicRevenue: sumKnown(
        analyses.map((analysis) => analysis.totals.total_receitas),
      ),
      passageEntries: sumAnalysisMetric(analyses, "entradas"),
      administrationCommission: sumKnown(
        analyses.map((analysis) => analysis.totals.total_comissoes),
      ),
      brokerageCommission: sumBrokerageCommission(analyses),
      retainedExpenses: sumRetainedExpenses(analyses),
      fees: monthlyFees,
      passageExits: sumAnalysisMetric(analyses, "saidas"),
    })
    const monthlyDeclaredTransfer = sumKnown(
      analyses.map(
        (analysis) =>
          analysis.totals.repasse_declarado ?? analysis.totals.total_a_repassar,
      ),
    )
    const hasFinancialDivergence =
      monthlyCalculatedTransfer !== null &&
      monthlyDeclaredTransfer !== null &&
      Math.abs(
        roundMoney(monthlyDeclaredTransfer - monthlyCalculatedTransfer),
      ) > FINANCIAL_TOLERANCE
    const statusConfianca =
      hasFinancialDivergence
        ? ("com_divergencia" as const)
        : hasGap || expectedPairs.size === 0
        ? ("incompleto" as const)
        : proofCoverage.presentes !== proofCoverage.esperados ||
            approved !== expectedPairs.size
          ? ("em_conferencia" as const)
          : ("confirmado" as const)

    return {
      competencia,
      label: formatCompetence(competencia, "short"),
      receitaTotal: applyReallocation(receitaBase, reallocation?.receitaIn, reallocation?.receitaOut),
      aluguelContratado: monthlyContractedRent,
      aluguelRecebido: applyReallocation(aluguelBase, reallocation?.aluguelIn, reallocation?.aluguelOut),
      repasseApurado: input.filtros.imovelId
        ? sumKnown(snapshots.map((snapshot) => snapshot.repasseApurado))
        : sumKnown(analyses.map((analysis) => analysis.totals.total_a_repassar)),
      ocupacaoPercentual: occupancy.percentual,
      coberturaPercentual: occupancy.coberturaPercentual,
      qualidade: hasGap || expectedPairs.size === 0 ? ("preliminar" as const) : ("completa" as const),
      competenciaAjusteReceita: roundMoney((reallocation?.receitaIn ?? 0) - (reallocation?.receitaOut ?? 0)),
      competenciaAjusteAluguel: roundMoney((reallocation?.aluguelIn ?? 0) - (reallocation?.aluguelOut ?? 0)),
      statusConfianca,
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
      const receivedCurrent = currentRent(snapshot)
      const gap =
        snapshot.aluguelEsperado === null || receivedCurrent === null
          ? null
          : Math.max(0, roundMoney(snapshot.aluguelEsperado - receivedCurrent))
      return {
        imovelId: property.id,
        unidade: property.unidade,
        inquilinoNome: snapshot.inquilinoNome ?? null,
        empreendimentoId: property.empreendimentoId,
        empreendimentoNome: property.empreendimentoNome ?? property.empreendimentoId,
        esperado: snapshot.aluguelEsperado,
        modeloReceita: snapshot.modeloReceita ?? "fixo",
        recebido: receivedCurrent,
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
      inquilinoNome: null,
      statusOcupacao: null,
      valor: null,
      inadimplenciaPercentual: null,
      vacanciaPercentual: null,
      origem: null,
      qualidade: null,
    }
  }

  const hasKnownStatus = snapshot.statusOcupacao !== "desconhecido"
  const receivedCurrent = currentRent(snapshot)
  const gap =
    snapshot.aluguelEsperado === null || receivedCurrent === null
      ? null
      : Math.max(0, roundMoney(snapshot.aluguelEsperado - receivedCurrent))
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
    inquilinoNome: snapshot.inquilinoNome ?? null,
    statusOcupacao: presentOccupancyStatus(
      snapshot.statusOcupacao,
      snapshot.modeloReceita === "variavel",
    ),
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
        statusOcupacao: presentOccupancyStatus(
          snapshot.statusOcupacao,
          snapshot.modeloReceita === "variavel",
        ),
        aluguelEsperado: snapshot.aluguelEsperado,
        modeloReceita: snapshot.modeloReceita ?? "fixo",
        aluguelRecebido: snapshot.aluguelRecebido,
        aluguelRecebidoCompetencia: currentRent(snapshot),
        atrasosRecuperados: snapshot.atrasosRecuperados ?? null,
        outrosRecebimentos: snapshot.outrosRecebimentos ?? null,
        receitaTotal: snapshot.receitaTotal,
        desconto: snapshot.desconto,
        comissaoAdministracao: snapshot.comissaoAdministracao,
        repasseApurado: snapshot.repasseApurado,
        vencimentoReferencia: snapshot.vencimentoReferencia ?? null,
        competenciaAluguel: snapshot.competenciaOriginal ?? null,
        competenciaRecebimento: snapshot.competenciaRecebimento ?? null,
        vencimentoDia: snapshot.diaVencimento ?? null,
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
  const historicalPropertyIds = new Set(
    (input.vigencias ?? []).filter((vigency) => vigency.ativo).map((vigency) => vigency.imovelId),
  )
  const activeProperties = input.imoveisAtivos.filter(
    (property) => property.ativo || historicalPropertyIds.has(property.id),
  )
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

// Locação por app (Airbnb) é receita variável em operação: uma categoria de
// exibição separada de "ocupado", derivada do modelo de receita. Nunca é
// persistida — o snapshot no banco continua "ocupado".
function presentOccupancyStatus(status: OccupancyStatus, isAppRental: boolean): OccupancyStatus {
  return status === "ocupado" && isAppRental ? "alugado_app" : status
}

function summarizeOccupancy(statuses: OccupancyStatus[]): IndicadoresOccupancy {
  const ocupados = count(statuses, "ocupado")
  const alugadosApp = count(statuses, "alugado_app")
  const inadimplentes = count(statuses, "inadimplente")
  const emRescisao = count(statuses, "em_rescisao")
  const vagos = count(statuses, "vago")
  const desconhecidos = count(statuses, "desconhecido")
  const numerador = ocupados + alugadosApp + inadimplentes + emRescisao
  const denominador = numerador + vagos

  return {
    ocupados,
    alugadosApp,
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

function summarizeTransferEvidence(closings: IndicadoresClosingInput[]) {
  if (closings.length === 0) return null
  const analyses = closings.flatMap((closing) =>
    closing.analiseCompleta ? [closing.analiseCompleta] : [],
  )
  const external = analyses.filter(
    (analysis) =>
      !analysis.totals.repasse_embutido && analysis.totals.valor_comprovado !== null,
  )
  const embedded = analyses.filter((analysis) => analysis.totals.repasse_embutido)
  const confirmed = sumKnown(external.map((analysis) => analysis.totals.valor_comprovado))
  const statement = sumKnown(embedded.map((analysis) => analysis.totals.valor_comprovado))
  const comparableCalculated = sumKnown(
    external.map(
      (analysis) =>
        calculateAnalysisBridgeTransfer(analysis) ??
        analysis.totals.repasse_declarado ??
        analysis.totals.total_a_repassar,
    ),
  )

  return {
    confirmed,
    statement,
    comparableCalculated,
  }
}

function summarizeProofCoverage(closings: IndicadoresClosingInput[]) {
  const expected = closings.length
  const present = closings.filter(
    (closing) =>
      closing.analiseCompleta !== null &&
      !closing.analiseCompleta.totals.repasse_embutido &&
      closing.analiseCompleta.totals.valor_comprovado !== null,
  ).length
  return {
    esperados: expected,
    presentes: present,
    ausentes: Math.max(0, expected - present),
    percentual: percentage(present, expected),
  }
}

function calculateAnalysisBridgeTransfer(analysis: IndicadoresAnalysisInput) {
  const fees = analysisMetric(analysis, "tarifas")
  return calculateBridgeTransfer({
    economicRevenue: analysis.totals.total_receitas,
    passageEntries: analysisMetric(analysis, "entradas"),
    administrationCommission: analysis.totals.total_comissoes,
    brokerageCommission: sumBrokerageCommission([analysis]),
    retainedExpenses: retainedExpensesForAnalysis(analysis),
    fees,
    passageExits: analysisMetric(analysis, "saidas"),
  })
}

function calculateBridgeTransfer(input: {
  economicRevenue: number | null
  passageEntries: number | null
  administrationCommission: number | null
  brokerageCommission: number | null
  retainedExpenses: number | null
  fees: number | null
  passageExits: number | null
}) {
  if (Object.values(input).some((value) => value === null)) return null
  return roundMoney(
    input.economicRevenue! +
      input.passageEntries! -
      input.administrationCommission! -
      input.brokerageCommission! -
      input.retainedExpenses! -
      input.fees! -
      input.passageExits!,
  )
}

function sumAnalysisMetric(
  analyses: IndicadoresAnalysisInput[],
  metric: "entradas" | "saidas" | "tarifas",
) {
  if (analyses.length === 0) return null
  return sumKnown(analyses.map((analysis) => analysisMetric(analysis, metric)))
}

function sumRetainedExpenses(analyses: IndicadoresAnalysisInput[]) {
  if (analyses.length === 0) return null
  return sumKnown(analyses.map(retainedExpensesForAnalysis))
}

function retainedExpensesForAnalysis(analysis: IndicadoresAnalysisInput) {
  const hasSeparatedFees =
    analysis.totals.total_tarifas !== null &&
    analysis.totals.total_tarifas !== undefined
  return roundMoney(
    analysis.totals.total_despesas -
      (hasSeparatedFees ? 0 : analysisMetric(analysis, "tarifas")),
  )
}

function analysisMetric(
  analysis: IndicadoresAnalysisInput,
  metric: "entradas" | "saidas" | "tarifas",
) {
  if (metric === "entradas") {
    const declared =
      analysis.totals.entradas_passagem ?? analysis.totals.total_entradas_passagem
    if (declared !== null && declared !== undefined) return declared
    return (
      sumKnown(
        (analysis.prestacao?.receitas_por_imovel ?? []).map(
          (line) => line.entradas_passagem,
        ),
      ) ?? 0
    )
  }
  if (metric === "saidas") {
    const declared =
      analysis.totals.saidas_passagem ?? analysis.totals.total_saidas_passagem
    if (declared !== null && declared !== undefined) return declared
    return (
      sumKnown(
        (analysis.prestacao?.receitas_por_imovel ?? []).map(
          (line) => line.saidas_passagem,
        ),
      ) ?? 0
    )
  }

  const declared = analysis.totals.total_tarifas
  if (declared !== null && declared !== undefined) return declared
  return roundMoney(
    (analysis.prestacao?.outras_comissoes_despesas ?? [])
      .filter((item) => /\bpix\b|\bted\b|tarifa|taxa banc|transferencia/i.test(item.descricao))
      .reduce((total, item) => total + item.valor, 0),
  )
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
  // CA27: só intermediações resolvidas pelo módulo canônico têm efeito
  // financeiro; item pendente (ex.: intermediação fantasma de despesa) fica
  // fora da comissão de intermediação em vez de contaminá-la.
  const values = sections.flatMap((section) =>
    resolverRecebimentosLegados(section!)
      .filter(({ item }) => item.tipo === "intermediacao")
      .map(({ financeiro }) => financeiro.comissao),
  )
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

function currentRent(snapshot: IndicadoresSnapshotInput) {
  return snapshot.aluguelRecebidoCompetencia === undefined
    ? snapshot.aluguelRecebido
    : snapshot.aluguelRecebidoCompetencia
}

function sumNullableMoney(
  left: number | null,
  right: number | null,
) {
  if (left === null && right === null) return null
  return roundMoney((left ?? 0) + (right ?? 0))
}

function contractedRentAtCompetence(
  input: IndicadoresAggregationInput,
  scope: AggregationScope,
  properties: IndicadoresPropertyInput[],
  snapshots: IndicadoresSnapshotInput[],
  competence: string,
) {
  if (input.vigenciasDisponiveis === undefined) {
    return sumKnown(snapshots.map((snapshot) => snapshot.aluguelEsperado))
  }
  if (!input.vigenciasDisponiveis) return null

  const vigencyByProperty = new Map(
    vigenciesAtCompetence(scope.vigencies, competence).map((vigency) => [
      vigency.imovelId,
      vigency,
    ]),
  )
  const vigencies = properties.map((property) => vigencyByProperty.get(property.id))
  if (
    vigencies.some(
      (vigency) =>
        !vigency ||
        (vigency.modeloReceita === "fixo" && vigency.aluguelContratado === null),
    )
  ) {
    return null
  }
  return sumKnown(
    vigencies.map((vigency) =>
      vigency?.modeloReceita === "fixo" ? vigency.aluguelContratado : null,
    ),
  )
}

function propertiesAtCompetence(
  properties: IndicadoresPropertyInput[],
  vigencies: IndicadoresVigencyInput[],
  competence: string,
) {
  if (vigencies.length === 0) return properties.filter((property) => property.ativo)
  const effectiveIds = new Set(
    vigenciesAtCompetence(vigencies, competence).map((vigency) => vigency.imovelId),
  )
  return properties.filter((property) => effectiveIds.has(property.id))
}

function vigenciesAtCompetence(
  vigencies: IndicadoresVigencyInput[],
  competence: string,
) {
  return vigencies.filter(
    (vigency) =>
      vigency.ativo &&
      vigency.vigenciaInicio <= competence &&
      (vigency.vigenciaFim === null || vigency.vigenciaFim >= competence),
  )
}

function buildConfidenceStatus(
  coverage: IndicadoresCoverage,
  closings: IndicadoresClosingInput[],
  bridge: IndicadoresFinancialBridge,
  summary: IndicadoresSummary,
  realization: IndicadoresRentRealization,
) {
  const reasons: string[] = []
  const hasFinancialDivergence =
    bridge.diferencaNaoExplicada !== null &&
    Math.abs(bridge.diferencaNaoExplicada) > FINANCIAL_TOLERANCE
  const hasTransferDivergence =
    summary.diferencaRepasse !== null &&
    Math.abs(summary.diferencaRepasse) > FINANCIAL_TOLERANCE
  const hasRentDivergence =
    realization.valoresSemClassificacao !== null &&
    Math.abs(realization.valoresSemClassificacao) > FINANCIAL_TOLERANCE

  if (hasFinancialDivergence) {
    reasons.push("A ponte financeira possui diferença não explicada acima de R$ 0,01.")
  }
  if (hasTransferDivergence) {
    reasons.push("O repasse confirmado pelo banco diverge do cálculo acima de R$ 0,01.")
  }
  if (hasRentDivergence) {
    reasons.push("A realização do aluguel possui valor sem classificação acima de R$ 0,01.")
  }
  if (hasFinancialDivergence || hasTransferDivergence || hasRentDivergence) {
    return { status: "com_divergencia" as const, reasons }
  }

  const structurallyComplete =
    hasStructuralCoverage(coverage) && bridge.reconciliada === true
  if (!structurallyComplete) {
    reasons.push("Há fechamento, contrato, vínculo ou histórico mensal ausente.")
    return { status: "incompleto" as const, reasons }
  }

  const allApproved =
    closings.length > 0 &&
    closings.every((closing) => APPROVED_STATUSES.has(closing.status))
  const allProofsPresent =
    coverage.comprovantes.esperados > 0 &&
    coverage.comprovantes.presentes === coverage.comprovantes.esperados
  if (!allApproved) reasons.push("A competência ainda não foi integralmente aprovada.")
  if (!allProofsPresent) {
    reasons.push("Nem todos os repasses possuem comprovante bancário externo.")
  }
  if (!allApproved || !allProofsPresent) {
    return { status: "em_conferencia" as const, reasons }
  }

  return {
    status: "confirmado" as const,
    reasons: ["Fechamentos, contratos, histórico mensal e comprovantes estão reconciliados."],
  }
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
    hasStructuralCoverage(coverage) &&
    coverage.fechamentos.pendentes === 0
  )
}

function hasStructuralCoverage(coverage: IndicadoresCoverage) {
  return (
    coverage.fechamentos.esperados > 0 &&
    coverage.fechamentos.processados === coverage.fechamentos.esperados &&
    coverage.fechamentos.emAtualizacao === 0 &&
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
