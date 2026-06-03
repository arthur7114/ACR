import { NextResponse } from "next/server"
import { empreendimentoInputSchema, empreendimentoPatchSchema, normalizeCadastroKey, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin()
  const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "true"
  let query = supabase
    .from("empreendimentos")
    .select("id,nome,codigo,descricao,endereco,ativo,egestor_tag_id")
    .order("nome")

  if (!includeInactive) query = query.eq("ativo", true)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimentos: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(empreendimentoInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data: existingRows, error: lookupError } = await supabase
    .from("empreendimentos")
    .select("id,nome,codigo")

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const targetName = normalizeCadastroKey(input.data.nome)
  const targetCode = normalizeCadastroKey(typeof input.data.codigo === "string" ? input.data.codigo : null)
  const existing = (existingRows ?? []).find((item) => {
    const sameName = normalizeCadastroKey(item.nome) === targetName
    const sameCode = targetCode && normalizeCadastroKey(item.codigo) === targetCode
    return sameName || sameCode
  })
  const query = existing
    ? supabase.from("empreendimentos").update({ ...input.data, ativo: true }).eq("id", existing.id)
    : supabase.from("empreendimentos").insert(input.data)

  const { data, error } = await query.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empreendimento: data }, { status: existing ? 200 : 201 })
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
