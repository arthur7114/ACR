import { createHash } from "node:crypto"
import { z } from "zod"
import {
  aggregateSnapshotLines,
  buildPropertyKey,
  classifyOccupancy,
  normalizePropertyKeyPart,
  roundMoney,
  type OccupancyStatus,
} from "@/lib/indicadores-domain"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"
import type { createSupabaseAdmin } from "./supabase"

export const INDICADORES_SNAPSHOT_CALCULATION_VERSION = "indicadores-operacionais-v1"

export type IndicadoresSnapshotOrigin = "processamento" | "backfill"
export type IndicadoresSnapshotQuality = "completo" | "parcial" | "sem_linha"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>
type SnapshotAnalysis = Pick<PackageAnalysis, "prestacao">

export interface IndicadoresSnapshotProperty {
  id: string
  unit: string
  expectedRent: number | null
  realEstateAgencyName: string | null
  developmentName: string | null
}

export interface IndicadoresSnapshotRow {
  imovel_id: string
  fechamento_id: string
  competencia: string
  status_ocupacao: OccupancyStatus
  status_origem: string
  inquilino_nome: string | null
  aluguel_esperado: number | null
  aluguel_esperado_origem: "cadastro" | null
  aluguel_recebido: number | null
  receita_total: number | null
  desconto: number | null
  comissao_administracao: number | null
  repasse_apurado: number | null
  vencimento_referencia: string | null
  quantidade_linhas: number
  origem: IndicadoresSnapshotOrigin
  qualidade: IndicadoresSnapshotQuality
  calculo_versao: string
  checksum: string
}

export interface IndicadoresUnlinkedLine {
  lineIndex: number
  propertyKey: string
  unit: string
  tenantName: string | null
}

export interface BuildIndicadoresSnapshotRowsInput {
  properties: IndicadoresSnapshotProperty[]
  fechamentoId: string
  competencia: string
  analysis: SnapshotAnalysis
  origem?: IndicadoresSnapshotOrigin
  realEstateAgencyName?: string | null
  developmentName?: string | null
}

export interface MaterializeIndicadoresSnapshotsInput {
  supabase: SupabaseAdmin
  fechamentoId: string
  imobiliariaId: string
  empreendimentoId: string
  competencia: string
  analysis: SnapshotAnalysis
  origem?: IndicadoresSnapshotOrigin
}

const relationSchema = z
  .union([
    z.object({ nome: z.string() }),
    z.array(z.object({ nome: z.string() })),
    z.null(),
  ])
  .optional()

const propertyRowSchema = z.object({
  id: z.string().min(1),
  unidade: z.string(),
  valor_aluguel_esperado: z.union([z.number(), z.string(), z.null()]),
  imobiliarias: relationSchema,
  empreendimentos: relationSchema,
})

export function buildIndicadoresSnapshotRows(input: BuildIndicadoresSnapshotRowsInput) {
  const competencia = normalizeCompetence(input.competencia)
  const origem = input.origem ?? "processamento"
  const context = resolvePropertyContext(input)
  const lines = input.analysis.prestacao?.receitas_por_imovel ?? []
  const lineGroups = groupLines(lines, context)
  const propertyByKey = indexProperties(input.properties, context)
  const terminationKeys = buildTerminationKeys(input.analysis, context)
  const delinquencyKeys = buildDelinquencyKeys(input.analysis, context)

  const rows = input.properties
    .map((property) => {
      const propertyKey = buildContextPropertyKey(context, property.unit)
      const propertyLines = lineGroups.get(propertyKey) ?? []
      return buildSnapshotRow({
        property,
        propertyLines,
        propertyKey,
        fechamentoId: input.fechamentoId,
        competencia,
        origem,
        terminationKeys,
        delinquencyKeys,
      })
    })
    .sort((left, right) => left.imovel_id.localeCompare(right.imovel_id))

  const unlinkedLines = lines
    .map((line, lineIndex) => ({
      lineIndex,
      propertyKey: buildContextPropertyKey(context, line.apto),
      unit: line.apto,
      tenantName: cleanText(line.inquilino),
    }))
    .filter((line) => !propertyByKey.has(line.propertyKey))
    .sort((left, right) => left.propertyKey.localeCompare(right.propertyKey) || left.lineIndex - right.lineIndex)

  return {
    rows,
    unlinkedLines,
    expectedPropertyCount: input.properties.length,
    matchedPropertyCount: rows.filter((row) => row.quantidade_linhas > 0).length,
    linkedLineCount: lines.length - unlinkedLines.length,
    unlinkedLineCount: unlinkedLines.length,
  }
}

export async function loadActiveIndicadoresProperties(input: {
  supabase: SupabaseAdmin
  imobiliariaId: string
  empreendimentoId: string
}) {
  const { data, error } = await input.supabase
    .from("imoveis")
    .select(
      "id, unidade, valor_aluguel_esperado, imobiliarias ( nome ), empreendimentos ( nome )",
    )
    .eq("imobiliaria_id", input.imobiliariaId)
    .eq("empreendimento_id", input.empreendimentoId)
    .eq("ativo", true)
    .order("id")

  if (error) throw error

  return z.array(propertyRowSchema).parse(data ?? []).map((property) => ({
    id: property.id,
    unit: property.unidade,
    expectedRent: toNullableMoney(property.valor_aluguel_esperado),
    realEstateAgencyName: getRelationName(property.imobiliarias),
    developmentName: getRelationName(property.empreendimentos),
  })) satisfies IndicadoresSnapshotProperty[]
}

