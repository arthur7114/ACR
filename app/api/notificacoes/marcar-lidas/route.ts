import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export const runtime = "nodejs"

// Marca notificacoes como lidas. Sem corpo (ou ids vazio) => marca todas as nao-lidas.
export async function POST(request: Request) {
  const supabase = createSupabaseAdmin()

  let ids: string[] | null = null
  try {
    const body = await request.json().catch(() => ({}))
    if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((value: unknown): value is string => typeof value === "string")
    }
  } catch {
    ids = null
  }

  const base = supabase.from("notificacoes").update({ lida: true }).eq("lida", false)
  const { error } = ids && ids.length > 0 ? await base.in("id", ids) : await base

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
