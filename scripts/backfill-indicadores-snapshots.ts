import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { PackageAnalysis } from "../lib/prestacao-types"
import {
  buildIndicadoresSnapshotRows,
  createIndicadoresSnapshotChecksum,
  type IndicadoresSnapshotProperty,
  type IndicadoresSnapshotRow,
} from "../lib/server/indicadores-snapshots"

export const BACKFILL_ELIGIBLE_STATUSES = [
  "pendente_revisao",
  "processado_com_sucesso",
  "processado_com_alertas",
  "aprovado",
  "preparado_egestor",
  "lancado_egestor",
  "erro_egestor",
] as const

const ELIGIBLE_STATUS_SET = new Set<string>(BACKFILL_ELIGIBLE_STATUSES)
const SNAPSHOT_TABLE = "imovel_competencias" as const
const FINGERPRINT_PAGE_SIZE = 1_000
const SOURCE_FINGERPRINT_COLUMNS = {
  fechamentos:
    "id,status,arquivado,competencia,imobiliaria_id,empreendimento_id,analise_completa,atualizado_em",
  imoveis:
    "id,ativo,unidade,valor_aluguel_esperado,imobiliaria_id,empreendimento_id,atualizado_em",
} as const

export interface BackfillOptions {
  mode: "dry-run" | "commit"
  competence: string | null
  developmentId: string | null
}

export interface BackfillSnapshotCandidate {
  propertyId: string
  competence: string
  checksum: string
  row?: IndicadoresSnapshotRow
}

export interface BackfillClosure {
  id: string
  status: string
  archived: boolean
  analysisComplete: unknown | null
  competence: string
  developmentId: string
  snapshots: BackfillSnapshotCandidate[]
  expectedPropertyCount?: number
  matchedPropertyCount?: number
  unlinkedLines?: Array<{ propertyKey: string; unit: string }>
}

export interface ExistingSnapshot {
  propertyId: string
  competence: string
  checksum: string
  origin?: "processamento" | "backfill"
  contentChecksum?: string
}

