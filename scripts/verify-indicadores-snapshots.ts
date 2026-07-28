import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { roundMoney } from "../lib/indicadores-domain"
import type { PackageAnalysis } from "../lib/prestacao-types"
import {
  buildBackfillPlan,
  loadBackfillDataset,
  parseBackfillArgs,
  readSourceFingerprints,
} from "./backfill-indicadores-snapshots"

const FINANCIAL_TOLERANCE = 0.01

interface SnapshotKeyInput {
  propertyId: string
  competence: string
}

interface SnapshotVerificationInput extends SnapshotKeyInput {
  id: string
  checksum: string | null
  expectedChecksum?: string | null
}

interface ReconciliationInput {
  closureId: string
  totalRevenue: number
  passageEntries?: number
  administrationCommission: number
  retainedExpenses: number
  intermediationCommission: number
  tariffs?: number
  passageExits?: number
  assessedTransfer: number
}

interface SourceFingerprint {
  count: number
  checksum: string
}

interface SourceFingerprints {
  before: Record<string, SourceFingerprint>
  after: Record<string, SourceFingerprint>
}

export function verifyIndicadoresSnapshots(input: {
  expectedProperties: SnapshotKeyInput[]
  snapshots: SnapshotVerificationInput[]
  reconciliations: ReconciliationInput[]
  sourceFingerprints?: SourceFingerprints
}) {
  const expectedKeys = new Set(input.expectedProperties.map(toKey))
  const snapshotCounts = countByKey(input.snapshots)
  const availableKeys = new Set(
    [...snapshotCounts.keys()].filter((key) => expectedKeys.has(key)),
  )
  const missingKeys = [...expectedKeys].filter((key) => !availableKeys.has(key)).sort()
  const duplicateKeys = [...snapshotCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort()
  const invalidChecksumKeys = [
    ...new Set(
      input.snapshots
        .filter(
          (snapshot) =>
            !snapshot.checksum ||
            !snapshot.expectedChecksum ||
            snapshot.checksum !== snapshot.expectedChecksum,
        )
        .map(toKey),
    ),
  ].sort()
  const reconciliationFailures = input.reconciliations
    .map((reconciliation) => ({
      closureId: reconciliation.closureId,
      residual: financialResidual(reconciliation),
    }))
    .filter(({ residual }) => Math.abs(residual) > FINANCIAL_TOLERANCE)
  const sources = compareSourceFingerprints(input.sourceFingerprints)
  const coverage = {
    expected: expectedKeys.size,
    available: availableKeys.size,
    percentage:
      expectedKeys.size === 0
        ? 100
        : roundPercentage((availableKeys.size / expectedKeys.size) * 100),
    missingKeys,
  }

  return {
    ok:
      missingKeys.length === 0 &&
      duplicateKeys.length === 0 &&
      invalidChecksumKeys.length === 0 &&
      reconciliationFailures.length === 0 &&
      sources.unchanged,
    coverage,
    duplicates: { count: duplicateKeys.length, keys: duplicateKeys },
    checksums: { checked: input.snapshots.length, invalidKeys: invalidChecksumKeys },
    reconciliation: {
      checked: input.reconciliations.length,
      failures: reconciliationFailures,
    },
    sources,
  }
}

function countByKey(values: SnapshotKeyInput[]) {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = toKey(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function toKey(value: SnapshotKeyInput) {
  return `${value.propertyId}|${normalizeCompetence(value.competence)}`
}

function normalizeCompetence(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})(?:-01)?$/)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`Competencia invalida: ${value}.`)
  }
  return `${match[1]}-${match[2]}-01`
}

function financialResidual(input: ReconciliationInput) {
  return roundMoney(
    input.totalRevenue +
      (input.passageEntries ?? 0) -
      input.administrationCommission -
      input.retainedExpenses -
      input.intermediationCommission -
      (input.tariffs ?? 0) -
      (input.passageExits ?? 0) -
      input.assessedTransfer,
  )
}

function compareSourceFingerprints(fingerprints: SourceFingerprints | undefined) {
  if (!fingerprints) return { unchanged: true, differences: [] as string[] }
  const tables = new Set([
    ...Object.keys(fingerprints.before),
    ...Object.keys(fingerprints.after),
  ])
  const differences = [...tables]
    .filter((table) => {
      const before = fingerprints.before[table]
      const after = fingerprints.after[table]
      return !before || !after || before.count !== after.count || before.checksum !== after.checksum
    })
    .sort()
  return { unchanged: differences.length === 0, differences }
}

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function buildReconciliations(
  closures: Array<{ id: string; analysisComplete: unknown | null }>,
) {
  return closures.map((closure): ReconciliationInput => {
    const analysis = closure.analysisComplete as PackageAnalysis
    const totals = analysis.totals
    const intermediationCommission = (analysis.prestacao?.acordos_rescisoes_recebidos ?? [])
      .filter((item) => item.tipo === "intermediacao")
      .reduce((total, item) => total + (item.comissao ?? 0), 0)
    return {
      closureId: closure.id,
      totalRevenue: totals.total_receitas,
      passageEntries: totals.entradas_passagem ?? 0,
      administrationCommission: totals.total_comissoes,
      retainedExpenses: totals.total_despesas,
      intermediationCommission: roundMoney(intermediationCommission),
      tariffs: totals.total_tarifas ?? 0,
      passageExits: totals.saidas_passagem ?? 0,
      assessedTransfer: totals.total_a_repassar,
    }
  })
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
  if (options.mode === "commit") throw new Error("O verificador e somente leitura.")
  loadEnvLocal()
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const sourceBefore = await readSourceFingerprints(supabase)
  const dataset = await loadBackfillDataset(supabase, options)
  const plan = buildBackfillPlan({ options, ...dataset })
  const expectedByKey = new Map(
    plan.operations.map((operation) => [operation.key, operation.checksum]),
  )
  const snapshots = dataset.existingSnapshots
    .map((snapshot) => ({
      id: toKey(snapshot),
      ...snapshot,
      expectedChecksum:
        snapshot.origin === "processamento"
          ? (snapshot.contentChecksum ?? null)
          : (expectedByKey.get(toKey(snapshot)) ?? null),
    }))
    .filter((snapshot) => expectedByKey.has(toKey(snapshot)))
  const sourceAfter = await readSourceFingerprints(supabase)
  const report = verifyIndicadoresSnapshots({
    expectedProperties: plan.operations.map((operation) => ({
      propertyId: operation.snapshot.propertyId,
      competence: operation.snapshot.competence,
    })),
    snapshots,
    reconciliations: buildReconciliations(
      dataset.closures.filter((closure) => plan.selectedClosureIds.includes(closure.id)),
    ),
    sourceFingerprints: { before: sourceBefore, after: sourceAfter },
  })

  console.log(
    JSON.stringify(
      {
        ...report,
        unlinkedLines: plan.unlinkedLines,
        currentSourceFingerprints: sourceAfter,
      },
      null,
      2,
    ),
  )
  if (!report.ok) process.exitCode = 1
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
