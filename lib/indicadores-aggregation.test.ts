import assert from "node:assert/strict"
import test from "node:test"
import { aggregateIndicadores } from "./indicadores-aggregation.ts"

const COMPETENCIA = "2026-05-01"
const ATUALIZADO_EM = "2026-07-13T12:00:00.000Z"

interface PairFixture {
  empresaId: string
  empresaNome?: string
  imobiliariaId: string
  imobiliariaNome?: string
  empreendimentoId: string
  empreendimentoNome?: string
}

interface RuleFixture extends PairFixture {
  ativo: boolean
}

interface PropertyFixture extends PairFixture {
  id: string
  unidade: string
  inquilinoNome: string | null
  statusAtual: "ocupado" | "inadimplente" | "vago" | "em_rescisao" | "desconhecido"
  aluguelEsperadoAtual: number | null
  ativo: boolean
}

interface RevenueLineFixture {
  apto: string
  inquilino: string
  aluguel: number | null
  aluguel_com_desconto: number | null
  desconto: number | null
  total: number
}

interface PrestacaoFixture {
  receitas_por_imovel: RevenueLineFixture[]
  acordos_rescisoes_recebidos: Array<{
    tipo: "intermediacao" | "acordo" | "rescisao" | "atraso" | "outro"
    comissao: number | null
  }>
  inadimplencias_acumuladas: Array<{ valor: number }>
}

interface AnalysisFixture {
  totals: {
    total_receitas: number
    total_comissoes: number
    total_despesas: number
    total_a_repassar: number
    valor_comprovado: number | null
    total_agua: number
    total_iptu: number
    total_seguro_incendio: number
    repasse_embutido: boolean
  }
  prestacao: PrestacaoFixture | null
}

interface ClosingFixture extends PairFixture {
  id: string
  competencia: string
  status: string
  arquivado: boolean
  processamentoStatus: string | null
  analiseCompleta: AnalysisFixture | null
}

interface SnapshotFixture {
  imovelId: string
  fechamentoId: string
  competencia: string
  statusOcupacao: "ocupado" | "inadimplente" | "vago" | "em_rescisao" | "desconhecido"
  statusOrigem: string
  aluguelEsperado: number | null
  aluguelRecebido: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  origem: "processamento" | "backfill"
  qualidade: "completo" | "parcial" | "sem_linha"
}

interface AggregationFixture {
  calculoVersao: string
  competencia: string
  atualizadoEm: string
  filtros: {
    empresaId: string | null
    empreendimentoId: string | null
    imovelId: string | null
  }
  regrasAtivas: RuleFixture[]
  imoveisAtivos: PropertyFixture[]
  fechamentos: ClosingFixture[]
  snapshots: SnapshotFixture[]
  linhasNaoVinculadas: Array<{
    fechamentoId: string
    quantidade: number
    detalhes?: string[]
  }>
}

const PAIR_A: PairFixture = {
  empresaId: "empresa-a",
  imobiliariaId: "imobiliaria-a",
  empreendimentoId: "empreendimento-a",
}

function makePair(index: string): PairFixture {
  return {
    empresaId: `empresa-${index}`,
    imobiliariaId: `imobiliaria-${index}`,
    empreendimentoId: `empreendimento-${index}`,
  }
}

function makeRule(pair: PairFixture = PAIR_A): RuleFixture {
  return { ...pair, ativo: true }
}

function makeProperty(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    ...PAIR_A,
    id: "imovel-a",
    unidade: "101",
    inquilinoNome: "Maria",
    statusAtual: "ocupado",
    aluguelEsperadoAtual: 1_000,
    ativo: true,
    ...overrides,
  }
}

