import { NextResponse } from "next/server"
import { z } from "zod"

import { parseJson } from "@/lib/server/cadastros"
import { cadastrarContratoManual, contratosDaUnidade, removerContrato } from "@/lib/server/imovel-contratos"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export const runtime = "nodejs"

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD.")
const contratoSchema = z
  .object({
    imovel_id: z.string().uuid(),
    locatario: z.string().trim().transform((valor) => (valor === "" ? null : valor)).nullish(),
    inicio: data,
    termino: z.union([z.literal("").transform(() => null), data]).nullish(),
  })
  .refine((valor) => !valor.termino || valor.termino >= valor.inicio, { message: "Término do contrato não pode ser anterior ao início." })

// GET /api/cadastros/imoveis/contratos?empreendimento_id=...&unidade=...
// Os contratos da unidade, de qualquer tela que abra o detalhe do imóvel.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")
  const unidade = params.get("unidade")
  if (!empreendimentoId || !unidade) {
    return NextResponse.json({ error: "Informe empreendimento_id e unidade." }, { status: 400 })
  }
  try {
    return NextResponse.json(await contratosDaUnidade(createSupabaseAdmin(), empreendimentoId, unidade))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar contratos." }, { status: 500 })
  }
}

// POST: cadastra um contrato. O mesmo início de um contrato existente o corrige.
export async function POST(request: Request) {
  const input = parseJson(contratoSchema, await request.json())
  if (input.error || !input.data) return NextResponse.json({ error: input.error ?? "Payload invalido." }, { status: 400 })
  try {
    const resultado = await cadastrarContratoManual(createSupabaseAdmin(), {
      imovelId: input.data.imovel_id,
      locatario: input.data.locatario ?? null,
      inicio: input.data.inicio,
      termino: input.data.termino ?? null,
    })
    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao cadastrar contrato." }, { status: 500 })
  }
}

// DELETE /api/cadastros/imoveis/contratos?imovel_id=...&contrato_id=...
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams
  const imovelId = params.get("imovel_id")
  const contratoId = params.get("contrato_id")
  if (!imovelId || !contratoId) return NextResponse.json({ error: "Informe imovel_id e contrato_id." }, { status: 400 })
  try {
    return NextResponse.json(await removerContrato(createSupabaseAdmin(), imovelId, contratoId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao remover contrato." }, { status: 500 })
  }
}
