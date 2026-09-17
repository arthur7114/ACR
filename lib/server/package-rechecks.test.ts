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
        competencia_original: "2026-03",
        competencia_recebimento: "2026-03",
        dia_vencimento: null,
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
        competencia_original: "2026-03",
        competencia_recebimento: "2026-03",
        dia_vencimento: null,
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

  assert.equal(result.rechecks.find((item) => item.id === "optional_relatorio_reajuste")?.status, "passed")
  assert.equal(result.rechecks.find((item) => item.id === "optional_despesas_comprovantes")?.status, "passed")
  assert.equal(result.parecer.status, "aprovado_tecnico")
})

test("ausencia de documento de despesas passa silenciosamente quando o total e zero", () => {
  const base = createPrestacao()
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      resumo_financeiro: {
        ...base.resumo_financeiro,
        total_comissao_despesas: 30,
        total_a_repassar: 2970,
      },
    }),
    repasse: createRepasse(2970),
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.totals.total_despesas, 0)
  assert.equal(result.rechecks.find((item) => item.id === "total_despesas")?.status, "passed")
})

test("repasse embutido nao esconde despesa sem documento quando o valor e positivo", () => {
  const base = createPrestacao()
  const result = validatePackage({
    documents: [requiredDocuments[0]],
    prestacao: createPrestacao({
      resumo_financeiro: {
        ...base.resumo_financeiro,
        repasse_embutido: true,
      },
    }),
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.totals.total_despesas, 270)
  assert.equal(result.rechecks.find((item) => item.id === "total_despesas")?.status, "warning")
})

test("linha sem recebimento considera comissao e repasse nulos como zero", () => {
  const prestacao = createPrestacao()
  prestacao.receitas_por_imovel.push({
    ...prestacao.receitas_por_imovel[0],
    apto: "303",
    inquilino: "Inadimplente",
    aluguel: null,
    aluguel_com_desconto: null,
    total: 0,
    comissao: null,
    repasse: null,
    observacao: "INADIMPLENCIA",
  })

  const result = validatePackage({
    documents: requiredDocuments,
    prestacao,
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.rechecks.find((item) => item.id === "total_linhas_comissoes")?.status, "passed")
  assert.equal(result.rechecks.find((item) => item.id === "total_linhas_repasse")?.status, "passed")
})

test("prestacao Alive isolada nao substitui comprovante bancario", () => {
  const result = validatePackage({
    documents: [requiredDocuments[0]],
    prestacao: createPrestacao(),
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.totals.repasse_embutido, false)
  assert.equal(result.totals.valor_comprovado, null)
  assert.equal(result.rechecks.find((item) => item.id === "required_comprovante_repasse")?.status, "failed")
  assert.equal(result.rechecks.find((item) => item.id === "repasse_conciliation")?.status, "failed")
  assert.equal(result.parecer.status, "bloqueado")
})

test("extrato consolidado explicitamente marcado usa o repasse embutido", () => {
  const prestacao = createPrestacao({
    resumo_financeiro: {
      ...createPrestacao().resumo_financeiro,
      repasse_embutido: true,
    },
  })
  const result = validatePackage({
    documents: [requiredDocuments[0]],
    prestacao,
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.totals.repasse_embutido, true)
  assert.equal(result.totals.valor_comprovado, 2700)
  assert.equal(result.rechecks.find((item) => item.id === "required_comprovante_repasse")?.status, "passed")
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
  // Contagem (1 acordo), não valor monetário: não populamos actual/expected
  // para não ser exibida/resolvida como se fosse dinheiro (R$ 1,00).
  assert.equal(check?.actual, null)
  assert.equal(check?.expected, null)
  assert.match(check?.message ?? "", /1 acordo/)
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
  // Contagem (1 possível repetição), não valor monetário.
  assert.equal(check?.actual, null)
  assert.equal(check?.expected, null)
  assert.match(check?.message ?? "", /1 possivel/)
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
  assert.equal(check?.actual, null)
})

test("Pompilio: validatePackage expoe receita bruta e 3 despesas itemizadas", () => {
  const prestacao = createPrestacao({
    imobiliaria: "Cesar Rego Imoveis",
    competencia: "2026-05",
    receitas_por_imovel: [
      { apto: "AP0361/1", inquilino: "", aluguel: 8000, desconto: 113.27, aluguel_com_desconto: 7886.73, garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null, total: 8000, comissao: null, repasse: null, vencimento: "05/2026", observacao: "Endereco. REEMBOLSO AO INQUILINO DESC. LOCATARIO 113,27", confianca: 1 },
      { apto: "AP0362/2", inquilino: "", aluguel: 6015.38, desconto: 0.26, aluguel_com_desconto: 6015.12, garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null, total: 6015.38, comissao: null, repasse: null, vencimento: "05/2026", observacao: "Endereco. DESCONTO FORNECIDO 0,26", confianca: 1 },
    ],
    resumo_financeiro: {
      total_linhas_receitas: 14015.38, total_linhas_comissoes: 594.12, total_linhas_repasse: 13409.90,
      comissao_administracao: 594.12,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 605.48,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13409.90,
      repasse_embutido: true,
      confianca: 1,
    },
  })
  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })

  assert.equal(result.totals.total_receitas, 14128.65)
  assert.equal(result.totals.total_despesas, 124.63)
  assert.equal(result.totals.total_a_repassar, 13409.90)
  const lista = result.prestacao?.resumo_financeiro.outras_comissoes_despesas ?? []
  assert.equal(lista.length, 3)
})

test("LOCMAIS: validatePackage nao soma a comissao de intermediacao em total_despesas", () => {
  const prestacao = createPrestacao({
    imobiliaria: "LOC MAIS Imoveis",
    competencia: "2026-05",
    receitas_por_imovel: [
      { apto: "SALA 01", inquilino: "", aluguel: 14204.58, desconto: null, aluguel_com_desconto: null, garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null, total: 14204.58, comissao: 994.12, repasse: null, vencimento: "05/2026", observacao: null, confianca: 0.9 },
    ],
    acordos_rescisoes_recebidos: [
      {
        tipo: "intermediacao",
        apto: "SALA 05",
        inquilino: "ISI VIAGENS LTDA",
        valor: 900,
        comissao: 540,
        percentual: null,
        competencia_original: "04/2026",
        competencia_recebimento: "05/2026",
        observacao: "Intermediacao de abril de 2026. Total R$ 938,08; repasse R$ 398,08.",
        confianca: 0.9,
      },
    ],
    resumo_financeiro: {
      total_linhas_receitas: 14204.58, total_linhas_comissoes: 994.32, total_linhas_repasse: 13210.26,
      comissao_administracao: 994.32,
      outras_comissoes_despesas: [
        { descricao: "CAGECE", valor: 47.6, confianca: 0.82 },
        { descricao: "ENEL", valor: 144.29, confianca: 0.82 },
        { descricao: "ENEL", valor: 307.13, confianca: 0.82 },
        { descricao: "IPTU 2026 GALPÃO 02 (5/7)", valor: 91.39, confianca: 0.82 },
        { descricao: "IPTU 2026 SALA 05 (5/5)", valor: 87.98, confianca: 0.82 },
        { descricao: "IPTU 2026 GALPÃO 05 (5/8)", valor: 87.5, confianca: 0.82 },
        { descricao: "SEGURO SALA 03", valor: 314.01, confianca: 0.82 },
      ],
      total_outras_comissoes_despesas: 1079.9,
      total_comissao_despesas: 2614.22,
      recebidos_em_nome_locador: 15142.66,
      total_a_repassar: 12528.44,
      confianca: 0.86,
    },
  })
  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })

  // total_despesas (calculateTotals) deve bater com a soma da LISTA (1079.90),
  // nao com o total_comissao_despesas bruto (2614.22 - 994.32 = 1619.90, que
  // ainda incluiria a comissao de intermediacao).
  assert.equal(result.totals.total_despesas, 1079.9)
  const lista = result.prestacao?.resumo_financeiro.outras_comissoes_despesas ?? []
  assert.equal(lista.length, 7)
  assert.ok(!lista.some((d) => /intermedia/i.test(d.descricao)))
  const resumoCheck = result.rechecks.find((item) => item.id === "resumo_financeiro")
  assert.equal(resumoCheck?.status, "passed")
  assert.equal(resumoCheck?.expected, 12528.44)
  assert.equal(resumoCheck?.actual, 12528.44)
})

