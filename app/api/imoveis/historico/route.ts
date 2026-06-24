import { NextResponse } from "next/server"
import { getImovelHistorico } from "@/lib/server/imovel-historico"

export const runtime = "nodejs"

// GET /api/imoveis/historico?empreendimento_id=...&unidade=...
// Historico derivado (Nivel 1) de um imovel a partir das prestacoes processadas.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")
  const unidade = params.get("unidade")

  if (!empreendimentoId || !unidade) {
    return NextResponse.json(
      { error: "Informe empreendimento_id e unidade." },
      { status: 400 },
    )
  }

  try {
    const historico = await getImovelHistorico({ empreendimentoId, unidade })
    return NextResponse.json({ historico })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar o histórico do imóvel."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
