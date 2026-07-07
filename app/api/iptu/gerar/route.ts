import { NextResponse } from "next/server"
import { gerarIptuSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { gerarParcelasLote } from "@/lib/server/iptu"

export async function POST(request: Request) {
  const input = parseJson(gerarIptuSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const resultado = await gerarParcelasLote(input.data)
    if (resultado.conflito) {
      return NextResponse.json(
        {
          error: "Ja existe carne para um ou mais imoveis neste ano.",
          conflitos: resultado.conflitos,
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ resultado }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar parcelas." },
      { status: 400 },
    )
  }
}
