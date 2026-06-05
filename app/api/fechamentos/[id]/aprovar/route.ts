import { NextResponse } from "next/server"
import { approveFechamentoForEgestor } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const fechamento = await approveFechamentoForEgestor(createSupabaseAdmin(), id)
    return NextResponse.json({ fechamento })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao aprovar fechamento." },
      { status: 400 },
    )
  }
}
