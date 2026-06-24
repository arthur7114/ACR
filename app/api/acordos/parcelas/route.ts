import { NextResponse } from "next/server"
import { darBaixaParcela } from "@/lib/server/acordos"

export const runtime = "nodejs"

// PATCH /api/acordos/parcelas  { parcela_id: string, pago: boolean }
export async function PATCH(request: Request) {
  let parcelaId: string | undefined
  let pago = true
  try {
    const body = (await request.json()) as { parcela_id?: string; pago?: boolean }
    parcelaId = body?.parcela_id
    pago = body?.pago ?? true
  } catch {
    parcelaId = undefined
  }

  if (!parcelaId) {
    return NextResponse.json({ error: "Informe parcela_id." }, { status: 400 })
  }

  try {
    await darBaixaParcela(parcelaId, pago)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao dar baixa na parcela."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