export interface BackfillOperation {
  key: string
  kind: "insert" | "update" | "skip"
  checksum: string
  closureId: string
  snapshot: BackfillSnapshotCandidate
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  let mode: BackfillOptions["mode"] = "dry-run"
  let competence: string | null = null
  let developmentId: string | null = null
  const seen = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument || !["--commit", "--competencia", "--empreendimento"].includes(argument)) {
      throw new Error(`Argumento desconhecido: ${argument ?? ""}.`)
    }
    if (seen.has(argument)) throw new Error(`Argumento duplicado: ${argument}.`)
    seen.add(argument)

    if (argument === "--commit") {
      mode = "commit"
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${argument}.`)
    index += 1

    if (argument === "--competencia") competence = normalizeCompetence(value)
    if (argument === "--empreendimento") developmentId = parseUuid(value)
  }

  return { mode, competence, developmentId }
}

export function buildBackfillPlan(input: {
  options: BackfillOptions
  closures: BackfillClosure[]
  existingSnapshots: ExistingSnapshot[]
}) {
  const closures = input.closures.filter((closure) => isSelectedClosure(closure, input.options))
  const selectedClosureIds = closures.map((closure) => closure.id).sort()
  const candidates = indexCandidates(closures)
  const existing = indexExistingSnapshots(input.existingSnapshots)
  const operations = [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]): BackfillOperation => {
      const current = existing.get(key)
      const kind = resolveOperation(candidate.snapshot, current)
      return {
        key,
        kind,
        checksum:
          kind === "skip" && current?.origin === "processamento"
            ? current.checksum
            : candidate.snapshot.checksum,
        closureId: candidate.closureId,
        snapshot: candidate.snapshot,
      }
    })
  const executableWrites =
    input.options.mode === "commit"
      ? operations
          .filter((operation) => operation.kind !== "skip")
          .map((operation) => ({ ...operation, table: SNAPSHOT_TABLE }))
      : []

  return {
    mode: input.options.mode,
    selectedClosureIds,
    operations,
    executableWrites,
    touchedTables: executableWrites.length > 0 ? [SNAPSHOT_TABLE] : [],
    sourceTablesTouched: [] as string[],
    coverage: summarizeCoverage(closures),
    unlinkedLines: closures.flatMap((closure) =>
      (closure.unlinkedLines ?? []).map((line) => ({ closureId: closure.id, ...line })),
    ),
  }
}

function isSelectedClosure(closure: BackfillClosure, options: BackfillOptions) {
  if (closure.archived || !closure.analysisComplete || !ELIGIBLE_STATUS_SET.has(closure.status)) {
    return false
  }
  if (options.competence && normalizeCompetence(closure.competence) !== options.competence) {
    return false
  }
  return !options.developmentId || closure.developmentId === options.developmentId
}

function indexCandidates(closures: BackfillClosure[]) {
  const candidates = new Map<
    string,
    { closureId: string; snapshot: BackfillSnapshotCandidate }
  >()

  for (const closure of closures) {
    for (const snapshot of closure.snapshots) {
      const normalized = { ...snapshot, competence: normalizeCompetence(snapshot.competence) }
      const key = snapshotKey(normalized.propertyId, normalized.competence)
      if (candidates.has(key)) throw new Error(`Snapshot duplicado no plano: ${key}.`)
      candidates.set(key, { closureId: closure.id, snapshot: normalized })
    }
  }
  return candidates
}

function indexExistingSnapshots(snapshots: ExistingSnapshot[]) {
  const existing = new Map<string, ExistingSnapshot>()
  for (const snapshot of snapshots) {
    const normalized = { ...snapshot, competence: normalizeCompetence(snapshot.competence) }
    const key = snapshotKey(normalized.propertyId, normalized.competence)
    if (existing.has(key)) throw new Error(`Snapshot existente duplicado: ${key}.`)
    existing.set(key, normalized)
  }
  return existing
}

function resolveOperation(
  candidate: BackfillSnapshotCandidate,
  existing: ExistingSnapshot | undefined,
): BackfillOperation["kind"] {
  if (!existing) return "insert"
  if (existing.origin === "processamento") return "skip"
  return existing.checksum === candidate.checksum ? "skip" : "update"
}

function summarizeCoverage(closures: BackfillClosure[]) {
  const expected = closures.reduce((total, closure) => total + (closure.expectedPropertyCount ?? 0), 0)
  const matched = closures.reduce((total, closure) => total + (closure.matchedPropertyCount ?? 0), 0)
  return {
    expectedProperties: expected,
    matchedProperties: matched,
    percentage: expected === 0 ? 100 : roundPercentage((matched / expected) * 100),
  }
}

function snapshotKey(propertyId: string, competence: string) {
  if (!propertyId.trim()) throw new Error("Imovel ausente na chave do snapshot.")
  return `${propertyId}|${normalizeCompetence(competence)}`
}

function normalizeCompetence(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})(?:-01)?$/)
  if (!match) throw new Error(`Competencia invalida: ${value}.`)
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error(`Competencia invalida: ${value}.`)
  return `${match[1]}-${match[2]}-01`
}

function parseUuid(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`Empreendimento invalido: ${value}.`)
  }
  return normalized
}

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

interface DatabaseClosureRow {
  id: string
  status: string
  arquivado: boolean
  analise_completa: PackageAnalysis | null
  competencia: string
  imobiliaria_id: string
  empreendimento_id: string
  imobiliarias: unknown
  empreendimentos: unknown
}

interface DatabasePropertyRow {
  id: string
  unidade: string
  valor_aluguel_esperado: number | string | null
  imobiliaria_id: string
  empreendimento_id: string
  imobiliarias: unknown
  empreendimentos: unknown
}

interface DatabaseSnapshotRow {
  imovel_id: string
  fechamento_id: string
  competencia: string
  status_ocupacao: IndicadoresSnapshotRow["status_ocupacao"]
  status_origem: string
  inquilino_nome: string | null
  aluguel_esperado: number | string | null
  aluguel_esperado_origem: "cadastro" | null
  aluguel_recebido: number | string | null
  receita_total: number | string | null
  desconto: number | string | null
  comissao_administracao: number | string | null
  repasse_apurado: number | string | null
  vencimento_referencia: string | null
  quantidade_linhas: number
  origem: "processamento" | "backfill"
  qualidade: IndicadoresSnapshotRow["qualidade"]
  calculo_versao: string
  checksum: string
}

type SupabaseAdmin = ReturnType<typeof import("../lib/server/supabase")["createSupabaseAdmin"]>

export async function loadBackfillDataset(
  supabase: SupabaseAdmin,
  options: BackfillOptions,
) {
  const [closureResult, propertyResult, snapshotResult] = await Promise.all([
    loadClosures(supabase, options),
    loadProperties(supabase, options),
    loadExistingSnapshots(supabase, options),
  ])
  const propertiesByPair = groupProperties(propertyResult)
  const closures = closureResult.map((closure) =>
    buildClosureCandidate(closure, propertiesByPair.get(pairKey(closure.imobiliaria_id, closure.empreendimento_id)) ?? []),
  )

  return {
    closures,
    existingSnapshots: snapshotResult.map((snapshot) => ({
      propertyId: snapshot.imovel_id,
      competence: snapshot.competencia,
      checksum: snapshot.checksum,
      origin: snapshot.origem,
      contentChecksum: calculatePersistedSnapshotChecksum(snapshot),
    })),
  }
}

async function loadClosures(supabase: SupabaseAdmin, options: BackfillOptions) {
  let query = supabase
    .from("fechamentos")
    .select(
      "id,status,arquivado,analise_completa,competencia,imobiliaria_id,empreendimento_id,imobiliarias(nome),empreendimentos(nome)",
    )
    .eq("arquivado", false)
    .in("status", [...BACKFILL_ELIGIBLE_STATUSES])
    .not("analise_completa", "is", null)
    .order("competencia")
    .order("id")
  if (options.competence) query = query.eq("competencia", options.competence)
  if (options.developmentId) query = query.eq("empreendimento_id", options.developmentId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DatabaseClosureRow[]
}

async function loadProperties(supabase: SupabaseAdmin, options: BackfillOptions) {
  let query = supabase
    .from("imoveis")
    .select(
      "id,unidade,valor_aluguel_esperado,imobiliaria_id,empreendimento_id,imobiliarias(nome),empreendimentos(nome)",
    )
    .eq("ativo", true)
    .order("id")
  if (options.developmentId) query = query.eq("empreendimento_id", options.developmentId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DatabasePropertyRow[]
}

async function loadExistingSnapshots(supabase: SupabaseAdmin, options: BackfillOptions) {
  let query = supabase
    .from(SNAPSHOT_TABLE)
    .select(
      `imovel_id,fechamento_id,competencia,status_ocupacao,status_origem,inquilino_nome,
       aluguel_esperado,aluguel_esperado_origem,aluguel_recebido,receita_total,desconto,
       comissao_administracao,repasse_apurado,vencimento_referencia,quantidade_linhas,
       origem,qualidade,calculo_versao,checksum`,
    )
    .order("competencia")
    .order("imovel_id")
  if (options.competence) query = query.eq("competencia", options.competence)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DatabaseSnapshotRow[]
}

function groupProperties(rows: DatabasePropertyRow[]) {
  const groups = new Map<string, IndicadoresSnapshotProperty[]>()
  for (const property of rows) {
    const key = pairKey(property.imobiliaria_id, property.empreendimento_id)
    const mapped = {
      id: property.id,
      unit: property.unidade,
      expectedRent: nullableNumber(property.valor_aluguel_esperado),
      realEstateAgencyName: relationName(property.imobiliarias),
      developmentName: relationName(property.empreendimentos),
    }
    groups.set(key, [...(groups.get(key) ?? []), mapped])
  }
  return groups
}

function buildClosureCandidate(
  closure: DatabaseClosureRow,
  properties: IndicadoresSnapshotProperty[],
): BackfillClosure {
  if (!closure.analise_completa) {
    throw new Error(`Fechamento sem analise completa: ${closure.id}.`)
  }
  const result = buildIndicadoresSnapshotRows({
    properties,
    fechamentoId: closure.id,
    competencia: closure.competencia,
    analysis: closure.analise_completa as Pick<PackageAnalysis, "prestacao">,
    origem: "backfill",
    realEstateAgencyName: relationName(closure.imobiliarias),
    developmentName: relationName(closure.empreendimentos),
  })
  return {
    id: closure.id,
    status: closure.status,
    archived: closure.arquivado,
    analysisComplete: closure.analise_completa,
    competence: normalizeCompetence(closure.competencia),
    developmentId: closure.empreendimento_id,
    snapshots: result.rows.map((row) => ({
      propertyId: row.imovel_id,
      competence: row.competencia,
      checksum: row.checksum,
      row,
    })),
    expectedPropertyCount: result.expectedPropertyCount,
    matchedPropertyCount: result.matchedPropertyCount,
    unlinkedLines: result.unlinkedLines,
  }
}

function pairKey(agencyId: string, developmentId: string) {
  return `${agencyId}|${developmentId}`
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value
  const name = (relation as { nome?: unknown } | null)?.nome
  return typeof name === "string" && name.trim() ? name.trim() : null
}

function nullableNumber(value: number | string | null) {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Valor monetario invalido: ${value}.`)
  return parsed
}

