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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao importar certidao." },
      { status: 500 },
    )
  }
}
