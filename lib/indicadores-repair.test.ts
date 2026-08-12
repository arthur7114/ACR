import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import type { PackageAnalysis, PrestacaoAnalysis, ReceitaPorImovel } from "./prestacao-types"
import {
  buildCesarMonthRepairs,
  reconcileFinancialDimensions,
  repairGmIiMarchAnalysis,
  repairPluralPassThroughAnalysis,
  scopeCesarRegoAnalysisToDevelopment,
} from "./indicadores-repair.ts"
import {
  extractPdfTextLines,
  parseCesarRegoPrestacao,
} from "./server/cesar-rego-parser.ts"
import { refreshPackageValidation } from "./server/package-rechecks.ts"
import { commissionBaseComponents } from "./comissao.ts"

test("ponte v2 exige diferença não explicada de no máximo um centavo", () => {
  const reconciled = reconcileFinancialDimensions({
    receitasEconomicas: 3_200,
    entradasPassagem: 445.95,
    comissoes: 256,
    despesas: 0,
    tarifas: 0,
    saidasPassagem: 0,
    repasseDeclarado: 3_389.95,
  })
  assert.equal(reconciled.repasseCalculado, 3_389.95)
  assert.equal(reconciled.reconciliado, true)

  const divergent = reconcileFinancialDimensions({
    ...reconciled,
    repasseDeclarado: 3_389.97,
  })
  assert.equal(divergent.reconciliado, false)
  assert.equal(divergent.diferencaNaoExplicada, 0.02)
})

test("GM II março preserva o atraso recebido de fevereiro e a inadimplência corrente", () => {
  const row = makeRow({
    apto: "3",
    inquilino: "FRANCISCO SANTIAGO",
    aluguel: 707.37,
    total: 784.17,
  })
  const repaired = repairGmIiMarchAnalysis(
    makePackage(makePrestacao("Grand Messejana II", "2026-03", [row]), {
      receita: 784.17,
      comissao: 54.89,
      despesa: 0,
      repasse: 729.28,
    }),
  )
  const received = repaired.prestacao!.receitas_por_imovel[0]
  const delinquency = repaired.prestacao!.inadimplencias_acumuladas[0]

  assert.equal(received.competencia_original, "2026-02")
  assert.equal(received.competencia_recebimento, "2026-03")
  assert.equal(received.dia_vencimento, 10)
  assert.equal(delinquency.valor, 705.89)
  assert.equal(delinquency.competencia_original, "2026-03")
})

test("Plural maio e junho separam o IPTU de passagem da receita econômica", () => {
  const may = repairPluralPassThroughAnalysis(
    makePackage(
      makePrestacao("Galpao Jose Walter", "2026-05", [
        makeRow({
          apto: "GA0002",
          aluguel: 3_200,
          total: 3_200,
          comissao: 256,
          repasse: 2_052.1,
          observacao:
            "IPTU - Parcela 04 -445,95; IPTU - Parcela 05 -445,95",
        }),
      ]),
      { receita: 3_200, comissao: 256, despesa: 891.9, repasse: 2_052.1 },
    ),
    "2026-05",
  )
  assert.equal(may.analysisRepaired.totals.total_receitas, 3_200)
  assert.equal(may.analysisRepaired.totals.total_despesas, 0)
  assert.equal(may.analysisRepaired.totals.saidas_passagem, 891.9)

  const june = repairPluralPassThroughAnalysis(
    makePackage(
      makePrestacao("Galpao Jose Walter", "2026-06", [
        makeRow({
          apto: "GA0002",
          aluguel: 3_200,
          total: 3_200,
          iptu: 445.95,
          comissao: 256,
          repasse: 3_389.95,
        }),
      ]),
      { receita: 3_645.95, comissao: 256, despesa: 0, repasse: 3_389.95 },
    ),
    "2026-06",
  )
  assert.equal(june.analysisRepaired.totals.total_receitas, 3_200)
  assert.equal(june.analysisRepaired.totals.entradas_passagem, 445.95)
  assert.equal(june.reconciliation.reconciliado, true)
})

