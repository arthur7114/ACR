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
  empreendimentoAliases?: string[]
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
  imovel_id?: string | null
  competencia_original?: string | null
}

interface PrestacaoFixture {
  receitas_por_imovel: RevenueLineFixture[]
  acordos_rescisoes_recebidos: Array<{
    tipo: "intermediacao" | "acordo" | "rescisao" | "atraso" | "outro"
    comissao: number | null
    apto?: string | null
    inquilino?: string | null
    valor?: number | null
    garagem?: number | null
    ajuste?: number | null
    total_recebido?: number | null
    repasse?: number | null
    confianca?: number
    competencia_original?: string | null
  }>
  inadimplencias_acumuladas: Array<{ valor: number }>
  outras_comissoes_despesas?: Array<{ descricao: string; valor: number }>
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
    entradas_passagem?: number | null
    saidas_passagem?: number | null
    total_tarifas?: number | null
    repasse_declarado?: number | null
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
  inquilinoNome?: string | null
  aluguelEsperado: number | null
  cobrancaEsperada?: number | null
  garagemRecebida?: number | null
  aluguelRecebido: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  origem: "processamento" | "backfill"
  qualidade: "completo" | "parcial" | "sem_linha"
  modeloReceita?: "fixo" | "variavel" | "nao_aplicavel"
  aluguelRecebidoCompetencia?: number | null
  atrasosRecuperados?: number | null
  outrosRecebimentos?: number | null
  entradasPassagem?: number | null
  saidasPassagem?: number | null
}

interface AggregationFixture {
  calculoVersao: string
  competencia: string
  atualizadoEm: string
  vigenciasDisponiveis?: boolean
  filtros: {
    empresaId: string | null
    empreendimentoId: string | null
    imovelId: string | null
  }
  regrasAtivas: RuleFixture[]
  imoveisAtivos: PropertyFixture[]
  vigencias?: Array<PairFixture & {
    id: string
    imovelId: string
    vigenciaInicio: string
    vigenciaFim: string | null
    modeloReceita: "fixo" | "variavel" | "nao_aplicavel"
    aluguelContratado: number | null
    fonte: string
    ativo: boolean
  }>
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
  outrasDespesas?: PrestacaoFixture["outras_comissoes_despesas"]
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
        { tipo: "intermediacao", inquilino: "Novo Locatario", valor: 250, comissao: 50, confianca: 0.9 },
      ],
      inadimplencias_acumuladas: overrides.inadimplencias ?? [],
      outras_comissoes_despesas: overrides.outrasDespesas,
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

test("forma o universo esperado somente pela carteira de imóveis, sem inflar por regras", () => {
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

  assert.equal(result.cobertura.fechamentos.esperados, 2)
  assert.equal(result.cobertura.fechamentos.ausentes, 2)
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
  assert.equal(result.ponteFinanceira.receitasEconomicas, 2_000)
  assert.equal(result.ponteFinanceira.entradasPassagem, 0)
  assert.equal(result.ponteFinanceira.comissoes, 150)
  assert.equal(result.ponteFinanceira.despesas, 200)
  assert.equal(result.ponteFinanceira.tarifas, 0)
  assert.equal(result.ponteFinanceira.saidasPassagem, 0)
  assert.equal(result.ponteFinanceira.repasseCalculado, 1_650)
  assert.equal(result.ponteFinanceira.repasseDeclarado, 1_650)
  assert.equal(result.ponteFinanceira.diferencaNaoExplicada, 0)
  assert.equal(result.ponteFinanceira.reconciliada, true)
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
    vacanciaFinanceira: 500,
    inadimplenciaMes: 500,
    inadimplenciaFinanceira: 500,
    descontos: 50,
    ajustesClassificados: 0,
    valoresSemClassificacao: -50,
    recebidoCompetencia: 1_000,
    atrasosRecuperados: null,
    alugueisRecebidosMes: 1_000,
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

  assert.equal(result.resumo.repasseCalculado, 3_300)
  assert.equal(result.resumo.repasseDeclarado, 1_300)
  assert.equal(result.resumo.repasseComprovado, 700)
  assert.equal(result.resumo.repasseInformadoExtrato, 300)
  assert.equal(result.resumo.repasseCalculadoComprovado, 1_650)
  assert.equal(result.resumo.diferencaRepasse, -950)
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
  assert.equal(result.resumo.repasseCalculadoComprovado, 1_650)
  assert.equal(result.resumo.diferencaRepasse, -950)
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
  assert.equal(result.heat.linhas[0].celulas[0].inquilinoNome, null)
})

