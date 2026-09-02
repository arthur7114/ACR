import assert from "node:assert/strict"
import test from "node:test"
import {
  IDENTIDADES_INDICADORES,
  decomporResiduoRealizacao,
  verificarIdentidades,
} from "./indicadores-identidades.ts"
import type { IndicadoresData, IndicadoresPropertyRevenue } from "./indicadores-types.ts"

// Fixture com os números reais de jul/2026 (consolidado), que fecham todas as
// identidades. Cada teste muta um campo e verifica que a violação aparece.
function dados(overrides: Partial<IndicadoresData> = {}): IndicadoresData {
  const base = {
    meta: { competencia: "2026-07-01" },
    resumo: {
      receitasEconomicas: 85273.78,
      receitaTotal: 85273.78,
      aluguelRecebidoCompetencia: 67484.3,
      atrasosRecuperados: 466.93,
      aluguelRecebido: 67951.23,
      repasseCalculado: 72737.55,
      repasseApurado: 72737.55,
      ocupacaoCompetencia: {
        ocupados: 82,
        alugadosApp: 13,
        inadimplentes: 7,
        emRescisao: 0,
        vagos: 15,
        desconhecidos: 1,
        numerador: 102,
        denominador: 117,
        percentual: 87.18,
      },
    },
    ponteFinanceira: {
      receitasEconomicas: 85273.78,
      entradasPassagem: 342.04,
      comissoes: 6650.79,
      comissaoAdministracao: 5315.79,
      comissaoIntermediacao: 1335,
      despesas: 5874.34,
      tarifas: 11.1,
      saidasPassagem: 342.04,
      repasseCalculado: 72737.55,
      repasseDeclarado: 72737.54,
      diferencaNaoExplicada: 0.01,
    },
    realizacaoAluguel: {
      contratado: 89120.05,
      vacancia: 11460.2,
      inadimplenciaMes: 6210.19,
      descontos: 20,
      ajustesClassificados: 0,
      valoresSemClassificacao: -3945.36,
      recebidoCompetencia: 67484.3,
      recebido: 67484.3,
      outrosAjustes: -3945.36,
      atrasosRecuperados: 466.93,
      alugueisRecebidosMes: 67951.23,
    },
    serieMensal: [
      {
        competencia: "2026-07-01",
        receitaTotal: 85273.78,
        aluguelContratado: 89120.05,
        aluguelRecebido: 67484.3,
        vacancia: 11460.2,
        inadimplencia: 6210.19,
        descontos: 20,
        outrosAjustes: -3945.36,
      },
    ],
    receitasPorImovel: [],
  }
  return { ...base, ...overrides } as unknown as IndicadoresData
}

// Linha de `receitasPorImovel`: só os campos que a decomposição lê variam; o
// resto existe para satisfazer o tipo.
function linha(over: {
  imovelId: string
  competencia: string
  unidade: string
  empreendimentoNome: string
  statusOcupacao: string
  aluguelEsperado: number | null
  aluguelRecebidoCompetencia: number | null
  outrosRecebimentos: number | null
  desconto: number | null
}): IndicadoresPropertyRevenue {
  return {
    inquilinoNome: null,
    empreendimentoId: "emp",
    modeloReceita: "fixo",
    aluguelRecebido: over.aluguelRecebidoCompetencia,
    atrasosRecuperados: 0,
    receitaTotal: null,
    comissaoAdministracao: null,
    repasseApurado: null,
    vencimentoReferencia: null,
    competenciaAluguel: null,
    competenciaRecebimento: null,
    vencimentoDia: null,
    origem: "processamento",
    qualidade: "completo",
    ...over,
  } as unknown as IndicadoresPropertyRevenue
}

test("os numeros reais de julho fecham todas as identidades", () => {
  assert.deepEqual(verificarIdentidades(dados()), [])
})

test("cada identidade declarada tem id unico", () => {
  const ids = IDENTIDADES_INDICADORES.map((identidade) => identidade.id)
  assert.equal(new Set(ids).size, ids.length)
})

test("repasse calculado fora da ponte e acusado com a diferenca exata", () => {
  const falhas = verificarIdentidades(
    dados({ ponteFinanceira: { ...dados().ponteFinanceira, repasseCalculado: 72000 } }),
  )
  const ponte = falhas.find((falha) => falha.id === "ponte_repasse_calculado")
  assert.ok(ponte)
  assert.equal(ponte?.diferenca, 737.55)
  assert.equal(ponte?.motivo, "valor_divergente")
})

test("comissoes que deixam de agregar a intermediacao sao acusadas", () => {
  // A armadilha da auditoria: `comissoes` (adm + intermediação) e
  // `comissaoAdministracao` (só adm) diferem em R$ 1.335,00 em jul/26 e isso é
  // correto. O que NÃO pode é `comissoes` deixar de somar os dois.
  assert.deepEqual(verificarIdentidades(dados()), [], "o fixture real não pode acusar nada")

  const falhas = verificarIdentidades(
    dados({ ponteFinanceira: { ...dados().ponteFinanceira, comissoes: 5315.79 } }),
  )
  assert.ok(falhas.some((falha) => falha.id === "ponte_comissoes_agregam_intermediacao"))
})

