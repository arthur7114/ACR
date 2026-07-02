import assert from "node:assert/strict"
import test from "node:test"
import type { ClassifiedDocument, PrestacaoAnalysis, RepasseAnalysis } from "@/lib/prestacao-types"
import { validatePackage } from "./package-rechecks.ts"

const requiredDocuments: ClassifiedDocument[] = [
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

function createPrestacao(overrides: Partial<PrestacaoAnalysis> = {}): PrestacaoAnalysis {
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imoveis",
    empreendimento: "Grand Messejana II",
    competencia: "2026-03",
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["receitas", "resumo financeiro"],
      estrategia: ["Extrair linhas e resumo final."],
      alertas: [],
    },
    receitas_por_imovel: [
      {
        apto: "101",
        inquilino: "Maria",
        aluguel: 1000,
        desconto: null,
        aluguel_com_desconto: null,
        garagem: null,
        vagas_garagem: null,
        agua: null,
        iptu: null,
        seguro_incendio: null,
        total: 1000,
        comissao: 10,
        repasse: 900,
        vencimento: null,
        observacao: null,
        confianca: 0.95,
      },
      {
        apto: "102",
        inquilino: "Joao",
        aluguel: 2000,
        desconto: null,
        aluguel_com_desconto: null,
        garagem: null,
        vagas_garagem: null,
        agua: null,
        iptu: null,
        seguro_incendio: null,
        total: 2000,
        comissao: 20,
        repasse: 1800,
        vencimento: null,
        observacao: null,
        confianca: 0.95,
      },
    ],
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 3000,
      total_linhas_comissoes: 30,
      total_linhas_repasse: 2700,
      comissao_administracao: 30,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 300,
      recebidos_em_nome_locador: 3000,
      total_a_repassar: 2700,
      confianca: 0.95,
    },
    totais: {
      total_receitas: 3000,
      total_comissoes: 30,
      total_repassar: 2700,
    },
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 0.95,
    ...overrides,
  }
}

function createRepasse(valor: number): RepasseAnalysis {
  return {
    valor,
    data: null,
    origem_nome: null,
    destino_nome: null,
    destino_banco: null,
    destino_agencia: null,
    destino_conta: null,
    protocolo: null,
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 0.95,
  }
}

test("gera divergencia real quando soma de comissao completa difere do consolidado", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      resumo_financeiro: {
        ...createPrestacao().resumo_financeiro,
        total_linhas_comissoes: 50,
      },
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "total_linhas_comissoes")

  // Divergencia entre a soma das linhas e o consolidado da IA e sinal de leitura,
  // nao erro de repasse: e reportada como alerta (rebaixada de bloqueio), mas com
  // esperado/encontrado/diferenca preservados. Ver comentario "B3" em buildRechecks.
  assert.equal(check?.status, "warning")
  assert.equal(check?.expected, 30)
  assert.equal(check?.actual, 50)
  assert.equal(check?.difference, 20)
  assert.match(check?.message ?? "", /A soma da coluna Comissao/)
})

test("nao acusa divergencia financeira quando coluna de comissao esta incompleta", () => {
  const prestacao = createPrestacao()
  prestacao.receitas_por_imovel[1].comissao = null

  const result = validatePackage({
    documents: requiredDocuments,
    prestacao,
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "total_linhas_comissoes")

  assert.equal(check?.status, "warning")
  assert.equal(check?.difference, null)
  assert.match(check?.message ?? "", /nao foi extraida em todas as linhas/)
})

test("repasse divergente informa esperado, encontrado e diferenca", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao(),
    repasse: createRepasse(2690),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "repasse_conciliation")

  assert.equal(check?.status, "failed")
  assert.equal(check?.expected, 2700)
  assert.equal(check?.actual, 2690)
  assert.equal(check?.difference, 10)
  assert.match(check?.message ?? "", /comprovante bancario tem/)
})

test("documentos opcionais ausentes nao alteram o parecer tecnico operacional", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao(),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.rechecks.find((item) => item.id === "optional_relatorio_reajuste")?.status, "warning")
  assert.equal(result.rechecks.find((item) => item.id === "optional_despesas_comprovantes")?.status, "warning")
  assert.equal(result.parecer.status, "aprovado_tecnico")
})