test("preserva o inquilino de cada competência nas células do histórico", () => {
  const result = aggregateIndicadores(makeInput({
    competencia: "2026-06-01",
    imoveisAtivos: [makeProperty({ inquilinoNome: "Inquilino de hoje" })],
    snapshots: [
      makeSnapshot({ competencia: "2026-05-01", inquilinoNome: "Maria em maio" }),
      makeSnapshot({ competencia: "2026-06-01", inquilinoNome: "João em junho" }),
    ],
  }))

  assert.deepEqual(
    result.heat.linhas[0].celulas.map((cell) => cell.inquilinoNome),
    ["Maria em maio", "João em junho"],
  )
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
  assert.equal(result.resumo.repasseDeclarado, 680)
  assert.equal(result.resumo.repasseCalculado, null)
  assert.equal(result.resumo.comissaoIntermediacao, null)
  assert.equal(result.resumo.despesasRetidas, null)
  assert.equal(result.resumo.despesaOperacionalDetalhada.total, null)
  assert.equal(result.resumo.repasseComprovado, null)
  assert.equal(result.ponteFinanceira.residuo, null)
  assert.equal(result.receitasPorImovel.length, 1)
  assert.equal(result.receitasPorImovel[0].imovelId, "imovel-b")
  assert.ok(result.cobertura.lacunas.some((gap) => gap.codigo === "nao_atribuivel_ao_imovel"))
})

// --- Reatribuicao por competencia original (caso Joao Cordeiro maio/2026) ---

test("serie mensal atribui linha recebida em maio a competencia original de marco", () => {
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 1_000 },
        receitas: [
          { apto: "101", inquilino: "Maria", aluguel: 1_000, aluguel_com_desconto: 1_000, desconto: 0, total: 1_000 },
        ],
      }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 2_095.91 },
        receitas: [
          // Linha do mes corrente: competencia igual nao gera ajuste.
          { apto: "101", inquilino: "Maria", aluguel: 1_213.27, aluguel_com_desconto: 1_100, desconto: 113.27, total: 1_213.27, competencia_original: "2026-05" },
          // Aluguel de marco quitado em maio.
          { apto: "102", inquilino: "Joao", aluguel: 882.64, aluguel_com_desconto: 788.22, desconto: 94.42, total: 882.64, competencia_original: "2026-03" },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ fechamentoId: "fechamento-marco", competencia: "2026-03-01", aluguelRecebido: 1_000 }),
    makeSnapshot({ fechamentoId: "fechamento-maio", competencia: "2026-05-01", aluguelRecebido: 1_888.22 }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  const marco = result.serieMensal.find((point) => point.competencia === "2026-03-01")!
  const maio = result.serieMensal.find((point) => point.competencia === "2026-05-01")!
  assert.equal(marco.receitaTotal, 1_882.64)
  assert.equal(marco.aluguelRecebido, 1_788.22)
  assert.equal(marco.competenciaAjusteReceita, 882.64)
  assert.equal(marco.competenciaAjusteAluguel, 788.22)
  assert.equal(maio.receitaTotal, 1_213.27)
  assert.equal(maio.aluguelRecebido, 1_100)
  assert.equal(maio.competenciaAjusteReceita, -882.64)
  assert.equal(maio.competenciaAjusteAluguel, -788.22)
  // O caixa do mes (repasse) e o resumo da competencia corrente nao mudam.
  assert.equal(maio.repasseApurado, 1_650)
  assert.equal(result.resumo.receitaTotal, 2_095.91)
})

