import { requireApiRole } from "@/lib/server/api-auth"
import { NextResponse } from "next/server"
import {
  IndicadoresQueryValidationError,
  parseIndicadoresQuery,
} from "@/lib/indicadores-query"
import { getIndicadores } from "@/lib/server/indicadores"

export async function GET(request: Request) {
  const acessoNegado = await requireApiRole("visualizador")
  if (acessoNegado) return acessoNegado

  try {
    const query = parseIndicadoresQuery(new URL(request.url).searchParams)
    const indicadores = await getIndicadores(query)
    return NextResponse.json({ indicadores })
  } catch (error) {
    if (error instanceof IndicadoresQueryValidationError) {
      return NextResponse.json(
        { error: { code: "INVALID_INDICADORES_QUERY", message: error.message } },
        { status: error.statusCode },
      )
    }

    console.error("Falha ao carregar indicadores.", error)
    return NextResponse.json(
      {
        error: {
          code: "INDICADORES_INTERNAL_ERROR",
          message: "Nao foi possivel carregar os indicadores.",
        },
      },
      { status: 500 },
    )
  }
}