function makeAnalysis(overrides: {
  totals?: Partial<AnalysisFixture["totals"]>
  receitas?: RevenueLineFixture[]
  intermediacoes?: PrestacaoFixture["acordos_rescisoes_recebidos"]
  inadimplencias?: PrestacaoFixture["inadimplencias_acumuladas"]
} = {}): AnalysisFixture {
  return {
    totals: {
      total_receitas: 2_000,
      total_comissoes: 100,
      total_despesas: 200,
      total_a_repassar: 1_650,
      valor_comprovado: 1_600,
      total_agua: 50,
      total_iptu: 50,
      total_seguro_incendio: 25,
      repasse_embutido: false,
      ...overrides.totals,
    },
    prestacao: {
      receitas_por_imovel: overrides.receitas ?? [
        {
          apto: "101",
          inquilino: "Maria",
          aluguel: 1_000,
          aluguel_com_desconto: 900,
          desconto: 100,
          total: 2_000,
        },
      ],
      acordos_rescisoes_recebidos: overrides.intermediacoes ?? [
        { tipo: "intermediacao", comissao: 50 },
      ],
      inadimplencias_acumuladas: overrides.inadimplencias ?? [],
    },
  }
}

function makeClosing(overrides: Partial<ClosingFixture> = {}): ClosingFixture {
  return {
    ...PAIR_A,
    id: "fechamento-a",
    competencia: COMPETENCIA,
    status: "aprovado",
    arquivado: false,
    processamentoStatus: "concluido",
    analiseCompleta: makeAnalysis(),
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<SnapshotFixture> = {}): SnapshotFixture {
  return {
    imovelId: "imovel-a",
    fechamentoId: "fechamento-a",
    competencia: COMPETENCIA,
    statusOcupacao: "ocupado",
    statusOrigem: "aluguel_positivo",
    aluguelEsperado: 1_000,
    aluguelRecebido: 900,
    receitaTotal: 2_000,
    desconto: 100,
    comissaoAdministracao: 100,
    repasseApurado: 1_650,
    origem: "processamento",
    qualidade: "completo",
    ...overrides,
  }
}

function makeInput(overrides: Partial<AggregationFixture> = {}): AggregationFixture {
  return {
    calculoVersao: "indicadores-operacionais-v1",
    competencia: COMPETENCIA,
    atualizadoEm: ATUALIZADO_EM,
    filtros: { empresaId: null, empreendimentoId: null, imovelId: null },
    regrasAtivas: [makeRule()],
    imoveisAtivos: [makeProperty()],
    fechamentos: [makeClosing()],
    snapshots: [makeSnapshot()],
    linhasNaoVinculadas: [],
    ...overrides,
  }
}

test("inclui somente a whitelist de status, com análise, não arquivados", () => {
  const eligibleStatuses = [
    "pendente_revisao",
    "processado_com_sucesso",
    "processado_com_alertas",
    "aprovado",
    "preparado_egestor",
    "lancado_egestor",
    "erro_egestor",
  ]
  const excludedStatuses = ["rascunho", "arquivos_enviados", "erro", "cancelado"]
  const eligible = eligibleStatuses.map((status, index) => {
    const pair = makePair(`ok-${index}`)
    return makeClosing({
      ...pair,
      id: `fechamento-ok-${index}`,
      status,
      analiseCompleta: makeAnalysis({ totals: { total_receitas: 10 } }),
    })
  })
  const excluded = excludedStatuses.map((status, index) => {
    const pair = makePair(`fora-${index}`)
    return makeClosing({
      ...pair,
      id: `fechamento-fora-${index}`,
      status,
      analiseCompleta: makeAnalysis({ totals: { total_receitas: 1_000 } }),
    })
  })
  const archived = makeClosing({
    ...makePair("arquivado"),
    id: "fechamento-arquivado",
    arquivado: true,
    analiseCompleta: makeAnalysis({ totals: { total_receitas: 1_000 } }),
  })
  const withoutAnalysis = makeClosing({
    ...makePair("sem-analise"),
    id: "fechamento-sem-analise",
    analiseCompleta: null,
  })

  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [...eligible, ...excluded, archived, withoutAnalysis].map((item) => makeRule(item)),
    imoveisAtivos: [],
    snapshots: [],
    fechamentos: [...eligible, ...excluded, archived, withoutAnalysis],
  }))

  assert.equal(result.resumo.receitaTotal, 70)
})

test("mantém a última análise válida e marca o par durante reprocessamento", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      status: "processado_com_sucesso",
      processamentoStatus: "processando",
      analiseCompleta: makeAnalysis({ totals: { total_receitas: 875 } }),
    })],
  }))

  assert.equal(result.resumo.receitaTotal, 875)
  assert.equal(result.cobertura.pares.emAtualizacao, 1)
})