test("totaliza receitas por categoria paga pelo inquilino", () => {
  const prestacao = createPrestacao()
  prestacao.receitas_por_imovel[0].garagem = 50
  prestacao.receitas_por_imovel[0].agua = 25
  prestacao.receitas_por_imovel[0].iptu = 10
  prestacao.receitas_por_imovel[0].seguro_incendio = 5

  const result = validatePackage({
    documents: requiredDocuments,
    prestacao,
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.totals.total_aluguel, 3000)
  assert.equal(result.totals.total_garagem, 50)
  assert.equal(result.totals.total_agua, 25)
  assert.equal(result.totals.total_iptu, 10)
  assert.equal(result.totals.total_seguro_incendio, 5)
})

test("valida comissao administrativa pela regra comercial sobre total pago", () => {
  const prestacao = createPrestacao()
  prestacao.receitas_por_imovel[0].garagem = 100

  const result = validatePackage({
    documents: requiredDocuments,
    prestacao,
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
    commercialRule: {
      taxa_administracao_percent: 1,
      taxa_intermediacao_percent: 50,
    },
  })

  const check = result.rechecks.find((item) => item.id === "comissao_administracao_regra")

  assert.equal(result.totals.comissao_administracao_calculada, 31)
  assert.equal(result.totals.taxa_administracao_percent, 1)
  assert.equal(result.totals.taxa_intermediacao_percent, 50)
  assert.equal(check?.status, "warning")
  assert.equal(check?.expected, 31)
  assert.equal(check?.actual, 30)
  assert.equal(check?.difference, 1)
})

test("calcula percentual de comissao realizada sobre o total recebido e preserva base cadastrada", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao(),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
    commercialRule: {
      taxa_administracao_percent: 1,
      taxa_intermediacao_percent: 50,
    },
  })

  assert.equal(result.totals.base_comissao_administracao, 3000)
  assert.equal(result.totals.comissao_realizada_percent, 1)
  assert.equal(result.totals.taxa_administracao_percent, 1)
})

test("calcula percentual de comissao realizada dividindo comissao pelo total recebido", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      receitas_por_imovel: [
        {
          apto: "101",
          inquilino: "Maria",
          aluguel: 1000,
          desconto: 100,
          aluguel_com_desconto: 900,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 1000,
          comissao: 100,
          repasse: 900,
          vencimento: null,
          observacao: null,
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        ...createPrestacao().resumo_financeiro,
        total_linhas_receitas: 1000,
        total_linhas_comissoes: 100,
        total_linhas_repasse: 900,
        comissao_administracao: 100,
        recebidos_em_nome_locador: 1000,
        total_comissao_despesas: 100,
        total_a_repassar: 900,
      },
      totais: {
        total_receitas: 1000,
        total_comissoes: 100,
        total_repassar: 900,
      },
    }),
    repasse: createRepasse(900),
    despesas: null,
    reajuste: null,
    commercialRule: {
      taxa_administracao_percent: 10,
      taxa_intermediacao_percent: 0,
    },
  })

  assert.equal(result.totals.base_comissao_administracao, 900)
  assert.equal(result.totals.comissao_realizada_percent, 10)
})

test("alerta quando acordo recebido no mes tem competencia original diferente", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "101",
          inquilino: "Natan",
          valor: 500,
          competencia_original: "2026-02",
          competencia_recebimento: "2026-03",
          observacao: "Acordo recebido em marco.",
          confianca: 0.95,
        },
      ],
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "acordos_competencias")

  assert.equal(check?.status, "warning")
  assert.equal(check?.actual, 1)
})

test("bloqueia possivel acordo ou rescisao repetido", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "rescisao",
          apto: "202",
          inquilino: "Natan",
          valor: 750,
          competencia_original: "03/2026",
          competencia_recebimento: "2026-03",
          observacao: "Rescisao paga.",
          confianca: 0.95,
        },
      ],
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
    // Reimportacao real: mesma chave completa (tipo|apto|inquilino|recebimento|
    // origem|valor) que buildAgreementPaymentKey gera para o item acima.
    historicalAgreementKeys: ["rescisao|202|natan|2026-03|2026-03|750.00"],
  })

  const check = result.rechecks.find((item) => item.id === "duplicate_agreement_payment")

  assert.equal(check?.status, "failed")
  assert.equal(check?.actual, 1)
  assert.equal(result.parecer.status, "bloqueado")
})

test("nao bloqueia parcelas do mesmo acordo recebidas em meses diferentes", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "303",
          inquilino: "Natan",
          valor: 500,
          competencia_original: "2026-01",
          competencia_recebimento: "2026-04",
          observacao: "Parcela recebida em abril.",
          confianca: 0.95,
        },
      ],
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
    // Parcela do mesmo acordo (origem 2026-01) recebida no mes anterior, ja
    // lancada e chaveada pelo recebimento de marco.
    historicalAgreementKeys: ["acordo|natan|2026-03|500.00"],
  })

  const check = result.rechecks.find((item) => item.id === "duplicate_agreement_payment")

  assert.equal(check?.status, "passed")
  assert.equal(check?.actual, 0)
})
