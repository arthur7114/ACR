import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import {
  extractPdfTextLines,
  isCesarRegoConsolidado,
  parseCesarRegoPrestacao,
} from "./cesar-rego-parser.ts"

const FIXTURE = join(
  process.cwd(),
  "docs/Artefatos/extratoagrupado - cesar rego - REF 03-26 (1).pdf",
)

test("César Rêgo março usa o resumo como verdade e separa IPTU de passagem", async () => {
  const lines = await extractPdfTextLines(readFileSync(FIXTURE))
  assert.equal(isCesarRegoConsolidado(lines), true)

  const result = parseCesarRegoPrestacao(lines, "2026-03")
  const entradasPassagem = result.receitas_por_imovel.reduce(
    (total, row) => total + (row.entradas_passagem ?? 0),
    0,
  )
  const saidasPassagem = result.receitas_por_imovel.reduce(
    (total, row) => total + (row.saidas_passagem ?? 0),
    0,
  )
  const receitasEconomicas = result.receitas_por_imovel.reduce(
    (total, row) => total + row.total,
    0,
  )

  assert.equal(result.totais.total_receitas, 13_132.74)
  assert.equal(result.resumo_financeiro.recebidos_em_nome_locador, 13_132.74)
  assert.equal(result.totais.total_repassar, 12_566.32)
  assert.equal(Number(receitasEconomicas.toFixed(2)), 13_132.74)
  assert.equal(Number(entradasPassagem.toFixed(2)), 448.69)
  assert.equal(Number(saidasPassagem.toFixed(2)), 448.69)
  assert.equal(
    result.receitas_por_imovel.find((row) => row.apto === "0002520")?.total,
    1_100,
  )
})
