import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { buildEgestorDrafts } from "./egestor.ts"

function createAnalysis(overrides: Partial<PackageAnalysis> = {}): PackageAnalysis {
  return {
    documents: [],
    prestacao: null,
    repasse: { valor: 900, data: "2026-03-10", origem_nome: null, destino_nome: null, destino_banco: null, destino_agencia: null, destino_conta: null, protocolo: null, campos_ausentes: [], observacoes: [], confianca_geral: 0.9 },
    despesas: {
      despesas: [
        { tipo: "energia", fornecedor: "ENEL", referencia: null, vencimento: null, valor: 120, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
        { tipo: "energia", fornecedor: "ENEL", referencia: null, vencimento: null, valor: 80, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
        { tipo: "agua", fornecedor: "CAGECE", referencia: null, vencimento: null, valor: 50, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
      ],
      total_despesas: 250,
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.9,
    },
    reajuste: null,
    totals: {
      total_receitas: 1000,
      total_aluguel: 1000,
      total_garagem: 0,
      total_agua: 0,
      total_iptu: 0,
      total_seguro_incendio: 0,
      total_comissoes: 100,
      total_repasse_bruto: 900,
      total_despesas: 250,
      total_comissao_despesas: 350,
      total_a_repassar: 650,
      valor_comprovado: 640,
      diferenca_repasse: -10,
      taxa_administracao_percent: 10,
      taxa_intermediacao_percent: 0,
      comissao_administracao_calculada: 100,
      base_comissao_administracao: 1000,
      comissao_realizada_percent: 10,
    },
    parecer: { status: "aprovado_tecnico", resumo: "ok", motivos: [], confianca: 1, requer_revisao_humana: false },
    rechecks: [],
    guardrails: [],
    fechamentoId: "fechamento",
    storagePath: null,
    ...overrides,
  }
}

test("gera previa consolidada com repasse, comissao e despesas agrupadas", () => {
  const drafts = buildEgestorDrafts(createAnalysis())

  assert.deepEqual(
    drafts.map((draft) => [draft.tipo, draft.categoria, draft.valor]),
    [
      ["recebimento", "repasse_mensal", 640],
      ["pagamento", "comissao_administrativa", 100],
      ["pagamento", "energia", 200],
      ["pagamento", "agua", 50],
    ],
  )
})

test("usa total a repassar quando nao existe comprovante", () => {
  const drafts = buildEgestorDrafts(createAnalysis({
    totals: { ...createAnalysis().totals, valor_comprovado: null, total_a_repassar: 650 },
  }))

  assert.equal(drafts[0].valor, 650)
})
