import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { EgestorClient } from "@/lib/server/egestor-client"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const contaId = searchParams.get("conta_id")
  if (!contaId) return NextResponse.json({ error: "conta_id obrigatorio." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("egestor_contas")
    .select("personal_token")
    .eq("id", contaId)
    .single()

  if (error || !data) return NextResponse.json({ error: "Conta nao encontrada." }, { status: 404 })
  if (!data.personal_token) return NextResponse.json({ error: "Token nao configurado para esta conta." }, { status: 400 })

  const client = new EgestorClient({ personalToken: data.personal_token as string })
  const contatos = await client.getContatos()
  return NextResponse.json(contatos)
}
