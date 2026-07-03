import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { mesclarLogs } from "@/lib/server/logs"

export async function GET() {
  const supabase = createSupabaseAdmin()

  const [{ data: correcoes, error: correcoesError }, { data: notificacoes, error: notificacoesError }] =
    await Promise.all([
      supabase
        .from("auditoria_correcoes")
        .select("id, campo_alterado, valor_anterior, valor_novo, usuario, justificativa, criado_em")
        .order("criado_em", { ascending: false })
        .limit(200),
      supabase
        .from("notificacoes")
        .select("id, tipo, titulo, corpo, criado_em")
        .order("criado_em", { ascending: false })
        .limit(200),
    ])

  if (correcoesError) return NextResponse.json({ error: correcoesError.message }, { status: 400 })
  if (notificacoesError) return NextResponse.json({ error: notificacoesError.message }, { status: 400 })

  const logs = mesclarLogs(correcoes ?? [], notificacoes ?? [])
  return NextResponse.json({ logs })
}
