import { competenciaMesToDatabase, normalizeCompetenciaMes } from "@/lib/competencia-fechamento"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"
import { applyFechamentoCorrection, resolveReceitaMovement } from "./fechamento-corrections"
import { buildValidacoesRows } from "./persist-package"
import { validatePackage } from "./package-rechecks"
import { getCommercialRuleForValidation } from "./regras-comerciais"
import { createSupabaseAdmin } from "./supabase"
import { loadHistoricalAgreementKeys } from "./historical-agreements"

const EDITABLE_STATUSES = new Set(["pendente_revisao", "processado_com_sucesso"])

export class FechamentoCorrectionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function corrigirCompetenciaReceita(input: {
  fechamentoId: string
  indice: number
  competenciaOriginal: string
}) {
  const supabase = createSupabaseAdmin()
  const fechamento = await loadFechamento(supabase, input.fechamentoId)
  const context = getReceitaContext(fechamento.analise_completa, input.indice)
  const correctedRow = buildCorrectedRow(context.row, input.competenciaOriginal, fechamento.competencia)
  const analysis = replaceReceita(context.analysis, input.indice, correctedRow)
  const validation = await validateCorrectedAnalysis(analysis, fechamento)
  const resolved = await loadResolvedValidations(supabase, input.fechamentoId)
  const movements = await loadReceitaMovements(supabase, input.fechamentoId)
  const movement = resolveReceitaMovement(movements, context.rows, input.indice)
  if (!movement) throw new FechamentoCorrectionError("Movimentação da receita não encontrada. Reprocesse o fechamento antes de corrigir.", 409)
  const newAnalysis = preserveFinancials(analysis, validation)

  await applyFechamentoCorrection({
    fechamentoId: input.fechamentoId,
    fechamentoPatch: { analise_completa: newAnalysis, status: getValidationStatus(validation, resolved) },
    movimentacoes: [buildMovementPatch(movement.id, correctedRow)],
    validacoes: buildValidacoesRows({
      fechamentoId: input.fechamentoId,
      documents: newAnalysis.documents ?? [],
      parecer: validation.parecer,
      rechecks: validation.rechecks,
      guardrails: validation.guardrails,
      resolvedValidations: resolved,
    }),
    auditorias: [buildCompetenceAudit(context.row, correctedRow, movement.id)],
    esperadoAtualizadoEm: fechamento.atualizado_em,
  })
  return correctedRow.competencia_original
}

async function loadFechamento(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,competencia,status,analise_completa,atualizado_em")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new FechamentoCorrectionError("Fechamento não encontrado.", 404)
  if (!EDITABLE_STATUSES.has(data.status)) throw new FechamentoCorrectionError("Reabra a revisão antes de alterar a competência.", 409)
  return { ...data, analise_completa: data.analise_completa as PackageAnalysis | null }
}

function getReceitaContext(analysis: PackageAnalysis | null, index: number) {
  const rows = analysis?.prestacao?.receitas_por_imovel
  const row = rows?.[index]
  if (!analysis?.prestacao || !rows || !row) throw new FechamentoCorrectionError("Linha não encontrada na prestação.", 404)
  return { analysis, row, rows }
}

function buildCorrectedRow(row: ReceitaPorImovel, competencia: string, fechamentoCompetencia: string) {
  return {
    ...row,
    competencia_original: competencia,
    competencia_recebimento:
      normalizeCompetenciaMes(row.competencia_recebimento) ?? normalizeCompetenciaMes(fechamentoCompetencia),
  }
}

function replaceReceita(analysis: PackageAnalysis, index: number, row: ReceitaPorImovel): PackageAnalysis {
  const prestacao = analysis.prestacao!
  const receitas = [...prestacao.receitas_por_imovel]
  receitas[index] = row
  return { ...analysis, prestacao: { ...prestacao, receitas_por_imovel: receitas } }
}

async function validateCorrectedAnalysis(
  analysis: PackageAnalysis,
  fechamento: { id: string; imobiliaria_id: string; empreendimento_id: string },
) {
  const commercialRule = await getCommercialRuleForValidation(fechamento.imobiliaria_id, fechamento.empreendimento_id)
  const historicalAgreementKeys = await loadHistoricalAgreementKeys(createSupabaseAdmin(), {
    id: fechamento.id,
    imobiliariaId: fechamento.imobiliaria_id,
    empreendimentoId: fechamento.empreendimento_id,
  })
  return validatePackage({
    documents: analysis.documents ?? [],
    prestacao: analysis.prestacao,
    repasse: analysis.repasse ?? null,
    despesas: analysis.despesas ?? null,
    reajuste: analysis.reajuste ?? null,
    commercialRule,
    historicalAgreementKeys,
  })
}

async function loadResolvedValidations(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("validacoes")
    .select("tipo_validacao,status,justificativa,resolvido_por,resolvido_em")
    .eq("fechamento_id", id)
    .in("status", ["resolvida", "ignorada_com_justificativa"])
  if (error) throw error
  return data ?? []
}

async function loadReceitaMovements(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("id,dados_extraidos")
    .eq("fechamento_id", id)
    .eq("tipo_movimentacao", "receita_aluguel")
    .order("criado_em", { ascending: true }).order("id", { ascending: true })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; dados_extraidos: { apto?: string; inquilino?: string } | null }>
}

function preserveFinancials(analysis: PackageAnalysis, validation: ReturnType<typeof validatePackage>): PackageAnalysis {
  return {
    ...analysis,
    parecer: validation.parecer,
    rechecks: validation.rechecks,
    guardrails: validation.guardrails,
  }
}

function getValidationStatus(
  validation: ReturnType<typeof validatePackage>,
  resolved: Array<{ tipo_validacao: string }>,
) {
  const isResolved = (id: string) => resolved.some((item) => item.tipo_validacao === id)
  const blocked = validation.rechecks.some((item) => item.status === "failed" && !isResolved(item.id)) ||
    validation.guardrails.some((item) => item.status === "blocked" && !isResolved(item.id))
  return blocked ? "pendente_revisao" : "processado_com_sucesso"
}

function buildMovementPatch(id: string, row: ReceitaPorImovel) {
  return {
    id,
    data_competencia: competenciaMesToDatabase(row.competencia_original),
    dados_extraidos: row,
    corrigido_manualmente: true,
  }
}

function buildCompetenceAudit(before: ReceitaPorImovel, after: ReceitaPorImovel, movementId: string | null) {
  return {
    movimentacao_id: movementId,
    usuario: "Operador",
    campo_alterado: `competencia_original:${before.apto}`,
    valor_anterior: before.competencia_original ?? before.vencimento ?? null,
    valor_novo: after.competencia_original ?? null,
    justificativa: "Competência original confirmada na revisão do fechamento.",
  }
}