function calculatePersistedSnapshotChecksum(snapshot: DatabaseSnapshotRow) {
  return createIndicadoresSnapshotChecksum({
    imovel_id: snapshot.imovel_id,
    fechamento_id: snapshot.fechamento_id,
    competencia: normalizeCompetence(snapshot.competencia),
    status_ocupacao: snapshot.status_ocupacao,
    status_origem: snapshot.status_origem,
    inquilino_nome: snapshot.inquilino_nome,
    aluguel_esperado: nullableNumber(snapshot.aluguel_esperado),
    aluguel_esperado_origem: snapshot.aluguel_esperado_origem,
    aluguel_recebido: nullableNumber(snapshot.aluguel_recebido),
    receita_total: nullableNumber(snapshot.receita_total),
    desconto: nullableNumber(snapshot.desconto),
    comissao_administracao: nullableNumber(snapshot.comissao_administracao),
    repasse_apurado: nullableNumber(snapshot.repasse_apurado),
    vencimento_referencia: snapshot.vencimento_referencia,
    quantidade_linhas: snapshot.quantidade_linhas,
    origem: snapshot.origem,
    qualidade: snapshot.qualidade,
    calculo_versao: snapshot.calculo_versao,
  })
}

async function executePlan(supabase: SupabaseAdmin, plan: ReturnType<typeof buildBackfillPlan>) {
  const rows = plan.executableWrites.map((write) => {
    if (!write.snapshot.row) throw new Error(`Snapshot sem linha persistivel: ${write.key}.`)
    return write.snapshot.row
  })
  if (rows.length === 0) return

  const { error } = await supabase
    .from(SNAPSHOT_TABLE)
    .upsert(rows, { onConflict: "imovel_id,competencia" })
  if (error) throw error
}

