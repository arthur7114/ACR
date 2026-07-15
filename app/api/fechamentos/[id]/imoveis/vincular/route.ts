import { NextResponse } from "next/server"
import { z } from "zod"
import { FechamentoCorrectionError, FechamentoStaleError } from "@/lib/server/fechamento-corrections"
import { vincularImovelFechamento } from "@/lib/server/vincular-imovel-fechamento"

const inputSchema = z.object({
  id: z.string().uuid(),
  indice: z.coerce.number().int().nonnegative(),
  modo: z.enum(["existente", "criar"]),
  imovel_id: z.string().uuid().optional(),
  status_sugerido: z.unknown().optional(),
  atualizacoes: z.object({ inquilino: z.boolean().optional(), status: z.boolean().optional(), aluguel: z.boolean().optional() }).optional(),
  cadastro: z.record(z.unknown()).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = inputSchema.safeParse({ ...(await request.json()), ...(await params) })
    if (!parsed.success) return NextResponse.json({ error: "Vínculo de receita inválido." }, { status: 400 })
    const result = await vincularImovelFechamento({ fechamentoId: parsed.data.id, indice: parsed.data.indice, modo: parsed.data.modo, imovelId: parsed.data.imovel_id, statusSugerido: parsed.data.status_sugerido, atualizacoes: parsed.data.atualizacoes, cadastro: parsed.data.cadastro })
    return NextResponse.json({ success: true, imovel: result.imovel, vinculos_imoveis: result.vinculos })
  } catch (error) {
    console.error("[VINCULAR IMOVEL ERROR]", error)
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505"
    const status = duplicate || error instanceof FechamentoStaleError ? 409 : error instanceof FechamentoCorrectionError ? error.status : 500
    const message = duplicate ? "Já existe um imóvel com este código ou unidade. Busque o cadastro existente para vinculá-lo." : error instanceof Error ? error.message : "Erro interno no servidor."
    return NextResponse.json({ error: message }, { status })
  }
}
