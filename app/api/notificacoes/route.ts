import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export const runtime = "nodejs"

// Lista as notificacoes recentes + contagem de nao-lidas para o sino do topo.
export async function GET() {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, fechamento_id, tipo, titulo, corpo, lida, criado_em")
    .order("criado_em", { ascending: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const notificacoes = data ?? []
  const nao_lidas = notificacoes.filter((n) => !n.lida).length
  return NextResponse.json({ notificacoes, nao_lidas })
}
