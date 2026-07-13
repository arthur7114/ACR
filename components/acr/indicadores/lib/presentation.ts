import type { IndicadoresData } from "@/lib/indicadores-types"

export type DashboardMetric = "valor" | "percentual"
export type HeatMetric = "inad" | "vac"
export type DashboardTab = "geral" | "receita" | "mapa" | "imoveis"

export type OccupancySummary = IndicadoresData["resumo"]["ocupacaoCompetencia"]
export type OccupancyStatus = IndicadoresData["heat"]["linhas"][number]["hoje"]

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const COMPACT_CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number | null): string {
  return value === null ? "—" : CURRENCY_FORMATTER.format(value)
}

export function formatCompactCurrency(value: number | null): string {
  return value === null ? "—" : COMPACT_CURRENCY_FORMATTER.format(value)
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${NUMBER_FORMATTER.format(value)}%`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
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
  return value
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
  if (quality === "parcial") return "Parcial"
  return "Sem linha vinculada"
}

export function escapeCsv(value: string | number | null): string {
  if (value === null) return ""
  const raw = String(value)
  const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
