import { NextResponse } from "next/server"
import { baixarIptuSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { baixarParcelas } from "@/lib/server/iptu"

export async function POST(request: Request) {
  const input = parseJson(baixarIptuSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const resultado = await baixarParcelas(input.data)
    return NextResponse.json({ resultado })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao dar baixa." },
      { status: 400 },
    )
  }
}
