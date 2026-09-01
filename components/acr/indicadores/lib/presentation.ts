import type {
  IndicadoresAccumulatedCoverage,
  IndicadoresData,
  IndicadoresHeatRow,
} from "@/lib/indicadores-types"

export type DashboardMetric = "valor" | "percentual"
export type HeatMetric = "inad" | "vac"
export type DashboardTab = "geral" | "receita" | "mapa" | "imoveis"
export type MonthlySeriesPeriod = "3" | "6" | "12" | "custom"
export type ConfidenceStatus = "confirmado" | "em_conferencia" | "incompleto" | "com_divergencia"

export type MonthlyPoint = IndicadoresData["serieMensal"][number]
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

export function filterMonthlySeriesPeriod<T extends { competencia: string }>(
  series: T[],
  period: MonthlySeriesPeriod,
  customRange?: { start: string; end: string },
): T[] {
  if (period !== "custom") return series.slice(-Number(period))
  if (!customRange) return series
  return series.filter(
    (point) => point.competencia >= customRange.start && point.competencia <= customRange.end,
  )
}

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

// Rótulo de eixo: o valor cheio não cabe repetido numa escala vertical, e a
// grandeza é o que importa ali — o valor exato vive no ponto da série.
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${NUMBER_FORMATTER.format(value / 1_000_000)} mi`
  if (abs >= 1_000) return `${NUMBER_FORMATTER.format(value / 1_000)} mil`
  return NUMBER_FORMATTER.format(value)
}

export function confidenceLabel(status: ConfidenceStatus): string {
  const labels: Record<ConfidenceStatus, string> = {
    confirmado: "Confirmado",
    em_conferencia: "Em conferência",
    incompleto: "Incompleto",
    com_divergencia: "Com divergência",
  }
  return labels[status]
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

// Nota da barra "Hoje": em quantas unidades a posição cadastral discorda da
// competência exibida. Sem ela, as duas barras parecem medir a mesma coisa em
// dois momentos e a diferença lê-se como erro de cálculo — foi exatamente a
// leitura relatada em julho/2026 (87,2% no mês, 94,1% no cadastro).
export function formatDivergenciaCadastro(divergencias: number | null): string | null {
  if (divergencias === null || divergencias === 0) return null
  return divergencias === 1
    ? "1 imóvel com situação diferente da competência exibida"
    : `${divergencias} imóveis com situação diferente da competência exibida`
}

// CA-IND21: "Hoje" é posição cadastral, não a competência selecionada. O rótulo
// declara a natureza e a data/hora da última sincronização DO CADASTRO — nunca a
// data de outra tabela, que faria uma posição antiga parecer atual.
export function formatHojeSincronizado(atualizadoEm: string | null): string {
  const quando = formatDateTime(atualizadoEm)
  return quando === "—"
    ? "Hoje — posição do cadastro"
    : `Hoje — cadastro sincronizado em ${quando}`
}

// Cobertura da inadimplência acumulada. Só aparece quando o número NÃO fala
// pelo escopo inteiro: parcial, porque parte dos fechamentos não traz a seção de
// dívidas; ou derivada do histórico do sistema, quando nenhum documento a traz.
// Sem esta nota, um parcial se leria como total — foi o que motivou trocar o
// "—" pelo valor declarado (jul/2026: R$ 56.199,25 em 5 de 8 fechamentos).
export function formatAcumuladaCobertura(
  cobertura: IndicadoresAccumulatedCoverage | null,
): string | null {
  if (!cobertura) return null
  if (cobertura.origem === "historico") return "derivada do histórico do sistema"
  if (cobertura.declarados >= cobertura.total) return null
  return `${cobertura.declarados} de ${cobertura.total} fechamentos com a seção de dívidas`
}

// CA-IND23/P0.4: nota exibida junto das linhas de vacância/inadimplência
// quando a cobrança esperada (aluguel + garagem contratada) difere da base do
// aluguel usada na equação. Nunca aparece quando as bases coincidem.
export function notaCobrancaEsperada(
  financeira: number | null | undefined,
  base: number | null | undefined,
): string | null {
  if (typeof financeira !== "number" || typeof base !== "number") return null
  if (Math.abs(financeira - base) <= 0.01) return null
  return `Pela cobrança esperada (aluguel + garagem): ${formatCurrency(financeira)}`
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

export type VerdictTone = "positive" | "warning" | "danger" | "neutral"

export interface ConferenceVerdict {
  label: string
  tone: VerdictTone
}

// O veredito só é honesto entre iguais: compara-se o repasse dos fechamentos que
// TÊM comprovante contra o que o banco confirmou. Medir o calculado total contra
// o comprovado transformaria comprovante ausente em divergência — falso alarme
// numa tela cujo trabalho é dizer se o mês pode ser confiado. Quando ainda falta
// comprovante, "confere" é verdadeiro mas não é final: fica neutro, nunca verde.
function roundMoneyValue(value: number) {
  return Math.round(value * 100) / 100
}

export function describeConference(input: {
  comprovado: number | null
  banco: number | null
  comprovantes: { presentes: number; ausentes: number; esperados: number }
  status: ConfidenceStatus
}): ConferenceVerdict {
  const { comprovado, banco, comprovantes, status } = input

  if (comprovado !== null && banco !== null) {
    // Arredonda ANTES de comparar. O delta de jul/2026 era 0,010000000002 — um
    // centavo exato representado em binário — e passava no `> 0.01`, acendendo
    // "Difere do banco em R$ 0,01" para uma diferença que a própria tolerância
    // do projeto considera conciliada (a ponte financeira, que arredonda, dava
    // `reconciliada: true` no mesmo mês). Alarme de centavo gasta a atenção que
    // a tela precisa guardar para divergência de verdade.
    const delta = roundMoneyValue(Math.abs(comprovado - banco))
    if (delta > 0.01) return { label: `Difere do banco em ${formatCurrency(delta)}`, tone: "danger" }
    return { label: "Confere com o banco", tone: comprovantes.ausentes === 0 ? "positive" : "neutral" }
  }
  if (status === "confirmado") return { label: confidenceLabel(status), tone: "positive" }
  if (status === "com_divergencia") return { label: confidenceLabel(status), tone: "danger" }
  if (status === "incompleto") return { label: confidenceLabel(status), tone: "warning" }
  return { label: confidenceLabel(status), tone: "neutral" }
}

export interface HeatGroupCell {
  competencia: string
  unidadesEmRisco: number
  unidadesComDado: number
  valor: number | null
  /** Share das unidades com dado que estão em risco; alimenta a cor da célula. */
  percentual: number | null
}

export interface HeatGroup {
  empreendimentoId: string
  empreendimentoNome: string
  linhas: IndicadoresHeatRow[]
  celulas: HeatGroupCell[]
}

// D27: uma linha por unidade tornava o mapa uma rolagem interminável. O default
// passa a ser por empreendimento, e a unidade vive dentro dele. O agregado NÃO
// é média de percentual (média de percentual mente quando as unidades têm
// aluguéis diferentes): é quantas unidades estão em risco entre as que têm
// dado, mais a soma do valor. Unidade sem dado no mês não entra no denominador,
// então mês sem informação nunca vira "0% de risco".
export function buildHeatGroups(input: {
  meses: Array<{ competencia: string; label: string }>
  linhas: IndicadoresHeatRow[]
  metric: HeatMetric
}): HeatGroup[] {
  const riskStatus: OccupancyStatus = input.metric === "inad" ? "inadimplente" : "vago"
  const groups = new Map<string, IndicadoresHeatRow[]>()

  for (const row of input.linhas) {
    const existing = groups.get(row.empreendimentoId)
    if (existing) existing.push(row)
    else groups.set(row.empreendimentoId, [row])
  }

  const result: HeatGroup[] = []

  for (const [empreendimentoId, linhas] of groups) {
    const celulas = input.meses.map((month) => {
      const cells = linhas
        .map((row) => row.celulas.find((cell) => cell.competencia === month.competencia) ?? null)
        .filter((cell): cell is NonNullable<typeof cell> => cell !== null && cell.statusOcupacao !== null)
      const emRisco = cells.filter((cell) => cell.statusOcupacao === riskStatus)
      const valores = emRisco.map((cell) => cell.valor)

      return {
        competencia: month.competencia,
        unidadesEmRisco: emRisco.length,
        unidadesComDado: cells.length,
        valor: valores.length === 0 ? null : sumKnownValues(valores),
        percentual: cells.length === 0 ? null : (emRisco.length / cells.length) * 100,
      }
    })

    result.push({
      empreendimentoId,
      empreendimentoNome: linhas[0].empreendimentoNome,
      linhas: [...linhas].sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true })),
      celulas,
    })
  }

  return result.sort((a, b) => a.empreendimentoNome.localeCompare(b.empreendimentoNome, "pt-BR"))
}

export function occupancyLabel(status: OccupancyStatus): string {
  const labels: Record<OccupancyStatus, string> = {
    ocupado: "Ocupado",
    alugado_app: "Alugado por app",
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

// A conta escrita fecha a leitura do gráfico: as quatro linhas mostram a forma,
// e a identidade diz que a distância entre o teto e o recebido é exatamente a
// soma das perdas do mês. Mesma identidade da tela de referência.
export function realizationIdentity(point: MonthlyPoint): string | null {
  const { aluguelContratado, aluguelRecebido, vacancia, inadimplencia } = point
  if (aluguelContratado === null || aluguelRecebido === null) return null
  if (vacancia === null || inadimplencia === null) return null
  const descontos = point.descontos ?? 0
  const ajustes = point.outrosAjustes ?? 0
  const partes = [
    `contratado ${formatCurrency(aluguelContratado)}`,
    `− vacância ${formatCurrency(vacancia)}`,
    `− inadimplência ${formatCurrency(inadimplencia)}`,
  ]
  if (descontos !== 0) partes.push(`− descontos ${formatCurrency(descontos)}`)
  if (ajustes !== 0) partes.push(`${ajustes < 0 ? "−" : "+"} ajustes ${formatCurrency(Math.abs(ajustes))}`)
  return `${partes.join(" ")} = recebido ${formatCurrency(aluguelRecebido)}`
}

// Reatribuição por competência de origem: já não entra no valor plotado (o valor
// é o que o fechamento declara), então aparece como nota. Sem ela, o dinheiro que
// mudou de mês desapareceria da leitura.
export function reallocationNote(point: MonthlyPoint): string | null {
  const ajuste = point.competenciaAjusteAluguel
  if (!ajuste) return null
  return ajuste > 0
    ? `${formatCurrency(ajuste)} de aluguel desta competência foram recebidos em outros meses.`
    : `${formatCurrency(Math.abs(ajuste))} recebidos neste mês pertencem a competências anteriores.`
}
