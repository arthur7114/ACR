import { NextResponse } from "next/server"
import { fechamentoInputSchema, parseJson } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

const FECHAMENTO_BASE_SELECT = `
  id,
  imobiliaria_id,
  empreendimento_id,
  competencia,
  status,
  processamento_status,
  processamento_atualizado_em,
  total_repassar,
  valor_repassado_comprovante,
  diferenca_total,
  atualizado_em,
  imobiliarias ( nome ),
  empreendimentos ( nome )
`

export async function GET(request: Request) {
  const supabase = createSupabaseAdmin()
  const includeArquivados = new URL(request.url).searchParams.get("include_arquivados") === "true"

  let query = supabase
    .from("fechamentos")
    .select(`${FECHAMENTO_BASE_SELECT}, arquivado`)
    .order("criado_em", { ascending: false })

  if (!includeArquivados) query = query.eq("arquivado", false)

  const primary = await query
  let data = primary.data as Array<Record<string, unknown>> | null
  let error = primary.error

  // Resiliencia: se a migration da coluna 'arquivado' ainda nao foi aplicada,
  // a lista nao pode quebrar — retorna sem o filtro de arquivamento.
  if (error && /arquivado/i.test(error.message)) {
    const fallback = await supabase
      .from("fechamentos")
      .select(FECHAMENTO_BASE_SELECT)
      .order("criado_em", { ascending: false })
    data = fallback.data as Array<Record<string, unknown>> | null
    error = fallback.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const ids = rows.map((row) => String(row.id))
  const analyzedIds = new Set<string>()

  if (ids.length > 0) {
    const analyzed = await supabase
      .from("fechamentos")
      .select("id")
      .in("id", ids)
      .not("analise_completa", "is", null)

    if (analyzed.error) {
      return NextResponse.json({ error: analyzed.error.message }, { status: 500 })
    }

    analyzed.data?.forEach((row) => analyzedIds.add(row.id))
  }

  return NextResponse.json({
    fechamentos: rows.map((row) => ({
      ...row,
      has_analysis: analyzedIds.has(String(row.id)),
    })),
  })
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
        // Criar um fechamento para uma combinacao (imobiliaria, empreendimento,
        // competencia) que ja existe arquivada DEVE desarquiva-la — caso contrario
        // o "novo" fechamento nasce invisivel na lista inicial (que filtra
        // arquivado=false). Sem isto, recriar um fechamento arquivado some da tela.
        arquivado: false,
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
