import type { IndicadoresData, IndicadoresHeatRow } from "@/lib/indicadores-types"

export type DashboardMetric = "valor" | "percentual"
export type HeatMetric = "inad" | "vac"
export type DashboardTab = "geral" | "receita" | "mapa" | "imoveis"
export type ConfidenceStatus = "confirmado" | "em_conferencia" | "incompleto" | "com_divergencia"

export type OccupancySummary = IndicadoresData["resumo"]["ocupacaoCompetencia"]
export type OccupancyStatus = IndicadoresData["heat"]["linhas"][number]["hoje"]

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number | null | undefined): string {
  return value == null ? "—" : CURRENCY_FORMATTER.format(value)
}

export function resolveMetricValue(
  value: number | null | undefined,
  fallback: number | null = null,
): number | null {
  return value === undefined ? fallback : value
}

export function sumKnownValues(
  values: Array<number | null | undefined>,
): number | null {
  return values.every((value): value is number => typeof value === "number")
    ? values.reduce((total, value) => total + value, 0)
    : null
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? "—" : `${NUMBER_FORMATTER.format(value)}%`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
}

export function formatHistoryCoverage(
  recordedMonths: number,
  classifiedMonths: number,
  totalMonths: number,
): string {
  if (recordedMonths === 0 || totalMonths === 0) return "Sem histórico no período"
  if (recordedMonths === classifiedMonths) {
    return `${classifiedMonths} de ${totalMonths} ${totalMonths === 1 ? "mês" : "meses"} com status`
  }
  return `${recordedMonths} de ${totalMonths} registrados · ${classifiedMonths} com status`
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export function formatReference(value: string | null): string {
  if (!value) return "—"
  const isoMonth = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value)
  if (isoMonth) return `${isoMonth[2]}/${isoMonth[1]}`
  const dayReference = /^(?:dia\s*)?(\d{1,2})$/i.exec(value.trim())
  const day = dayReference ? Number(dayReference[1]) : null
  if (day !== null && day >= 1 && day <= 31) return `Dia ${day}`
  return value
}

export function getConfidenceStatus(data: IndicadoresData): ConfidenceStatus {
  const meta = data.meta as unknown as Record<string, unknown>
  const status = meta.statusConfianca
  if (
    status === "confirmado"
    || status === "em_conferencia"
    || status === "incompleto"
    || status === "com_divergencia"
  ) {
    return status
  }
  return "em_conferencia"
}

export function getClosingsCoverage(data: IndicadoresData) {
  const coverage = data.cobertura as unknown as {
    fechamentos?: IndicadoresData["cobertura"]["pares"]
    pares: IndicadoresData["cobertura"]["pares"]
  }
  return coverage.fechamentos ?? coverage.pares
}

export function formatContractedRent(
  value: number | null,
  revenueModel: unknown,
): string {
  if (revenueModel === "variavel" || revenueModel === "não aplicável" || revenueModel === "nao_aplicavel") {
    return "Não se aplica"
  }
  return formatCurrency(value)
}

export function formatPortfolioContractedRent(
  value: number | null,
  contracts: { conhecidos: number; naoAplicaveis: number; ausentes: number },
): string {
  if (
    value === null &&
    contracts.conhecidos === 0 &&
    contracts.naoAplicaveis > 0 &&
    contracts.ausentes === 0
  ) {
    return "Não se aplica"
  }
  return formatCurrency(value)
}

