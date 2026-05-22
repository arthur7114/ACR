import { NextResponse } from "next/server"
import { imobiliariaInputSchema, imobiliariaPatchSchema, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET() {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("imobiliarias")
    .select("id,nome,cnpj,email,telefone,layout,ativo,tolerancia_repasse_reais,janela_antes_dias,janela_depois_dias,egestor_tag_id,observacoes")
    .order("nome")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliarias: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(imobiliariaInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("imobiliarias").insert(input.data).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliaria: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const input = parseJson(imobiliariaPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const { id, ...changes } = input.data
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("imobiliarias").update(changes).eq("id", id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliaria: data })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("imobiliarias").update({ ativo: false }).eq("id", id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliaria: data })
}
