import { NextResponse } from "next/server"
import { listarImportacoesPorEmpreendimento } from "@/lib/server/persist-iptu"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")

  if (!empreendimentoId) {
    return NextResponse.json({ error: "empreendimento_id e obrigatorio." }, { status: 400 })
  }

  try {
    const importacoes = await listarImportacoesPorEmpreendimento(empreendimentoId)
    return NextResponse.json({ importacoes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar historico de importacoes." },
      { status: 500 },
    )
  }
}
