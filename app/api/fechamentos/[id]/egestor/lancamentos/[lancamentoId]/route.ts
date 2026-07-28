import { NextResponse } from "next/server"
import { deleteManualEgestorLancamento, updateEgestorLancamentoCampo } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; lancamentoId: string }> },
) {
  try {
    const { id, lancamentoId } = await context.params
    const body = (await request.json()) as { descricao?: unknown; valor?: unknown; tags?: unknown }
    const mudancas: { descricao?: string; valor?: number; tags?: string[] } = {}
    if (typeof body?.descricao === "string") mudancas.descricao = body.descricao
    if (typeof body?.valor === "number") mudancas.valor = body.valor
    if (Array.isArray(body?.tags)) mudancas.tags = body.tags.filter((t): t is string => typeof t === "string")

    const lancamentos = await updateEgestorLancamentoCampo(createSupabaseAdmin(), id, lancamentoId, mudancas)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao editar o lancamento." },
      { status: 400 },
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; lancamentoId: string }> },
) {
  try {
    const { id, lancamentoId } = await context.params
    const lancamentos = await deleteManualEgestorLancamento(createSupabaseAdmin(), id, lancamentoId)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover o lancamento." },
      { status: 400 },
    )
  }
}
