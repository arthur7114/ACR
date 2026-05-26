import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { status = "resolvida", justificativa } = await request.json()

    if (!justificativa || typeof justificativa !== "string" || justificativa.trim() === "") {
      return NextResponse.json(
        { error: "Justificativa obrigatória." },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()

    // 1. Fetch the target validation
    const { data: validacao, error: fetchError } = await supabase
      .from("validacoes")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !validacao) {
      return NextResponse.json(
        { error: "Validação não encontrada." },
        { status: 404 }
      )
    }

    // 2. Update validation row with resolution details
    const { error: updateError } = await supabase
      .from("validacoes")
      .update({
        status,
        justificativa,
        resolvido_por: "Operador",
        resolvido_em: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) throw updateError

    // 3. Write log to auditoria_correcoes table
    const { error: logError } = await supabase
      .from("auditoria_correcoes")
      .insert({
        fechamento_id: validacao.fechamento_id,
        validacao_id: validacao.id,
        movimentacao_id: validacao.movimentacao_id,
        usuario: "Operador",
        campo_alterado: validacao.tipo_validacao,
        valor_anterior: validacao.valor_encontrado !== null ? String(validacao.valor_encontrado) : null,
        valor_novo: validacao.valor_esperado !== null ? String(validacao.valor_esperado) : null,
        justificativa: justificativa.trim(),
      })

    if (logError) throw logError

    // 4. Check if any blocking validations remain open for this fechamento (excluding parecer_tecnico)
    const { data: openValidations, error: openError } = await supabase
      .from("validacoes")
      .select("id")
      .eq("fechamento_id", validacao.fechamento_id)
      .eq("status", "aberta")
      .eq("severidade", "bloqueante")
      .neq("tipo_validacao", "parecer_tecnico")

    if (openError) throw openError

    // If no blocking validations remain, transition fechamento status and resolve the technical opinion validation row
    if (!openValidations || openValidations.length === 0) {
      await supabase
        .from("validacoes")
        .update({
          status: "resolvida",
          justificativa: "Resolução automática: todos os conflitos bloqueantes individuais foram sanados.",
          resolvido_por: "Sistema",
          resolvido_em: new Date().toISOString(),
        })
        .eq("fechamento_id", validacao.fechamento_id)
        .eq("tipo_validacao", "parecer_tecnico")

      const { error: closeStatusError } = await supabase
        .from("fechamentos")
        .update({ status: "processado_com_sucesso" })
        .eq("id", validacao.fechamento_id)

      if (closeStatusError) throw closeStatusError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[RESOLVER ERROR]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno no servidor." },
      { status: 500 }
    )
  }
}
