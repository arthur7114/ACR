import { NextResponse } from "next/server"
import { fechamentoInputSchema, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin()
  const includeArquivados = new URL(request.url).searchParams.get("include_arquivados") === "true"

  let query = supabase
    .from("fechamentos")
    .select(`
      id,
      competencia,
      status,
      arquivado,
      total_repassar,
      valor_repassado_comprovante,
      diferenca_total,
      atualizado_em,
      imobiliarias ( nome ),
      empreendimentos ( nome )
    `)
    .order("criado_em", { ascending: false })

  if (!includeArquivados) query = query.eq("arquivado", false)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ fechamentos: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(fechamentoInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("fechamentos")
    .upsert(
      {
        imobiliaria_id: input.data.imobiliaria_id,
        empreendimento_id: input.data.empreendimento_id,
        competencia: input.data.competencia,
        observacoes: input.data.observacoes,
        status: "rascunho",
      },
      { onConflict: "imobiliaria_id,empreendimento_id,competencia" },
    )
    .select(`
      id,
      imobiliaria_id,
      empreendimento_id,
      competencia,
      status,
      imobiliarias ( nome ),
      empreendimentos ( nome )
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ fechamento: data }, { status: 201 })
}
