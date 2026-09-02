import assert from "node:assert/strict"
import test from "node:test"
import {
  ehComparavel,
  extrairResumo,
  verificarReconciliacaoRepasse,
  type ResumoFechamento,
} from "./verify-reconciliacao-repasse.ts"

function resumo(overrides: Partial<ResumoFechamento> = {}): ResumoFechamento {
  return {
    competencia: "2026-07-01",
    empreendimento: "Grand Messejana I",
    recebidosEmNomeLocador: 13721.12,
    totalComissaoDespesas: 1091.62,
    comissaoIntermediacao: 0,
    totalARepassar: 12629.5,
    ...overrides,
  }
}

test("fechamento sem intermediacao que fecha nao acusa nada", () => {
  // Grand Messejana I jul/26, valores reais: 13721,12 − 1091,62 = 12629,50.
  assert.deepEqual(verificarReconciliacaoRepasse([resumo()]), [])
})

test("intermediacao entra na equacao como terceira parcela", () => {
  // LOCMAIS jul/26, valores reais: 12350,41 − 1514,54 − 480,00 = 10355,87.
  // Sem contar a intermediacao a conta sobraria exatamente 480,00 — foi assim
  // que a divergencia apareceu na auditoria de 2026-09-02.
  const divergencias = verificarReconciliacaoRepasse([
    resumo({
      empreendimento: "LOCMAIS",
      recebidosEmNomeLocador: 12350.41,
      totalComissaoDespesas: 1514.54,
      comissaoIntermediacao: 480,
      totalARepassar: 10355.87,
    }),
  ])

  assert.deepEqual(divergencias, [])
})

test("intermediacao esquecida do consolidado acusa a diferenca exata", () => {
  // O mesmo LOCMAIS, mas com a intermediacao perdida pelo caminho: a equacao
  // sobra os 480,00 e o verificador precisa nomear o valor.
  const divergencias = verificarReconciliacaoRepasse([
    resumo({
      empreendimento: "LOCMAIS",
      recebidosEmNomeLocador: 12350.41,
      totalComissaoDespesas: 1514.54,
      comissaoIntermediacao: 0,
      totalARepassar: 10355.87,
    }),
  ])

  assert.equal(divergencias.length, 1)
  assert.equal(divergencias[0]?.esperado, 10835.87)
  assert.equal(divergencias[0]?.diferenca, 480)
})

test("consolidado retido negativo fecha quando a passagem devolve dinheiro", () => {
  // Galpao Jose Walter jun/26: o IPTU de passagem entrou 445,95 e o consolidado
  // retido ficou negativo (256,00 de comissao − 445,95 de entrada). O repasse
  // fica MAIOR que a receita, e isso e correto — o verificador nao pode tratar
  // consolidado negativo como estado impossivel.
  assert.deepEqual(
    verificarReconciliacaoRepasse([
      resumo({
        empreendimento: "Galpao Jose Walter",
        competencia: "2026-06-01",
        recebidosEmNomeLocador: 3200,
        totalComissaoDespesas: -189.95,
        comissaoIntermediacao: 0,
        totalARepassar: 3389.95,
      }),
    ]),
    [],
  )
})

test("diferenca de um centavo fica dentro da tolerancia e dois centavos nao", () => {
  const umCentavo = verificarReconciliacaoRepasse([resumo({ totalARepassar: 12629.51 })])
  assert.deepEqual(umCentavo, [])

  const doisCentavos = verificarReconciliacaoRepasse([resumo({ totalARepassar: 12629.52 })])
  assert.equal(doisCentavos.length, 1)
  assert.equal(doisCentavos[0]?.diferenca, 0.02)
})

test("resumo incompleto e ausencia de dado, nao divergencia", () => {
  // A analise ja marca isso como pendencia propria (recheck resumo_financeiro
  // em warning); acusar de novo aqui seria ruido duplicado.
  assert.equal(ehComparavel(resumo({ totalComissaoDespesas: null })), false)
  assert.deepEqual(verificarReconciliacaoRepasse([resumo({ totalComissaoDespesas: null })]), [])
  assert.deepEqual(verificarReconciliacaoRepasse([resumo({ totalARepassar: null })]), [])
  assert.deepEqual(verificarReconciliacaoRepasse([resumo({ recebidosEmNomeLocador: null })]), [])
})

test("extrairResumo soma so a comissao das linhas de intermediacao", () => {
  // Grand Castelao I jul/26: a secao de acordos/rescisoes traz rescisao e
  // acordo junto com a intermediacao; so a ultima entra na equacao.
  const extraido = extrairResumo({
    competencia: "2026-07-01",
    empreendimentos: { nome: "Grand Castelão I" },
    analise_completa: {
      prestacao: {
        resumo_financeiro: {
          recebidos_em_nome_locador: 16634.19,
          total_comissao_despesas: 2583.81,
          total_a_repassar: 13645.38,
        },
        acordos_rescisoes_recebidos: [
          { tipo: "acordo", apto: "101", valor: 1685.87, comissao: 120.5, confianca: 0.95 },
          { tipo: "intermediacao", apto: "12", valor: 675, comissao: 405, confianca: 0.95 },
          { tipo: "rescisao", apto: "7", valor: 900, comissao: 60, confianca: 0.95 },
        ],
      },
    },
  })

  assert.equal(extraido.comissaoIntermediacao, 405)
  assert.equal(extraido.empreendimento, "Grand Castelão I")
  assert.deepEqual(verificarReconciliacaoRepasse([extraido]), [])
})

test("intermediacao pendente nao entra na equacao do verificador", () => {
  // CA27.2: item sem vinculo (nem apto nem inquilino) vira pendencia de
  // revisao, nunca soma confirmada — e o fechamento tambem nao o somou. Somar
  // aqui acusaria divergencia justamente em quem tratou a pendencia direito.
  // Caso real: canary "Grand Messejana I: intermediacao sem unidade e com
  // baixa confianca nao entra nos totais".
  const semVinculo = extrairResumo({
    competencia: "2026-07-01",
    empreendimentos: { nome: "Grand Messejana I" },
    analise_completa: {
      prestacao: {
        resumo_financeiro: {
          recebidos_em_nome_locador: 13721.12,
          total_comissao_despesas: 1091.62,
          total_a_repassar: 12629.5,
        },
        acordos_rescisoes_recebidos: [{ tipo: "intermediacao", valor: 800, comissao: 480, confianca: 0.95 }],
      },
    },
  })
  assert.equal(semVinculo.comissaoIntermediacao, 0)
  assert.deepEqual(verificarReconciliacaoRepasse([semVinculo]), [])

  const confiancaBaixa = extrairResumo({
    competencia: "2026-07-01",
    empreendimentos: { nome: "Grand Messejana I" },
    analise_completa: {
      prestacao: {
        resumo_financeiro: {
          recebidos_em_nome_locador: 13721.12,
          total_comissao_despesas: 1091.62,
          total_a_repassar: 12629.5,
        },
        acordos_rescisoes_recebidos: [
          { tipo: "intermediacao", apto: "9", valor: 800, comissao: 480, confianca: 0.4 },
        ],
      },
    },
  })
  assert.equal(confiancaBaixa.comissaoIntermediacao, 0)
})

test("fechamento sem prestacao nao explode e sai como incomparavel", () => {
  const extraido = extrairResumo({
    competencia: "2026-05-01",
    empreendimentos: null,
    analise_completa: null,
  })

  assert.equal(ehComparavel(extraido), false)
  assert.equal(extraido.comissaoIntermediacao, 0)
  assert.equal(extraido.empreendimento, "—")
})
