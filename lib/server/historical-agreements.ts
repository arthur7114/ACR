import type { AcordoRescisaoRecebido } from "@/lib/prestacao-types"
import { buildAgreementPaymentKey } from "./package-rechecks"
import { createSupabaseAdmin } from "./supabase"

export async function loadHistoricalAgreementKeys(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: { id?: string | null; imobiliariaId?: string | null; empreendimentoId?: string | null },
) {
  if (!context.imobiliariaId || !context.empreendimentoId) return []
  const { data: fechamentos, error: fechamentoError } = await supabase
    .from("fechamentos").select("id")
    .eq("imobiliaria_id", context.imobiliariaId).eq("empreendimento_id", context.empreendimentoId)
  if (fechamentoError) throw fechamentoError
  const ids = (fechamentos ?? []).map((item) => item.id as string).filter((id) => id && id !== context.id)
  if (ids.length === 0) return []
  const { data, error } = await supabase.from("movimentacoes").select("dados_extraidos")
    .eq("tipo_movimentacao", "acordo_rescisao_recebido").in("fechamento_id", ids)
  if (error) throw error
  return (data ?? []).map((item) => buildAgreementPaymentKey(item.dados_extraidos as AcordoRescisaoRecebido))
    .filter((key): key is string => Boolean(key))
}
