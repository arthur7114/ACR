import { NextResponse } from "next/server"
import { parseJson, regraComercialInputSchema, regraComercialPatchSchema } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

const selectFields = `
  id,
  imobiliaria_id,
  empreendimento_id,
  taxa_administracao_percent,
  taxa_intermediacao_percent,
  ativo,
  imobiliarias ( nome ),
  empreendimentos ( nome )
`

export async function GET() {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("regras_comerciais")
    .select(selectFields)
    .order("ativo", { ascending: false })
    .order("taxa_administracao_percent")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regrasComerciais: (data ?? []).map(normalizeRule) })
}

export async function POST(request: Request) {
  const input = parseJson(regraComercialInputSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("regras_comerciais")
    .upsert(input.data, { onConflict: "imobiliaria_id,empreendimento_id" })
    .select(selectFields)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regraComercial: normalizeRule(data) }, { status: 201 })
}

export async function PATCH(request: Request) {
  const input = parseJson(regraComercialPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  const { id, ...changes } = input.data
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("regras_comerciais")
    .update(changes)
    .eq("id", id)
    .select(selectFields)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regraComercial: normalizeRule(data) })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("regras_comerciais")
    .update({ ativo: false })
    .eq("id", id)
    .select(selectFields)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regraComercial: normalizeRule(data) })
}

function normalizeRule<T extends { taxa_administracao_percent: unknown; taxa_intermediacao_percent: unknown }>(rule: T) {
  return {
    ...rule,
    taxa_administracao_percent: Number(rule.taxa_administracao_percent),
    taxa_intermediacao_percent: Number(rule.taxa_intermediacao_percent),
  }
}
