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
import type { IndicadoresRevenueModel } from "@/lib/indicadores-types"
import type { createSupabaseAdmin } from "./supabase"

export const INDICADORES_SNAPSHOT_CALCULATION_VERSION = "indicadores-confiabilidade-v2"

export type IndicadoresSnapshotOrigin = "processamento" | "backfill"
export type IndicadoresSnapshotQuality = "completo" | "parcial" | "sem_linha"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>
type SnapshotAnalysis = Pick<PackageAnalysis, "prestacao">

export interface IndicadoresSnapshotProperty {
  id: string
  unit: string
  expectedRent: number | null
  revenueModel?: IndicadoresRevenueModel
  expectedRentSource?: string | null
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
  aluguel_esperado_origem: "cadastro" | "vigencia" | null
  aluguel_recebido: number | null
  aluguel_competencia?: number | null
  atrasos_recuperados?: number | null
  outros_recebimentos?: number | null
  entradas_passagem?: number | null
  saidas_passagem?: number | null
  receita_total: number | null
  desconto: number | null
  comissao_administracao: number | null
  repasse_apurado: number | null
  vencimento_referencia: string | null
  competencia_original?: string | null
  competencia_recebimento?: string | null
  dia_vencimento?: number | null
  modelo_receita?: IndicadoresRevenueModel
  status_mensal_explicito?: OccupancyStatus | null
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
const snapshotVigencyRowSchema = z.object({
  imovel_id: z.string(),
  modelo_receita: z.enum(["fixo", "variavel", "nao_aplicavel"]),
  aluguel_contratado: z.union([z.number(), z.string(), z.null()]),
  fonte: z.string(),
})

export function buildIndicadoresSnapshotRows(input: BuildIndicadoresSnapshotRowsInput) {
  const competencia = normalizeCompetence(input.competencia)
  const origem = input.origem ?? "processamento"
  const context = resolvePropertyContext(input)
  const lines = input.analysis.prestacao?.receitas_por_imovel ?? []
  const propertyByKey = indexProperties(input.properties, context)
  const solePropertyKey =
    input.properties.length === 1
      ? buildContextPropertyKey(context, input.properties[0].unit)
      : null
  const resolveLineKey = (line: ReceitaPorImovel) => {
    const extractedKey = buildContextPropertyKey(context, line.apto)
    if (
      propertyByKey.has(extractedKey) ||
      solePropertyKey === null ||
      !isUnambiguousSinglePropertyLine(line)
    ) {
      return extractedKey
    }
    return solePropertyKey
  }
  const lineGroups = groupLines(lines, resolveLineKey)
  const terminationKeys = buildTerminationKeys(input.analysis, context)
  const delinquencyKeys = buildDelinquencyKeys(input.analysis, context)
  const agreementGroups = groupAgreements(input.analysis, context)

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
        agreements: agreementGroups.get(propertyKey) ?? [],
      })
    })
    .sort((left, right) => left.imovel_id.localeCompare(right.imovel_id))

  const unlinkedLines = lines
    .map((line, lineIndex) => ({
      lineIndex,
      propertyKey: resolveLineKey(line),
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
  competencia?: string
}) {
  const competence = input.competencia
    ? normalizeCompetence(input.competencia)
    : null
  const vigencies = competence
    ? await loadSnapshotVigencies(input, competence)
    : []
  const vigencyByProperty = new Map(
    vigencies.map((vigency) => [vigency.imovel_id, vigency]),
  )
  let query = input.supabase
    .from("imoveis")
    .select(
      "id, unidade, valor_aluguel_esperado, imobiliarias ( nome ), empreendimentos ( nome )",
    )
    .eq("imobiliaria_id", input.imobiliariaId)
    .eq("empreendimento_id", input.empreendimentoId)
  query =
    vigencies.length > 0
      ? query.in("id", vigencies.map((vigency) => vigency.imovel_id))
      : query.eq("ativo", true)
  const { data, error } = await query.order("id")

  if (error) throw error

  return z.array(propertyRowSchema).parse(data ?? []).map((property) => {
    const vigency = vigencyByProperty.get(property.id)
    const revenueModel = vigency?.modelo_receita ?? "fixo"
    return {
      id: property.id,
      unit: property.unidade,
      expectedRent:
        revenueModel === "fixo"
          ? toNullableMoney(
              vigency?.aluguel_contratado ?? property.valor_aluguel_esperado,
            )
          : null,
      revenueModel,
      expectedRentSource: vigency ? "vigencia" : "cadastro",
      realEstateAgencyName: getRelationName(property.imobiliarias),
      developmentName: getRelationName(property.empreendimentos),
    }
  }) satisfies IndicadoresSnapshotProperty[]
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

async function loadSnapshotVigencies(
  input: {
    supabase: SupabaseAdmin
    imobiliariaId: string
    empreendimentoId: string
  },
  competence: string,
) {
  const { data, error } = await input.supabase
    .from("imovel_vigencias")
    .select("imovel_id, modelo_receita, aluguel_contratado, fonte")
    .eq("imobiliaria_id", input.imobiliariaId)
    .eq("empreendimento_id", input.empreendimentoId)
    .eq("ativo", true)
    .lte("vigencia_inicio", competence)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${competence}`)
    .order("imovel_id")
  if (error) {
    if (isMissingDatabaseObject(error)) return []
    throw error
  }
  return z.array(snapshotVigencyRowSchema).parse(data ?? [])
}

function isMissingDatabaseObject(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /does not exist|could not find|schema cache/i.test(error.message ?? "")
  )
}

export async function materializeIndicadoresSnapshots(
  input: MaterializeIndicadoresSnapshotsInput,
) {
  const properties = await loadActiveIndicadoresProperties({
    ...input,
    competencia: input.competencia,
  })
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
  agreements: NonNullable<SnapshotAnalysis["prestacao"]>["acordos_rescisoes_recebidos"]
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
  const originalCompetence = selectStableText(
    propertyLines.map((line) => normalizeOptionalCompetence(line.competencia_original)),
  )
  const receiptCompetence =
    selectStableText(
      propertyLines.map((line) => normalizeOptionalCompetence(line.competencia_recebimento)),
    ) ??
    (propertyLines.length > 0 || input.agreements.length > 0
      ? input.competencia
      : null)
  const currentRent = sumLineRent(
    propertyLines.filter((line) =>
      belongsToCurrentCompetence(line, input.competencia),
    ),
  )
  const recoveredFromLines = sumLineRent(
    propertyLines.filter((line) =>
      belongsToEarlierCompetence(line, input.competencia),
    ),
  )
  const recoveredFromAgreements = sumKnownMoney(
    input.agreements
      .filter((item) => item.tipo === "atraso")
      .map((item) => item.valor),
  )
  const recoveredLate = sumNullableMoney(recoveredFromLines, recoveredFromAgreements)
  const otherFromLines = sumKnownMoney(
    propertyLines.map((line) => {
      if (typeof line.outros_recebimentos === "number") return line.outros_recebimentos
      const rent = line.aluguel_com_desconto ?? line.aluguel ?? 0
      // `total` é receita econômica da linha. Movimentos de passagem vivem em
      // campos próprios e não devem ser somados ou subtraídos novamente aqui.
      return roundMoney(line.total - rent)
    }),
  )
  const otherFromAgreements = sumKnownMoney(
    input.agreements
      .filter((item) => item.tipo !== "atraso")
      .map((item) => item.valor),
  )
  const otherReceipts = sumNullableMoney(otherFromLines, otherFromAgreements)
  const passageEntries = sumKnownMoney(
    propertyLines.map((line) => line.entradas_passagem),
  )
  const passageExits = sumKnownMoney(
    propertyLines.map((line) => line.saidas_passagem),
  )
  const evidence = {
    tenantName,
    observation,
    rentReceived: currentRent,
    hasTermination:
      input.terminationKeys.has(input.propertyKey) || hasTerminationEvidence(evidenceText),
    hasDelinquency:
      input.delinquencyKeys.has(input.propertyKey) || hasDelinquencyEvidence(evidenceText),
    hasVacancy: hasVacancyEvidence(evidenceText),
    isVariableRevenue: (property.revenueModel ?? "fixo") === "variavel",
  }
  const status = classifyOccupancy(evidence)
  const revenueModel = property.revenueModel ?? "fixo"
  const expectedRent = revenueModel === "fixo" ? property.expectedRent : null
  const quality = resolveQuality(propertyLines.length, expectedRent, currentRent, revenueModel)
  const dayDue = selectStableNumber(propertyLines.map((line) => line.dia_vencimento))
  const statusExplicit =
    evidence.hasTermination || evidence.hasDelinquency || evidence.hasVacancy
  const withoutChecksum = {
    imovel_id: property.id,
    fechamento_id: input.fechamentoId,
    competencia: input.competencia,
    status_ocupacao: status,
    status_origem: resolveStatusOrigin(status, evidence, propertyLines.length),
    inquilino_nome: tenantName,
    aluguel_esperado: expectedRent,
    aluguel_esperado_origem:
      expectedRent === null
        ? null
        : property.expectedRentSource === "vigencia"
          ? ("vigencia" as const)
          : ("cadastro" as const),
    aluguel_recebido: sumNullableMoney(currentRent, recoveredLate),
    aluguel_competencia: currentRent,
    atrasos_recuperados: recoveredLate,
    outros_recebimentos: otherReceipts,
    entradas_passagem: passageEntries,
    saidas_passagem: passageExits,
    receita_total: amounts.revenueTotal,
    desconto: amounts.discount,
    comissao_administracao: amounts.administrationCommission,
    repasse_apurado: amounts.assessedTransfer,
    vencimento_referencia: selectStableText(propertyLines.map((line) => line.vencimento)),
    competencia_original: originalCompetence,
    competencia_recebimento: receiptCompetence,
    dia_vencimento: dayDue,
    modelo_receita: revenueModel,
    status_mensal_explicito: statusExplicit ? status : null,
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
  resolveKey: (line: ReceitaPorImovel) => string,
) {
  const groups = new Map<string, ReceitaPorImovel[]>()
  for (const line of lines) {
    const key = resolveKey(line)
    groups.set(key, [...(groups.get(key) ?? []), line])
  }
  return groups
}

function isUnambiguousSinglePropertyLine(line: ReceitaPorImovel) {
  const unit = cleanText(line.apto)
  if (unit === null) return true
  const tenant = cleanText(line.inquilino)
  return (
    tenant !== null &&
    normalizePropertyKeyPart(unit) === normalizePropertyKeyPart(tenant)
  )
}

function groupAgreements(
  analysis: SnapshotAnalysis,
  context: ReturnType<typeof resolvePropertyContext>,
) {
  const groups = new Map<
    string,
    NonNullable<SnapshotAnalysis["prestacao"]>["acordos_rescisoes_recebidos"]
  >()
  for (const item of analysis.prestacao?.acordos_rescisoes_recebidos ?? []) {
    const unit = cleanText(item.apto)
    if (!unit) continue
    const key = buildContextPropertyKey(context, unit)
    groups.set(key, [...(groups.get(key) ?? []), item])
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
  revenueModel: IndicadoresRevenueModel,
): IndicadoresSnapshotQuality {
  if (lineCount === 0) return "sem_linha"
  const hasContract = revenueModel !== "fixo" || expectedRent !== null
  return hasContract && receivedRent !== null ? "completo" : "parcial"
}

function resolveStatusOrigin(
  status: OccupancyStatus,
  evidence: Parameters<typeof classifyOccupancy>[0],
  lineCount: number,
) {
  if (status === "em_rescisao") return "prestacao_rescisao"
  if (status === "inadimplente") return "prestacao_inadimplencia"
  if (status === "vago") return "prestacao_vacancia"
  if (status === "ocupado") {
    // Ocupada sem linha só acontece pela receita variável do cadastro; a origem
    // precisa revelar que a evidência veio do cadastro, não da prestação.
    if (lineCount === 0) return "cadastro_receita_variavel"
    const context = normalizePropertyKeyPart(
      [evidence.tenantName, evidence.observation].filter(Boolean).join(" "),
    )
    return context.includes("airbnb") ? "prestacao_airbnb" : "prestacao_aluguel"
  }
  if (lineCount === 0) return "sem_linha"
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

function selectStableNumber(values: Array<number | null | undefined>) {
  const known = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  return known.length === 0 ? null : [...known].sort((left, right) => left - right)[0]
}

function sumLineRent(lines: ReceitaPorImovel[]) {
  return sumKnownMoney(lines.map((line) => line.aluguel_com_desconto ?? line.aluguel))
}

function sumKnownMoney(values: Array<number | null | undefined>) {
  const known = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  return known.length === 0
    ? null
    : roundMoney(known.reduce((total, value) => total + value, 0))
}

function sumNullableMoney(left: number | null, right: number | null) {
  if (left === null && right === null) return null
  return roundMoney((left ?? 0) + (right ?? 0))
}

function belongsToCurrentCompetence(line: ReceitaPorImovel, competence: string) {
  const original = normalizeOptionalCompetence(line.competencia_original)
  return original === null || original === competence
}

function belongsToEarlierCompetence(line: ReceitaPorImovel, competence: string) {
  const original = normalizeOptionalCompetence(line.competencia_original)
  return original !== null && original < competence
}

function normalizeOptionalCompetence(value: string | null | undefined) {
  const text = cleanText(value)
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (iso) return `${iso[1]}-${iso[2]}-01`
  const brazilian = text.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/)
  if (brazilian) return `${brazilian[2]}-${brazilian[1].padStart(2, "0")}-01`
  return null
}

export function createIndicadoresSnapshotChecksum(
  value: Omit<IndicadoresSnapshotRow, "checksum">,
) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
