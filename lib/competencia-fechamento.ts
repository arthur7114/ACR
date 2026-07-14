export interface ReceitaCompetenciaInput {
  competencia_original?: string | null
  competencia_recebimento?: string | null
  dia_vencimento?: number | null
  vencimento?: string | null
  observacao?: string | null
}

export interface ReceitaCompetenciasResolvidas {
  competencia_original: string | null
  competencia_recebimento: string | null
  dia_vencimento: number | null
}

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
}

function canonicalCompetencia(ano: number, mes: number): string | null {
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2200) return null
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null
  return `${ano}-${String(mes).padStart(2, "0")}`
}

function normalizarTexto(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function normalizeCompetenciaMes(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim()

  const iso = normalized.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
  if (iso) return canonicalCompetencia(Number(iso[1]), Number(iso[2]))

  const brasileira = normalized.match(/^(\d{1,2})\/(\d{4})$/)
  if (brasileira) return canonicalCompetencia(Number(brasileira[2]), Number(brasileira[1]))

  const dataBrasileira = normalized.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/)
  if (dataBrasileira) return canonicalCompetencia(Number(dataBrasileira[2]), Number(dataBrasileira[1]))

  return null
}

export function extractCompetenciaFromText(value: string | null | undefined): string | null {
  if (!value) return null

  const semanticValue = normalizarTexto(value)
  const candidates = [
    ...semanticValue.matchAll(/(?:^|\D)(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:\D|$)/g),
    ...semanticValue.matchAll(/(?:^|\D)(\d{1,2})\/(\d{4})(?:\D|$)/g),
  ]

  for (const match of candidates) {
    const before = semanticValue.slice(0, match.index)
    const segment = before.slice(Math.max(before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("|")) + 1)
    const hasAnchor = /(?:competencia|referente|referencia|vigencia|aluguel|locacao)\s*(?:de|do|da|a|:|-)?\s*$/.test(segment)
    if (!hasAnchor) continue
    const rentAnchor = Math.max(segment.lastIndexOf("aluguel"), segment.lastIndexOf("locacao"), segment.lastIndexOf("vigencia"))
    const nonRentAnchor = Math.max(
      segment.lastIndexOf("iptu"), segment.lastIndexOf("seguro"), segment.lastIndexOf("agua"),
      segment.lastIndexOf("esgoto"), segment.lastIndexOf("energia"), segment.lastIndexOf("taxa"),
      segment.lastIndexOf("comissao"), segment.lastIndexOf("despesa"),
    )
    if (nonRentAnchor >= 0 && rentAnchor <= nonRentAnchor) continue
    const isoOrder = match[1].length === 4
    const result = canonicalCompetencia(Number(isoOrder ? match[1] : match[2]), Number(isoOrder ? match[2] : match[1]))
    if (result) return result
  }

  const porExtenso = semanticValue.match(/(?:^|[.;|]\s*|(?:aluguel|locacao)\s+)(?:competencia|referente|referencia|vigencia)?\s*(?:de|do|da|a|:|-)?\s*(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})\b/)
  if (!porExtenso) return null
  return canonicalCompetencia(Number(porExtenso[2]), MESES[porExtenso[1]])
}

function normalizeDiaVencimento(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isInteger(value)) return null
  return value >= 1 && value <= 31 ? value : null
}

function legacyDiaVencimento(value: string | null | undefined): number | null {
  if (!value) return null
  const normalized = value.trim()
  if (/^\d{1,2}$/.test(normalized)) return normalizeDiaVencimento(Number(normalized))
  const brasileira = normalized.match(/^(\d{1,2})\/\d{1,2}\/\d{4}$/)
  if (brasileira) return normalizeDiaVencimento(Number(brasileira[1]))
  const iso = normalized.match(/^\d{4}-\d{1,2}-(\d{1,2})$/)
  return iso ? normalizeDiaVencimento(Number(iso[1])) : null
}

export function resolveReceitaCompetencias(
  row: ReceitaCompetenciaInput,
  competenciaFechamento: string | null | undefined,
): ReceitaCompetenciasResolvidas {
  const competenciaOriginal =
    normalizeCompetenciaMes(row.competencia_original) ??
    normalizeCompetenciaMes(row.vencimento) ??
    extractCompetenciaFromText(row.observacao)

  return {
    competencia_original: competenciaOriginal,
    competencia_recebimento:
      normalizeCompetenciaMes(row.competencia_recebimento) ?? normalizeCompetenciaMes(competenciaFechamento),
    dia_vencimento: normalizeDiaVencimento(row.dia_vencimento) ?? legacyDiaVencimento(row.vencimento),
  }
}

export function formatCompetenciaMes(value: string | null | undefined): string {
  const normalized = normalizeCompetenciaMes(value)
  if (!normalized) return "Não informada"
  const [ano, mes] = normalized.split("-")
  return `${mes}/${ano}`
}

export function competenciaMesToDatabase(value: string | null | undefined): string | null {
  const normalized = normalizeCompetenciaMes(value)
  return normalized ? `${normalized}-01` : null
}
