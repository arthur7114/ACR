import { NextResponse } from "next/server"
import { getIndicadores } from "@/lib/server/indicadores"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  try {
    const data = await getIndicadores({
      competencia: params.get("competencia"),
      empreendimentoId: params.get("empreendimento_id"),
      imovel: params.get("imovel"),
    })
    return NextResponse.json({ indicadores: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao calcular indicadores."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
