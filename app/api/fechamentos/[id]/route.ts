import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { purgeFechamentos } from "@/lib/server/cadastros-delete"
import type { PackageAnalysis } from "@/lib/prestacao-types"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("fechamentos")
    .select(`
      id,
      imobiliaria_id,
      empreendimento_id,
      competencia,
      status,
      observacoes,
      total_receitas,
      total_despesas,
      total_comissoes,
      total_repassar,
      valor_repassado_comprovante,
      diferenca_total,
      comentario_operador,
      analise_completa,
      criado_em,
      atualizado_em,
      imobiliarias ( id, nome ),
      empreendimentos ( id, nome )
    `)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: "Fechamento nao encontrado." }, { status: 404 })
  }

  const analiseCompleta = (data.analise_completa as PackageAnalysis | null) ?? null
  const { data: regraComercial } = await supabase
    .from("regras_comerciais")
    .select("id,taxa_administracao_percent,taxa_intermediacao_percent,ativo")
    .eq("imobiliaria_id", data.imobiliaria_id)
    .eq("empreendimento_id", data.empreendimento_id)
    .eq("ativo", true)
    .maybeSingle()
  const regraComercialNormalizada = regraComercial
    ? {
        ...regraComercial,
        taxa_administracao_percent: Number(regraComercial.taxa_administracao_percent),
        taxa_intermediacao_percent: Number(regraComercial.taxa_intermediacao_percent),
      }
    : null

  if (analiseCompleta) {
    const { data: dbValidacoes } = await supabase
      .from("validacoes")
      .select("*")
      .eq("fechamento_id", id)

    if (dbValidacoes) {
      if (analiseCompleta.rechecks) {
        analiseCompleta.rechecks = analiseCompleta.rechecks.map((check) => {
          const dbVal = dbValidacoes.find((v) => v.tipo_validacao === check.id)
          return {
            ...check,
            databaseId: dbVal?.id ?? null,
            dbStatus: dbVal?.status ?? "aberta",
            justificativa: dbVal?.justificativa ?? null,
            status: dbVal && (dbVal.status === "resolvida" || dbVal.status === "ignorada_com_justificativa") ? "passed" : check.status,
          }
        })
      }
      if (analiseCompleta.guardrails) {
        analiseCompleta.guardrails = analiseCompleta.guardrails.map((guardrail) => {
          const dbVal = dbValidacoes.find((v) => v.tipo_validacao === guardrail.id)
          return {
            ...guardrail,
            databaseId: dbVal?.id ?? null,
            dbStatus: dbVal?.status ?? "aberta",
            justificativa: dbVal?.justificativa ?? null,
            status: dbVal && (dbVal.status === "resolvida" || dbVal.status === "ignorada_com_justificativa") ? "passed" : guardrail.status,
          }
        })
      }
      const dbParecer = dbValidacoes.find((v) => v.tipo_validacao === "parecer_tecnico")
      if (dbParecer && (dbParecer.status === "resolvida" || dbParecer.status === "ignorada_com_justificativa")) {
        analiseCompleta.parecer.status = "aprovado_tecnico"
      }
    }
  }

  return NextResponse.json({
    fechamento: {
      id: data.id,
      imobiliaria_id: data.imobiliaria_id,
      empreendimento_id: data.empreendimento_id,
      competencia: data.competencia,
      status: data.status,
      observacoes: data.observacoes,
      total_receitas: data.total_receitas,
      total_despesas: data.total_despesas,
      total_comissoes: data.total_comissoes,
      total_repassar: data.total_repassar,
      valor_repassado_comprovante: data.valor_repassado_comprovante,
      diferenca_total: data.diferenca_total,
      comentario_operador: data.comentario_operador,
      criado_em: data.criado_em,
      atualizado_em: data.atualizado_em,
      imobiliarias: data.imobiliarias,
      empreendimentos: data.empreendimentos,
      regra_comercial: regraComercialNormalizada,
    },
    analise_completa: analiseCompleta,
    egestor_lancamentos: await getEgestorLancamentos(supabase, id),
    egestor_envios: await getEgestorEnvios(supabase, id),
    status_eventos: await getStatusEventos(supabase, id),
  })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = createSupabaseAdmin()

  try {
    const body = await request.json()

    const changes: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
    if ("comentario_operador" in body) changes.comentario_operador = body.comentario_operador ?? null
    if (typeof body.arquivado === "boolean") changes.arquivado = body.arquivado

    const { data, error } = await supabase
      .from("fechamentos")
      .update(changes)
      .eq("id", id)
      .select("id, comentario_operador, arquivado")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ fechamento: data })
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = createSupabaseAdmin()

  try {
    await purgeFechamentos(supabase, [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao excluir fechamento." }, { status: 500 })
  }
}

async function getEgestorLancamentos(supabase: ReturnType<typeof createSupabaseAdmin>, fechamentoId: string) {
  const { data } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .order("tipo")
    .order("categoria")

  return data ?? []
}

async function getEgestorEnvios(supabase: ReturnType<typeof createSupabaseAdmin>, fechamentoId: string) {
  const { data } = await supabase
    .from("egestor_envios")
    .select("id,fechamento_id,lancamento_id,acao,status,erro,request_payload,response_payload,criado_em")
    .eq("fechamento_id", fechamentoId)
    .order("criado_em", { ascending: false })
    .limit(50)

  return data ?? []
}

async function getStatusEventos(supabase: ReturnType<typeof createSupabaseAdmin>, fechamentoId: string) {
  const { data } = await supabase
    .from("fechamento_status_eventos")
    .select("id,status_anterior,status_novo,usuario,motivo,criado_em")
    .eq("fechamento_id", fechamentoId)
    .order("criado_em", { ascending: false })
    .limit(20)

  return data ?? []
}