export function getFinancialReferences(row: {
  competencia: string
  vencimentoReferencia: string | null
}) {
  const record = row as unknown as Record<string, unknown>
  const explicitRentCompetence = stringValue(record.competenciaAluguel ?? record.competenciaOriginal)
  const explicitReceiptCompetence = stringValue(record.competenciaRecebimento)
  const explicitDueDay = numericDay(record.vencimentoDia ?? record.diaVencimento)
  const reference = row.vencimentoReferencia?.trim() ?? ""
  const monthReference = /^(\d{4})-(\d{2})(?:-\d{2})?$/.test(reference) ? reference : null
  const dayReference = numericDay(reference.replace(/^dia\s*/i, ""))
  const dueDay = explicitDueDay ?? dayReference

  return {
    rentCompetence: formatReference(explicitRentCompetence ?? monthReference),
    receiptCompetence: formatReference(explicitReceiptCompetence ?? row.competencia),
    dueDay: dueDay === null ? "—" : `Dia ${dueDay}`,
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function numericDay(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null
}

export function occupancyLabel(status: OccupancyStatus): string {
  const labels: Record<OccupancyStatus, string> = {
    ocupado: "Ocupado",
    inadimplente: "Inadimplente",
    vago: "Vago",
    em_rescisao: "Em rescisão",
    desconhecido: "Desconhecido",
  }
  return labels[status]
}

export function qualityLabel(quality: "completo" | "parcial" | "sem_linha"): string {
  if (quality === "completo") return "Completo"
  if (quality === "parcial") return "Dados parciais"
  return "Vínculo pendente"
}

export interface DelinquentUnitMonth {
  competencia: string
  label: string
  valor: number | null
}

export interface DelinquentUnit {
  imovelId: string
  unidade: string
  empreendimentoNome: string
  hoje: OccupancyStatus
  valorEmAberto: number | null
  meses: DelinquentUnitMonth[]
}

export interface DelinquencySummary {
  mesAtual: number | null
  acumulada: number | null
  totalEmAberto: number | null
  unidades: DelinquentUnit[]
}

// Responde direto: quanto é a inadimplência (do mês, acumulada e total), quais
// unidades estão inadimplentes agora e em quais meses (dentro da janela
// visível do mapa) — sem recalcular nada, só agregando os valores por célula
// que o heatmap já usa. "Mês atual" e "acumulada" são naturezas diferentes
// (não pagou este mês vs. dívida de meses anteriores) e não se substituem.
export function buildDelinquencySummary(input: {
  competenciaAtual: string
  meses: Array<{ competencia: string; label: string }>
  linhas: IndicadoresHeatRow[]
  inadimplenciaAcumulada: number | null
}): DelinquencySummary {
  const labelByCompetencia = new Map(input.meses.map((month) => [month.competencia, month.label]))
  const unidades: DelinquentUnit[] = []
  const valoresMesAtual: Array<number | null> = []

  for (const row of input.linhas) {
    const celulaAtual = row.celulas.find((cell) => cell.competencia === input.competenciaAtual)
    if (celulaAtual?.statusOcupacao !== "inadimplente") continue
    valoresMesAtual.push(celulaAtual.valor)
    const meses = row.celulas
      .filter((cell) => cell.statusOcupacao === "inadimplente")
      .map((cell) => ({
        competencia: cell.competencia,
        label: labelByCompetencia.get(cell.competencia) ?? cell.competencia,
        valor: cell.valor,
      }))
    unidades.push({
      imovelId: row.imovelId,
      unidade: row.unidade,
      empreendimentoNome: row.empreendimentoNome,
      hoje: row.hoje,
      valorEmAberto: sumKnownValues(meses.map((mes) => mes.valor)),
      meses,
    })
  }

  unidades.sort((a, b) => (b.valorEmAberto ?? -1) - (a.valorEmAberto ?? -1))

  const mesAtual = sumKnownValues(valoresMesAtual)
  const acumulada = input.inadimplenciaAcumulada
  const totalEmAberto = sumKnownValues([mesAtual, acumulada])

  return { mesAtual, acumulada, totalEmAberto, unidades }
}

export interface HeatCellDetail {
  kind: "sem_calculo" | "oculto" | "detalhado"
  percentualLabel: string | null
  valorLabel: string | null
}

// Decide o que mostrar sob o status de uma célula do mapa de riscos. "0% de
// inadimplência" força o leitor a decodificar uma dupla negativa para
// descobrir que está tudo em dia; e vacância é binária (0/100, ver
// HeatLegend) — o percentual nunca acrescenta nada ao status já exibido. Só
// vale mostrar número quando ele carrega informação real: inadimplência
// parcial/total, ou uma diferença residual mesmo com percentual zerado.
export function describeHeatCellDetail(input: {
  metric: HeatMetric
  percentage: number | null
  valor: number | null
}): HeatCellDetail {
  const { metric, percentage, valor } = input
  if (percentage === null && valor === null) {
    return { kind: "sem_calculo", percentualLabel: null, valorLabel: null }
  }
  if (metric === "vac") {
    return { kind: "oculto", percentualLabel: null, valorLabel: null }
  }
  if (percentage === 0 && (valor ?? 0) <= 0) {
    return { kind: "oculto", percentualLabel: null, valorLabel: null }
  }
  const percentualLabel = percentage === null ? "Percentual indisponível" : `${formatPercent(percentage)} de inadimplência`
  const valorLabel = valor === null
    ? "valor indisponível"
    : percentage === 0 && valor > 0
      ? `${formatCurrency(valor)} de diferença`
      : `${formatCurrency(valor)} não recebido`
  return { kind: "detalhado", percentualLabel, valorLabel }
}

export function escapeCsv(value: string | number | null): string {
  if (value === null) return ""
  const raw = String(value)
  const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