test("Terreno Castelao: recupera marco da observacao sem inferir inadimplencia atual", () => {
  const base = createPrestacao()
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      competencia: "2026-05",
      receitas_por_imovel: [
        {
          ...base.receitas_por_imovel[0],
          vencimento: "10",
          competencia_original: undefined,
          competencia_recebimento: undefined,
          dia_vencimento: undefined,
          observacao: "VIGÊNCIA MARÇO/2026. IPTU 3/11.",
        },
      ],
      resumo_financeiro: {
        ...base.resumo_financeiro,
        total_linhas_receitas: 1000,
        total_linhas_comissoes: 10,
        total_linhas_repasse: 900,
        comissao_administracao: 10,
        recebidos_em_nome_locador: 1000,
        total_comissao_despesas: 100,
        total_a_repassar: 900,
      },
    }),
    repasse: createRepasse(900),
    despesas: null,
    reajuste: null,
  })

  const row = result.prestacao?.receitas_por_imovel[0]
  assert.equal(row?.competencia_original, "2026-03")
  assert.equal(row?.competencia_recebimento, "2026-05")
  assert.equal(row?.dia_vencimento, 10)
  assert.doesNotMatch(row?.observacao ?? "", /INADIMPLENCIA/)
})

test("rescisao proporcional nao vira desconto integral quando a coluna DESCONTO do documento vem em branco", () => {
  // Grand Maracanaú junho/2026, apto 202: o documento mostra DESCONTO em
  // branco e ALUGUEL C/DESCONTO = ALUGUEL (13,33); a extração duplicou o
  // aluguel em desconto, zerando aluguel_com_desconto. Sinal determinístico:
  // aluguel_com_desconto (zerado) + demais componentes não fecha com total.
  const base = createPrestacao()
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      receitas_por_imovel: [
        {
          ...base.receitas_por_imovel[0],
          apto: "202",
          inquilino: "BRUNO EDUARDO DA SILVA",
          aluguel: 13.33,
          desconto: 13.33,
          aluguel_com_desconto: 0,
          garagem: 0,
          agua: 0,
          iptu: 0,
          seguro_incendio: 0,
          total: 13.33,
          comissao: 0.93,
          repasse: 12.4,
          observacao: "RESCISÃO. PROPORCIONAL DE 01 DIA (01/06). SEGURO QUITADO. IPTU 2026 QUITADO.",
        },
      ],
    }),
    repasse: createRepasse(12.4),
    despesas: null,
    reajuste: null,
  })

  const row = result.prestacao?.receitas_por_imovel[0]
  assert.equal(row?.desconto, 0)
  assert.equal(row?.aluguel_com_desconto, 13.33)
  assert.equal(row?.total, 13.33)
})

