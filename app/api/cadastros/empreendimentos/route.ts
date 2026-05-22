import { NextResponse } from "next/server"
import { empreendimentoInputSchema, empreendimentoPatchSchema, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET() {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("id,nome,codigo,descricao,endereco,ativo,egestor_tag_id")
    .order("nome")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimentos: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(empreendimentoInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("empreendimentos").insert(input.data).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimento: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const input = parseJson(empreendimentoPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const { id, ...changes } = input.data
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("empreendimentos").update(changes).eq("id", id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimento: data })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("empreendimentos").update({ ativo: false }).eq("id", id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimento: data })
}