test("forma o universo esperado pela união deduplicada de regras e imóveis ativos", () => {
  const pairB = makePair("b")
  const pairC = makePair("c")

  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [makeRule(PAIR_A), makeRule(pairB)],
    imoveisAtivos: [
      makeProperty(),
      makeProperty({ ...pairC, id: "imovel-c", unidade: "301" }),
    ],
    fechamentos: [],
    snapshots: [],
  }))

  assert.equal(result.cobertura.pares.esperados, 3)
  assert.equal(result.cobertura.pares.ausentes, 3)
})

test("identifica nominalmente pares, imóveis e linhas das lacunas de cobertura", () => {
  const pairB = {
    ...makePair("b"),
    imobiliariaNome: "Imobiliária Norte",
    empreendimentoNome: "Residencial Sol",
  }
  const propertyA = makeProperty({
    imobiliariaNome: "Imobiliária Sul",
    empreendimentoNome: "Residencial Mar",
  })
  const propertyB = makeProperty({
    ...pairB,
    id: "imovel-b",
    unidade: "202",
  })
  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [makeRule(PAIR_A), makeRule(pairB)],
    imoveisAtivos: [propertyA, propertyB],
    fechamentos: [makeClosing({ ...PAIR_A })],
    snapshots: [makeSnapshot({ statusOcupacao: "desconhecido", aluguelEsperado: null })],
    linhasNaoVinculadas: [{
      fechamentoId: "fechamento-a",
      quantidade: 1,
      detalhes: ["Imobiliária Sul · Residencial Mar · Unidade 999"],
    }],
  }))

  const gaps = new Map(result.cobertura.lacunas.map((gap) => [gap.codigo, gap]))
  assert.deepEqual(gaps.get("par_ausente")?.detalhes, ["Imobiliária Norte · Residencial Sol"])
  assert.deepEqual(gaps.get("snapshot_ausente")?.detalhes, [
    "Imobiliária Norte · Residencial Sol · Unidade 202",
  ])
  assert.deepEqual(gaps.get("snapshot_desconhecido")?.detalhes, [
    "Imobiliária Sul · Residencial Mar · Unidade 101",
  ])
  assert.deepEqual(gaps.get("aluguel_esperado_ausente")?.detalhes, [
    "Imobiliária Sul · Residencial Mar · Unidade 101",
  ])
  assert.deepEqual(gaps.get("linha_nao_vinculada")?.detalhes, [
    "Imobiliária Sul · Residencial Mar · Unidade 999",
  ])
})

test("não colapsa imóveis homônimos de imobiliárias diferentes nas lacunas", () => {
  const commonDevelopment = {
    empreendimentoId: "empreendimento-compartilhado",
    empreendimentoNome: "Residencial Compartilhado",
  }
  const propertyNorth = makeProperty({
    ...commonDevelopment,
    id: "imovel-norte",
    unidade: "101",
    imobiliariaId: "imobiliaria-norte",
    imobiliariaNome: "Imobiliária Norte",
  })
  const propertySouth = makeProperty({
    ...commonDevelopment,
    id: "imovel-sul",
    unidade: "101",
    imobiliariaId: "imobiliaria-sul",
    imobiliariaNome: "Imobiliária Sul",
  })
  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [],
    imoveisAtivos: [propertyNorth, propertySouth],
    fechamentos: [],
    snapshots: [],
  }))

  const missingSnapshots = result.cobertura.lacunas.find(
    (gap) => gap.codigo === "snapshot_ausente",
  )
  assert.equal(missingSnapshots?.quantidade, 2)
  assert.deepEqual(missingSnapshots?.detalhes, [
    "Imobiliária Norte · Residencial Compartilhado · Unidade 101",
    "Imobiliária Sul · Residencial Compartilhado · Unidade 101",
  ])
})

