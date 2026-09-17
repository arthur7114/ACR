import { NextResponse } from "next/server"
import { IndicadoresQueryValidationError, parseIndicadoresQuery } from "@/lib/indicadores-query"
import { getIndicadores } from "@/lib/server/indicadores"
import { gerarPdfIndicadores } from "@/lib/server/indicadores-pdf"

// Mesmo recorte de /api/indicadores (competencia, empresa, empreendimento,
// imovel), devolvido como PDF. O relatorio le o mesmo objeto que a tela.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const query = parseIndicadoresQuery(new URL(request.url).searchParams)
    const indicadores = await getIndicadores(query)
    const { buffer, nomeArquivo } = await gerarPdfIndicadores(indicadores)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof IndicadoresQueryValidationError) {
      return NextResponse.json(
        { error: { code: "INVALID_INDICADORES_QUERY", message: error.message } },
        { status: error.statusCode },
      )
    }
    console.error("Falha ao gerar o PDF dos indicadores.", error)
    return NextResponse.json(
      { error: { code: "INDICADORES_PDF_ERROR", message: "Não foi possível gerar o PDF dos indicadores." } },
      { status: 500 },
    )
  }
}
