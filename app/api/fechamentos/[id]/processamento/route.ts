import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export const runtime = "nodejs"

// Endpoint leve para o polling da tela de processamento. Mantido separado do GET
// principal do fechamento de proposito: as colunas de progresso podem nao existir
// antes da migration, e isso NAO pode derrubar a revisao. Busca resiliente.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = createSupabaseAdmin()

  const { data: base } = await supabase.from("fechamentos").select("status").eq("id", id).maybeSingle()
  if (!base) {
    return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 })
  }

  // Se as colunas de progresso ainda nao foram migradas, este select retorna erro
  // (data = null) e seguimos com nulls — o fluxo degrada para "sem job em background".
  const { data: proc } = await supabase
    .from("fechamentos")
    .select(
      "processamento_status, processamento_progress, processamento_evento, processamento_erro, processamento_atualizado_em",
    )
    .eq("id", id)
    .maybeSingle()

  return NextResponse.json({
    fechamento_status: base.status ?? null,
    processamento_status: proc?.processamento_status ?? null,
    processamento_progress: proc?.processamento_progress ?? null,
    processamento_evento: proc?.processamento_evento ?? null,
    processamento_erro: proc?.processamento_erro ?? null,
    processamento_atualizado_em: proc?.processamento_atualizado_em ?? null,
  })
}
