import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET() {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("fechamentos")
    .select(`
      id,
      competencia,
      status,
      total_repassar,
      valor_repassado_comprovante,
      diferenca_total,
      imobiliarias ( nome ),
      empreendimentos ( nome )
    `)
    .order("criado_em", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ fechamentos: data ?? [] })
}