test("classifica como completa somente quando todos os pares estão processados e sem lacuna", () => {
  const complete = aggregateIndicadores(makeInput())
  const withStructuralGap = aggregateIndicadores(makeInput({
    linhasNaoVinculadas: [{ fechamentoId: "fechamento-a", quantidade: 1 }],
  }))

  assert.equal(complete.meta.qualidade, "completa")
  assert.equal(withStructuralGap.meta.qualidade, "preliminar")
  assert.ok(withStructuralGap.cobertura.lacunas.some((gap) => gap.codigo === "linha_nao_vinculada"))
})

test("mantém competência pendente ou em atualização como preliminar", () => {
  const pending = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({ status: "pendente_revisao" })],
  }))
  const updating = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({ processamentoStatus: "processando" })],
  }))

  assert.equal(pending.meta.qualidade, "preliminar")
  assert.equal(updating.meta.qualidade, "preliminar")
})

test("rascunho não altera valores financeiros elegíveis", () => {
  const baseline = aggregateIndicadores(makeInput())
  const withDraft = aggregateIndicadores(makeInput({
    fechamentos: [
      makeClosing(),
      makeClosing({
        id: "fechamento-rascunho",
        status: "rascunho",
        analiseCompleta: makeAnalysis({
          totals: {
            total_receitas: 999_999,
            total_comissoes: 999_999,
            total_despesas: 999_999,
            total_a_repassar: 999_999,
          },
        }),
      }),
    ],
  }))

  assert.deepEqual(withDraft.resumo, baseline.resumo)
})

test("mantém despesas retidas separadas da despesa operacional detalhada", () => {
  const result = aggregateIndicadores(makeInput())

  assert.equal(result.resumo.receitaTotal, 2_000)
  assert.equal(result.resumo.aluguelContratado, 1_000)
  assert.equal(result.resumo.aluguelRecebido, 900)
  assert.equal(result.resumo.comissaoAdministracao, 100)
  assert.equal(result.resumo.comissaoIntermediacao, 50)
  assert.equal(result.resumo.despesasRetidas, 200)
  assert.deepEqual(result.resumo.despesaOperacionalDetalhada, {
    agua: 50,
    iptu: 50,
    seguro: 25,
    total: 125,
  })
  assert.equal(result.resumo.repasseApurado, 1_650)
  assert.deepEqual(result.ponteFinanceira, {
    receitaTotal: 2_000,
    comissaoAdministracao: 100,
    despesasRetidas: 200,
    comissaoIntermediacao: 50,
    repasseApurado: 1_650,
    residuo: 0,
    tolerancia: 0.01,
    reconciliada: true,
    alerta: false,
  })
})

test("preserva ausência legada de prestação como null, nunca como zero", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: { ...makeAnalysis(), prestacao: null },
    })],
  }))

  assert.equal(result.resumo.comissaoIntermediacao, null)
  assert.equal(result.resumo.inadimplenciaAcumulada, null)
  assert.equal(result.ponteFinanceira.reconciliada, null)
})

test("reconcilia aluguel contratado, vacância, inadimplência, descontos e ajustes", () => {
  const properties = [
    makeProperty({ id: "imovel-ocupado", unidade: "101", aluguelEsperadoAtual: 1_000 }),
    makeProperty({ id: "imovel-vago", unidade: "102", aluguelEsperadoAtual: 500 }),
    makeProperty({ id: "imovel-inadimplente", unidade: "103", aluguelEsperadoAtual: 600 }),
  ]
  const snapshots = [
    makeSnapshot({
      imovelId: "imovel-ocupado",
      statusOcupacao: "ocupado",
      aluguelEsperado: 1_000,
      aluguelRecebido: 900,
      desconto: 50,
    }),
    makeSnapshot({
      imovelId: "imovel-vago",
      statusOcupacao: "vago",
      aluguelEsperado: 500,
      aluguelRecebido: 0,
      desconto: 0,
    }),
    makeSnapshot({
      imovelId: "imovel-inadimplente",
      statusOcupacao: "inadimplente",
      aluguelEsperado: 600,
      aluguelRecebido: 100,
      desconto: 0,
    }),
  ]

  const result = aggregateIndicadores(makeInput({ imoveisAtivos: properties, snapshots }))

  assert.deepEqual(result.realizacaoAluguel, {
    contratado: 2_100,
    vacancia: 500,
    inadimplenciaMes: 500,
    descontos: 50,
    outrosAjustes: -50,
    outrosAjustesPercentualContratado: -50 / 2_100 * 100,
    recebido: 1_000,
  })
})