test("atraso pago em maio move receita para marco sem inventar aluguel recebido", () => {
  // Caso Terreno Castelao: aluguel de marco quitado em maio via inadimplencia
  // paga (acordos tipo atraso); a linha corrente de maio esta zerada.
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 100 },
        receitas: [
          { apto: "101", inquilino: "Ricardo", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 0 },
        ],
      }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 1_824.71 },
        receitas: [
          { apto: "101", inquilino: "Ricardo", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 0 },
        ],
        intermediacoes: [
          { tipo: "atraso", comissao: 127.73, apto: "101", valor: 1_717.36, competencia_original: "03/2026", confianca: 0.95 },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ fechamentoId: "fechamento-marco", competencia: "2026-03-01", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelRecebido: 0, receitaTotal: 0 }),
    makeSnapshot({ fechamentoId: "fechamento-maio", competencia: "2026-05-01", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelRecebido: 0, receitaTotal: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  const marco = result.serieMensal.find((point) => point.competencia === "2026-03-01")!
  const maio = result.serieMensal.find((point) => point.competencia === "2026-05-01")!
  assert.equal(marco.receitaTotal, 1_817.36)
  assert.equal(maio.receitaTotal, 107.35)
  // Atraso nunca compos o aluguel recebido de nenhum mes: metrica intacta.
  assert.equal(marco.aluguelRecebido, 0)
  assert.equal(maio.aluguelRecebido, 0)
  assert.equal(marco.competenciaAjusteAluguel, 0)
  assert.equal(marco.competenciaAjusteReceita, 1_717.36)
  assert.equal(maio.competenciaAjusteReceita, -1_717.36)
})

test("atraso com competencia original fora da janela nao inventa mes na serie", () => {
  // Caso real: atraso de 04/2025 quitado em 05/2026. A competencia original fica
  // fora do historico exibivel (sem fechamento/snapshot). A serie nao deve criar
  // um mes-fantasma 2025-04 nem vazar o valor: ele permanece no mes do recebimento.
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 100 },
        receitas: [
          { apto: "101", inquilino: "Ricardo", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 100 },
        ],
      }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 776.97 },
        receitas: [
          { apto: "101", inquilino: "Ricardo", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 0 },
        ],
        intermediacoes: [
          { tipo: "atraso", comissao: 0, apto: "101", valor: 776.97, competencia_original: "04/2025", confianca: 0.95 },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ fechamentoId: "fechamento-marco", competencia: "2026-03-01", aluguelRecebido: 100, receitaTotal: 100 }),
    makeSnapshot({ fechamentoId: "fechamento-maio", competencia: "2026-05-01", aluguelRecebido: 0, receitaTotal: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  // Nenhum mes fora do historico com lastro (fechamento/snapshot).
  assert.equal(result.serieMensal.find((point) => point.competencia === "2025-04-01"), undefined)
  // O valor nao vaza: permanece no mes do recebimento, sem realocacao.
  const maio = result.serieMensal.find((point) => point.competencia === "2026-05-01")!
  assert.equal(maio.competenciaAjusteReceita, 0)
  assert.equal(maio.receitaTotal, 776.97)
})

test("filtro por imovel reatribui apenas linhas do imovel e ignora acordos", () => {
  const propertyA = makeProperty({ id: "imovel-a", unidade: "101" })
  const propertyB = makeProperty({ id: "imovel-b", unidade: "102" })
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({ totals: { total_receitas: 500 }, receitas: [] }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 2_000 },
        receitas: [
          { apto: "101", inquilino: "Maria", aluguel: 900, aluguel_com_desconto: 900, desconto: 0, total: 900, imovel_id: "imovel-a", competencia_original: "2026-03" },
          { apto: "102", inquilino: "Joao", aluguel: 800, aluguel_com_desconto: 800, desconto: 0, total: 800, imovel_id: "imovel-b", competencia_original: "2026-03" },
        ],
        intermediacoes: [
          { tipo: "atraso", comissao: 10, apto: "103", valor: 300, competencia_original: "2026-03", confianca: 0.95 },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ imovelId: "imovel-a", fechamentoId: "fechamento-marco", competencia: "2026-03-01", aluguelRecebido: 0, receitaTotal: 0 }),
    makeSnapshot({ imovelId: "imovel-a", fechamentoId: "fechamento-maio", competencia: "2026-05-01", aluguelRecebido: 900, receitaTotal: 900 }),
  ]

  const result = aggregateIndicadores(makeInput({
    imoveisAtivos: [propertyA, propertyB],
    fechamentos: closings,
    snapshots,
    filtros: { empresaId: null, empreendimentoId: null, imovelId: "imovel-a" },
  }))

  const marco = result.serieMensal.find((point) => point.competencia === "2026-03-01")!
  const maio = result.serieMensal.find((point) => point.competencia === "2026-05-01")!
  // So a linha do imovel filtrado se move; a linha do imovel-b e o acordo nao.
  assert.equal(marco.competenciaAjusteReceita, 900)
  assert.equal(maio.competenciaAjusteReceita, -900)
  assert.equal(marco.receitaTotal, 900)
  assert.equal(maio.receitaTotal, 0)
})

