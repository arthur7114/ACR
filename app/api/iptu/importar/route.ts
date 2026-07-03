import { NextResponse } from "next/server"
import { extractIptuFromPdf } from "@/lib/server/analyze-iptu"
import { importarCertidaoIptu } from "@/lib/server/persist-iptu"

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  const imobiliariaId = formData.get("imobiliaria_id")
  const empreendimentoId = formData.get("empreendimento_id")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo e obrigatorio." }, { status: 400 })
  }
  if (typeof imobiliariaId !== "string" || typeof empreendimentoId !== "string") {
    return NextResponse.json({ error: "imobiliaria_id e empreendimento_id sao obrigatorios." }, { status: 400 })
  }

  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type.includes("pdf")
  if (!isPdf) {
    return NextResponse.json({ error: "Apenas PDF e aceito para a certidao de IPTU." }, { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo acima do limite de 20MB." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio ou invalido." }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  try {
    const extracao = await extractIptuFromPdf({
      fileName: file.name,
      fileType: file.type,
      fileBase64: fileBuffer.toString("base64"),
    })

    const resultado = await importarCertidaoIptu({
      imobiliariaId,
      empreendimentoId,
      fileName: file.name,
      fileType: file.type,
      fileBuffer,
      extracao,
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar certidao."
    const status = getErrorStatus(message)

    return NextResponse.json({ error: message }, { status })
  }
}

function getErrorStatus(message: string) {
  if (message.startsWith("Missing required environment variable")) return 500
  if (message.includes("A resposta da IA nao retornou texto estruturado")) return 422
  return 502
}