test("preserva repasse comprovado ausente, zero confirmado e sinal comprovado menos apurado", () => {
  const unknown = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({ totals: { valor_comprovado: null } }),
    })],
  }))
  const confirmedZero = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: {
          total_receitas: 0,
          total_comissoes: 0,
          total_despesas: 0,
          total_a_repassar: 0,
          valor_comprovado: 0,
          total_agua: 0,
          total_iptu: 0,
          total_seguro_incendio: 0,
        },
        intermediacoes: [],
      }),
    })],
  }))
  const signed = aggregateIndicadores(makeInput())

  assert.equal(unknown.resumo.repasseComprovado, null)
  assert.equal(confirmedZero.resumo.repasseComprovado, 0)
  assert.equal(signed.resumo.diferencaRepasse, -50)
})

test("separa repasse informado no extrato de comprovante bancário", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: { repasse_embutido: true, valor_comprovado: 1_650 },
      }),
    })],
  }))

  assert.equal(result.resumo.repasseComprovado, null)
  assert.equal(result.resumo.repasseInformadoExtrato, 1_650)
  assert.equal(result.resumo.diferencaRepasse, null)
})

test("mantém a diferença do comprovante externo quando também há repasse informado no extrato", () => {
  const externalPair = {
    ...makePair("externo"),
    imobiliariaNome: "Imobiliária Externa",
    empreendimentoNome: "Residencial Externo",
  }
  const statementPair = {
    ...makePair("extrato"),
    imobiliariaNome: "Imobiliária Extrato",
    empreendimentoNome: "Residencial Extrato",
  }
  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [makeRule(externalPair), makeRule(statementPair)],
    imoveisAtivos: [],
    snapshots: [],
    fechamentos: [
      makeClosing({
        ...externalPair,
        id: "fechamento-externo",
        analiseCompleta: makeAnalysis({
          totals: { total_a_repassar: 1_000, valor_comprovado: 700 },
        }),
      }),
      makeClosing({
        ...statementPair,
        id: "fechamento-extrato",
        analiseCompleta: makeAnalysis({
          totals: {
            total_a_repassar: 300,
            valor_comprovado: 300,
            repasse_embutido: true,
          },
        }),
      }),
    ],
  }))

  assert.equal(result.resumo.repasseApurado, 1_300)
  assert.equal(result.resumo.repasseComprovado, 700)
  assert.equal(result.resumo.repasseInformadoExtrato, 300)
  assert.equal(result.resumo.diferencaRepasse, -600)
})

test("calcula diferença com a soma dos comprovantes externos conhecidos", () => {
  const knownPair = makePair("comprovado")
  const unknownPair = makePair("sem-comprovante")
  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [makeRule(knownPair), makeRule(unknownPair)],
    imoveisAtivos: [],
    snapshots: [],
    fechamentos: [
      makeClosing({
        ...knownPair,
        id: "fechamento-comprovado",
        analiseCompleta: makeAnalysis({
          totals: { total_a_repassar: 1_000, valor_comprovado: 700 },
        }),
      }),
      makeClosing({
        ...unknownPair,
        id: "fechamento-sem-comprovante",
        analiseCompleta: makeAnalysis({
          totals: { total_a_repassar: 300, valor_comprovado: null },
        }),
      }),
    ],
  }))

  assert.equal(result.resumo.repasseComprovado, 700)
  assert.equal(result.resumo.diferencaRepasse, -600)
})

test("não usa receita total como fallback de aluguel recebido", () => {
  const absent = aggregateIndicadores(makeInput({
    snapshots: [makeSnapshot({ aluguelRecebido: null, receitaTotal: 999 })],
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        receitas: [{
          apto: "101",
          inquilino: "Maria",
          aluguel: null,
          aluguel_com_desconto: null,
          desconto: null,
          total: 999,
        }],
      }),
    })],
  }))
  const rentFallbackMaterialized = aggregateIndicadores(makeInput({
    snapshots: [makeSnapshot({ aluguelRecebido: 500, receitaTotal: 999 })],
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        receitas: [{
          apto: "101",
          inquilino: "Maria",
          aluguel: 500,
          aluguel_com_desconto: null,
          desconto: null,
          total: 999,
        }],
      }),
    })],
  }))

  assert.equal(absent.resumo.aluguelRecebido, null)
  assert.equal(rentFallbackMaterialized.resumo.aluguelRecebido, 500)
})

