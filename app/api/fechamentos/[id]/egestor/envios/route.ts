import { NextResponse } from "next/server"
import { getEgestorEnvios } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const envios = await getEgestorEnvios(createSupabaseAdmin(), id)
    return NextResponse.json({ envios })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar envios eGestor." },
      { status: 400 },
    )
  }
}