test("deriva cobertura da vigência histórica e ignora regra sem imóvel na carteira", () => {
  const historicalProperty = makeProperty({
    id: "fernando-ap0361",
    unidade: "AP0361",
    ativo: false,
    aluguelEsperadoAtual: null,
  })
  const ghostPair = makePair("regra-fantasma")
  const competence = "2026-03-01"
  const result = aggregateIndicadores(makeInput({
    competencia: competence,
    regrasAtivas: [makeRule(PAIR_A), makeRule(ghostPair)],
    imoveisAtivos: [historicalProperty],
    vigencias: [{
      ...PAIR_A,
      id: "vigencia-fernando",
      imovelId: historicalProperty.id,
      vigenciaInicio: "2026-01-01",
      vigenciaFim: "2026-03-01",
      modeloReceita: "fixo",
      aluguelContratado: null,
      fonte: "Fechamento documental",
      ativo: true,
    }],
    fechamentos: [makeClosing({ competencia: competence })],
    snapshots: [makeSnapshot({
      imovelId: historicalProperty.id,
      competencia: competence,
      aluguelEsperado: null,
    })],
  }))

  assert.equal(result.cobertura.fechamentos.esperados, 1)
  assert.equal(result.cobertura.contratos.ausentes, 1)
  assert.ok(result.cobertura.lacunas.some((gap) => gap.codigo === "contrato_ausente"))
})

test("contrato variável é não aplicável e não vira zero nem contrato ausente", () => {
  const result = aggregateIndicadores(makeInput({
    vigencias: [{
      ...PAIR_A,
      id: "vigencia-airbnb",
      imovelId: "imovel-a",
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
      modeloReceita: "variavel",
      aluguelContratado: null,
      fonte: "Contrato de hospedagem",
      ativo: true,
    }],
    snapshots: [makeSnapshot({
      aluguelEsperado: null,
      modeloReceita: "variavel",
      statusOcupacao: "inadimplente",
    })],
  }))

  assert.equal(result.cobertura.contratos.conhecidos, 0)
  assert.equal(result.cobertura.contratos.naoAplicaveis, 1)
  assert.equal(result.cobertura.contratos.ausentes, 0)
  assert.equal(result.resumo.aluguelContratado, null)
  assert.ok(!result.cobertura.lacunas.some((gap) => gap.codigo === "aluguel_esperado_ausente"))
  assert.equal(result.rankingAtencao[0]?.modeloReceita, "variavel")
})

test("não estima aluguel contratado quando a fonte histórica está indisponível", () => {
  const result = aggregateIndicadores(makeInput({
    calculoVersao: "indicadores-confiabilidade-v2",
    vigenciasDisponiveis: false,
    snapshots: [makeSnapshot({
      aluguelEsperado: 1_000,
      aluguelRecebido: 900,
      statusOcupacao: "inadimplente",
    })],
  }))

  assert.equal(result.cobertura.contratos.conhecidos, 0)
  assert.equal(result.cobertura.contratos.ausentes, 1)
  assert.equal(result.resumo.aluguelContratado, null)
  assert.equal(result.realizacaoAluguel.contratado, null)
  assert.equal(result.realizacaoAluguel.vacancia, null)
  assert.equal(result.realizacaoAluguel.inadimplenciaMes, null)
  assert.equal(result.realizacaoAluguel.valoresSemClassificacao, null)
  assert.equal(result.rankingAtencao[0]?.esperado, null)
  assert.equal(result.rankingAtencao[0]?.gapValor, null)
})

