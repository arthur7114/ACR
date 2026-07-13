export interface IndicadoresQuery {
  competencia?: string
  empresaId?: string
  empreendimentoId?: string
  imovelId?: string
}

export class IndicadoresQueryValidationError extends Error {
  readonly statusCode = 400

  constructor(message = "Filtros de indicadores invalidos.") {
    super(message)
    this.name = "IndicadoresQueryValidationError"
  }
}

const ALLOWED_PARAMETERS = new Set([
  "competencia",
  "empresaId",
  "empreendimentoId",
  "imovelId",
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMPANY_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/

export function parseIndicadoresQuery(params: URLSearchParams): IndicadoresQuery {
  const result: IndicadoresQuery = {}

  for (const key of new Set(params.keys())) {
    if (!ALLOWED_PARAMETERS.has(key) || params.getAll(key).length !== 1) {
      throw new IndicadoresQueryValidationError()
    }
  }

  const competencia = params.get("competencia")
  if (competencia !== null) {
    if (!isValidCompetence(competencia)) throw new IndicadoresQueryValidationError()
    result.competencia = competencia
  }

  const empresaId = params.get("empresaId")
  if (empresaId !== null) {
    if (!COMPANY_TAG_PATTERN.test(empresaId)) throw new IndicadoresQueryValidationError()
    result.empresaId = empresaId
  }

  for (const key of ["empreendimentoId", "imovelId"] as const) {
    const value = params.get(key)
    if (value === null) continue
    if (!UUID_PATTERN.test(value)) throw new IndicadoresQueryValidationError()
    result[key] = value
  }

  return result
}

function isValidCompetence(value: string) {
  const match = /^(\d{4})-(\d{2})-01$/.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}
