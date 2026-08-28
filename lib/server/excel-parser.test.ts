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

// Layout real das planilhas Alive (jul/2026): a intermediação vive numa seção
// no TOPO da aba, cujo cabeçalho não contém "RECEBIDA", e o bloco de resumo
// traz COMISSÃO ADMINISTRAÇÃO (já somando a comissão dos acordos) separada de
// COMISSÃO INTERMEDIAÇÃO. Fixture com nomes genéricos e valores-canário.
function planilhaLayoutReal() {
  const header = [
    "NOME", "APTO", "REAJUSTE", "ALUGUEL", "DESCONTO", "ALUGUEL C/ DESCONTO",
    "GARAGEM", "ÁGUA", "IPTU ", "SEG INC.", "TOTAL", "COMISSÃO", "REPASSE",
    "OBSERVAÇÃO", "VENC.",
  ]
  const workbook = xlsx.utils.book_new()
  const sheet = xlsx.utils.aoa_to_sheet([
    ["GRAND CASTELÃO I"],
    ["INTERMEDIAÇÃO DE JUNHO DE 2026"],
    header,
    ["LOCATARIO NOVO", "204", "JUNHO", 650, 0, 650, 25, 47.6, 3.84, 0, 726.44, 405, 321.44, "IPTU (7/12). SEGURO QUITADO.", 30],
    ["TOTAL", null, null, 650, 0, 650, 25, 47.6, 3.84, 0, 726.44, 405, 321.44],
    ["VIGÊNCIA JULHO 2026"],
    header,
    ["LOCATARIO A", "2", "FEVEREIRO", 690, 0, 690, 25, 47.6, 4.59, 0, 767.19, 53.7, 713.49, "IPTU (7/12).", 30],
    ["TOTAL", null, null, 690, 0, 690, 25, 47.6, 4.59, 0, 767.19, 53.7, 713.49],
    ["ACORDOS E RESCISÕES RECEBIDAS EM JULHO"],
    header,
    ["LOCATARIO B", "1", "SETEMBRO", 763.14, 0, 763.14, 27.65, 0, 5.08, 0, 848.52, 59.4, 789.12, "VIGÊNCIA DE JUNHO/26. IPTU (6/12).", 30],
    ["TOTAL", null, null, 763.14, 0, 763.14, 27.65, 0, 5.08, 0, 848.52, 59.4, 789.12],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "COMISSÃO ADMINISTRAÇÃO", null, 113.1],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "COMISSÃO INTERMEDIAÇÃO ", null, 405],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "OUTRAS COMISSÕES E DESPESAS"],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "ENEL", null, 95.66],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "TOTAL COMISSÃO + DESPESAS", null, 613.76],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "SUBTOTAL RECEBIDOS EM NOME DO LOCADOR", null, 2342.15],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "TOTAL A REPASSAR", null, 1728.39],
  ])
  xlsx.utils.book_append_sheet(workbook, sheet, "JUL 26")
  return xlsx.write(workbook, { type: "buffer" })
}

test("extrai a secao de intermediacao do topo, cujo cabecalho nao diz RECEBIDA", () => {
  const result = parseExcelPrestacao(planilhaLayoutReal(), "2026-07")
  const interm = result.acordos_rescisoes_recebidos.find((item) => item.tipo === "intermediacao")

  assert.equal(interm?.apto, "204")
  assert.equal(interm?.aluguel, 650)
  assert.equal(interm?.garagem, 25)
  assert.equal(interm?.comissao, 405)
  assert.equal(interm?.percentual, 60)
  assert.equal(interm?.total_recebido, 726.44)
  assert.equal(interm?.repasse, 321.44)
  assert.equal(interm?.competencia_original, "2026-06")
  assert.equal(interm?.competencia_recebimento, "2026-07")
})

test("competencia de origem aceita ano de dois digitos (JUNHO/26)", () => {
  const result = parseExcelPrestacao(planilhaLayoutReal(), "2026-07")
  const acordo = result.acordos_rescisoes_recebidos.find((item) => item.tipo === "acordo")

  assert.equal(acordo?.competencia_original, "2026-06")
})

test("comissao de administracao vem do bloco de resumo, incluindo a dos acordos", () => {
  const result = parseExcelPrestacao(planilhaLayoutReal(), "2026-07")

  // O documento imprime 113,10 (53,70 das linhas + 59,40 do acordo). Somar
  // apenas as linhas perderia a comissao do acordo do total do fechamento.
  assert.equal(result.resumo_financeiro.comissao_administracao, 113.1)
  assert.equal(result.resumo_financeiro.total_comissao_despesas, 613.76)
})

test("comissao de administracao tambem e lida quando o rotulo e percentual (COMISSAO 7%)", () => {
  const header = ["NOME", "APTO", "ALUGUEL", "TOTAL", "COMISSÃO", "REPASSE", "OBSERVAÇÃO"]
  const workbook = xlsx.utils.book_new()
  const sheet = xlsx.utils.aoa_to_sheet([
    ["GRAND MESSEJANA II"],
    ["VIGÊNCIA JULHO 2026"],
    header,
    ["LOCATARIO A", "2", 690, 690, 48.3, 641.7, ""],
    ["TOTAL", null, 690, 690, 48.3, 641.7],
    ["ACORDOS E RESCISÕES RECEBIDAS EM JULHO"],
    header,
    ["LOCATARIO B", "7", 500, 500, 35, 465, ""],
    ["TOTAL", null, 500, 500, 35, 465],
    [null, null, null, null, null, null, "COMISSÕES"],
    [null, null, null, null, null, null, "COMISSÃO 7%", null, 83.3],
    [null, null, null, null, null, null, "OUTRAS COMISSÕES E DESPESAS"],
    [null, null, null, null, null, null, "ENEL", null, 100],
    [null, null, null, null, null, null, "TOTAL COMISSÃO + DESPESAS", null, 183.3],
    [null, null, null, null, null, null, "R$ RECEBIDOS EM NOME DO LOCADOR", null, 1190],
    [null, null, null, null, null, null, "TOTAL A REPASSAR", null, 1006.7],
  ])
  xlsx.utils.book_append_sheet(workbook, sheet, "JUL 26")

  const result = parseExcelPrestacao(xlsx.write(workbook, { type: "buffer" }), "2026-07")

  // 48,30 das linhas + 35,00 do acordo = 83,30 impresso no documento.
  assert.equal(result.resumo_financeiro.comissao_administracao, 83.3)
  assert.equal(result.resumo_financeiro.total_outras_comissoes_despesas, 100)
})
