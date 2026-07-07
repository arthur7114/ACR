import { NextResponse } from "next/server"
import type { IptuFiltros, IptuStatus } from "@/lib/iptu-types"
import { listarParcelas } from "@/lib/server/iptu"

const STATUS_VALIDOS: IptuStatus[] = ["aberto", "vencido", "pago"]

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const statusParam = params.get("status")
  const anoParam = params.get("ano")
  const status = statusParam && STATUS_VALIDOS.includes(statusParam as IptuStatus)
    ? (statusParam as IptuStatus)
    : undefined

  const filtros: IptuFiltros = {
    imobiliariaId: params.get("imobiliariaId") ?? undefined,
    empreendimentoId: params.get("empreendimentoId") ?? undefined,
    imovelId: params.get("imovelId") ?? undefined,
    ano: anoParam ? Number(anoParam) : undefined,
    status,
    vencimentoInicio: params.get("vencimentoInicio") ?? undefined,
    vencimentoFim: params.get("vencimentoFim") ?? undefined,
    mesVencimento: params.get("mesVencimento") ?? undefined,
  }

  const page = Number(params.get("page") ?? "1") || 1
  const pageSize = Number(params.get("pageSize") ?? "50") || 50
  const sort = params.get("sort") ?? undefined

  try {
    const resultado = await listarParcelas(filtros, { page, pageSize, sort })
    return NextResponse.json(resultado)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao listar IPTU." },
      { status: 500 },
    )
  }
}
