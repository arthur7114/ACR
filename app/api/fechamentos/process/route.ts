import { NextResponse } from "next/server"
import { startPackageProcessingInBackground } from "@/lib/server/background-processing"
import { loadAuthoritativeFechamentoContext, parseSubmittedFechamentoId } from "@/lib/server/fechamento-context-server"

export const runtime = "nodejs"

// Inicia o processamento do pacote em segundo plano e responde na hora (202).
// O job continua no servidor mesmo se o cliente fechar a aba; a tela acompanha
// por polling em GET /api/fechamentos/[id] e a conclusao gera uma notificacao.
export async function POST(request: Request) {
  const formData = await request.formData()
  const incoming = formData.getAll("files").filter((file): file is File => file instanceof File)
  const fechamentoId = parseSubmittedFechamentoId(formData.get("fechamentoContext"))

  if (!fechamentoId) {
    return NextResponse.json({ error: "Contexto do fechamento inválido." }, { status: 400 })
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Envie ao menos um arquivo para processamento." }, { status: 400 })
  }

  // Os bytes precisam ser desacoplados do request antes de iniciar o job.
  const files = await Promise.all(
    incoming.map(async (file) => new File([Buffer.from(await file.arrayBuffer())], file.name, { type: file.type })),
  )

  const context = await loadAuthoritativeFechamentoContext(fechamentoId)
  if (!context) {
    return NextResponse.json({ error: "Fechamento nao encontrado." }, { status: 404 })
  }

  const claimed = await startPackageProcessingInBackground(files, context)
  if (!claimed) {
    return NextResponse.json(
      { error: "Este fechamento já está sendo processado.", alreadyRunning: true },
      { status: 409 },
    )
  }

  return NextResponse.json({ accepted: true, fechamentoId: context.id }, { status: 202 })
}
