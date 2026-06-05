import { NextResponse } from "next/server"
import { revalidateEgestorLancamentos } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const lancamentos = await revalidateEgestorLancamentos(createSupabaseAdmin(), id)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao revalidar eGestor." },
      { status: 400 },
    )
  }
}
