import { NextResponse } from "next/server"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { isProcessingActive, startPackageProcessingInBackground } from "@/lib/server/background-processing"

export const runtime = "nodejs"

// Inicia o processamento do pacote em segundo plano e responde na hora (202).
// O job continua no servidor mesmo se o cliente fechar a aba; a tela acompanha
// por polling em GET /api/fechamentos/[id] e a conclusao gera uma notificacao.
export async function POST(request: Request) {
  const formData = await request.formData()
  const incoming = formData.getAll("files").filter((file): file is File => file instanceof File)
  const context = parseFechamentoContext(formData.get("fechamentoContext"))

  if (!context) {
    return NextResponse.json({ error: "Contexto do fechamento inválido." }, { status: 400 })
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Envie ao menos um arquivo para processamento." }, { status: 400 })
  }

  if (await isProcessingActive(context.id)) {
    return NextResponse.json(
      { error: "Este fechamento já está sendo processado.", alreadyRunning: true },
      { status: 409 },
    )
  }

  // Le os bytes ANTES de responder e reconstroi Files desacoplados do request,
  // para o job destacado sobreviver ao fim da conexao HTTP.
  const files = await Promise.all(
    incoming.map(async (file) => new File([Buffer.from(await file.arrayBuffer())], file.name, { type: file.type })),
  )

  await startPackageProcessingInBackground(files, context)

  return NextResponse.json({ accepted: true, fechamentoId: context.id }, { status: 202 })
}

function parseFechamentoContext(rawContext: FormDataEntryValue | null): FechamentoContext | null {
  if (typeof rawContext !== "string") return null

  try {
    const parsed = JSON.parse(rawContext) as Partial<FechamentoContext>
    if (
      typeof parsed.id === "string" &&
      typeof parsed.imobiliariaId === "string" &&
      typeof parsed.imobiliariaNome === "string" &&
      typeof parsed.empreendimentoId === "string" &&
      typeof parsed.empreendimentoNome === "string" &&
      typeof parsed.competencia === "string"
    ) {
      return parsed as FechamentoContext
    }
  } catch {
    return null
  }

  return null
}
