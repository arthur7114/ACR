import { NextResponse } from "next/server"
import { imovelInputSchema, normalizeCsvHeader } from "@/lib/server/cadastros"
import { createSupabaseAdmin } from "@/lib/server/supabase"

type CsvRow = Record<string, string>

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo CSV e obrigatorio." }, { status: 400 })
  }

  const rows = parseCsv(await file.text())
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV sem linhas de dados." }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()
  const [{ data: imobiliarias, error: imobiliariasError }, { data: empreendimentos, error: empreendimentosError }] =
    await Promise.all([
      supabase.from("imobiliarias").select("id,nome").eq("ativo", true),
      supabase.from("empreendimentos").select("id,nome").eq("ativo", true),
    ])

  if (imobiliariasError) return NextResponse.json({ error: imobiliariasError.message }, { status: 500 })
  if (empreendimentosError) return NextResponse.json({ error: empreendimentosError.message }, { status: 500 })

  const imobiliariaByName = new Map((imobiliarias ?? []).map((item) => [normalizeLookup(item.nome), item.id]))
  const empreendimentoByName = new Map((empreendimentos ?? []).map((item) => [normalizeLookup(item.nome), item.id]))
  const errors: Array<{ line: number; message: string }> = []
  const validRows = rows.flatMap((row, index) => {
    const line = index + 2
    const imobiliariaId = imobiliariaByName.get(normalizeLookup(row.imobiliaria ?? ""))
    const empreendimentoId = empreendimentoByName.get(normalizeLookup(row.empreendimento ?? ""))

    if (!imobiliariaId) errors.push({ line, message: `Imobiliaria nao encontrada: ${row.imobiliaria || "-"}` })
    if (!empreendimentoId) errors.push({ line, message: `Empreendimento nao encontrado: ${row.empreendimento || "-"}` })

    const parsed = imovelInputSchema.safeParse({
      imobiliaria_id: imobiliariaId,
      empreendimento_id: empreendimentoId,
      codigo_imobiliaria: row.codigo_imobiliaria,
      unidade: row.unidade,
      tipo: row.tipo,
      inquilino_nome: row.inquilino_nome,
      status: row.status || "ocupado",
      valor_aluguel_esperado: row.valor_aluguel_esperado,
      taxa_administracao_percent: row.taxa_administracao_percent,
      ativo: true,
    })

    if (!parsed.success) {
      errors.push({ line, message: parsed.error.issues.map((issue) => issue.message).join("; ") })
      return []
    }

    return [parsed.data]
  })

  if (errors.length > 0) {
    return NextResponse.json({ created: 0, updated: 0, errors }, { status: 422 })
  }

  const existingKeys = new Set<string>()
  for (const row of validRows) {
    const { data, error } = await supabase
      .from("imoveis")
      .select("id")
      .eq("imobiliaria_id", row.imobiliaria_id)
      .eq("empreendimento_id", row.empreendimento_id)
      .eq("codigo_imobiliaria", row.codigo_imobiliaria)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data) existingKeys.add(importKey(row))
  }

  const { error } = await supabase.from("imoveis").upsert(validRows, {
    onConflict: "imobiliaria_id,empreendimento_id,codigo_imobiliaria",
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const updated = validRows.filter((row) => existingKeys.has(importKey(row))).length
  return NextResponse.json({
    created: validRows.length - updated,
    updated,
    errors: [],
  })
}

function parseCsv(content: string) {
  const matrix = parseCsvMatrix(content.trim(), detectDelimiter(content))
  const [rawHeaders, ...dataRows] = matrix
  if (!rawHeaders) return []

  const headers = rawHeaders.map(normalizeCsvHeader)
  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) =>
      headers.reduce<CsvRow>((record, header, index) => {
        record[header] = row[index]?.trim() ?? ""
        return record
      }, {}),
    )
}

function parseCsvMatrix(content: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows
}

function detectDelimiter(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ""
  return firstLine.split(";").length > firstLine.split(",").length ? ";" : ","
}

function normalizeLookup(value: string) {
  return normalizeCsvHeader(value)
}

function importKey(row: { imobiliaria_id: string; empreendimento_id: string; codigo_imobiliaria: string }) {
  return `${row.imobiliaria_id}:${row.empreendimento_id}:${row.codigo_imobiliaria}`
}