test("usa a vigência histórica no lugar do valor legado do snapshot", () => {
  const result = aggregateIndicadores(makeInput({
    calculoVersao: "indicadores-confiabilidade-v2",
    vigenciasDisponiveis: true,
    vigencias: [{
      ...PAIR_A,
      id: "vigencia-contratual",
      imovelId: "imovel-a",
      vigenciaInicio: "2026-01-01",
      vigenciaFim: null,
      modeloReceita: "fixo",
      aluguelContratado: 1_250,
      fonte: "Contrato histórico",
      ativo: true,
    }],
    snapshots: [makeSnapshot({ aluguelEsperado: 999 })],
  }))

  assert.equal(result.resumo.aluguelContratado, 1_250)
  assert.equal(result.realizacaoAluguel.contratado, 1_250)
  assert.equal(result.rankingAtencao[0]?.esperado, 1_250)
})

test("expõe os quatro estados de confiança sem promover declaração embutida a comprovante", () => {
  const confirmed = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({ totals: { valor_comprovado: 1_650 } }),
    })],
  }))
  const inReview = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({ totals: { valor_comprovado: null } }),
    })],
  }))
  const incomplete = aggregateIndicadores(makeInput({
    snapshots: [],
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({ totals: { valor_comprovado: 1_650 } }),
    })],
  }))
  const divergent = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: { total_a_repassar: 1_649.98, valor_comprovado: 1_650 },
      }),
    })],
  }))
  const embedded = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: { repasse_embutido: true, valor_comprovado: 1_650 },
      }),
    })],
  }))

  assert.equal(confirmed.meta.statusConfianca, "confirmado")
  assert.equal(inReview.meta.statusConfianca, "em_conferencia")
  assert.equal(incomplete.meta.statusConfianca, "incompleto")
  assert.equal(divergent.meta.statusConfianca, "com_divergencia")
  assert.equal(embedded.meta.statusConfianca, "em_conferencia")
  assert.equal(embedded.cobertura.comprovantes.presentes, 0)
})

test("ponte v2 separa movimentos de passagem e tarifas", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: {
          total_receitas: 1_000,
          entradas_passagem: 100,
          total_comissoes: 80,
          total_despesas: 50,
          total_tarifas: 10,
          saidas_passagem: 100,
          total_a_repassar: 840,
          repasse_declarado: 840,
          valor_comprovado: 840,
        },
        intermediacoes: [{ tipo: "intermediacao", inquilino: "Novo Locatario", valor: 100, comissao: 20, confianca: 0.9 }],
      }),
    })],
  }))

  assert.equal(result.resumo.receitasEconomicas, 1_000)
  assert.equal(result.resumo.entradasPassagem, 100)
  assert.equal(result.resumo.despesasRetidas, 50)
  assert.equal(result.resumo.tarifas, 10)
  assert.equal(result.resumo.saidasPassagem, 100)
  assert.equal(result.resumo.repasseCalculado, 840)
  assert.equal(result.ponteFinanceira.diferencaNaoExplicada, 0)
})

test("separa tarifa derivada apenas nos fechamentos legados que a incluíam em despesas", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({
        totals: {
          total_receitas: 1_000,
          total_comissoes: 80,
          total_despesas: 60,
          total_a_repassar: 840,
          repasse_declarado: 840,
          valor_comprovado: 840,
        },
        intermediacoes: [{ tipo: "intermediacao", inquilino: "Novo Locatario", valor: 100, comissao: 20, confianca: 0.9 }],
        outrasDespesas: [{ descricao: "Tarifa TED", valor: 10 }],
      }),
    })],
  }))

  assert.equal(result.resumo.despesasRetidas, 50)
  assert.equal(result.resumo.tarifas, 10)
  assert.equal(result.resumo.repasseCalculado, 840)
  assert.equal(result.ponteFinanceira.diferencaNaoExplicada, 0)
})

