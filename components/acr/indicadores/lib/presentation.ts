import type { IndicadoresData } from "@/lib/indicadores-types"

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

export function escapeCsv(value: string | number | null): string {
  if (value === null) return ""
  const raw = String(value)
  const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
