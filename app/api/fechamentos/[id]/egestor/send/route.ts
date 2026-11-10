import { requireApiRole } from "@/lib/server/api-auth"
import { NextResponse } from "next/server"
import { sendEgestorLancamentos } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const acessoNegado = await requireApiRole("operador")
  if (acessoNegado) return acessoNegado

  try {
    const { id } = await context.params
    const body = await request.json()
    const lancamentos = await sendEgestorLancamentos(createSupabaseAdmin(), id, body.confirmation)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar ao eGestor." },
      { status: 400 },
    )
  }
}
