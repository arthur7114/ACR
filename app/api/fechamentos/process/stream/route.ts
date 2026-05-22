import { runPackageWorkflowWithEvents } from "@/lib/server/package-workflow"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const formData = await request.formData()
  const files = formData.getAll("files").filter((file): file is File => file instanceof File)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of runPackageWorkflowWithEvents(files)) {
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