export async function upsertIndicadoresSnapshotRows(
  supabase: SupabaseAdmin,
  rows: IndicadoresSnapshotRow[],
) {
  if (rows.length === 0) return

  const { error } = await supabase
    .from("imovel_competencias")
    .upsert(rows, { onConflict: "imovel_id,competencia" })

  if (error) throw error
}

export async function materializeIndicadoresSnapshots(
  input: MaterializeIndicadoresSnapshotsInput,
) {
  const properties = await loadActiveIndicadoresProperties(input)
  const result = buildIndicadoresSnapshotRows({
    properties,
    fechamentoId: input.fechamentoId,
    competencia: input.competencia,
    analysis: input.analysis,
    origem: input.origem,
  })

  await upsertIndicadoresSnapshotRows(input.supabase, result.rows)

  return {
    ...result,
    snapshotsUpserted: result.rows.length,
  }
}

function buildSnapshotRow(input: {
  property: IndicadoresSnapshotProperty
  propertyLines: ReceitaPorImovel[]
  propertyKey: string
  fechamentoId: string
  competencia: string
  origem: IndicadoresSnapshotOrigin
  terminationKeys: Set<string>
  delinquencyKeys: Set<string>
}) {
  const { property, propertyLines } = input
  const amounts = aggregateSnapshotLines(
    propertyLines.map((line) => ({
      rent: line.aluguel,
      discountedRent: line.aluguel_com_desconto,
      revenueTotal: line.total,
      discount: line.desconto,
      administrationCommission: line.comissao,
      assessedTransfer: line.repasse,
    })),
  )
  const observation = joinKnownText(propertyLines.map((line) => line.observacao))
  const tenantName = selectStableText(propertyLines.map((line) => line.inquilino))
  const evidenceText = joinKnownText([tenantName, observation])
  const evidence = {
    tenantName,
    observation,
    rentReceived: amounts.rentReceived,
    hasTermination:
      input.terminationKeys.has(input.propertyKey) || hasTerminationEvidence(evidenceText),
    hasDelinquency:
      input.delinquencyKeys.has(input.propertyKey) || hasDelinquencyEvidence(evidenceText),
    hasVacancy: hasVacancyEvidence(evidenceText),
  }
  const status = classifyOccupancy(evidence)
  const expectedRent = property.expectedRent
  const quality = resolveQuality(propertyLines.length, expectedRent, amounts.rentReceived)
  const withoutChecksum = {
    imovel_id: property.id,
    fechamento_id: input.fechamentoId,
    competencia: input.competencia,
    status_ocupacao: status,
    status_origem: resolveStatusOrigin(status, evidence, propertyLines.length),
    inquilino_nome: tenantName,
    aluguel_esperado: expectedRent,
    aluguel_esperado_origem: expectedRent === null ? null : ("cadastro" as const),
    aluguel_recebido: amounts.rentReceived,
    receita_total: amounts.revenueTotal,
    desconto: amounts.discount,
    comissao_administracao: amounts.administrationCommission,
    repasse_apurado: amounts.assessedTransfer,
    vencimento_referencia: selectStableText(propertyLines.map((line) => line.vencimento)),
    quantidade_linhas: propertyLines.length,
    origem: input.origem,
    qualidade: quality,
    calculo_versao: INDICADORES_SNAPSHOT_CALCULATION_VERSION,
  }

  return {
    ...withoutChecksum,
    checksum: createIndicadoresSnapshotChecksum(withoutChecksum),
  } satisfies IndicadoresSnapshotRow
}

function resolvePropertyContext(input: BuildIndicadoresSnapshotRowsInput) {
  const firstProperty = input.properties[0]
  const firstAgencyName = input.properties
    .map((property) => cleanText(property.realEstateAgencyName))
    .find((name) => name !== null)
  const firstDevelopmentName = input.properties
    .map((property) => cleanText(property.developmentName))
    .find((name) => name !== null)
  const realEstateAgencyName =
    cleanText(input.analysis.prestacao?.imobiliaria) ??
    cleanText(input.realEstateAgencyName) ??
    firstAgencyName ??
    cleanText(firstProperty?.realEstateAgencyName)
  const developmentName =
    cleanText(input.analysis.prestacao?.empreendimento) ??
    cleanText(input.developmentName) ??
    firstDevelopmentName ??
    cleanText(firstProperty?.developmentName)

  if ((!realEstateAgencyName || !developmentName) && hasSnapshotSourceData(input)) {
    throw new Error("Imobiliaria e empreendimento sao obrigatorios para vincular snapshots.")
  }

  return {
    realEstateAgencyName: realEstateAgencyName ?? "",
    developmentName: developmentName ?? "",
  }
}