test("reconcilia a ponte com tolerância inclusiva de R$ 0,01", () => {
  const atTolerance = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: { total_a_repassar: 1_649.99, valor_comprovado: null },
      }),
    })],
  }))
  const aboveTolerance = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: { total_a_repassar: 1_649.98, valor_comprovado: null },
      }),
    })],
  }))

  assert.equal(atTolerance.ponteFinanceira.residuo, 0.01)
  assert.equal(atTolerance.ponteFinanceira.reconciliada, true)
  assert.equal(aboveTolerance.ponteFinanceira.residuo, 0.02)
  assert.equal(aboveTolerance.ponteFinanceira.reconciliada, false)
  assert.equal(aboveTolerance.ponteFinanceira.alerta, true)
})

test("pondera ocupação pelos denominadores e exclui desconhecidos", () => {
  const pairB = makePair("b")
  const properties = [
    makeProperty({ id: "a-ocupado", unidade: "A1" }),
    makeProperty({ ...pairB, id: "b-ocupado", unidade: "B1" }),
    ...Array.from({ length: 9 }, (_, index) => makeProperty({
      ...pairB,
      id: `b-vago-${index}`,
      unidade: `BV${index}`,
      statusAtual: "vago",
    })),
    ...Array.from({ length: 5 }, (_, index) => makeProperty({
      ...pairB,
      id: `b-desconhecido-${index}`,
      unidade: `BD${index}`,
      statusAtual: "desconhecido",
    })),
  ]
  const snapshots = properties.map((property) => makeSnapshot({
    imovelId: property.id,
    fechamentoId: property.empreendimentoId === PAIR_A.empreendimentoId ? "fechamento-a" : "fechamento-b",
    statusOcupacao: property.id.includes("vago")
      ? "vago"
      : property.id.includes("desconhecido")
        ? "desconhecido"
        : "ocupado",
  }))

  const result = aggregateIndicadores(makeInput({
    regrasAtivas: [makeRule(), makeRule(pairB)],
    imoveisAtivos: properties,
    fechamentos: [
      makeClosing(),
      makeClosing({ ...pairB, id: "fechamento-b" }),
    ],
    snapshots,
  }))

  assert.equal(result.resumo.ocupacaoCompetencia.numerador, 2)
  assert.equal(result.resumo.ocupacaoCompetencia.denominador, 11)
  assert.equal(result.resumo.ocupacaoCompetencia.desconhecidos, 5)
  const percentual = result.resumo.ocupacaoCompetencia.percentual
  const coberturaPercentual = result.resumo.ocupacaoCompetencia.coberturaPercentual
  assert.ok(percentual !== null && Math.abs(percentual - (2 / 11) * 100) < 0.0001)
  assert.ok(
    coberturaPercentual !== null &&
      Math.abs(coberturaPercentual - (11 / 16) * 100) < 0.0001,
  )
})

test("encerra série e heatmap na competência selecionada", () => {
  const months = ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]
  const closings = months.map((competencia, index) => makeClosing({
    id: `fechamento-${index}`,
    competencia,
    analiseCompleta: makeAnalysis({ totals: { total_receitas: (index + 1) * 100 } }),
  }))
  const snapshots = months.map((competencia, index) => makeSnapshot({
    fechamentoId: `fechamento-${index}`,
    competencia,
  }))

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  assert.deepEqual(
    result.serieMensal.map((point) => point.competencia),
    ["2026-03-01", "2026-04-01", "2026-05-01"],
  )
  assert.deepEqual(
    result.heat.meses.map((month) => month.competencia),
    ["2026-03-01", "2026-04-01", "2026-05-01"],
  )
})

test("marca a série mensal como preliminar quando há linha sem vínculo", () => {
  const result = aggregateIndicadores(makeInput({
    linhasNaoVinculadas: [{ fechamentoId: "fechamento-a", quantidade: 1 }],
  }))

  assert.equal(result.serieMensal[0].qualidade, "preliminar")
})

