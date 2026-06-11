import { readFileSync } from "fs"
import {
  extractPdfTextLines,
  isCesarRegoConsolidado,
  parseCesarRegoPrestacao,
} from "../lib/server/cesar-rego-parser"

const pdfPath = process.argv[2]
const competencia = process.argv[3] ?? "2026-03"
if (!pdfPath) {
  console.error("uso: npx tsx scripts/test-cesar-rego-parser.ts <pdf> [competencia YYYY-MM]")
  process.exit(1)
}

async function main() {
  const buffer = readFileSync(pdfPath)
  const lines = await extractPdfTextLines(buffer)
  console.log("layout C detectado:", isCesarRegoConsolidado(lines))
  const analysis = parseCesarRegoPrestacao(lines, competencia)
  console.log(JSON.stringify(analysis, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
