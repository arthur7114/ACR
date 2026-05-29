import { createSupabaseAdmin } from "./supabase"

export interface CommercialRuleForValidation {
  taxa_administracao_percent: number
  taxa_intermediacao_percent: number
}

export async function getCommercialRuleForValidation(
  imobiliariaId: string | null | undefined,
  empreendimentoId: string | null | undefined,
): Promise<CommercialRuleForValidation | null> {
  if (!imobiliariaId || !empreendimentoId) return null

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("regras_comerciais")
    .select("taxa_administracao_percent,taxa_intermediacao_percent")
    .eq("imobiliaria_id", imobiliariaId)
    .eq("empreendimento_id", empreendimentoId)
    .eq("ativo", true)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    taxa_administracao_percent: Number(data.taxa_administracao_percent),
    taxa_intermediacao_percent: Number(data.taxa_intermediacao_percent),
  }
}
