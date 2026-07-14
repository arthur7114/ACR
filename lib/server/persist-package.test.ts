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

test("movimentacao sem competencia fica sem data e depende da validacao bloqueante", () => {
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