test("desconto real e proporcional (com componentes consistentes) permanece intacto", () => {
  // Grand Maracanaú junho/2026, apto 112: desconto de 20 sobre 416,49 de
  // aluguel; aluguel_com_desconto (396,49) + garagem+iptu+seguro fecha com o
  // total (501,90) — não é o sinal de inconsistência, não deve ser tocado.
  const base = createPrestacao()
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      receitas_por_imovel: [
        {
          ...base.receitas_por_imovel[0],
          apto: "112",
          aluguel: 416.49,
          desconto: 20,
          aluguel_com_desconto: 396.49,
          garagem: 16.53,
          agua: 0,
          iptu: 0,
          seguro_incendio: 88.88,
          total: 501.9,
          comissao: 35.13,
          repasse: 466.77,
          observacao: "SEGURO (1/1). IPTU 2026 QUITADO. GARAGEM PARA MOTO.",
        },
      ],
    }),
    repasse: createRepasse(466.77),
    despesas: null,
    reajuste: null,
  })

  const row = result.prestacao?.receitas_por_imovel[0]
  assert.equal(row?.desconto, 20)
  assert.equal(row?.aluguel_com_desconto, 396.49)
})

test("nao bloqueia aprovacao quando aluguel recebido esta sem competencia original", () => {
  const base = createPrestacao()
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      competencia: "2026-05",
      receitas_por_imovel: [
        {
          ...base.receitas_por_imovel[0],
          vencimento: "10",
          competencia_original: undefined,
          competencia_recebimento: undefined,
          dia_vencimento: undefined,
        },
      ],
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  // A competencia e exibida a partir do documento; a ausencia nao gera recheck
  // bloqueante nem impede a aprovacao.
  assert.equal(result.rechecks.some((item) => item.id === "receitas_competencias"), false)
  assert.notEqual(result.parecer.status, "bloqueado")
})

