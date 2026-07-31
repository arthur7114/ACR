import assert from "node:assert/strict"
import test from "node:test"
import type { ClassifiedDocument, PackageAnalysis, PrestacaoAnalysis } from "../lib/prestacao-types"
import { buildLineConsistencyRepairPlan } from "./repair-linha-desconto-inconsistente.ts"

const documents: ClassifiedDocument[] = [
  {
    fileName: "prestacao.pdf",
    fileType: "application/pdf",
    fileSize: 100,
    documentType: "prestacao_contas",
    confidence: 0.95,
    reason: "Prestacao identificada.",
  },
  {
    fileName: "repasse.pdf",
    fileType: "application/pdf",
    fileSize: 100,
    documentType: "comprovante_repasse",
    confidence: 0.95,
    reason: "Comprovante identificado.",
  },
]

function makePrestacao(overrides: Partial<PrestacaoAnalysis> = {}): PrestacaoAnalysis {
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imoveis",
    empreendimento: "Grand Maracanaú",
    competencia: "2026-06",
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["receitas", "resumo financeiro"],
      estrategia: [],
      alertas: [],
    },
    receitas_por_imovel: [
      {
        apto: "202",
        inquilino: "BRUNO EDUARDO DA SILVA",
        aluguel: 13.33,
        desconto: 13.33,
        aluguel_com_desconto: 0,
        garagem: 0,
        vagas_garagem: null,
        agua: 0,
        iptu: 0,
        seguro_incendio: 0,
        total: 13.33,
        comissao: 0.93,
        repasse: 12.4,
        competencia_original: "2026-06",
        competencia_recebimento: "2026-06",
        dia_vencimento: null,
        vencimento: null,
        observacao: "RESCISÃO. PROPORCIONAL DE 01 DIA (01/06). SEGURO QUITADO. IPTU 2026 QUITADO.",
        confianca: 0.86,
      },
    ],
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 13.33,
      total_linhas_comissoes: 0.93,
      total_linhas_repasse: 12.4,
      comissao_administracao: 0.93,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 0.93,
      recebidos_em_nome_locador: 13.33,
      total_a_repassar: 12.4,
      confianca: 0.9,
    },
    totais: { total_receitas: 13.33, total_comissoes: 0.93, total_repassar: 12.4 },
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 0.9,
    ...overrides,
  }
}

function makePackage(prestacao: PrestacaoAnalysis): PackageAnalysis {
  return {
    documents,
    prestacao,
    repasse: {
      data: "2026-07-13",
      valor: 12.4,
      protocolo: null,
      observacoes: [],
      origem_nome: null,
      destino_nome: null,
      destino_banco: null,
      destino_conta: null,
      campos_ausentes: [],
      confianca_geral: 0.9,
      destino_agencia: null,
    },
    despesas: null,
    reajuste: null,
    totals: {
      total_receitas: 13.33,
      total_aluguel: 0,
      total_garagem: 0,
      total_agua: 0,
      total_iptu: 0,
      total_seguro_incendio: 0,
      total_comissoes: 0.93,
      total_repasse_bruto: 12.4,
      total_despesas: 0,
      total_comissao_despesas: 0.93,
      total_a_repassar: 12.4,
      valor_comprovado: 12.4,
      diferenca_repasse: 0,
      taxa_administracao_percent: 7,
      taxa_intermediacao_percent: 60,
      comissao_administracao_calculada: 0,
      base_comissao_administracao: 0,
      comissao_realizada_percent: 6.98,
      repasse_embutido: false,
    },
    parecer: {
      status: "aprovado_tecnico",
      resumo: "Fixture",
      motivos: [],
      confianca: 1,
      requer_revisao_humana: false,
    },
    rechecks: [],
    guardrails: [],
    fechamentoId: "918d1fc6-df78-4c86-b147-0df06ef62f2f",
    storagePath: null,
  }
}

test("corrige o desconto integral inconsistente sem alterar os totais financeiros já enviados", () => {
  const analysis = makePackage(makePrestacao())
  const plan = buildLineConsistencyRepairPlan(analysis, {
    taxa_administracao_percent: 7,
    taxa_intermediacao_percent: 60,
  })

  assert.equal(plan.kind, "repaired")
  const row = plan.analysisRepaired?.prestacao?.receitas_por_imovel[0]
  assert.equal(row?.desconto, 0)
  assert.equal(row?.aluguel_com_desconto, 13.33)
  // Invariantes financeiros já enviados ao eGestor: intocados.
  assert.equal(plan.analysisRepaired?.totals.total_receitas, analysis.totals.total_receitas)
  assert.equal(plan.analysisRepaired?.totals.total_a_repassar, analysis.totals.total_a_repassar)
  assert.equal(plan.analysisRepaired?.totals.total_comissoes, analysis.totals.total_comissoes)
})

test("não propõe reparo quando a linha já está consistente", () => {
  const analysis = makePackage(
    makePrestacao({
      receitas_por_imovel: [
        {
          ...makePrestacao().receitas_por_imovel[0],
          desconto: 0,
          aluguel_com_desconto: 13.33,
        },
      ],
    }),
  )
  const plan = buildLineConsistencyRepairPlan(analysis, {
    taxa_administracao_percent: 7,
    taxa_intermediacao_percent: 60,
  })
  assert.equal(plan.kind, "unchanged")
})