export async function readSourceFingerprints(supabase: SupabaseAdmin) {
  const [closures, properties] = await Promise.all([
    readFingerprint(supabase, "fechamentos"),
    readFingerprint(supabase, "imoveis"),
  ])
  return { fechamentos: closures, imoveis: properties }
}

async function readFingerprint(supabase: SupabaseAdmin, table: "fechamentos" | "imoveis") {
  const rows: unknown[] = []
  let count = 0
  for (let from = 0; ; from += FINGERPRINT_PAGE_SIZE) {
    const { data, error, count: exactCount } = await supabase
      .from(table)
      .select(SOURCE_FINGERPRINT_COLUMNS[table], { count: from === 0 ? "exact" : undefined })
      .order("id")
      .range(from, from + FINGERPRINT_PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    if (from === 0) count = exactCount ?? page.length
    rows.push(...page)
    if (page.length < FINGERPRINT_PAGE_SIZE) break
  }
  return {
    count,
    checksum: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  }
}

function loadEnvLocal() {
  const filePath = join(process.cwd(), ".env.local")
  if (!existsSync(filePath)) return
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2))
  loadEnvLocal()
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const sourceBefore = await readSourceFingerprints(supabase)
  const dataset = await loadBackfillDataset(supabase, options)
  const plan = buildBackfillPlan({ options, ...dataset })
  await executePlan(supabase, plan)
  const sourceAfter = await readSourceFingerprints(supabase)
  const sourceTablesUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)

  console.log(
    JSON.stringify(
      {
        mode: plan.mode,
        closures: plan.selectedClosureIds.length,
        operations: countOperations(plan.operations),
        coverage: plan.coverage,
        unlinkedLines: plan.unlinkedLines,
        sourceTablesUnchanged,
      },
      null,
      2,
    ),
  )
  if (!sourceTablesUnchanged) process.exitCode = 1
}

function countOperations(operations: BackfillOperation[]) {
  return operations.reduce(
    (counts, operation) => ({ ...counts, [operation.kind]: counts[operation.kind] + 1 }),
    { insert: 0, update: 0, skip: 0 },
  )
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
