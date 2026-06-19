export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/** Valor compacto em reais: 238100 -> "R$ 238,1k", 1240000 -> "R$ 1,2M". */
export function formatBRLk(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R$ ${formatNumberPtBR(value / 1_000_000, 1)}M`
  if (abs >= 1_000) return `R$ ${formatNumberPtBR(value / 1_000, 1)}k`
  return formatBRL(value)
}

/** Percentual com vírgula decimal: 91.6 -> "91,6%". */
export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumberPtBR(value, decimals)}%`
}

/** Competência curta com ano: "2026-05-01" -> "Mai/26". */
export function formatCompetenciaShort(value: string | null | undefined): string {
  if (!value) return "—"
  const [year, month] = value.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const idx = Number(month) - 1
  if (idx < 0 || idx > 11 || !year) return value
  return `${months[idx]}/${year.slice(2)}`
}

function formatNumberPtBR(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",")
}