test("César Rêgo março distribui as linhas sem duplicar o documento consolidado", async () => {
  const fixture = join(
    process.cwd(),
    "docs/Artefatos/extratoagrupado - cesar rego - REF 03-26 (1).pdf",
  )
  const parsed = parseCesarRegoPrestacao(
    await extractPdfTextLines(readFileSync(fixture)),
    "2026-03",
  )
  const plan = buildCesarMonthRepairs(
    [
      {
        id: "joao",
        empreendimentoNome: "João Cordeiro",
        analysis: makePackage(makePrestacao("João Cordeiro", "2026-03", [])),
      },
      {
        id: "pompilio",
        empreendimentoNome: "Galpão Pompílio Gomes",
        analysis: makePackage(makePrestacao("Galpão Pompílio Gomes", "2026-03", [])),
      },
    ],
    parsed,
  )

  assert.equal(plan.sourceReconciled, true)
  assert.deepEqual(plan.missingPropertyCodes, [])
  assert.equal(plan.repairs.length, 2)
  assert.equal(
    plan.repairs.reduce(
      (total, repair) => total + repair.reconciliation.receitasEconomicas,
      0,
    ),
    13_132.74,
  )
  assert.equal(
    plan.repairs.reduce(
      (total, repair) => total + repair.reconciliation.repasseDeclarado,
      0,
    ),
    12_566.32,
  )
  assert.deepEqual(
    plan.repairs.find((repair) => repair.id === "joao")?.propertyCodes,
    ["0002520", "0002521"],
  )
  assert.deepEqual(
    plan.repairs.map((repair) => repair.reconciliation.tarifas),
    [5.55, 5.55],
  )

  // A base de comissão do reparo reflete SÓ as linhas do empreendimento
  // (incluindo o IPTU), não o total do documento consolidado. Sem isso, a base
  // herdaria o valor do consolidado inteiro e ficaria maior que a receita.
  for (const repair of plan.repairs) {
    const rows = repair.analysisRepaired.prestacao?.receitas_por_imovel ?? []
    const expected = commissionBaseComponents(rows)
    assert.equal(
      repair.analysisRepaired.totals.base_comissao_administracao,
      expected.base,
    )
    assert.equal(
      repair.analysisRepaired.totals.total_iptu,
      expected.totalIptu,
    )
  }

  const scoped = scopeCesarRegoAnalysisToDevelopment(
    makePackage(parsed, {
      receita: 13_132.74,
      comissao: 555.32,
      despesa: 11.1,
      repasse: 12_566.32,
    }),
    "João Cordeiro",
  )
  assert.deepEqual(
    scoped.prestacao?.receitas_por_imovel.map((row) => row.apto),
    ["0002520", "0002521"],
  )
  assert.equal(scoped.totals.total_receitas, 1_100)
  assert.equal(scoped.totals.total_tarifas, 5.55)
  assert.equal(scoped.totals.total_repasse_bruto, 1_039.67)
  assert.equal(scoped.totals.repasse_declarado, 1_034.12)
  assert.equal(scoped.totals.valor_comprovado, 1_034.12)
  assert.equal(scoped.totals.diferenca_repasse, 0)

  const refreshed = refreshPackageValidation(scoped)
  const commissionCheck = refreshed.rechecks.find(
    (check) => check.id === "total_linhas_comissoes",
  )
  const transferCheck = refreshed.rechecks.find(
    (check) => check.id === "total_linhas_repasse",
  )
  assert.equal(commissionCheck?.status, "passed")
  assert.equal(
    commissionCheck?.actual,
    scoped.prestacao?.resumo_financeiro.total_linhas_comissoes,
  )
  assert.equal(transferCheck?.status, "passed")
  assert.equal(
    transferCheck?.actual,
    scoped.prestacao?.resumo_financeiro.total_linhas_repasse,
  )
  assert.equal(refreshed.totals.total_tarifas, 5.55)
})