test("recebimento sem vinculo ou confianca vira pendencia e sai dos totais (CA27.2)", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "intermediacao",
          apto: null,
          inquilino: null,
          valor: 255.9,
          comissao: 127.95,
          percentual: 50,
          competencia_original: "2026-02",
          competencia_recebimento: "2026-03",
          observacao: "Base inferida pelo OCR; linha de imovel nao identificada.",
          confianca: 0.55,
        },
      ],
    }),
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.prestacao?.acordos_rescisoes_recebidos.length, 0)
  const check = result.rechecks.find((item) => item.id === "recebimentos_sem_evidencia")
  assert.equal(check?.status, "warning")
  assert.match(check?.message ?? "", /intermediacao/i)
})

test("recebimento com evidencia suficiente permanece e o recheck passa", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "204",
          inquilino: "DEVEDOR",
          valor: 414.86,
          garagem: 52.07,
          total_recebido: 466.93,
          comissao: 32.69,
          repasse: 434.24,
          competencia_original: null,
          competencia_recebimento: "2026-03",
          observacao: null,
          confianca: 0.95,
        },
      ],
    }),
    repasse: null,
    despesas: null,
    reajuste: null,
  })

  assert.equal(result.prestacao?.acordos_rescisoes_recebidos.length, 1)
  const check = result.rechecks.find((item) => item.id === "recebimentos_sem_evidencia")
  assert.equal(check?.status, "passed")
})

// GM II jul/26: a coluna SEG INC. da planilha nao foi lida e 8 linhas ficaram com
// seguro null. Nenhum recheck acusou, porque o TOTAL da linha (copiado do
// documento) continuou correto. A soma dos componentes menor que o total e o
// sinal deterministico de coluna perdida na leitura.
test("alerta quando a soma dos componentes da linha fica abaixo do total impresso", () => {
  const prestacao = createPrestacao({
    receitas_por_imovel: [
      {
        apto: "2",
        inquilino: "LUIS",
        aluguel: 690.63,
        desconto: null,
        aluguel_com_desconto: 690.63,
        garagem: 52.32,
        agua: 67.7,
        iptu: 1.43,
        seguro_incendio: null,
        total: 951.91,
        comissao: 66.63,
        repasse: 885.28,
        vencimento: "10",
        observacao: "SEGURO (1/1).",
        confianca: 1,
      },
      {
        apto: "5",
        inquilino: "CRISTINA",
        aluguel: 617.92,
        desconto: null,
        aluguel_com_desconto: 617.92,
        garagem: 50,
        agua: 67.7,
        iptu: 1.43,
        seguro_incendio: null,
        total: 737.05,
        comissao: 51.59,
        repasse: 685.46,
        vencimento: "10",
        observacao: null,
        confianca: 1,
      },
    ],
  })

  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })
  const check = result.rechecks.find((item) => item.id === "linhas_componentes")

  assert.ok(check)
  assert.equal(check.status, "warning")
  assert.match(check.message, /apto 2/i)
  assert.match(check.message, /139,83/)
  assert.doesNotMatch(check.message, /apto 5/i)
  // Alerta de qualidade de leitura: nunca entra como bloqueio.
  assert.ok(result.rechecks.filter((item) => item.status === "failed").every((item) => item.id !== "linhas_componentes"))
})

test("componentes acima do total (IPTU de passagem anulado) nao geram alerta", () => {
  const prestacao = createPrestacao({
    receitas_por_imovel: [
      {
        apto: "0002526",
        inquilino: "LOCATARIO",
        aluguel: 6896.75,
        desconto: null,
        aluguel_com_desconto: 6896.75,
        garagem: null,
        agua: null,
        iptu: 193.02,
        seguro_incendio: null,
        total: 6896.75,
        comissao: 344.84,
        repasse: 6358.89,
        vencimento: null,
        observacao: "IPTU de passagem cobrado e repassado.",
        confianca: 1,
      },
    ],
  })

  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })
  const check = result.rechecks.find((item) => item.id === "linhas_componentes")

  assert.ok(check)
  assert.equal(check.status, "passed")
})

