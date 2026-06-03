import { NextResponse } from "next/server"
import { imovelInputSchema, imovelPatchSchema, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

const selectFields = `
  id,
  empreendimento_id,
  imobiliaria_id,
  codigo_imobiliaria,
  unidade,
  tipo,
  inquilino_nome,
  status,
  valor_aluguel_esperado,
  taxa_administracao_percent,
  ativo,
  egestor_tag_id,
  observacoes,
  imobiliarias ( nome ),
  empreendimentos ( nome )
`

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin()
  const params = new URL(request.url).searchParams

  let query = supabase.from("imoveis").select(selectFields).order("unidade")

  const imobiliariaId = params.get("imobiliaria_id")
  const empreendimentoId = params.get("empreendimento_id")
  const status = params.get("status")
  const includeInactive = params.get("include_inactive") === "true"

  if (imobiliariaId) query = query.eq("imobiliaria_id", imobiliariaId)
  if (empreendimentoId) query = query.eq("empreendimento_id", empreendimentoId)
  if (status) query = query.eq("status", status)
  if (!includeInactive) query = query.eq("ativo", true)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imoveis: data ?? [] })
}

export async function POST(request: Request) {
  const input = parseJson(imovelInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("imoveis").insert(input.data).select(selectFields).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imovel: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const input = parseJson(imovelPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const { id, ...changes } = input.data
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.from("imoveis").update(changes).eq("id", id).select(selectFields).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imovel: data })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("imoveis")
    .update({ ativo: false, status: "inativo" })
    .eq("id", id)
    .select(selectFields)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imovel: data })
}
