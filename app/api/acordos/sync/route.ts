import { NextResponse } from "next/server"
import { syncAcordosFromFechamentos } from "@/lib/server/acordos"

export const runtime = "nodejs"

// POST /api/acordos/sync  { empreendimento_id?: string }
export async function POST(request: Request) {
  let empreendimentoId: string | null = null
  try {
    const body = (await request.json()) as { empreendimento_id?: string } | null
    empreendimentoId = body?.empreendimento_id ?? null
  } catch {
    empreendimentoId = null
  }

  try {
    const result = await syncAcordosFromFechamentos({ empreendimentoId })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar acordos."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
