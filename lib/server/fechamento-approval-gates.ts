import { competenciaMesToDatabase } from "@/lib/competencia-fechamento"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"
import { loadFechamentoVinculosImoveis } from "./fechamento-imoveis"
import { resolveReceitaMovement } from "./fechamento-corrections"
import { createSupabaseAdmin } from "./supabase"

export async function assertFechamentoOperationalReady(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  fechamentoId: string,
) {
  const fechamento = await loadFechamento(supabase, fechamentoId)
  await assertMovements(supabase, fechamentoId, fechamento.analise)
  const vinculos = await loadFechamentoVinculosImoveis(supabase, {
    imobiliaria_id: fechamento.imobiliariaId,
    empreendimento_id: fechamento.empreendimentoId,
    analise_completa: fechamento.analise,
  })
  if (vinculos.pendentes.length > 0) {
    throw new Error(`${vinculos.pendentes.length} receita(s) estão sem imóvel vinculado. Resolva os vínculos antes de aprovar.`)
  }
}

async function assertMovements(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  fechamentoId: string,
  analysis: PackageAnalysis | null,
) {
  const rows = analysis?.prestacao?.receitas_por_imovel ?? []
  const movements = await loadMovements(supabase, fechamentoId)
  const inconsistent = countMovementInconsistencies(rows, movements)
  if (inconsistent > 0) throw new Error(`${inconsistent} receita(s) estão divergentes da movimentação. Reprocesse ou corrija antes de aprovar.`)
}

export function countMovementInconsistencies(
  rows: ReceitaPorImovel[],
  movements: Array<{
    id: string
    data_competencia: string | null
    imovel_id: string | null
    dados_extraidos: { apto?: string; inquilino?: string } | null
  }>,
) {
  return rows.filter((row, index) => {
    const movement = resolveReceitaMovement(movements, rows, index)
    if (!movement || movement.imovel_id !== row.imovel_id) return true
    const aluguel = row.aluguel_com_desconto ?? row.aluguel ?? 0
    const competenciaOriginal = competenciaMesToDatabase(row.competencia_original)
    return aluguel > 0 && competenciaOriginal !== null && movement.data_competencia !== competenciaOriginal
  }).length
}

async function loadMovements(supabase: ReturnType<typeof createSupabaseAdmin>, fechamentoId: string) {
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("id,data_competencia,imovel_id,dados_extraidos")
    .eq("fechamento_id", fechamentoId)
    .eq("tipo_movimentacao", "receita_aluguel")
    .order("criado_em", { ascending: true }).order("id", { ascending: true })
  if (error) throw error
  return data ?? []
}

async function loadFechamento(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("imobiliaria_id,empreendimento_id,analise_completa")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Fechamento não encontrado.")
  return {
    imobiliariaId: data.imobiliaria_id,
    empreendimentoId: data.empreendimento_id,
    analise: data.analise_completa as PackageAnalysis | null,
  }
}
