import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeCompetenciaMes } from "@/lib/competencia-fechamento"
import { corrigirCompetenciaReceita, FechamentoCorrectionError } from "@/lib/server/corrigir-competencia-receita"
import { FechamentoStaleError } from "@/lib/server/fechamento-corrections"

const inputSchema = z.object({
  id: z.string().uuid(),
  indice: z.coerce.number().int().nonnegative(),
  competencia_original: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = inputSchema.safeParse({ ...(await request.json()), ...(await params) })
    const competencia = parsed.success ? normalizeCompetenciaMes(parsed.data.competencia_original) : null
    if (!parsed.success || !competencia) return NextResponse.json({ error: "Informe a competência no formato MM/AAAA." }, { status: 400 })
    await corrigirCompetenciaReceita({ fechamentoId: parsed.data.id, indice: parsed.data.indice, competenciaOriginal: competencia })
    return NextResponse.json({ success: true, competencia_original: competencia })
  } catch (error) {
    console.error("[CORRIGIR COMPETENCIA ERROR]", error)
    const status = error instanceof FechamentoStaleError ? 409 : error instanceof FechamentoCorrectionError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno no servidor." }, { status })
  }
}
