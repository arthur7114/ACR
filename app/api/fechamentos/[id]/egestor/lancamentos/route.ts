import { NextResponse } from "next/server"
import { addManualEgestorLancamento } from "@/lib/server/egestor"
import type { EgestorCategoria, EgestorTipoLancamento } from "@/lib/egestor-types"
import { createSupabaseAdmin } from "@/lib/server/supabase"

const TIPOS: EgestorTipoLancamento[] = ["recebimento", "pagamento"]
const CATEGORIAS: EgestorCategoria[] = [
  "repasse_mensal",
  "comissao_administrativa",
  "energia",
  "agua",
  "iptu",
  "seguro",
  "outras_despesas",
]

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = (await request.json()) as {
      tipo?: unknown
      categoria?: unknown
      descricao?: unknown
      valor?: unknown
    }

    const tipo = body?.tipo
    const categoria = body?.categoria
    const descricao = typeof body?.descricao === "string" ? body.descricao.trim() : ""
    const valor = typeof body?.valor === "number" ? body.valor : Number(body?.valor)

    if (!TIPOS.includes(tipo as EgestorTipoLancamento)) {
      return NextResponse.json({ error: "Tipo invalido." }, { status: 400 })
    }
    if (!CATEGORIAS.includes(categoria as EgestorCategoria)) {
      return NextResponse.json({ error: "Categoria invalida." }, { status: 400 })
    }
    if (!descricao) {
      return NextResponse.json({ error: "Descricao obrigatoria." }, { status: 400 })
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Valor deve ser maior que zero." }, { status: 400 })
    }

    const lancamentos = await addManualEgestorLancamento(createSupabaseAdmin(), id, {
      tipo: tipo as EgestorTipoLancamento,
      categoria: categoria as EgestorCategoria,
      descricao,
      valor,
    })
    return NextResponse.json({ lancamentos }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao adicionar o lancamento." },
      { status: 400 },
    )
  }
}