test("César Rêgo julho preserva os valores exatos e elimina totais consolidados dos rechecks", () => {
  const parsed = makePrestacao("Documento consolidado", "2026-07", [
    makeRow({
      apto: "0002520",
      aluguel: 1_237.05,
      total: 1_237.05,
      comissao: 61.85,
      repasse: 1_175.2,
    }),
    makeRow({
      apto: "0002521",
      inquilino: "CONTRATO ATIVO",
      total: 0,
      comissao: null,
      repasse: null,
      observacao: "INADIMPLENCIA",
    }),
    makeRow({
      apto: "0002526",
      aluguel: 6_896.75,
      iptu: 193.02,
      total: 6_896.75,
      comissao: 283.59,
      repasse: 6_613.16,
      entradas_passagem: 193.02,
      saidas_passagem: 193.02,
    }),
    makeRow({
      apto: "0002527",
      aluguel: 5_517.41,
      iptu: 149.02,
      total: 5_517.41,
      comissao: 226.66,
      repasse: 5_290.75,
      entradas_passagem: 149.02,
      saidas_passagem: 149.02,
    }),
  ])
  parsed.imobiliaria = "Cesar Rego Imoveis"
  parsed.resumo_financeiro = {
    ...parsed.resumo_financeiro,
    total_linhas_receitas: 13_651.21,
    total_linhas_comissoes: 572.1,
    total_linhas_repasse: 13_079.11,
    comissao_administracao: 572.1,
    outras_comissoes_despesas: [
      { descricao: "TED", valor: 11.1, confianca: 1 },
    ],
    total_outras_comissoes_despesas: 11.1,
    total_comissao_despesas: 583.2,
    recebidos_em_nome_locador: 13_651.21,
    total_a_repassar: 13_068.01,
    repasse_embutido: true,
  }

  const plan = buildCesarMonthRepairs(
    [
      {
        id: "joao-julho",
        empreendimentoNome: "João Cordeiro",
        analysis: makePackage(parsed),
      },
      {
        id: "pompilio-julho",
        empreendimentoNome: "Galpão Pompílio Gomes",
        analysis: makePackage(parsed),
      },
    ],
    parsed,
  )
  const joao = plan.repairs.find((repair) => repair.id === "joao-julho")!
  const pompilio = plan.repairs.find((repair) => repair.id === "pompilio-julho")!
  const joaoValidated = refreshPackageValidation(joao.analysisRepaired, {
    commercialRule: {
      taxa_administracao_percent: 5,
      taxa_intermediacao_percent: 0,
    },
  })
  const pompilioValidated = refreshPackageValidation(pompilio.analysisRepaired, {
    commercialRule: {
      taxa_administracao_percent: 4,
      taxa_intermediacao_percent: 0,
    },
  })

  assert.deepEqual(
    [
      joaoValidated.totals.total_comissoes,
      joaoValidated.totals.total_tarifas,
      joaoValidated.totals.total_a_repassar,
    ],
    [61.85, 5.55, 1_169.65],
  )
  assert.deepEqual(
    [
      pompilioValidated.totals.total_comissoes,
      pompilioValidated.totals.total_tarifas,
      pompilioValidated.totals.total_a_repassar,
    ],
    [510.25, 5.55, 11_898.36],
  )
  for (const analysis of [joaoValidated, pompilioValidated]) {
    const values = analysis.rechecks.flatMap((check) => [
      check.expected,
      check.actual,
    ])
    assert.ok(!values.includes(572.1))
    assert.ok(!values.includes(13_079.11))
  }
  assert.equal(
    pompilioValidated.rechecks.find(
      (check) => check.id === "comissao_administracao_regra",
    )?.status,
    "passed",
  )
})

function makePackage(
  prestacao: PrestacaoAnalysis,
  values: {
    receita?: number
    comissao?: number
    despesa?: number
    repasse?: number
  } = {},
): PackageAnalysis {
  const receita = values.receita ?? 0
  const comissao = values.comissao ?? 0
  const despesa = values.despesa ?? 0
  const repasse = values.repasse ?? receita - comissao - despesa
  return {
    documents: [],
    prestacao,
    repasse: null,
    despesas: null,
    reajuste: null,
    totals: {
      total_receitas: receita,
      total_aluguel: receita,
      total_garagem: 0,
      total_agua: 0,
      total_iptu: 0,
      total_seguro_incendio: 0,
      total_comissoes: comissao,
      total_repasse_bruto: repasse,
      total_despesas: despesa,
      total_comissao_despesas: comissao + despesa,
      total_a_repassar: repasse,
      valor_comprovado: repasse,
      diferenca_repasse: 0,
      taxa_administracao_percent: null,
      taxa_intermediacao_percent: null,
      comissao_administracao_calculada: null,
      base_comissao_administracao: receita,
      comissao_realizada_percent: null,
      repasse_embutido: true,
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
    fechamentoId: null,
    storagePath: null,
  }
}

function makePrestacao(
  empreendimento: string,
  competencia: string,
  rows: ReceitaPorImovel[],
): PrestacaoAnalysis {
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "",
    empreendimento,
    competencia,
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: [],
      estrategia: [],
      alertas: [],
    },
    receitas_por_imovel: rows,
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 0,
      total_linhas_comissoes: 0,
      total_linhas_repasse: 0,
      comissao_administracao: 0,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 0,
      recebidos_em_nome_locador: 0,
      total_a_repassar: 0,
      repasse_embutido: true,
      confianca: 1,
    },
    totais: { total_receitas: 0, total_comissoes: 0, total_repassar: 0 },
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 1,
  }
}

function makeRow(overrides: Partial<ReceitaPorImovel>): ReceitaPorImovel {
  return {
    apto: "1",
    inquilino: "",
    aluguel: null,
    desconto: null,
    aluguel_com_desconto: null,
    garagem: null,
    vagas_garagem: null,
    agua: null,
    iptu: null,
    seguro_incendio: null,
    total: 0,
    comissao: null,
    repasse: null,
    vencimento: null,
    observacao: null,
    confianca: 1,
    ...overrides,
  }
}
