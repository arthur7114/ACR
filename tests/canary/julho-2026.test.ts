import assert from "node:assert/strict"
import test from "node:test"
import * as xlsx from "xlsx"

import { calcularResumoReceitasAdicionais } from "../../lib/fechamento-operacional"
import { parseExcelPrestacao } from "../../lib/server/excel-parser"
import { validatePackage } from "../../lib/server/package-rechecks"

// Canários de julho/2026 — reprodução dos erros confirmados no feedback de agosto.
// Valores registrados em docs/06-acceptance-criteria.md (valores-canário).

test("LOCMAIS: rescisão usa o total líquido recebido, não o principal bruto", () => {
  const result = calcularResumoReceitasAdicionais({
    acordos_rescisoes_recebidos: [
      {
        tipo: "rescisao",
        valor: 1890,
        total_recebido: 1663.56,
        comissao: 116.45,
        repasse: 1547.11,
      },
    ],
  } as never)

  assert.equal(result.rescisoes, 1663.56)
})

test("seção de intermediação preserva a competência escrita no cabeçalho", () => {
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
  assert.equal(result.acordos_rescisoes_recebidos[0]?.competencia_original, "2026-06")
})

test("Grand Messejana I: intermediação sem unidade e com baixa confiança não entra nos totais", () => {
  const prestacao = {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imóveis",
    empreendimento: "Grand Messejana I",
    competencia: "2026-07",
    plano_extracao: { documento_lido_integralmente: true, secoes_identificadas: [], estrategia: [], alertas: [] },
    receitas_por_imovel: [],
    acordos_rescisoes_recebidos: [
      {
        tipo: "intermediacao",
        apto: null,
        inquilino: null,
        valor: 255.9,
        comissao: 127.95,
        percentual: 50,
        competencia_original: "2026-06",
        competencia_recebimento: "2026-07",
        observacao: "Base inferida pelo OCR; linha de imóvel não identificada.",
        confianca: 0.55,
      },
    ],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 0,
      total_linhas_comissoes: 0,
      total_linhas_repasse: 0,
      comissao_administracao: 0,
      outras_comissoes_despesas: [{ descricao: "SEGURO APTO 01", valor: 140.4, confianca: 0.85 }],
      total_outras_comissoes_despesas: 140.4,
      total_comissao_despesas: 140.4,
      recebidos_em_nome_locador: 0,
      total_a_repassar: 0,
      confianca: 0.9,
    },
    totais: { total_receitas: 0, total_comissoes: 0, total_repassar: 0 },
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 0.9,
  }

  const result = validatePackage({
    documents: [],
    prestacao: prestacao as never,
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.prestacao?.acordos_rescisoes_recebidos.length, 0)
  assert.equal(result.totals.total_comissao_despesas, 140.4)
})
