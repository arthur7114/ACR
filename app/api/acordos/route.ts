import { NextResponse } from "next/server"
import { getAcordosByUnidade } from "@/lib/server/acordos"

export const runtime = "nodejs"

// GET /api/acordos?empreendimento_id=...&unidade=...
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")
  const unidade = params.get("unidade")
  if (!empreendimentoId || !unidade) {
    return NextResponse.json({ error: "Informe empreendimento_id e unidade." }, { status: 400 })
  }
  try {
    const result = await getAcordosByUnidade({ empreendimentoId, unidade })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar acordos."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