// Coluna desconhecida no cabecalho + totais que nao fecham = dinheiro real nao
// lido: bloqueia e nomeia a coluna. Coluna desconhecida com totais fechando
// (numero que nao e receita) fica em alerta.
test("bloqueia quando o parser reporta coluna nao lida e o total da linha nao fecha", () => {
  const prestacao = createPrestacao({
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["receitas"],
      estrategia: ["planilha"],
      alertas: ['Coluna "TAXA EXTRA" com 1 linha(s) e R$ 20.00 não é lida pelo parser.'],
      colunas_nao_lidas: [{ coluna: "TAXA EXTRA", total: 20, linhas: 1 }],
    },
    receitas_por_imovel: [
      {
        apto: "201",
        inquilino: "JOSE",
        aluguel: 154.84,
        desconto: null,
        aluguel_com_desconto: 154.84,
        garagem: null,
        agua: null,
        iptu: 3.35,
        seguro_incendio: 89.57,
        outros_recebimentos: 15.7,
        total: 283.46,
        comissao: 19.84,
        repasse: 263.62,
        vencimento: "10",
        observacao: null,
        confianca: 1,
      },
    ],
  })

  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })
  const check = result.rechecks.find((item) => item.id === "linhas_componentes")

  assert.ok(check)
  assert.equal(check.status, "failed")
  assert.match(check.message, /TAXA EXTRA/)
  assert.match(check.message, /apto 201 \(R\$\s?20,00\)/)
})

test("coluna nao lida com totais fechando fica em alerta e outros_recebimentos conta como componente", () => {
  const prestacao = createPrestacao({
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["receitas"],
      estrategia: ["planilha"],
      alertas: ["Coluna \"INDICE\" com 1 linha(s) e R$ 3.00 não é lida pelo parser."],
      colunas_nao_lidas: [{ coluna: "INDICE", total: 3, linhas: 1 }],
    },
    receitas_por_imovel: [
      {
        apto: "201",
        inquilino: "JOSE",
        aluguel: 154.84,
        desconto: null,
        aluguel_com_desconto: 154.84,
        garagem: null,
        agua: null,
        iptu: 3.35,
        seguro_incendio: 89.57,
        outros_recebimentos: 15.7,
        total: 263.46,
        comissao: 18.44,
        repasse: 245.02,
        vencimento: "10",
        observacao: null,
        confianca: 1,
      },
    ],
  })

  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })
  const check = result.rechecks.find((item) => item.id === "linhas_componentes")

  assert.ok(check)
  assert.equal(check.status, "warning")
  assert.match(check.message, /INDICE/)
})

test("nota fiscal da propria taxa de administracao nao vira despesa em dobro", () => {
  // Galpao Jose Walter, ago/2026. O extrato ja deduz a taxa de administracao na
  // linha do aluguel (vira comissao) e a NFS-e da administradora, subida como
  // documento de despesa, traz o MESMO valor. Com a despesa externa na frente do
  // consolidado, a taxa era retida duas vezes e o repasse calculado saia abaixo
  // do declarado — acendendo "Com divergencia" com razao.
  const prestacao = createPrestacao({
    resumo_financeiro: {
      ...createPrestacao().resumo_financeiro,
      comissao_administracao: 300,
      // Retido total = so a comissao. Nao ha outra retencao neste extrato.
      total_comissao_despesas: 300,
      total_a_repassar: 2700,
      recebidos_em_nome_locador: 3000,
    },
  })

  const result = validatePackage({
    documents: requiredDocuments,
    prestacao,
    repasse: createRepasse(2700),
    despesas: {
      despesas: [
        {
          tipo: "outro",
          valor: 300,
          fornecedor: "ADMINISTRADORA DE IMOVEIS LTDA",
          observacao: "Taxa de administracao.",
          referencia: "NFS-e 1234",
          endereco: null,
          pago_em: null,
          pago_por: null,
          vencimento: null,
          unidade_consumidora: null,
          confianca: 0.94,
        },
      ],
      total_despesas: 300,
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.94,
    } as never,
    reajuste: null,
  })

  // O consolidado manda: retido total 300 menos comissao 300 = zero despesa.
  assert.equal(result.totals.total_despesas, 0)
  // E o repasse fecha com o declarado, sem o desconto duplicado.
  assert.equal(
    result.totals.total_receitas - result.totals.total_comissoes - result.totals.total_despesas,
    2700,
  )
})

