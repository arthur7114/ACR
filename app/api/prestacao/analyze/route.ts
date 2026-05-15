import { NextResponse } from "next/server"
import { runPrestacaoAliveWorkflow } from "@/lib/server/prestacao-workflow"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo PDF de prestacao de contas." }, { status: 400 })
    }

    const result = await runPrestacaoAliveWorkflow(file)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao analisar a prestacao."
    const status = getErrorStatus(message)

    return NextResponse.json({ error: message }, { status })
  }
}

function getErrorStatus(message: string) {
  if (message.startsWith("Missing required environment variable")) return 500
  if (message.includes("Apenas PDF") || message.includes("20MB") || message.includes("Arquivo vazio")) return 400
  if (message.includes("nao parece conter")) return 422
  return 502
}