function hasSnapshotSourceData(input: BuildIndicadoresSnapshotRowsInput) {
  return input.properties.length > 0 || (input.analysis.prestacao?.receitas_por_imovel.length ?? 0) > 0
}

function indexProperties(
  properties: IndicadoresSnapshotProperty[],
  context: ReturnType<typeof resolvePropertyContext>,
) {
  const result = new Map<string, IndicadoresSnapshotProperty>()
  for (const property of properties) {
    const key = buildContextPropertyKey(context, property.unit)
    if (result.has(key)) throw new Error(`Imovel duplicado na chave normalizada: ${key}.`)
    result.set(key, property)
  }
  return result
}

function groupLines(
  lines: ReceitaPorImovel[],
  context: ReturnType<typeof resolvePropertyContext>,
) {
  const groups = new Map<string, ReceitaPorImovel[]>()
  for (const line of lines) {
    const key = buildContextPropertyKey(context, line.apto)
    groups.set(key, [...(groups.get(key) ?? []), line])
  }
  return groups
}

function buildTerminationKeys(
  analysis: SnapshotAnalysis,
  context: ReturnType<typeof resolvePropertyContext>,
) {
  return new Set(
    (analysis.prestacao?.acordos_rescisoes_recebidos ?? [])
      .filter((item) => item.tipo === "rescisao" && cleanText(item.apto))
      .map((item) => buildContextPropertyKey(context, item.apto!)),
  )
}

function buildDelinquencyKeys(
  analysis: SnapshotAnalysis,
  context: ReturnType<typeof resolvePropertyContext>,
) {
  return new Set(
    (analysis.prestacao?.inadimplencias_acumuladas ?? [])
      .filter((item) => cleanText(item.apto))
      .map((item) => buildContextPropertyKey(context, item.apto!)),
  )
}

function buildContextPropertyKey(
  context: ReturnType<typeof resolvePropertyContext>,
  unit: string,
) {
  return buildPropertyKey({
    realEstateAgency: context.realEstateAgencyName,
    development: context.developmentName,
    unit,
  })
}

function resolveQuality(
  lineCount: number,
  expectedRent: number | null,
  receivedRent: number | null,
): IndicadoresSnapshotQuality {
  if (lineCount === 0) return "sem_linha"
  return expectedRent !== null && receivedRent !== null ? "completo" : "parcial"
}

function resolveStatusOrigin(
  status: OccupancyStatus,
  evidence: Parameters<typeof classifyOccupancy>[0],
  lineCount: number,
) {
  if (lineCount === 0) return "sem_linha"
  if (status === "em_rescisao") return "prestacao_rescisao"
  if (status === "inadimplente") return "prestacao_inadimplencia"
  if (status === "vago") return "prestacao_vacancia"
  if (status === "ocupado") {
    const context = normalizePropertyKeyPart(
      [evidence.tenantName, evidence.observation].filter(Boolean).join(" "),
    )
    return context.includes("airbnb") ? "prestacao_airbnb" : "prestacao_aluguel"
  }
  return "prestacao_sem_evidencia"
}

function hasTerminationEvidence(value: string | null) {
  const normalized = normalizePropertyKeyPart(value ?? "")
  return /\brescisao\b|\brescind|\bencerramento (?:do|de) contrato\b/.test(normalized)
}

function hasDelinquencyEvidence(value: string | null) {
  const normalized = normalizePropertyKeyPart(value ?? "")
  return /\binadimpl|\bem atraso\b|\baluguel atrasad|\bsem pagamento\b|\bnao pago\b/.test(
    normalized,
  )
}

function hasVacancyEvidence(value: string | null) {
  const normalized = normalizePropertyKeyPart(value ?? "")
  return /\bvago\b|\bdesocupad|\bvacancia\b|\bsem inquilino\b/.test(normalized)
}

function normalizeCompetence(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (!match) throw new Error(`Competencia invalida para snapshot: ${value}.`)
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error(`Competencia invalida para snapshot: ${value}.`)
  return `${match[1]}-${match[2]}-01`
}

function toNullableMoney(value: number | string | null) {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Valor monetario invalido no cadastro: ${value}.`)
  return roundMoney(parsed)
}

function getRelationName(value: z.infer<typeof relationSchema>) {
  if (!value) return null
  const relation = Array.isArray(value) ? value[0] : value
  return cleanText(relation?.nome)
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function selectStableText(values: Array<string | null | undefined>) {
  return values
    .map(cleanText)
    .filter((value): value is string => value !== null)
    .sort((left, right) => {
      const normalizedOrder = normalizePropertyKeyPart(left).localeCompare(
        normalizePropertyKeyPart(right),
      )
      return normalizedOrder || left.localeCompare(right)
    })[0] ?? null
}

function joinKnownText(values: Array<string | null | undefined>) {
  const known = values.map(cleanText).filter((value): value is string => value !== null)
  return known.length === 0 ? null : known.sort().join(" | ")
}

export function createIndicadoresSnapshotChecksum(
  value: Omit<IndicadoresSnapshotRow, "checksum">,
) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