// Canários GM I / Maracanaú ago/2026 (feedback do cliente em 2026-09-17, pontos
// #10 e #14): o consolidado da prestação não tem escopo único na carteira. Num
// fechamento ele cobre só as linhas da vigência, noutro cobre as linhas mais os
// acordos e rescisões recebidos. Comparar sempre com as linhas acusava
// divergência de milhares de reais em documento correto — nos 31 fechamentos
// até ago/2026 eram 27 alertas falsos em 35.
test("GM I ago/2026: consolidado que inclui acordos e rescisoes nao e divergencia", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "101",
          inquilino: "Natan",
          valor: 500,
          total_recebido: 500,
          comissao: 50,
          repasse: 450,
          competencia_original: "2026-03",
          competencia_recebimento: "2026-03",
          observacao: "Acordo recebido no mes.",
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        ...createPrestacao().resumo_financeiro,
        // Linhas 3.000 + acordo 500; comissoes 30 + 50; repasse 2.700 + 450.
        total_linhas_receitas: 3500,
        total_linhas_comissoes: 80,
        total_linhas_repasse: 3150,
      },
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  for (const id of ["total_linhas_receitas", "total_linhas_comissoes", "total_linhas_repasse"]) {
    const check = result.rechecks.find((item) => item.id === id)
    assert.equal(check?.status, "passed", `${id}: ${check?.message}`)
    assert.match(check?.message ?? "", /acordos e rescisoes recebidos no mes/)
  }
})

// GM II ago/2026 é o caso oposto: o consolidado cobre SÓ as linhas. Somar os
// acordos sempre apenas inverteria o falso positivo.
test("GM II ago/2026: consolidado restrito as linhas continua batendo com os acordos presentes", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "101",
          inquilino: "Natan",
          valor: 500,
          total_recebido: 500,
          comissao: 50,
          repasse: 450,
          competencia_original: "2026-03",
          competencia_recebimento: "2026-03",
          observacao: "Acordo recebido no mes.",
          confianca: 0.95,
        },
      ],
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "total_linhas_receitas")
  assert.equal(check?.status, "passed")
  assert.match(check?.message ?? "", /bate com o consolidado\./)
})

// GM II ago/2026, ponto #13: o documento fecha o total em R$ 14.255,86 enquanto
// suas 27 linhas somam R$ 14.255,82. Quatro centavos de arredondamento não são
// erro, e o alerta dizia "o correto pelo recálculo é...", acusando o documento.
test("centavos de arredondamento do documento nao viram acusacao de erro", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      resumo_financeiro: {
        ...createPrestacao().resumo_financeiro,
        total_linhas_receitas: 3000.04,
      },
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "total_linhas_receitas")
  assert.equal(check?.status, "passed")
  assert.equal(check?.difference, 0.04)
  assert.match(check?.message ?? "", /arredondamento do documento/)
})

// Divergência real (Maracanaú ago/2026: R$ 123,33 no repasse, o menor dos
// casos que sobram) continua alertando — e agora aponta o escopo mais próximo.
test("divergencia real continua alertando e nomeia o escopo mais proximo", () => {
  const result = validatePackage({
    documents: requiredDocuments,
    prestacao: createPrestacao({
      acordos_rescisoes_recebidos: [
        {
          tipo: "acordo",
          apto: "101",
          inquilino: "Natan",
          valor: 500,
          total_recebido: 500,
          comissao: 50,
          repasse: 450,
          competencia_original: "2026-03",
          competencia_recebimento: "2026-03",
          observacao: "Acordo recebido no mes.",
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        ...createPrestacao().resumo_financeiro,
        total_linhas_receitas: 3623.33,
      },
    }),
    repasse: createRepasse(2700),
    despesas: null,
    reajuste: null,
  })

  const check = result.rechecks.find((item) => item.id === "total_linhas_receitas")
  assert.equal(check?.status, "warning")
  assert.equal(check?.expected, 3500)
  assert.equal(check?.difference, 123.33)
  assert.match(check?.message ?? "", /linhas R\$\s3\.000,00 \+ acordos e rescisoes R\$\s500,00/)
})