test("não exibe no heatmap snapshot ligado a fechamento inelegível", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [
      makeClosing(),
      makeClosing({
        id: "fechamento-rascunho-abril",
        competencia: "2026-04-01",
        status: "rascunho",
      }),
    ],
    snapshots: [
      makeSnapshot(),
      makeSnapshot({
        fechamentoId: "fechamento-rascunho-abril",
        competencia: "2026-04-01",
        aluguelRecebido: 999_999,
      }),
    ],
  }))

  assert.deepEqual(
    result.heat.meses.map((month) => month.competencia),
    ["2026-05-01"],
  )
})

test("ordena atenção pelo maior gap de aluguel em reais", () => {
  const properties = [
    makeProperty({ id: "imovel-gap-100", unidade: "101", aluguelEsperadoAtual: 1_000 }),
    makeProperty({ id: "imovel-gap-500", unidade: "102", aluguelEsperadoAtual: 500 }),
  ]
  const snapshots = [
    makeSnapshot({ imovelId: "imovel-gap-100", aluguelEsperado: 1_000, aluguelRecebido: 900 }),
    makeSnapshot({ imovelId: "imovel-gap-500", aluguelEsperado: 500, aluguelRecebido: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({ imoveisAtivos: properties, snapshots }))

  assert.equal(result.rankingAtencao[0].imovelId, "imovel-gap-500")
  assert.equal(result.rankingAtencao[0].gapValor, 500)
  assert.equal(result.rankingAtencao[1].gapValor, 100)
})

test("não inclui imóvel sem gap ou risco explícito no ranking de atenção", () => {
  const result = aggregateIndicadores(makeInput({
    snapshots: [makeSnapshot({ aluguelEsperado: 1_000, aluguelRecebido: 1_000 })],
  }))

  assert.deepEqual(result.rankingAtencao, [])
})

test("não usa o inquilino atual como fallback para a competência histórica", () => {
  const result = aggregateIndicadores(makeInput({
    imoveisAtivos: [makeProperty({ inquilinoNome: "Inquilino de hoje" })],
    snapshots: [makeSnapshot()],
  }))

  assert.equal(result.rankingAtencao[0].inquilinoNome, null)
  assert.equal(result.receitasPorImovel[0].inquilinoNome, null)
})

test("filtro por imóvel recalcula dados atribuíveis e anula campos do fechamento", () => {
  const properties = [
    makeProperty({ id: "imovel-a", unidade: "101" }),
    makeProperty({ id: "imovel-b", unidade: "102", inquilinoNome: "João", aluguelEsperadoAtual: 800 }),
  ]
  const snapshots = [
    makeSnapshot(),
    makeSnapshot({
      imovelId: "imovel-b",
      aluguelEsperado: 800,
      aluguelRecebido: 700,
      receitaTotal: 750,
      desconto: 100,
      comissaoAdministracao: 70,
      repasseApurado: 680,
    }),
  ]

  const result = aggregateIndicadores(makeInput({
    filtros: { empresaId: null, empreendimentoId: null, imovelId: "imovel-b" },
    imoveisAtivos: properties,
    snapshots,
  }))

  assert.equal(result.resumo.receitaTotal, 750)
  assert.equal(result.resumo.aluguelContratado, 800)
  assert.equal(result.resumo.aluguelRecebido, 700)
  assert.equal(result.resumo.comissaoAdministracao, 70)
  assert.equal(result.resumo.repasseApurado, 680)
  assert.equal(result.resumo.comissaoIntermediacao, null)
  assert.equal(result.resumo.despesasRetidas, null)
  assert.equal(result.resumo.despesaOperacionalDetalhada.total, null)
  assert.equal(result.resumo.repasseComprovado, null)
  assert.equal(result.ponteFinanceira.residuo, null)
  assert.equal(result.receitasPorImovel.length, 1)
  assert.equal(result.receitasPorImovel[0].imovelId, "imovel-b")
  assert.ok(result.cobertura.lacunas.some((gap) => gap.codigo === "nao_atribuivel_ao_imovel"))
})
