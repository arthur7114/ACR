import type { ReceitaPorImovel } from "@/lib/prestacao-types"
import { createSupabaseAdmin } from "./supabase"

export interface ReceitaMovement {
  id: string
  dados_extraidos: { linha_id?: string | null; apto?: string; inquilino?: string } | null
}

export interface FechamentoAuditInput {
  movimentacao_id?: string | null
  validacao_id?: string | null
  usuario: string
  campo_alterado: string
  valor_anterior: string | null
  valor_novo: string | null
  justificativa: string
}

export class FechamentoStaleError extends Error {}

export class FechamentoCorrectionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function ensureReceitaLineIds<T extends { receitas_por_imovel: ReceitaPorImovel[] }>(prestacao: T): T {
  const used = new Set<string>()
  return {
    ...prestacao,
    receitas_por_imovel: prestacao.receitas_por_imovel.map((row, index) => {
      const current = row.linha_id?.trim()
      let linhaId = current && !used.has(current) ? current : `receita-${String(index + 1).padStart(4, "0")}`
      while (used.has(linhaId)) linhaId = `${linhaId}-${index + 1}`
      used.add(linhaId)
      return { ...row, linha_id: linhaId }
    }),
  }
}

export function resolveReceitaMovement<T extends ReceitaMovement>(
  movements: T[],
  rows: ReceitaPorImovel[],
  index: number,
): T | null {
  const row = rows[index]
  if (!row) return null
  if (row.linha_id) {
    const byId = movements.filter((item) => item.dados_extraidos?.linha_id === row.linha_id)
    if (byId.length === 1) return byId[0]
    if (byId.length > 1 || movements.some((item) => item.dados_extraidos?.linha_id)) return null
  }
  const occurrence = rows.slice(0, index + 1).filter((item) => sameReceita(item, row)).length
  return movements.filter((item) => sameReceita(item.dados_extraidos, row))[occurrence - 1] ?? null
}

function sameReceita(
  left: { apto?: string; inquilino?: string | null } | null,
  right: { apto?: string; inquilino?: string | null },
) {
  return left?.apto === right.apto && (left?.inquilino ?? "") === (right.inquilino ?? "")
}

export async function applyFechamentoCorrection(input: {
  fechamentoId: string
  fechamentoPatch: Record<string, unknown>
  movimentacoes?: Array<Record<string, unknown>>
  validacoes?: Array<Record<string, unknown>> | null
  auditorias: FechamentoAuditInput[]
  imovelOperacao?: Record<string, unknown> | null
  permitirStatusFechado?: boolean
  esperadoAtualizadoEm?: string | null
}) {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.rpc("aplicar_correcao_fechamento", {
    p_fechamento_id: input.fechamentoId,
    p_fechamento_patch: input.fechamentoPatch,
    p_movimentacoes: input.movimentacoes ?? [],
    p_validacoes: input.validacoes ?? null,
    p_auditorias: input.auditorias,
    p_imovel_operacao: input.imovelOperacao ?? null,
    p_permitir_status_fechado: input.permitirStatusFechado ?? false,
    p_esperado_atualizado_em: input.esperadoAtualizadoEm ?? null,
  })
  if (error?.code === "40001") throw new FechamentoStaleError(error.message)
  if (error) throw error
  return data as { imovel: Record<string, unknown> | null }
}
