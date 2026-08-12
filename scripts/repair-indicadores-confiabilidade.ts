/**
 * Repara a base documental dos indicadores com auditoria antes/depois.
 *
 * Seguro por padrão:
 *   node --import tsx scripts/repair-indicadores-confiabilidade.ts
 *   node --import tsx scripts/repair-indicadores-confiabilidade.ts --competencia 2026-03
 *
 * Escrita exige a RPC de reparo indicada nas migrations atuais e opt-in explícito:
 *   node --import tsx scripts/repair-indicadores-confiabilidade.ts --commit
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { PackageAnalysis, PrestacaoAnalysis } from "../lib/prestacao-types"
import {
  buildCesarMonthRepairs,
  reconcileFinancialDimensions,
  repairGmIiMarchAnalysis,
  repairPluralPassThroughAnalysis,
  type FinancialReconciliation,
} from "../lib/indicadores-repair"
import {
  extractPdfTextLines,
  isCesarRegoConsolidado,
  parseCesarRegoPrestacao,
} from "../lib/server/cesar-rego-parser"
import {
  buildValidacoesRows,
  buildPrestacaoMovimentacoes,
  type ResolvedValidation,
} from "../lib/server/persist-package"
import { generateEgestorPreview } from "../lib/server/egestor"
import {
  buildIndicadoresSnapshotRows,
  loadActiveIndicadoresProperties,
} from "../lib/server/indicadores-snapshots"
import {
  type ImovelVinculoCadastro,
  vincularReceitasExistentes,
} from "../lib/server/fechamento-imoveis"
import { loadHistoricalAgreementKeys } from "../lib/server/historical-agreements"
import { refreshPackageValidation } from "../lib/server/package-rechecks"
import { getCommercialRuleForValidation } from "../lib/server/regras-comerciais"

const BUCKET = "fechamento-documentos"
const START_COMPETENCE = "2026-01-01"
const END_COMPETENCE = "2026-07-01"
const resolvedValidationsSchema: z.ZodType<ResolvedValidation[]> = z.array(
  z.object({
    tipo_validacao: z.string(),
    status: z.string(),
    justificativa: z.string().nullable(),
    resolvido_por: z.string().nullable(),
    resolvido_em: z.string().nullable(),
  }),
)

export interface ReliabilityRepairOptions {
  mode: "dry-run" | "commit"
  competence: string | null
  fechamentoId: string | null
  cesarOnly: boolean
}

interface ClosureRow {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  competencia: string
  status: string
  atualizado_em: string
  total_receitas: number | string | null
  total_despesas: number | string | null
  total_comissoes: number | string | null
  total_repassar: number | string | null
  analise_completa: PackageAnalysis | null
  imobiliarias: unknown
  empreendimentos: unknown
}

interface DocumentRow {
  id: string
  fechamento_id: string
  nome_arquivo: string
  arquivo_url: string
  criado_em: string
}

interface RepairRecord {
  fechamentoId: string
  competence: string
  agencyName: string
  developmentName: string
  kind: "repaired" | "unchanged" | "incomplete" | "divergent"
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown> | null
  reconciliation: FinancialReconciliation | null
  analysisRepaired: PackageAnalysis | null
  documentId: string | null
  updatedAt: string
  agencyId: string
  developmentId: string
  closureStatus: string
}

export function parseReliabilityRepairArgs(argv: string[]): ReliabilityRepairOptions {
  let mode: ReliabilityRepairOptions["mode"] = "dry-run"
  let competence: string | null = null
  let fechamentoId: string | null = null
  let cesarOnly = false
  const seen = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument || !["--commit", "--competencia", "--fechamento", "--cesar-rego"].includes(argument)) {
      throw new Error(`Argumento desconhecido: ${argument ?? ""}.`)
    }
    if (seen.has(argument)) throw new Error(`Argumento duplicado: ${argument}.`)
    seen.add(argument)
    if (argument === "--commit") {
      mode = "commit"
      continue
    }
    if (argument === "--cesar-rego") {
      cesarOnly = true
      continue
    }
    const value = argv[++index]
    if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${argument}.`)
    if (argument === "--competencia") competence = normalizeCompetence(value)
    if (argument === "--fechamento") fechamentoId = parseUuid(value)
  }

  return { mode, competence, fechamentoId, cesarOnly }
}

export function auditExistingAnalysis(analysis: PackageAnalysis): FinancialReconciliation {
  const intermediationCommission = analysis.prestacao?.acordos_rescisoes_recebidos
    .filter((item) => item.tipo === "intermediacao")
    .reduce((total, item) => total + (item.comissao ?? 0), 0) ?? 0
  return reconcileFinancialDimensions({
    receitasEconomicas: analysis.totals.total_receitas,
    entradasPassagem: analysis.totals.entradas_passagem ?? 0,
    comissoes: analysis.totals.total_comissoes + intermediationCommission,
    despesas: analysis.totals.total_despesas,
    tarifas: analysis.totals.total_tarifas ?? 0,
    saidasPassagem: analysis.totals.saidas_passagem ?? 0,
    repasseDeclarado:
      analysis.totals.repasse_declarado ?? analysis.totals.total_a_repassar,
  })
}

export function analysesAreEquivalent(
  current: PackageAnalysis | null,
  repaired: PackageAnalysis,
) {
  return (
    current !== null &&
    JSON.stringify(canonicalizeJson(current)) ===
      JSON.stringify(canonicalizeJson(repaired))
  )
}

export function assertRepairCommitAllowed(
  records: Array<Pick<RepairRecord, "kind" | "reconciliation">>,
) {
  const blocked = records.filter(
    (record) =>
      record.kind === "incomplete" ||
      record.kind === "divergent" ||
      (record.kind === "repaired" && !record.reconciliation?.reconciliado),
  )
  if (blocked.length > 0) {
    throw new Error(
      `Commit bloqueado: ${blocked.length} fechamento(s) incompleto(s) ou com diferença não explicada.`,
    )
  }
}

// Compatibilidade para reparos cirúrgicos antigos que ainda usam o RPC v2.
export function buildReparoReceitas(input: {
  fechamentoId: string
  documentoId: string | null
  prestacao: PrestacaoAnalysis | null
}) {
  return buildPrestacaoMovimentacoes(input).filter(
    (row) => row.tipo_movimentacao === "receita_aluguel",
  )
}

export function attachAnalysisToExistingProperties(
  analysis: PackageAnalysis,
  properties: ImovelVinculoCadastro[],
) {
  if (!analysis.prestacao) return analysis
  return {
    ...analysis,
    prestacao: vincularReceitasExistentes(analysis.prestacao, properties),
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]),
  )
}

async function loadClosures(supabase: SupabaseClient, options: ReliabilityRepairOptions) {
  let query = supabase
    .from("fechamentos")
    .select(
      "id,imobiliaria_id,empreendimento_id,competencia,status,atualizado_em,total_receitas,total_despesas,total_comissoes,total_repassar,analise_completa,imobiliarias(nome),empreendimentos(nome)",
    )
    .eq("arquivado", false)
    .gte("competencia", START_COMPETENCE)
    .lte("competencia", END_COMPETENCE)
    .order("competencia", { ascending: true })
  if (options.competence) query = query.eq("competencia", options.competence)
  if (options.fechamentoId) query = query.eq("id", options.fechamentoId)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as unknown as ClosureRow[]
  return options.cesarOnly
    ? rows.filter((closure) => isCesar(getAgencyName(closure)))
    : rows
}

async function loadDocuments(supabase: SupabaseClient, closureIds: string[]) {
  if (closureIds.length === 0) return [] as DocumentRow[]
  const { data, error } = await supabase
    .from("documentos_fechamento")
    .select("id,fechamento_id,nome_arquivo,arquivo_url,criado_em")
    .in("fechamento_id", closureIds)
    .eq("tipo_documento", "prestacao_contas")
    .order("criado_em", { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

async function buildRepairPlan(
  supabase: SupabaseClient,
  closures: ClosureRow[],
  documents: DocumentRow[],
) {
  const records: RepairRecord[] = []
  const propertiesByClosure = await loadPropertiesByClosure(supabase, closures)
  const documentByClosure = new Map<string, DocumentRow>()
  for (const document of documents) {
    if (!documentByClosure.has(document.fechamento_id)) {
      documentByClosure.set(document.fechamento_id, document)
    }
  }
  const handled = new Set<string>()
  const cesarByMonth = groupBy(
    closures.filter((closure) => isCesar(getAgencyName(closure))),
    (closure) => normalizeCompetence(closure.competencia),
  )

  for (const [competence, monthClosures] of cesarByMonth) {
    const source = await loadCesarSource(supabase, monthClosures, documentByClosure)
    if (!source.ok) {
      for (const closure of monthClosures) {
        handled.add(closure.id)
        records.push(buildIncompleteRecord(closure, source.reason))
      }
      continue
    }

    const plan = buildCesarMonthRepairs(
      monthClosures.flatMap((closure) =>
        closure.analise_completa
          ? [{
              id: closure.id,
              empreendimentoNome: getDevelopmentName(closure),
              analysis: closure.analise_completa,
            }]
          : [],
      ),
      source.parsed,
    )
    if (!plan.sourceReconciled) {
      const reason =
        `Documento César Rêgo ${competence} não pôde ser integralmente distribuído; ` +
        `unidades sem fechamento: ${plan.missingPropertyCodes.join(", ") || "nenhuma"}; ` +
        `diferença de receita: ${plan.difference.toFixed(2)}; ` +
        `diferença de repasse: ${plan.transferDifference.toFixed(2)}.`
      for (const closure of monthClosures) {
        handled.add(closure.id)
        records.push(buildIncompleteRecord(closure, reason))
      }
      continue
    }

    for (const repair of plan.repairs) {
      const closure = monthClosures.find((candidate) => candidate.id === repair.id)!
      handled.add(closure.id)
      const scopedAnalysis = attachAnalysisToExistingProperties(
        repair.analysisRepaired,
        propertiesByClosure.get(closure.id) ?? [],
      )
      const analysisRepaired = await refreshClosureValidation(
        supabase,
        closure,
        scopedAnalysis,
      )
      const unlinkedCodes =
        analysisRepaired.prestacao?.receitas_por_imovel
          .filter((row) => !row.imovel_id)
          .map((row) => row.apto) ?? []
      if (unlinkedCodes.length > 0) {
        records.push(
          buildIncompleteRecord(
            closure,
            `Imóveis cadastrados não encontrados para: ${unlinkedCodes.join(", ")}.`,
          ),
        )
        continue
      }
      const missingDestinationNote = plan.sourceReconciled
        ? ""
        : ` A fonte também contém ${plan.missingPropertyCodes.join(", ")}, sem fechamento de destino nesta competência.`
      records.push(
        buildRepairedRecord(
          closure,
          analysisRepaired,
          repair.reconciliation,
          `César Rêgo ${competence}: linhas distribuídas por empreendimento e vinculadas ao cadastro existente.${missingDestinationNote}`,
          documentByClosure.get(closure.id)?.id ?? null,
        ),
      )
    }
    for (const closure of monthClosures.filter((candidate) => !handled.has(candidate.id))) {
      handled.add(closure.id)
      records.push(
        buildIncompleteRecord(
          closure,
          `Empreendimento sem regra de distribuição para o documento César Rêgo ${competence}.`,
        ),
      )
    }
  }

  for (const closure of closures) {
    if (handled.has(closure.id)) continue
    const analysis = closure.analise_completa
    if (!analysis?.prestacao) {
      records.push(buildIncompleteRecord(closure, "Fechamento sem análise/prestação materializada."))
      continue
    }
    const agency = normalizeText(getAgencyName(closure))
    const development = normalizeText(getDevelopmentName(closure))
    const competence = normalizeCompetence(closure.competencia)

    if (agency.includes("alive") && development.includes("grand messejana ii") && competence === "2026-03-01") {
      const repaired = await refreshClosureValidation(
        supabase,
        closure,
        repairGmIiMarchAnalysis(analysis),
      )
      const reconciliation = auditExistingAnalysis(repaired)
      records.push(
        buildRepairedRecord(
          closure,
          repaired,
          reconciliation,
          "GM II março: recebimento de fevereiro separado da inadimplência de março da unidade 3.",
          documentByClosure.get(closure.id)?.id ?? null,
        ),
      )
      continue
    }

    if (agency.includes("plural") && ["2026-05-01", "2026-06-01"].includes(competence)) {
      const repaired = repairPluralPassThroughAnalysis(analysis, competence)
      const analysisRepaired = await refreshClosureValidation(
        supabase,
        closure,
        repaired.analysisRepaired,
      )
      records.push(
        buildRepairedRecord(
          closure,
          analysisRepaired,
          repaired.reconciliation,
          `Plural ${competence.slice(0, 7)}: IPTU classificado como movimento de passagem.`,
          documentByClosure.get(closure.id)?.id ?? null,
        ),
      )
      continue
    }

    const refreshed = await refreshClosureValidation(supabase, closure, analysis)
    const reconciliation = auditExistingAnalysis(refreshed)
    records.push(
      buildRepairedRecord(
        closure,
        refreshed,
        reconciliation,
        "Validações determinísticas regeneradas com as regras operacionais atuais.",
        documentByClosure.get(closure.id)?.id ?? null,
      ),
    )
  }

  return records.sort(
    (left, right) =>
      left.competence.localeCompare(right.competence) ||
      left.agencyName.localeCompare(right.agencyName) ||
      left.developmentName.localeCompare(right.developmentName),
  )
}

async function refreshClosureValidation(
  supabase: SupabaseClient,
  closure: ClosureRow,
  analysis: PackageAnalysis,
) {
  const [commercialRule, historicalAgreementKeys] = await Promise.all([
    getCommercialRuleForValidation(
      closure.imobiliaria_id,
      closure.empreendimento_id,
    ),
    loadHistoricalAgreementKeys(supabase, {
      id: closure.id,
      imobiliariaId: closure.imobiliaria_id,
      empreendimentoId: closure.empreendimento_id,
    }),
  ])
  return refreshPackageValidation(analysis, {
    commercialRule,
    historicalAgreementKeys,
  })
}

async function loadPropertiesByClosure(
  supabase: SupabaseClient,
  closures: ClosureRow[],
) {
  const agencyIds = [...new Set(closures.map((closure) => closure.imobiliaria_id))]
  if (agencyIds.length === 0) return new Map<string, ImovelVinculoCadastro[]>()
  const { data, error } = await supabase
    .from("imoveis")
    .select("id,imobiliaria_id,empreendimento_id,codigo_imobiliaria,unidade,inquilino_nome,status,valor_aluguel_esperado")
    .in("imobiliaria_id", agencyIds)
    .eq("ativo", true)
  if (error) throw error

  const properties = (data ?? []) as Array<
    ImovelVinculoCadastro & {
      imobiliaria_id: string
      empreendimento_id: string
    }
  >
  return new Map(
    closures.map((closure) => [
      closure.id,
      properties.filter(
        (property) =>
          property.imobiliaria_id === closure.imobiliaria_id &&
          property.empreendimento_id === closure.empreendimento_id,
      ),
    ]),
  )
}

async function loadCesarSource(
  supabase: SupabaseClient,
  closures: ClosureRow[],
  documentByClosure: Map<string, DocumentRow>,
): Promise<{ ok: true; parsed: PrestacaoAnalysis } | { ok: false; reason: string }> {
  const sources = new Map<string, { buffer: Buffer; document: DocumentRow }>()
  for (const closure of closures) {
    const document = documentByClosure.get(closure.id)
    if (!document) {
      return { ok: false, reason: `Documento de prestação ausente no fechamento ${closure.id}.` }
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(document.arquivo_url)
    if (error) return { ok: false, reason: `Falha ao baixar ${document.nome_arquivo}: ${error.message}` }
    const buffer = Buffer.from(await data.arrayBuffer())
    sources.set(createHash("sha256").update(buffer).digest("hex"), { buffer, document })
  }

  const parsedSources: PrestacaoAnalysis[] = []
  for (const { buffer, document } of sources.values()) {
    try {
      const lines = await extractPdfTextLines(buffer)
      if (!isCesarRegoConsolidado(lines)) {
        return { ok: false, reason: `${document.nome_arquivo} não corresponde ao layout César Rêgo.` }
      }
      parsedSources.push(
        parseCesarRegoPrestacao(lines, normalizeCompetence(closures[0].competencia).slice(0, 7)),
      )
    } catch (error) {
      return {
        ok: false,
        reason: `Falha no parser determinístico de ${document.nome_arquivo}: ${toError(error).message}`,
      }
    }
  }
  const fingerprints = new Set(parsedSources.map(sourceFingerprint))
  if (fingerprints.size !== 1) {
    return { ok: false, reason: "Há documentos César Rêgo distintos na mesma competência." }
  }
  return { ok: true, parsed: parsedSources[0] }
}

async function commitRecords(supabase: SupabaseClient, records: RepairRecord[]) {
  assertRepairCommitAllowed(records)

  for (const record of records.filter((candidate) => candidate.kind === "repaired")) {
    const analysis = record.analysisRepaired!
    const patch = {
      analise_completa: analysis,
      total_receitas: analysis.totals.total_receitas,
      total_despesas: analysis.totals.total_despesas,
      total_comissoes: analysis.totals.total_comissoes,
      total_repassar: analysis.totals.total_a_repassar,
    }
    const movimentacoes = buildPrestacaoMovimentacoes({
      fechamentoId: record.fechamentoId,
      documentoId: record.documentId,
      prestacao: analysis.prestacao,
      competencia: record.competence,
    })
    const resolvedValidations = await loadResolvedValidations(
      supabase,
      record.fechamentoId,
    )
    const validacoes = buildValidacoesRows({
      fechamentoId: record.fechamentoId,
      documents: analysis.documents ?? [],
      parecer: analysis.parecer,
      rechecks: analysis.rechecks,
      guardrails: analysis.guardrails,
      resolvedValidations,
    })
    const properties = await loadActiveIndicadoresProperties({
      supabase: supabase as never,
      imobiliariaId: record.agencyId,
      empreendimentoId: record.developmentId,
      competencia: record.competence,
    })
    const snapshotBuild = buildIndicadoresSnapshotRows({
      properties,
      fechamentoId: record.fechamentoId,
      competencia: record.competence,
      analysis,
      origem: "processamento",
    })
    if (snapshotBuild.unlinkedLineCount > 0) {
      throw new Error(
        `Commit bloqueado: ${snapshotBuild.unlinkedLineCount} linha(s) sem vínculo no snapshot.`,
      )
    }
    const { error } = await supabase.rpc("aplicar_reparo_indicadores_v4", {
      p_fechamento_id: record.fechamentoId,
      p_esperado_atualizado_em: record.updatedAt,
      p_fechamento_patch: patch,
      p_movimentacoes: movimentacoes,
      p_snapshots: snapshotBuild.rows,
      p_validacoes: validacoes,
      p_auditoria: [{
        usuario: "Sistema - reparo de confiabilidade dos indicadores",
        campo_alterado: "reparo_indicadores_v4",
        valor_anterior: JSON.stringify(record.before),
        valor_novo: JSON.stringify(record.after),
        justificativa: record.reason,
      }],
    })
    if (error) throw error
  }

  for (const record of records.filter(
    (candidate) => candidate.kind === "repaired" || candidate.kind === "unchanged",
  )) {
    await regenerateExistingUnsentPreview(supabase, record)
  }
}

async function loadResolvedValidations(
  supabase: SupabaseClient,
  fechamentoId: string,
): Promise<ResolvedValidation[]> {
  const { data, error } = await supabase
    .from("validacoes")
    .select("tipo_validacao,status,justificativa,resolvido_por,resolvido_em")
    .eq("fechamento_id", fechamentoId)
    .in("status", ["resolvida", "ignorada_com_justificativa"])
  if (error) throw error
  return resolvedValidationsSchema.parse(data ?? [])
}

async function regenerateExistingUnsentPreview(
  supabase: SupabaseClient,
  record: RepairRecord,
) {
  if (!["aprovado", "preparado_egestor", "erro_egestor"].includes(record.closureStatus)) {
    return
  }
  const { data, error } = await supabase
    .from("egestor_lancamentos")
    .select("id,egestor_codigo")
    .eq("fechamento_id", record.fechamentoId)
  if (error) throw error
  if (!data?.length || data.some((row) => row.egestor_codigo !== null)) return
  await generateEgestorPreview(supabase, record.fechamentoId)
}

function buildRepairedRecord(
  closure: ClosureRow,
  analysisRepaired: PackageAnalysis,
  reconciliation: FinancialReconciliation,
  reason: string,
  documentId: string | null,
): RepairRecord {
  if (analysesAreEquivalent(closure.analise_completa, analysisRepaired)) {
    return {
      ...baseRecord(closure),
      kind: "unchanged",
      reason: `${reason} Correção já aplicada; nenhuma nova escrita proposta.`,
      before: financialSnapshot(closure.analise_completa),
      after: null,
      reconciliation,
      analysisRepaired: null,
      documentId,
    }
  }

  return {
    ...baseRecord(closure),
    kind: reconciliation.reconciliado ? "repaired" : "divergent",
    reason,
    before: financialSnapshot(closure.analise_completa),
    after: financialSnapshot(analysisRepaired),
    reconciliation,
    analysisRepaired,
    documentId,
  }
}

function buildIncompleteRecord(closure: ClosureRow, reason: string): RepairRecord {
  return {
    ...baseRecord(closure),
    kind: "incomplete",
    reason,
    before: financialSnapshot(closure.analise_completa),
    after: null,
    reconciliation: closure.analise_completa
      ? auditExistingAnalysis(closure.analise_completa)
      : null,
    analysisRepaired: null,
    documentId: null,
  }
}

function baseRecord(closure: ClosureRow) {
  return {
    fechamentoId: closure.id,
    competence: normalizeCompetence(closure.competencia),
    agencyName: getAgencyName(closure),
    developmentName: getDevelopmentName(closure),
    updatedAt: closure.atualizado_em,
    agencyId: closure.imobiliaria_id,
    developmentId: closure.empreendimento_id,
    closureStatus: closure.status,
  }
}

function financialSnapshot(analysis: PackageAnalysis | null) {
  if (!analysis) return { analysis: null }
  return {
    receitasEconomicas: analysis.totals.total_receitas,
    entradasPassagem: analysis.totals.entradas_passagem ?? 0,
    comissoes: analysis.totals.total_comissoes,
    despesas: analysis.totals.total_despesas,
    tarifas: analysis.totals.total_tarifas ?? 0,
    saidasPassagem: analysis.totals.saidas_passagem ?? 0,
    repasseCalculado: analysis.totals.total_a_repassar,
    repasseDeclarado:
      analysis.totals.repasse_declarado ?? analysis.totals.total_a_repassar,
    baseComissao: analysis.totals.base_comissao_administracao,
    comissaoCalculada: analysis.totals.comissao_administracao_calculada,
    validacoes: {
      parecer: analysis.parecer,
      rechecks: analysis.rechecks,
      guardrails: analysis.guardrails,
    },
  }
}

function sourceFingerprint(analysis: PrestacaoAnalysis) {
  return JSON.stringify({
    revenue: analysis.resumo_financeiro.recebidos_em_nome_locador,
    transfer: analysis.resumo_financeiro.total_a_repassar,
    rows: analysis.receitas_por_imovel.map((row) => [
      row.apto,
      row.total,
      row.comissao,
      row.repasse,
      row.entradas_passagem,
      row.saidas_passagem,
    ]),
  })
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>()
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item])
  return grouped
}

function getAgencyName(row: ClosureRow) {
  return relationName(row.imobiliarias)
}

function getDevelopmentName(row: ClosureRow) {
  return relationName(row.empreendimentos)
}

function relationName(value: unknown) {
  if (Array.isArray(value)) return String(value[0]?.nome ?? "")
  if (value && typeof value === "object" && "nome" in value) {
    return String((value as { nome: unknown }).nome ?? "")
  }
  return ""
}

function isCesar(value: string) {
  return normalizeText(value).includes("cesar rego")
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function normalizeCompetence(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})(?:-01)?$/)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`Competência inválida: ${value}.`)
  }
  return `${match[1]}-${match[2]}-01`
}

function parseUuid(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`Fechamento inválido: ${value}.`)
  }
  return normalized
}

function toError(value: unknown) {
  if (value instanceof Error) return value
  if (value && typeof value === "object") return new Error(JSON.stringify(value))
  return new Error(String(value))
}

function loadEnvLocal() {
  const file = join(process.cwd(), ".env.local")
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()
  const options = parseReliabilityRepairArgs(process.argv.slice(2))
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const closures = await loadClosures(supabase, options)
  const documents = await loadDocuments(supabase, closures.map((closure) => closure.id))
  const records = await buildRepairPlan(supabase, closures, documents)

  if (options.mode === "commit") await commitRecords(supabase, records)

  const report = records.map(({ analysisRepaired: _analysis, ...record }) => record)
  const summary = {
    mode: options.mode,
    total: records.length,
    repaired: records.filter((record) => record.kind === "repaired").length,
    unchanged: records.filter((record) => record.kind === "unchanged").length,
    incomplete: records.filter((record) => record.kind === "incomplete").length,
    divergent: records.filter((record) => record.kind === "divergent").length,
  }
  console.log(JSON.stringify({ summary, report }, null, 2))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    console.error(toError(error).message)
    process.exitCode = 1
  })
}
