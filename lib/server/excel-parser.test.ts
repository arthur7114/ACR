import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import * as xlsx from "xlsx"
import { parseExcelPrestacao } from "./excel-parser.ts"

test("le integralmente a planilha real GM II e usa valores monetarios exibidos", () => {
  const result = parseExcelPrestacao(
    readFileSync("docs/Artefatos/CAIXA ADMINISTRAÇÃO LOCAÇÃO - GM II (1).xlsx"),
    "2026-03",
  )

  assert.equal(result.empreendimento, "GRAND MESSEJANA II")
  assert.equal(result.receitas_por_imovel.length, 27)
  assert.equal(result.acordos_rescisoes_recebidos.length, 1)
  assert.equal(result.inadimplencias_acumuladas.length, 8)
  assert.equal(result.resumo_financeiro.recebidos_em_nome_locador, 20_830.41)
  assert.equal(result.resumo_financeiro.total_comissao_despesas, 3_771.55)
  assert.equal(result.resumo_financeiro.total_a_repassar, 17_058.86)
  assert.equal(result.totais.total_receitas, 20_830.41)
  assert.equal(result.totais.total_repassar, 17_058.86)
  assert.equal(result.plano_extracao.documento_lido_integralmente, true)
})

test("aceita unidades textuais em layout dinamico", () => {
  const workbook = xlsx.utils.book_new()
  const sheet = xlsx.utils.aoa_to_sheet([
    ["LOC MAIS"],
    ["VIGÊNCIA MARÇO 2026"],
    ["NOME", "IMÓVEL", "ALUGUEL", "DESCONTO", "ALUGUEL C/ DESCONTO", "IPTU", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO", "VENC."],
    ["LOCATÁRIO", "GALPÃO 01", 1000, 0, 1000, 50, 1050, 73.5, 976.5, "IPTU 3/12", 30],
    ["TOTAL", null, 1000, 0, 1000, 50, 1050, 73.5, 976.5],
    [null, null, null, null, null, null, null, "COMISSÃO ADMINISTRAÇÃO", null, 73.5],
    [null, null, null, null, null, null, null, "TOTAL COMISSÃO + DESPESAS", null, 73.5],
    [null, null, null, null, null, null, null, "SUBTOTAL RECEBIDOS EM NOME DO LOCADOR", null, 1050],
    [null, null, null, null, null, null, null, "TOTAL A REPASSAR", null, 976.5],
  ])
  xlsx.utils.book_append_sheet(workbook, sheet, "MAR 26")

  const result = parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-03")

  assert.equal(result.receitas_por_imovel[0]?.apto, "GALPÃO 01")
  assert.equal(result.resumo_financeiro.total_a_repassar, 976.5)
})

test("falha fechado quando a aba da competencia nao existe", () => {
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["Dashboard"]]), "Dashboard")

  assert.throws(
    () => parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-03"),
    /aba.*competência/i,
  )
})

test("falha fechado quando a aba nao contem prestacao financeira", () => {
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["Cadastro de imóveis"]]), "MAR 26")

  assert.throws(
    () => parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-03"),
    /layout.*prestação/i,
  )
})

test("intermediacao preserva aluguel e garagem e calcula percentual sobre a base comissionavel", () => {
  const workbook = xlsx.utils.book_new()
  const sheet = xlsx.utils.aoa_to_sheet([
    ["GRAND CASTELÃO I"],
    ["VIGÊNCIA JULHO 2026"],
    ["NOME", "APTO", "ALUGUEL", "GARAGEM", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO"],
    ["LOCATÁRIO", "101", 700, 0, 700, 49, 651, ""],
    ["TOTAL", null, 700, 0, 700, 49, 651],
    ["INTERMEDIAÇÃO DE JUNHO DE 2026 RECEBIDA EM JULHO"],
    ["NOME", "APTO", "ALUGUEL", "GARAGEM", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO"],
    ["NOVO LOCATÁRIO", "204", 650, 25, 726.44, 405, 321.44, "IPTU (7/12)"],
    ["TOTAL", null, 650, 25, 726.44, 405, 321.44],
    [null, null, null, null, null, null, null, "TOTAL COMISSÃO + DESPESAS", 454],
    [null, null, null, null, null, null, null, "SUBTOTAL RECEBIDOS EM NOME DO LOCADOR", 1426.44],
    [null, null, null, null, null, null, null, "TOTAL A REPASSAR", 972.44],
  ])
  xlsx.utils.book_append_sheet(workbook, sheet, "JUL 26")

  const result = parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-07")
  const item = result.acordos_rescisoes_recebidos[0]

  assert.equal(item?.aluguel, 650)
  assert.equal(item?.garagem, 25)
  assert.equal(item?.percentual, 60)
  assert.equal(item?.competencia_original, "2026-06")
  assert.equal(item?.competencia_recebimento, "2026-07")
})

test("cabecalho de secao sem mes de origem nao inventa competencia original", () => {
  const workbook = xlsx.utils.book_new()
  const sheet = xlsx.utils.aoa_to_sheet([
    ["GRAND MARACANAÚ"],
    ["VIGÊNCIA JULHO 2026"],
    ["NOME", "APTO", "ALUGUEL", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO"],
    ["LOCATÁRIO", "101", 700, 700, 49, 651, ""],
    ["TOTAL", null, 700, 700, 49, 651],
    ["ACORDOS E RESCISÕES RECEBIDAS EM JULHO"],
    ["NOME", "APTO", "PRINCIPAL", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO"],
    ["DEVEDOR", "204", 414.86, 466.93, 32.69, 434.24, "acordo"],
    ["TOTAL", null, 414.86, 466.93, 32.69, 434.24],
    [null, null, null, null, null, null, "TOTAL COMISSÃO + DESPESAS", 81.69],
    [null, null, null, null, null, null, "SUBTOTAL RECEBIDOS EM NOME DO LOCADOR", 1166.93],
    [null, null, null, null, null, null, "TOTAL A REPASSAR", 1085.24],
  ])
  xlsx.utils.book_append_sheet(workbook, sheet, "JUL 26")

  const result = parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-07")
  const item = result.acordos_rescisoes_recebidos[0]

  assert.equal(item?.competencia_original, null)
  assert.equal(item?.tipo, "acordo")
})
