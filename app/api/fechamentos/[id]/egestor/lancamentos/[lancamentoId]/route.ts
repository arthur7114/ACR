import { NextResponse } from "next/server"
import { updateEgestorLancamentoDescricao } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; lancamentoId: string }> },
) {
  try {
    const { id, lancamentoId } = await context.params
    const body = (await request.json()) as { descricao?: unknown }
    const descricao = typeof body?.descricao === "string" ? body.descricao : ""
    const lancamentos = await updateEgestorLancamentoDescricao(createSupabaseAdmin(), id, lancamentoId, descricao)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao editar a descricao do lancamento." },
      { status: 400 },
    )
  }
}