test("separa aluguel da competência, atrasos recuperados e outros recebimentos", () => {
  const result = aggregateIndicadores(makeInput({
    snapshots: [makeSnapshot({
      aluguelRecebido: 1_607.37,
      aluguelRecebidoCompetencia: 900,
      atrasosRecuperados: 707.37,
      outrosRecebimentos: 75,
    })],
  }))

  assert.equal(result.resumo.aluguelRecebidoCompetencia, 900)
  assert.equal(result.resumo.atrasosRecuperados, 707.37)
  assert.equal(result.resumo.outrosRecebimentos, 75)
  assert.equal(result.realizacaoAluguel.alugueisRecebidosMes, 1_607.37)
  assert.equal(result.serieMensal.at(-1)?.aluguelRecebido, 900)
})

test("preserva null explícito do aluguel da competência sem usar atrasos como fallback", () => {
  const result = aggregateIndicadores(makeInput({
    snapshots: [makeSnapshot({
      aluguelRecebido: 707.37,
      aluguelRecebidoCompetencia: null,
      atrasosRecuperados: 707.37,
      statusOcupacao: "inadimplente",
      aluguelEsperado: 705.89,
      desconto: 0,
    })],
  }))

  assert.equal(result.resumo.aluguelRecebidoCompetencia, null)
  assert.equal(result.resumo.atrasosRecuperados, 707.37)
  assert.equal(result.realizacaoAluguel.recebidoCompetencia, null)
  assert.equal(result.realizacaoAluguel.inadimplenciaMes, 705.89)
  assert.equal(result.receitasPorImovel[0]?.aluguelRecebidoCompetencia, null)
})

test("classifica a diferença de imóvel em rescisão sem absorver lacunas desconhecidas", () => {
  const properties = [
    makeProperty({ id: "rescisao", unidade: "101", aluguelEsperadoAtual: 1_000 }),
    makeProperty({ id: "desconhecido", unidade: "102", aluguelEsperadoAtual: 500 }),
  ]
  const result = aggregateIndicadores(makeInput({
    imoveisAtivos: properties,
    snapshots: [
      makeSnapshot({
        imovelId: "rescisao",
        statusOcupacao: "em_rescisao",
        aluguelEsperado: 1_000,
        aluguelRecebido: 200,
        aluguelRecebidoCompetencia: 200,
        desconto: 50,
      }),
      makeSnapshot({
        imovelId: "desconhecido",
        statusOcupacao: "desconhecido",
        aluguelEsperado: 500,
        aluguelRecebido: null,
        aluguelRecebidoCompetencia: null,
        desconto: 0,
      }),
    ],
  }))

  assert.equal(result.realizacaoAluguel.ajustesClassificados, -750)
  assert.equal(result.realizacaoAluguel.valoresSemClassificacao, -500)
})

test("valor de aluguel sem classificação acima de um centavo bloqueia confirmação", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [makeClosing({
      analiseCompleta: makeAnalysis({ totals: { valor_comprovado: 1_650 } }),
    })],
    snapshots: [makeSnapshot({
      aluguelEsperado: 1_000,
      aluguelRecebido: 899.98,
      aluguelRecebidoCompetencia: 899.98,
      desconto: 100,
    })],
  }))

  assert.equal(result.realizacaoAluguel.valoresSemClassificacao, -0.02)
  assert.equal(result.meta.statusConfianca, "com_divergencia")
})

test("imóvel de receita variável ocupado vira categoria alugado por app", () => {
  const result = aggregateIndicadores(
    makeInput({
      snapshots: [makeSnapshot({ statusOcupacao: "ocupado", modeloReceita: "variavel" })],
    }),
  )

  // Categoria própria, separada de "ocupado", contando como ocupado no numerador.
  assert.equal(result.resumo.ocupacaoCompetencia.alugadosApp, 1)
  assert.equal(result.resumo.ocupacaoCompetencia.ocupados, 0)
  assert.equal(result.resumo.ocupacaoCompetencia.numerador, 1)
  assert.equal(result.resumo.ocupacaoCompetencia.percentual, 100)
  // Na tabela por imóvel o status de exibição também é a categoria de app.
  assert.equal(result.receitasPorImovel[0]?.statusOcupacao, "alugado_app")
})

