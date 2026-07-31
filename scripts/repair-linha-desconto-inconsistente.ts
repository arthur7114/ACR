/**
 * Repara linhas de receita com desconto integral inconsistente (a IA duplicou
 * o aluguel na coluna DESCONTO quando ela vinha em branco no documento —
 * visto no apto 202 do Grand Maracanaú junho/2026). Reaproveita o pipeline
 * real (validatePackage) para recalcular a linha e os totais, e só grava se
 * nenhum total financeiro já confirmado/enviado mudar.
 *
 * Seguro por padrão:
 *   node --import tsx scripts/repair-linha-desconto-inconsistente.ts --fechamento <id>
 *
 * Escrita exige opt-in explícito:
 *   node --import tsx scripts/repair-linha-desconto-inconsistente.ts --fechamento <id> --commit
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PackageAnalysis } from "../lib/prestacao-types"
import type { CommercialRuleForValidation } from "../lib/server/regras-comerciais"
import { validatePackage } from "../lib/server/package-rechecks"
import { buildReparoReceitas } from "./repair-indicadores-confiabilidade"
import { materializeIndicadoresSnapshots } from "../lib/server/indicadores-snapshots"

const FINANCIAL_TOLERANCE = 0.01
// Campos que já podem ter sido comunicados (eGestor, comprovante conferido)
// e portanto NUNCA podem mudar neste reparo. Divergência aborta o commit.
const INVARIANT_TOTAL_FIELDS = [
  "total_receitas",
  "total_despesas",
  "total_comissoes",
  "total_comissao_despesas",
  "total_a_repassar",
  "valor_comprovado",
] as const

export interface LineConsistencyRepairPlan {
  kind: "repaired" | "unchanged" | "divergent"
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown> | null
  analysisRepaired: PackageAnalysis | null
}

export function buildLineConsistencyRepairPlan(
  analysis: PackageAnalysis,
  commercialRule: CommercialRuleForValidation | null,
): LineConsistencyRepairPlan {
  if (!analysis.prestacao) {
    return { kind: "divergent", reason: "Fechamento sem prestação materializada.", before: {}, after: null, analysisRepaired: null }
  }

  const recalculated = validatePackage({
    documents: analysis.documents,
    prestacao: analysis.prestacao,
    repasse: analysis.repasse,
    despesas: analysis.despesas,
    reajuste: analysis.reajuste,
    commercialRule,
    historicalAgreementKeys: [],
  })

  const divergence = INVARIANT_TOTAL_FIELDS.find((field) => {
    const before = analysis.totals[field]
    const after = recalculated.totals[field]
    if (before === null || after === null) return before !== after
    return Math.abs(before - after) > FINANCIAL_TOLERANCE
  })
  if (divergence) {
    return {
      kind: "divergent",
      reason: `Recalcular a linha alterou ${divergence} (${analysis.totals[divergence]} → ${recalculated.totals[divergence]}); reparo abortado para não tocar valor já confirmado.`,
      before: snapshot(analysis),
      after: snapshot({ ...analysis, totals: recalculated.totals }),
      analysisRepaired: null,
    }
  }
  if (recalculated.parecer.status === "bloqueado" && analysis.parecer.status !== "bloqueado") {
    return {
      kind: "divergent",
      reason: "Recalcular a linha bloqueou o parecer técnico que antes não estava bloqueado; reparo abortado.",
      before: snapshot(analysis),
      after: null,
      analysisRepaired: null,
    }
  }

  const analysisRepaired: PackageAnalysis = {
    ...analysis,
    prestacao: recalculated.prestacao,
    totals: recalculated.totals,
    rechecks: recalculated.rechecks,
    guardrails: recalculated.guardrails,
    parecer: recalculated.parecer,
  }

  if (sameReceitas(analysis.prestacao.receitas_por_imovel, recalculated.prestacao?.receitas_por_imovel ?? [])) {
    return { kind: "unchanged", reason: "Nenhuma linha inconsistente encontrada.", before: snapshot(analysis), after: null, analysisRepaired: null }
  }

  return {
    kind: "repaired",
    reason: "Desconto integral inconsistente corrigido (aluguel_com_desconto restaurado); totais financeiros já confirmados permanecem intactos.",
    before: snapshot(analysis),
    after: snapshot(analysisRepaired),
    analysisRepaired,
  }
}

function sameReceitas(
  before: PackageAnalysis["prestacao"] extends null ? never : NonNullable<PackageAnalysis["prestacao"]>["receitas_por_imovel"],
  after: NonNullable<PackageAnalysis["prestacao"]>["receitas_por_imovel"],
) {
  if (before.length !== after.length) return false
  return before.every((row, index) => {
    const other = after[index]
    return row.desconto === other?.desconto && row.aluguel_com_desconto === other?.aluguel_com_desconto
  })
}

function snapshot(analysis: PackageAnalysis) {
  return {
    totals: analysis.totals,
    receitas: analysis.prestacao?.receitas_por_imovel.map((row) => ({
      apto: row.apto,
      desconto: row.desconto,
      aluguel_com_desconto: row.aluguel_com_desconto,
    })),
  }
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

function parseArgs(argv: string[]) {
  let commit = false
  let fechamentoId: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--commit") commit = true
    else if (argv[index] === "--fechamento") fechamentoId = argv[++index] ?? null
  }
  if (!fechamentoId) throw new Error("Uso: --fechamento <id> [--commit]")
  return { commit, fechamentoId }
}

async function loadCommercialRule(
  supabase: SupabaseClient,
  imobiliariaId: string,
  empreendimentoId: string,
): Promise<CommercialRuleForValidation | null> {
  const { getCommercialRuleForValidation } = await import("../lib/server/regras-comerciais")
  return getCommercialRuleForValidation(imobiliariaId, empreendimentoId)
}

async function main() {
  loadEnvLocal()
  const { commit, fechamentoId } = parseArgs(process.argv.slice(2))
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()

  const { data: fechamento, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,competencia,atualizado_em,analise_completa")
    .eq("id", fechamentoId)
    .single()
  if (error) throw error
  const analysis = fechamento.analise_completa as PackageAnalysis

  const commercialRule = await loadCommercialRule(
    supabase,
    fechamento.imobiliaria_id as string,
    fechamento.empreendimento_id as string,
  )
  const plan = buildLineConsistencyRepairPlan(analysis, commercialRule)
  console.log(JSON.stringify({ fechamentoId, mode: commit ? "commit" : "dry-run", plan }, null, 2))

  if (!commit || plan.kind !== "repaired" || !plan.analysisRepaired) return

  const receitas = buildReparoReceitas({
    fechamentoId,
    documentoId: plan.analysisRepaired.documents.find((d) => d.documentType === "prestacao_contas")?.documentoId ?? null,
    prestacao: plan.analysisRepaired.prestacao,
  })
  const { error: rpcError } = await supabase.rpc("aplicar_reparo_indicadores_v2", {
    p_fechamento_id: fechamentoId,
    p_esperado_atualizado_em: fechamento.atualizado_em,
    p_fechamento_patch: {
      analise_completa: plan.analysisRepaired,
      total_receitas: plan.analysisRepaired.totals.total_receitas,
      total_despesas: plan.analysisRepaired.totals.total_despesas,
      total_comissoes: plan.analysisRepaired.totals.total_comissoes,
      total_repassar: plan.analysisRepaired.totals.total_a_repassar,
    },
    p_receitas: receitas,
    p_auditoria: [{
      usuario: "Sistema - reparo de linha com desconto inconsistente",
      campo_alterado: "reparo_desconto_inconsistente",
      valor_anterior: JSON.stringify(plan.before),
      valor_novo: JSON.stringify(plan.after),
      justificativa: plan.reason,
    }],
  })
  if (rpcError) throw rpcError

  await materializeIndicadoresSnapshots({
    supabase: supabase as never,
    fechamentoId,
    imobiliariaId: fechamento.imobiliaria_id as string,
    empreendimentoId: fechamento.empreendimento_id as string,
    competencia: fechamento.competencia as string,
    analysis: plan.analysisRepaired,
    origem: "backfill",
  })
  console.log("Reparo aplicado e snapshots materializados.")
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : JSON.stringify(error))
    process.exitCode = 1
  })
}
