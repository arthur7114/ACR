import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
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
      criado_em: data.criado_em,
      atualizado_em: data.atualizado_em,
      imobiliarias: data.imobiliarias,
      empreendimentos: data.empreendimentos,
    },
    analise_completa: analiseCompleta,
  })
}
