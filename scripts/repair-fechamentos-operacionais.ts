import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { competenciaMesToDatabase } from "../lib/competencia-fechamento"
import type { PackageAnalysis, ReceitaPorImovel } from "../lib/prestacao-types"
import { applyFechamentoCorrection, resolveReceitaMovement } from "../lib/server/fechamento-corrections"
import { buildValidacoesRows, type ResolvedValidation } from "../lib/server/persist-package"
import { normalizePrestacaoCompetencias, validatePackage } from "../lib/server/package-rechecks"
import { getCommercialRuleForValidation } from "../lib/server/regras-comerciais"
import { loadHistoricalAgreementKeys } from "../lib/server/historical-agreements"
import {
  type ImovelVinculoCadastro,
  vincularReceitasExistentes,
} from "../lib/server/fechamento-imoveis"

const TARGET_COMPETENCIA = "2026-05"
const TARGET_NAMES = [
  "terreno castelao",
  "terreno castelao ricardo",
  "joao cordeiro",
  "galpao pompilio gomes",
  "grand messejana ii",
]

interface FechamentoRow {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  competencia: string
  status: string
  atualizado_em: string
  analise_completa: PackageAnalysis | null
  empreendimentos: { nome: string } | Array<{ nome: string }> | null
}

interface MovementRow {
  id: string
  data_competencia: string | null
  imovel_id: string | null
  dados_extraidos: { linha_id?: string | null; apto?: string; inquilino?: string } | null
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeCompetencia(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}` : value
}

export function isOperationalRepairTarget(empreendimento: string, competencia: string) {
  return normalizeCompetencia(competencia) === TARGET_COMPETENCIA && TARGET_NAMES.includes(normalizeText(empreendimento))
}

function competenciaSnapshot(row: ReceitaPorImovel) {
  return {
    competencia_original: row.competencia_original ?? null,
    competencia_recebimento: row.competencia_recebimento ?? null,
    dia_vencimento: row.dia_vencimento ?? null,
  }
}

export function collectCompetenciaRepairs(before: ReceitaPorImovel[], after: ReceitaPorImovel[]) {
  return after.flatMap((row, indice) => {
    const anterior = before[indice]
    if (!anterior) return []
    const antes = competenciaSnapshot(anterior)
    const depois = competenciaSnapshot(row)
    return JSON.stringify(antes) === JSON.stringify(depois) ? [] : [{ indice, apto: row.apto, antes, depois }]
  })
}

export function collectImovelRepairs(before: ReceitaPorImovel[], after: ReceitaPorImovel[]) {
  return after.flatMap((row, indice) => {
    const anterior = before[indice]
    if (!anterior || anterior.imovel_id === row.imovel_id) return []
    return [{ indice, apto: row.apto, antes: anterior.imovel_id ?? null, depois: row.imovel_id ?? null }]
  })
}

export function collectLineIdRepairs(before: ReceitaPorImovel[], after: ReceitaPorImovel[]) {
  return after.flatMap((row, indice) => before[indice]?.linha_id === row.linha_id ? [] : [{
    indice, apto: row.apto, antes: before[indice]?.linha_id ?? null, depois: row.linha_id ?? null,
  }])
}

function invariantSnapshot(analysis: PackageAnalysis) {
  const prestacao = analysis.prestacao
  const receitas = prestacao?.receitas_por_imovel.map(({ linha_id, competencia_original, competencia_recebimento, dia_vencimento, imovel_id, ...row }) => row)
  return JSON.stringify({
    ...analysis,
    parecer: undefined,
    rechecks: undefined,
    guardrails: undefined,
    prestacao: prestacao ? { ...prestacao, receitas_por_imovel: receitas } : null,
  })
}

export function assertFinancialInvariant(before: PackageAnalysis, after: PackageAnalysis) {
  if (invariantSnapshot(before) !== invariantSnapshot(after)) {
    throw new Error("O reparo tentou alterar valores ou dados fora das competências; operação cancelada.")
  }
}

function getEmpreendimentoName(row: FechamentoRow) {
  return Array.isArray(row.empreendimentos) ? row.empreendimentos[0]?.nome ?? "" : row.empreendimentos?.nome ?? ""
}

function loadEnvLocal() {
  const filePath = join(process.cwd(), ".env.local")
  if (!existsSync(filePath)) return
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) loadEnvLine(rawLine)
}

function loadEnvLine(rawLine: string) {
  const line = rawLine.trim()
  if (!line || line.startsWith("#")) return
  const separator = line.indexOf("=")
  if (separator < 0) return
  const key = line.slice(0, separator).trim()
  const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
  if (!(key in process.env)) process.env[key] = value
}

async function loadTargets() {
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,competencia,status,atualizado_em,analise_completa,empreendimentos(nome)")
    .eq("competencia", `${TARGET_COMPETENCIA}-01`)
    .eq("arquivado", false)
  if (error) throw error
  const rows = (data ?? []) as unknown as FechamentoRow[]
  return { supabase, targets: rows.filter((row) => isOperationalRepairTarget(getEmpreendimentoName(row), row.competencia)) }
}

async function loadMovements(supabase: Awaited<ReturnType<typeof loadTargets>>["supabase"], fechamentoId: string) {
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("id,data_competencia,imovel_id,dados_extraidos")
    .eq("fechamento_id", fechamentoId)
    .eq("tipo_movimentacao", "receita_aluguel")
    .order("criado_em", { ascending: true }).order("id", { ascending: true })
  if (error) throw error
  return (data ?? []) as MovementRow[]
}

async function buildRepair(
  supabase: Awaited<ReturnType<typeof loadTargets>>["supabase"],
  fechamento: FechamentoRow,
  movements: MovementRow[],
  imoveis: ImovelVinculoCadastro[],
) {
  const analysis = fechamento.analise_completa!
  const movementLinked = applyMovementLinks(analysis.prestacao!, movements, imoveis)
  const prestacao = normalizePrestacaoCompetencias(vincularReceitasExistentes(movementLinked, imoveis)!)
  const rule = await getCommercialRuleForValidation(fechamento.imobiliaria_id, fechamento.empreendimento_id)
  const historicalAgreementKeys = await loadHistoricalAgreementKeys(supabase, {
    id: fechamento.id, imobiliariaId: fechamento.imobiliaria_id, empreendimentoId: fechamento.empreendimento_id,
  })
  const validation = validatePackage({
    documents: analysis.documents ?? [], prestacao, repasse: analysis.repasse ?? null,
    despesas: analysis.despesas ?? null, reajuste: analysis.reajuste ?? null,
    commercialRule: rule, historicalAgreementKeys,
  })
  const newAnalysis = { ...analysis, prestacao, parecer: validation.parecer, rechecks: validation.rechecks, guardrails: validation.guardrails }
  assertFinancialInvariant(analysis, newAnalysis)
  const repairs = collectCompetenciaRepairs(analysis.prestacao!.receitas_por_imovel, prestacao.receitas_por_imovel)
  const linkRepairs = collectImovelRepairs(analysis.prestacao!.receitas_por_imovel, prestacao.receitas_por_imovel)
  const lineIdRepairs = collectLineIdRepairs(analysis.prestacao!.receitas_por_imovel, prestacao.receitas_por_imovel)
  assertChangedRowsHaveMovements([...repairs, ...linkRepairs, ...lineIdRepairs], movements, prestacao.receitas_por_imovel)
  const movementRepairs = buildMovementRepairs(movements, prestacao.receitas_por_imovel)
  return { analysis, newAnalysis, validation, repairs, linkRepairs, lineIdRepairs, movementRepairs }
}

function assertChangedRowsHaveMovements(
  repairs: Array<{ indice: number; apto: string }>,
  movements: MovementRow[],
  rows: ReceitaPorImovel[],
) {
  const missing = repairs.filter((item) => !resolveReceitaMovement(movements, rows, item.indice))
  if (missing.length > 0) {
    throw new Error(`Movimentação não encontrada para: ${missing.map((item) => item.apto).join(", ")}. Reprocesse antes do reparo.`)
  }
}

function applyMovementLinks(
  prestacao: NonNullable<PackageAnalysis["prestacao"]>,
  movements: MovementRow[],
  imoveis: ImovelVinculoCadastro[],
) {
  const validIds = new Set(imoveis.map((item) => item.id))
  return {
    ...prestacao,
    receitas_por_imovel: prestacao.receitas_por_imovel.map((row, index, rows) => {
      const movement = resolveReceitaMovement(movements, rows, index) as MovementRow | null
      return movement?.imovel_id && validIds.has(movement.imovel_id) ? { ...row, imovel_id: movement.imovel_id } : row
    }),
  }
}

function buildMovementRepairs(movements: MovementRow[], rows: ReceitaPorImovel[]) {
  return rows.flatMap((row, index) => {
    const movement = resolveReceitaMovement(movements, rows, index) as MovementRow | null
    if (!movement) return []
    const dataCompetencia = competenciaMesToDatabase(row.competencia_original)
    const competenceChanged = movement.data_competencia !== dataCompetencia
    const linkChanged = Boolean(row.imovel_id && movement.imovel_id !== row.imovel_id)
    const identityChanged = movement.dados_extraidos?.linha_id !== row.linha_id
    return competenceChanged || linkChanged || identityChanged ? [{ index, movement, row, dataCompetencia }] : []
  })
}

function buildAudits(repair: Awaited<ReturnType<typeof buildRepair>>) {
  const auditedIndexes = new Set([...repair.repairs, ...repair.linkRepairs, ...repair.lineIdRepairs].map((item) => item.indice))
  const competenceAudits = repair.repairs.map((item) => {
    const movement = repair.movementRepairs.find((candidate) => candidate.index === item.indice)?.movement
    return buildAudit("competencias_receita", item.apto, item.antes, item.depois, movement?.id ?? null)
  })
  const linkAudits = repair.linkRepairs.map((item) => {
    const movement = repair.movementRepairs.find((candidate) => candidate.index === item.indice)?.movement
    return buildAudit("imovel_vinculado", item.apto, item.antes, item.depois, movement?.id ?? null)
  })
  const identityAudits = repair.lineIdRepairs.map((item) => {
    const movement = repair.movementRepairs.find((candidate) => candidate.index === item.indice)?.movement
    return buildAudit("identidade_linha_receita", item.apto, item.antes, item.depois, movement?.id ?? null)
  })
  const movementAudits = repair.movementRepairs
    .filter((item) => !auditedIndexes.has(item.index))
    .map((item) => buildAudit("movimentacao_receita", item.row.apto, {
      competencia: item.movement.data_competencia,
      imovel_id: item.movement.imovel_id,
      linha_id: item.movement.dados_extraidos?.linha_id ?? null,
    }, {
      competencia: item.dataCompetencia,
      imovel_id: item.row.imovel_id ?? item.movement.imovel_id,
      linha_id: item.row.linha_id ?? null,
    }, item.movement.id))
  return [...competenceAudits, ...linkAudits, ...identityAudits, ...movementAudits]
}

function buildAudit(field: string, apto: string, before: unknown, after: unknown, movementId: string | null) {
  return {
    movimentacao_id: movementId,
    usuario: "Sistema - reparo determinístico",
    campo_alterado: `${field}:${apto}`,
    valor_anterior: typeof before === "string" || before === null ? before : JSON.stringify(before),
    valor_novo: typeof after === "string" || after === null ? after : JSON.stringify(after),
    justificativa: "Correção determinística de competência e vínculo cadastral; sem reexecução de IA e sem alteração financeira.",
  }
}

async function persistRepair(fechamento: FechamentoRow, repair: Awaited<ReturnType<typeof buildRepair>>, resolved: ResolvedValidation[]) {
  const audits = buildAudits(repair)
  if (audits.length === 0) return
  await applyFechamentoCorrection({
    fechamentoId: fechamento.id,
    fechamentoPatch: { analise_completa: repair.newAnalysis },
    movimentacoes: repair.movementRepairs.map((item) => ({
      id: item.movement.id, data_competencia: item.dataCompetencia,
      dados_extraidos: item.row, corrigido_manualmente: true,
      ...(item.row.imovel_id ? { imovel_id: item.row.imovel_id } : {}),
    })),
    validacoes: buildValidacoesRows({
      fechamentoId: fechamento.id, documents: repair.newAnalysis.documents ?? [],
      parecer: repair.validation.parecer, rechecks: repair.validation.rechecks,
      guardrails: repair.validation.guardrails, resolvedValidations: resolved,
    }),
    auditorias: audits,
    permitirStatusFechado: true,
    esperadoAtualizadoEm: fechamento.atualizado_em,
  })
}

async function loadResolved(supabase: Awaited<ReturnType<typeof loadTargets>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("validacoes")
    .select("tipo_validacao,status,justificativa,resolvido_por,resolvido_em")
    .eq("fechamento_id", id)
    .in("status", ["resolvida", "ignorada_com_justificativa"])
  if (error) throw error
  return (data ?? []) as ResolvedValidation[]
}

async function loadImoveis(
  supabase: Awaited<ReturnType<typeof loadTargets>>["supabase"],
  fechamento: FechamentoRow,
) {
  const { data, error } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,inquilino_nome,status,valor_aluguel_esperado")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
  if (error) throw error
  return (data ?? []) as ImovelVinculoCadastro[]
}

async function processTarget(
  supabase: Awaited<ReturnType<typeof loadTargets>>["supabase"],
  fechamento: FechamentoRow,
  commit: boolean,
) {
  if (!fechamento.analise_completa?.prestacao) return { fechamento_id: fechamento.id, status: "sem_analise" }
  const repair = await buildRepair(
    supabase,
    fechamento,
    await loadMovements(supabase, fechamento.id),
    await loadImoveis(supabase, fechamento),
  )
  if (commit && (repair.repairs.length > 0 || repair.linkRepairs.length > 0 || repair.lineIdRepairs.length > 0 || repair.movementRepairs.length > 0)) {
    await persistRepair(fechamento, repair, await loadResolved(supabase, fechamento.id))
  }
  return {
    fechamento_id: fechamento.id, empreendimento: getEmpreendimentoName(fechamento),
    status_atual: fechamento.status, linhas_competencia_alteradas: repair.repairs,
    linhas_imovel_vinculadas: repair.linkRepairs,
    linhas_identificadas: repair.lineIdRepairs,
    movimentacoes_alteradas: repair.movementRepairs.map((item) => ({
      id: item.movement.id, apto: item.row.apto,
      antes: { competencia: item.movement.data_competencia, imovel_id: item.movement.imovel_id },
      depois: { competencia: item.dataCompetencia, imovel_id: item.row.imovel_id ?? item.movement.imovel_id },
    })),
    bloqueios_depois: repair.validation.rechecks.filter((item) => item.status === "failed").map((item) => item.id),
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--commit")) throw new Error(`Argumento desconhecido: ${args.join(" ")}`)
  loadEnvLocal()
  const commit = args.includes("--commit")
  const { supabase, targets } = await loadTargets()
  const report = []
  for (const target of targets) report.push(await processTarget(supabase, target, commit))
  console.log(JSON.stringify({ mode: commit ? "commit" : "dry-run", targets: targets.length, report }, null, 2))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main().catch((error) => { console.error(error); process.exitCode = 1 })
