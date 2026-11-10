import { requireApiRole } from "@/lib/server/api-auth"
import { NextResponse } from "next/server"
import { approveFechamentoForEgestor } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { assertFechamentoOperationalReady } from "@/lib/server/fechamento-approval-gates"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const acessoNegado = await requireApiRole("aprovador")
  if (acessoNegado) return acessoNegado

  try {
    const { id } = await context.params
    const supabase = createSupabaseAdmin()
    await assertFechamentoOperationalReady(supabase, id)
    const fechamento = await approveFechamentoForEgestor(supabase, id)
    return NextResponse.json({ fechamento })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao aprovar fechamento." },
      { status: 400 },
    )
  }
}
