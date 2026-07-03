import { NextResponse } from "next/server"
import { listarIptuPorEmpreendimento } from "@/lib/server/persist-iptu"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")

  if (!empreendimentoId) {
    return NextResponse.json({ error: "empreendimento_id e obrigatorio." }, { status: 400 })
  }

  try {
    const carnes = await listarIptuPorEmpreendimento(empreendimentoId)
    return NextResponse.json({ carnes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar controle de IPTU." },
      { status: 500 },
    )
  }
}
