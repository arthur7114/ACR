import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoAnalysis } from "@/lib/prestacao-types"
import { buildPrestacaoMovimentacoes } from "./persist-package.ts"

test("movimentacao de aluguel usa competencia original e preserva o recebimento no JSON", () => {
  const prestacao = {
    receitas_por_imovel: [
      {
        apto: "0002521",
        inquilino: "João Cordeiro",
        aluguel: 1200,
        desconto: null,
        aluguel_com_desconto: null,
        garagem: null,
        agua: null,
        iptu: null,
        seguro_incendio: null,
        total: 1200,
        comissao: 84,
        repasse: 1116,
        competencia_original: "2026-03",
        competencia_recebimento: "2026-05",
        dia_vencimento: 10,
        vencimento: "03/2026",
        observacao: null,
        confianca: 1,
      },
    ],
  } as PrestacaoAnalysis

  const [row] = buildPrestacaoMovimentacoes({
    fechamentoId: "fechamento-1",
    documentoId: "documento-1",
    prestacao,
  })

  assert.equal(row.data_competencia, "2026-03-01")
  assert.equal(row.dados_extraidos.competencia_recebimento, "2026-05")
  assert.equal(row.dados_extraidos.dia_vencimento, 10)
})

test("movimentacao sem competencia fica sem data de competencia", () => {
  const prestacao = {
    receitas_por_imovel: [
      {
        apto: "101",
        inquilino: "Maria",
        total: 1000,
        competencia_original: null,
        confianca: 1,
      },
    ],
  } as PrestacaoAnalysis

  const [row] = buildPrestacaoMovimentacoes({
    fechamentoId: "fechamento-1",
    documentoId: null,
    prestacao,
  })

  assert.equal(row.data_competencia, null)
})

test("TED itemizada gera uma despesa por imovel, somando a TED e sem alterar receitas", () => {
  const prestacao = {
    receitas_por_imovel: [
      { apto: "101", inquilino: "Ana", total: 1000, imovel_id: "im-1", competencia_original: null, confianca: 1 },
      { apto: "102", inquilino: "Bia", total: 2000, imovel_id: "im-2", competencia_original: null, confianca: 1 },
    ],
    resumo_financeiro: {
      outras_comissoes_despesas: [{ descricao: "TED", valor: 11.1, confianca: 1 }],
    },
  } as unknown as PrestacaoAnalysis

  const rows = buildPrestacaoMovimentacoes({
    fechamentoId: "fechamento-1",
    documentoId: "doc-1",
    prestacao,
    competencia: "2026-05",
  })

  const receitas = rows.filter((r) => r.tipo_movimentacao === "receita_aluguel")
  const ted = rows.filter((r) => r.tipo_movimentacao === "despesa" && r.categoria === "tarifa_bancaria")
  assert.equal(receitas.length, 2)
  assert.equal(ted.length, 2)
  assert.equal(ted.reduce((a, r) => a + r.valor, 0).toFixed(2), "11.10")
  assert.equal(ted[0].sinal, "negativo")
  assert.equal(ted[0].imovel_id, "im-1")
  assert.equal(ted[0].data_competencia, "2026-05-01")
})

test("movimentacao de acordo persiste o total recebido resolvido, nao o principal", async () => {
  const { buildPackageMovimentacoes } = await import("./persist-package.ts")
  const rows = buildPackageMovimentacoes({
    fechamentoId: "fechamento-1",
    competencia: "2026-07-01",
    documents: [],
    prestacao: {
      acordos_rescisoes_recebidos: [
        {
          tipo: "rescisao",
          apto: null,
          inquilino: "EX-LOCATÁRIO",
          valor: 1890,
          total_recebido: 1663.56,
          comissao: 116.45,
          repasse: 1547.11,
          competencia_original: null,
          competencia_recebimento: "2026-07",
          observacao: null,
          confianca: 0.9,
        },
      ],
      receitas_por_imovel: [],
      resumo_financeiro: { outras_comissoes_despesas: [] },
    } as never,
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  const acordo = rows.find((row) => row.tipo_movimentacao === "acordo_rescisao_recebido")
  assert.equal(acordo?.valor, 1663.56)
})
