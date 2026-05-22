import { runPackageWorkflowWithEvents } from "@/lib/server/package-workflow"
import type { FechamentoContext } from "@/lib/fechamento-context"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const formData = await request.formData()
  const files = formData.getAll("files").filter((file): file is File => file instanceof File)
  const rawContext = formData.get("fechamentoContext")
  const fechamentoContext = parseFechamentoContext(rawContext)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of runPackageWorkflowWithEvents(files, fechamentoContext)) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
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
