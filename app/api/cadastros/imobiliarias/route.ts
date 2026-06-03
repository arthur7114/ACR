import { NextResponse } from "next/server"
import { imobiliariaInputSchema, imobiliariaPatchSchema, normalizeCadastroKey, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin()
  const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "true"
  let query = supabase
    .from("imobiliarias")
    .select("id,nome,cnpj,email,telefone,layout,ativo,tolerancia_repasse_reais,janela_antes_dias,janela_depois_dias,egestor_tag_id,observacoes")
    .order("nome")

  if (!includeInactive) query = query.eq("ativo", true)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliarias: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(imobiliariaInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data: existingRows, error: lookupError } = await supabase
    .from("imobiliarias")
    .select("id,nome")

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const existing = (existingRows ?? []).find((item) => normalizeCadastroKey(item.nome) === normalizeCadastroKey(input.data.nome))
  const query = existing
    ? supabase.from("imobiliarias").update({ ...input.data, ativo: true }).eq("id", existing.id)
    : supabase.from("imobiliarias").insert(input.data)

  const { data, error } = await query.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliaria: data }, { status: existing ? 200 : 201 })
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