test("receita fixa ocupada permanece ocupado, não vira alugado por app", () => {
  const result = aggregateIndicadores(
    makeInput({
      snapshots: [makeSnapshot({ statusOcupacao: "ocupado", modeloReceita: "fixo" })],
    }),
  )

  assert.equal(result.resumo.ocupacaoCompetencia.ocupados, 1)
  assert.equal(result.resumo.ocupacaoCompetencia.alugadosApp, 0)
})

test("realocacao de atraso usa o total recebido resolvido, nao o principal bruto", () => {
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 0 },
        receitas: [
          { apto: "101", inquilino: "Devedor", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 0 },
        ],
        intermediacoes: [],
      }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 466.93 },
        receitas: [
          { apto: "101", inquilino: "Devedor", aluguel: null, aluguel_com_desconto: null, desconto: null, total: 0 },
        ],
        intermediacoes: [
          {
            tipo: "atraso",
            apto: "101",
            inquilino: "Devedor",
            valor: 414.86,
            garagem: 52.07,
            total_recebido: 466.93,
            comissao: 32.69,
            repasse: 434.24,
            competencia_original: "03/2026",
            confianca: 0.95,
          },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ fechamentoId: "fechamento-marco", competencia: "2026-03-01", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelRecebido: 0, receitaTotal: 0 }),
    makeSnapshot({ fechamentoId: "fechamento-maio", competencia: "2026-05-01", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelRecebido: 0, receitaTotal: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  const marco = result.serieMensal.find((point) => point.competencia === "2026-03-01")!
  assert.equal(marco.competenciaAjusteReceita, 466.93)
})

test("atraso pendente (baixa confianca) nao realoca receita entre meses", () => {
  const closings = [
    makeClosing({
      id: "fechamento-marco",
      competencia: "2026-03-01",
      analiseCompleta: makeAnalysis({ totals: { total_receitas: 0 }, receitas: [], intermediacoes: [] }),
    }),
    makeClosing({
      id: "fechamento-maio",
      competencia: "2026-05-01",
      analiseCompleta: makeAnalysis({
        totals: { total_receitas: 100 },
        receitas: [],
        intermediacoes: [
          { tipo: "atraso", apto: "101", inquilino: "Devedor", valor: 999, comissao: null, competencia_original: "03/2026", confianca: 0.4 },
        ],
      }),
    }),
  ]
  const snapshots = [
    makeSnapshot({ fechamentoId: "fechamento-marco", competencia: "2026-03-01", aluguelRecebido: 0, receitaTotal: 0 }),
    makeSnapshot({ fechamentoId: "fechamento-maio", competencia: "2026-05-01", aluguelRecebido: 0, receitaTotal: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings, snapshots }))

  const marco = result.serieMensal.find((point) => point.competencia === "2026-03-01")!
  assert.equal(marco.competenciaAjusteReceita, 0)
})

