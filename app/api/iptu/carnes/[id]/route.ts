import { NextResponse } from "next/server"
import { iptuCarnePatchSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { ajustarNumeroParcelas } from "@/lib/server/iptu"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const input = parseJson(iptuCarnePatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const carne = await ajustarNumeroParcelas(id, input.data.numero_parcelas)
    return NextResponse.json({ carne })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar carne." },
      { status: 400 },
    )
  }
}
