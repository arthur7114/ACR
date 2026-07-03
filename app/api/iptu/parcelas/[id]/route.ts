import { NextResponse } from "next/server"
import { iptuParcelaPatchSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { atualizarResponsavelParcela } from "@/lib/server/persist-iptu"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const input = parseJson(iptuParcelaPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const parcela = await atualizarResponsavelParcela(id, input.data.responsavel)
    return NextResponse.json({ parcela })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar parcela." },
      { status: 400 },
    )
  }
}