test("vacancia financeira usa a cobranca esperada e reconcilia com todas as vagas", () => {
  const snapshots = [
    makeSnapshot({ imovelId: "imovel-a", statusOcupacao: "vago", statusOrigem: "prestacao_sem_inquilino", aluguelEsperado: 414.86, cobrancaEsperada: 466.93, aluguelRecebido: 0, receitaTotal: 0, desconto: 0, comissaoAdministracao: 0, repasseApurado: 0 }),
    makeSnapshot({ imovelId: "imovel-b", statusOcupacao: "vago", statusOrigem: "prestacao_sem_inquilino", aluguelEsperado: 400, aluguelRecebido: 0, receitaTotal: 0, desconto: 0, comissaoAdministracao: 0, repasseApurado: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({
    imoveisAtivos: [
      makeProperty({ id: "imovel-a", unidade: "201", statusAtual: "vago" }),
      makeProperty({ id: "imovel-b", unidade: "214", statusAtual: "vago" }),
    ],
    fechamentos: [makeClosing()],
    snapshots,
  }))

  // CA-IND23: cada vaga com vigência aplicável contribui com sua cobrança
  // esperada; sem garagem contratada, a cobrança é o próprio aluguel.
  assert.equal(result.realizacaoAluguel.vacanciaFinanceira, 866.93)
  // A vacância da realização permanece na base do aluguel (equação do contratado).
  assert.equal(result.realizacaoAluguel.vacancia, 814.86)
})

test("fechamentos elegiveis que resolvem para a mesma entidade canonica falham fechado", () => {
  const closings = [
    makeClosing({ id: "f1", empreendimentoNome: "Grand Castelão I" }),
    makeClosing({
      id: "f2",
      empreendimentoId: "empreendimento-b",
      empreendimentoNome: "Grand Castelao I Etapa Única",
      empreendimentoAliases: ["Grand Castelão I"],
    }),
  ]

  const result = aggregateIndicadores(makeInput({ fechamentos: closings }))

  const gap = result.cobertura.lacunas.find((lacuna) => lacuna.codigo === "duplicidade_semantica")
  assert.equal(gap?.quantidade, 1)
  assert.match(gap?.detalhes.join(" ") ?? "", /Grand Castelão I/)
  // Nenhum dos dois soma: falhar fechado em vez de duplicar valores.
  assert.equal(result.cobertura.fechamentos.processados, 0)
})

test("empreendimentos distintos sem colisao de nome ou alias nao geram duplicidade", () => {
  const result = aggregateIndicadores(makeInput({
    fechamentos: [
      makeClosing({ id: "f1", empreendimentoNome: "Grand Castelão I" }),
      makeClosing({ id: "f2", empreendimentoId: "empreendimento-b", empreendimentoNome: "Grand Messejana II" }),
    ],
  }))

  assert.equal(result.cobertura.lacunas.some((lacuna) => lacuna.codigo === "duplicidade_semantica"), false)
})

test("inadimplencia financeira usa cobranca esperada quando as bases sao compativeis", () => {
  const snapshots = [
    // Nada recebido: o gap é a cobrança esperada inteira.
    makeSnapshot({ imovelId: "imovel-a", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelEsperado: 414.86, cobrancaEsperada: 466.93, aluguelRecebido: 0, aluguelRecebidoCompetencia: 0, receitaTotal: 0, desconto: 0, comissaoAdministracao: 0, repasseApurado: 0 }),
    // Recebimento parcial com garagem recebida conhecida: cobrança − aluguel − garagem.
    makeSnapshot({ imovelId: "imovel-b", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelEsperado: 400, cobrancaEsperada: 450, garagemRecebida: 50, aluguelRecebido: 200, aluguelRecebidoCompetencia: 200, receitaTotal: 250, desconto: 0, comissaoAdministracao: 0, repasseApurado: 0 }),
    // Recebimento parcial SEM garagem recebida persistida: bases incompatíveis,
    // cai no gap por aluguel (não inventa componente).
    makeSnapshot({ imovelId: "imovel-c", statusOcupacao: "inadimplente", statusOrigem: "inadimplencia_explicita", aluguelEsperado: 300, cobrancaEsperada: 330, aluguelRecebido: 100, aluguelRecebidoCompetencia: 100, receitaTotal: 100, desconto: 0, comissaoAdministracao: 0, repasseApurado: 0 }),
  ]

  const result = aggregateIndicadores(makeInput({
    imoveisAtivos: [
      makeProperty({ id: "imovel-a", unidade: "204" }),
      makeProperty({ id: "imovel-b", unidade: "205" }),
      makeProperty({ id: "imovel-c", unidade: "206" }),
    ],
    snapshots,
  }))

  // 466.93 + (450 − 200 − 50) + (300 − 100) = 866.93
  assert.equal(result.realizacaoAluguel.inadimplenciaFinanceira, 866.93)
})
