import { NextResponse } from "next/server"
import { syncImoveisFromFechamentos } from "@/lib/server/sync-imoveis"

export const runtime = "nodejs"

// POST /api/cadastros/imoveis/sync  { empreendimento_id?: string }
// Popula/atualiza o cadastro de imoveis a partir das prestacoes ja processadas.
export async function POST(request: Request) {
  let empreendimentoId: string | null = null
  try {
    const body = (await request.json()) as { empreendimento_id?: string } | null
    empreendimentoId = body?.empreendimento_id ?? null
  } catch {
    empreendimentoId = null
  }

  try {
    const resultado = await syncImoveisFromFechamentos({ empreendimentoId })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar imóveis."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
