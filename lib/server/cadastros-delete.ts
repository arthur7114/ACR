import { createSupabaseAdmin } from "./supabase"

const BUCKET = "fechamento-documentos"

type Supabase = ReturnType<typeof createSupabaseAdmin>

// Remove os fechamentos informados de forma definitiva: apaga os PDFs no Storage
// e deleta as linhas (documentos/movimentacoes/validacoes/egestor cascateiam via
// ON DELETE CASCADE). Usado tanto na exclusao direta de fechamento quanto na
// exclusao em cascata de imobiliaria/empreendimento.
export async function purgeFechamentos(supabase: Supabase, fechamentoIds: string[]) {
  if (fechamentoIds.length === 0) return

  const { data: docs } = await supabase
    .from("documentos_fechamento")
    .select("arquivo_url")
    .in("fechamento_id", fechamentoIds)

  const paths = (docs ?? [])
    .map((doc) => doc.arquivo_url as string | null)
    .filter((path): path is string => Boolean(path))

  if (paths.length > 0) {
    // Falha no Storage nao deve impedir a limpeza do banco; apenas registramos.
    const { error } = await supabase.storage.from(BUCKET).remove(paths)
    if (error) console.warn("[CADASTROS] Falha ao remover arquivos do Storage:", error.message)
  }

  const { error } = await supabase.from("fechamentos").delete().in("id", fechamentoIds)
  if (error) throw error
}

async function fechamentoIdsBy(supabase: Supabase, column: "imobiliaria_id" | "empreendimento_id", id: string) {
  const { data, error } = await supabase.from("fechamentos").select("id").eq(column, id)
  if (error) throw error
  return (data ?? []).map((row) => row.id as string)
}

// Exclusao definitiva em cascata: remove fechamentos e imoveis vinculados antes
// do cadastro (as FKs sao RESTRICT, entao precisamos limpar manualmente; as
// regras_comerciais cascateiam sozinhas).
export async function hardDeleteImobiliaria(supabase: Supabase, id: string) {
  await purgeFechamentos(supabase, await fechamentoIdsBy(supabase, "imobiliaria_id", id))
  const delImoveis = await supabase.from("imoveis").delete().eq("imobiliaria_id", id)
  if (delImoveis.error) throw delImoveis.error
  const { error } = await supabase.from("imobiliarias").delete().eq("id", id)
  if (error) throw error
}

export async function hardDeleteEmpreendimento(supabase: Supabase, id: string) {
  await purgeFechamentos(supabase, await fechamentoIdsBy(supabase, "empreendimento_id", id))
  const delImoveis = await supabase.from("imoveis").delete().eq("empreendimento_id", id)
  if (delImoveis.error) throw delImoveis.error
  const { error } = await supabase.from("empreendimentos").delete().eq("id", id)
  if (error) throw error
}

export async function hardDeleteImovel(supabase: Supabase, id: string) {
  // movimentacoes.imovel_id usa ON DELETE SET NULL, entao a exclusao e direta.
  const { error } = await supabase.from("imoveis").delete().eq("id", id)
  if (error) throw error
}

export async function hardDeleteRegraComercial(supabase: Supabase, id: string) {
  const { error } = await supabase.from("regras_comerciais").delete().eq("id", id)
  if (error) throw error
}