test("denominador da ocupacao exclui desconhecidos, nao os soma", () => {
  // 82 + 13 + 7 + 0 + 15 = 117, com 1 desconhecido de fora. Somar o
  // desconhecido daria 118 e acusaria uma divergência que não existe.
  assert.deepEqual(
    verificarIdentidades(dados()).filter((falha) => falha.id === "ocupacao_denominador"),
    [],
  )

  const comDenominadorErrado = dados()
  comDenominadorErrado.resumo.ocupacaoCompetencia.denominador = 118
  assert.ok(
    verificarIdentidades(comDenominadorErrado).some((falha) => falha.id === "ocupacao_denominador"),
  )
})

test("resumo com atrasos e serie sem atrasos convivem sem acusar", () => {
  // `resumo.aluguelRecebido` = 67.951,23 (com atrasos) e
  // `serie.aluguelRecebido` = 67.484,30 (só a competência) diferem em R$ 466,93
  // de propósito. As duas identidades medem pares distintos.
  assert.deepEqual(
    verificarIdentidades(dados()).filter(
      (falha) => falha.id === "resumo_aluguel_recebido" || falha.id === "serie_recebido_da_competencia",
    ),
    [],
  )
})

test("campo v1 que para de espelhar o v2 e acusado", () => {
  const falhas = verificarIdentidades(
    dados({ realizacaoAluguel: { ...dados().realizacaoAluguel, outrosAjustes: 0 } }),
  )
  assert.equal(falhas.find((falha) => falha.id === "v1_outros_ajustes")?.diferenca, 3945.36)
})

test("lado ausente e acusado como tal, nao como diferenca", () => {
  const falhas = verificarIdentidades(dados({ resumo: { ...dados().resumo, receitaTotal: null } }))
  const v1 = falhas.find((falha) => falha.id === "v1_receita_total")
  assert.equal(v1?.motivo, "lado_ausente")
  assert.equal(v1?.diferenca, null)
})

test("serie sem ponto para a competencia nao e divergencia", () => {
  // Escopo sem histórico não tem o que comparar; ausência de caso não é falha.
  assert.deepEqual(
    verificarIdentidades(dados({ serieMensal: [] })).filter((falha) => falha.id.startsWith("serie_")),
    [],
  )
})

test("decomposicao do residuo explica o valor inteiro e ordena pela maior parcela", () => {
  // Unidades reais de jul/26: intermediação com recebido zero (o dinheiro está
  // em `outrosRecebimentos`), rescisão proporcional que terminou vaga, e uma
  // unidade que fecha certinho.
  const contribuicoes = decomporResiduoRealizacao(
    dados({
      receitasPorImovel: [
        linha({
          imovelId: "a",
          competencia: "2026-07-01",
          unidade: "SALA 01",
          empreendimentoNome: "LOCMAIS",
          statusOcupacao: "ocupado",
          aluguelEsperado: 700,
          aluguelRecebidoCompetencia: 0,
          outrosRecebimentos: 828.19,
          desconto: null,
        }),
        linha({
          imovelId: "b",
          competencia: "2026-07-01",
          unidade: "26",
          empreendimentoNome: "Grand Messejana II",
          statusOcupacao: "vago",
          aluguelEsperado: 660,
          aluguelRecebidoCompetencia: 212.9,
          outrosRecebimentos: 1342.3,
          desconto: null,
        }),
        linha({
          imovelId: "c",
          competencia: "2026-07-01",
          unidade: "2",
          empreendimentoNome: "Grand Castelão I",
          statusOcupacao: "ocupado",
          aluguelEsperado: 690,
          aluguelRecebidoCompetencia: 690,
          outrosRecebimentos: 77.19,
          desconto: null,
        }),
        linha({
          imovelId: "d",
          competencia: "2026-06-01",
          unidade: "outra competência",
          empreendimentoNome: "LOCMAIS",
          statusOcupacao: "ocupado",
          aluguelEsperado: 500,
          aluguelRecebidoCompetencia: 0,
          outrosRecebimentos: null,
          desconto: null,
        }),
      ],
    }),
  )

  // A unidade que fecha e a de outra competência ficam de fora.
  assert.equal(contribuicoes.length, 2)
  assert.equal(contribuicoes[0]?.unidade, "SALA 01")
  assert.equal(contribuicoes[0]?.contribuicao, -700)
  assert.equal(contribuicoes[1]?.unidade, "26")
  assert.equal(contribuicoes[1]?.contribuicao, 212.9)
})

test("unidade inadimplente devolve o gap a inadimplencia e nao entra no residuo", () => {
  const contribuicoes = decomporResiduoRealizacao(
    dados({
      receitasPorImovel: [
        linha({
          imovelId: "a",
          competencia: "2026-07-01",
          unidade: "10",
          empreendimentoNome: "LOCMAIS",
          statusOcupacao: "inadimplente",
          aluguelEsperado: 700,
          aluguelRecebidoCompetencia: 0,
          outrosRecebimentos: null,
          desconto: null,
        }),
      ],
    }),
  )

  assert.deepEqual(contribuicoes, [])
})
