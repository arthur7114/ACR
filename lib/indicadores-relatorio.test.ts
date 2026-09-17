import assert from "node:assert/strict"
import test from "node:test"
import { montarRelatorioIndicadores } from "./indicadores-relatorio.ts"
import type { IndicadoresData } from "./indicadores-types.ts"

// Fixture minima: so o que o relatorio le. Numeros de jul/2026 da carteira,
// os mesmos do teste de identidades, para o PDF e a tela contarem a mesma coisa.
function dados(overrides: Record<string, unknown> = {}): IndicadoresData {
  const ocupacao = {
    ocupados: 82, alugadosApp: 13, inadimplentes: 7, emRescisao: 0, vagos: 15, desconhecidos: 1,
    numerador: 102, denominador: 117, percentual: 87.18, coberturaPercentual: 99.1,
  }
  const base = {
    meta: {
      competencia: "2026-07-01",
      competenciaLabel: "jul/2026",
      atualizadoEm: "2026-09-01T12:00:00.000Z",
      statusConfianca: "confirmado",
      motivosConfianca: [],
    },
    cobertura: {
      fechamentos: { esperados: 4, processados: 4, aprovados: 4, pendentes: 0, rascunhos: 0, emAtualizacao: 0, ausentes: 0, percentual: 100 },
      contratos: { conhecidos: 117, naoAplicaveis: 0, ausentes: 0 },
      comprovantes: { esperados: 4, presentes: 4, ausentes: 0, percentual: 100, detalhesAusentes: [] },
      lacunas: [],
    },
    resumo: {
      receitasEconomicas: 85273.78,
      aluguelRecebidoCompetencia: 67484.3,
      repasseCalculado: 72737.55,
      repasseApurado: 72737.55,
      repasseConfirmadoBanco: 72737.55,
      repasseCalculadoComprovado: 72737.55,
      aluguelContratado: 89120.05,
      comissaoAdministracao: 5315.79,
      comissaoIntermediacao: 1335,
      despesasRetidas: 5874.34,
      tarifas: 11.1,
      inadimplenciaAcumulada: 12000,
      ocupacaoCompetencia: ocupacao,
      ocupacaoAcumulada: null,
      taxas: { administracao: { contrato: 8, efetivo: 7.9 }, intermediacao: { contrato: null, efetivo: null } },
      acordosRescisoes: {
        acordos: { quantidade: 2, valor: 1500 },
        rescisoes: { quantidade: 1, valor: 800 },
        intermediacoes: { quantidade: 3, valor: 4200, comissao: 1335 },
        atrasos: { quantidade: 4, valor: 466.93 },
        semOrigem: { quantidade: 0, valor: 0 },
      },
      receitaLocacao: { aluguel: 67484.3, vagas: null, vagasCobertura: { conhecidas: 117, total: 117 } },
      despesaOperacionalDetalhada: { agua: 1827.9, iptu: null, seguro: 320, total: 2147.9, reembolsado: { agua: 1203.31, iptu: null, seguro: null } },
    },
    ponteFinanceira: {
      receitasEconomicas: 85273.78, entradasPassagem: 342.04, comissoes: 6650.79, despesas: 5874.34, tarifas: 11.1,
      saidasPassagem: 342.04, repasseCalculado: 72737.55, repasseDeclarado: 72737.54, diferencaNaoExplicada: 0.01,
      reconciliada: true, alerta: false,
    },
    realizacaoAluguel: {
      contratado: 89120.05, vacancia: 11460.2, inadimplenciaMes: 6210.19, descontos: 20, ajustesClassificados: 0,
      cobradoComoIntermediacao: null, mesProporcionalContratoNovo: null,
      ocupadoSemRecebimento: 2031.98, ocupadoRecebimentoParcial: 2314.49, recebidoEmVago: 401.11, restoNaoExplicado: 0,
      recebidoCompetencia: 67484.3, atrasosRecuperados: 466.93, alugueisRecebidosMes: 67951.23,
    },
    serieMensal: [
      { competencia: "2026-06-01", label: "jun/2026", aluguelContratado: 88000, aluguelRecebido: 70000, receitaTotal: 84000, repasseApurado: 71000, ocupacaoPercentual: 88, inadimplenciaPercentual: 5 },
      { competencia: "2026-07-01", label: "jul/2026", aluguelContratado: 89120.05, aluguelRecebido: 67484.3, receitaTotal: 85273.78, repasseApurado: 72737.55, ocupacaoPercentual: 87.18, inadimplenciaPercentual: 6.97 },
    ],
    rankingAtencao: [
      { imovelId: "i-7", unidade: "Apto 7", inquilinoNome: "Luana", empreendimentoId: "gm2", empreendimentoNome: "GM II", esperado: 700, modeloReceita: "fixo", recebido: null, gapValor: 700, statusOcupacao: "inadimplente" },
    ],
    receitasPorImovel: [
      {
        imovelId: "i-17", unidade: "Apto 17", inquilinoNome: "Maria", empreendimentoId: "gm2", empreendimentoNome: "GM II", statusOcupacao: "ocupado",
        aluguelEsperado: 655.96, modeloReceita: "fixo", aluguelRecebidoCompetencia: 655.96, atrasosRecuperados: null, outrosRecebimentos: null,
        receitaTotal: 730.66, desconto: null, comissaoAdministracao: 52.48, repasseApurado: 678.18,
        reajuste: { de: 628.06, para: 655.96, percentual: 4.44, inquilinoMudou: false },
      },
      {
        imovelId: "i-9", unidade: "Apto 9", inquilinoNome: null, empreendimentoId: "gm2", empreendimentoNome: "GM II", statusOcupacao: "vago",
        aluguelEsperado: 700, modeloReceita: "fixo", aluguelRecebidoCompetencia: null, atrasosRecuperados: null, outrosRecebimentos: null,
        receitaTotal: null, desconto: null, comissaoAdministracao: null, repasseApurado: null, reajuste: null,
      },
    ],
    filtros: {
      selecionados: { empresaId: null, empreendimentoId: null, imovelId: null },
      competencias: [], empresas: [{ value: "e1", label: "ACR Empreendimentos" }],
      empreendimentos: [{ value: "gm2", label: "Guilherme Moreira II" }], imoveis: [{ value: "i-17", label: "GM II · Apto 17" }],
    },
  }
  return { ...base, ...overrides } as unknown as IndicadoresData
}

const AGORA = new Date("2026-09-17T15:30:00-03:00")

test("KPIs espelham a visao geral: resultado, inadimplencia, ocupacao e comissoes", () => {
  const r = montarRelatorioIndicadores(dados(), AGORA)
  const kpi = (rotulo: string) => r.kpis.find((k) => k.rotulo === rotulo)
  assert.equal(r.competenciaLabel, "jul/2026")
  assert.match(kpi("Resultado do mês")!.valor, /72\.737,55/)
  assert.match(kpi("Inadimplência do mês")!.valor, /6\.210,19/)
  assert.equal(kpi("Inadimplência do mês")!.nota, "7 de 117 imóveis")
  assert.match(kpi("Ocupação")!.valor, /87,2/)
  assert.match(kpi("Comissões")!.valor, /6\.650,79/)
  assert.match(kpi("Comissões")!.nota!, /adm\. R\$\s5\.315,79 \(7,9%\)/)
  assert.equal(kpi("Rentabilidade")!.valor, "—")
})

test("cascatas repetem as linhas da aba Receita e marcam a diferenca", () => {
  const r = montarRelatorioIndicadores(dados(), AGORA)
  const linha = (t: typeof r.receitasAoRepasse, nome: string) => t.linhas.find((l) => l.celulas[1] === nome)!
  assert.equal(r.receitasAoRepasse.subtitulo, "Fecha")
  assert.match(linha(r.receitasAoRepasse, "Repasse calculado").celulas[2], /72\.737,55/)
  assert.equal(linha(r.receitasAoRepasse, "Diferença").tom, "positivo")
  assert.match(r.contratoAoRecebido.subtitulo!, /22\.016,86 fora do previsto/)
  assert.match(linha(r.contratoAoRecebido, "Recebido no mês").celulas[2], /67\.951,23/)
  assert.equal(linha(r.contratoAoRecebido, "Sem explicação").tom, "positivo")
})

test("desconhecido vira travessao, nunca zero", () => {
  const r = montarRelatorioIndicadores(dados(), AGORA)
  const iptu = r.despesaDetalhada.linhas.find((l) => l.celulas[0] === "IPTU")!
  assert.deepEqual(iptu.celulas, ["IPTU", "—", "—"])
  const vago = r.detalhamento.linhas[1]
  assert.equal(vago.celulas[1], "—")
  assert.equal(vago.celulas[5], "—")
  assert.equal(vago.tom, "alerta")
})

test("detalhamento mostra o reajuste da unidade e a ocupacao so com situacoes presentes", () => {
  const r = montarRelatorioIndicadores(dados(), AGORA)
  assert.equal(r.detalhamento.linhas[0].celulas[4], "▲ 4,4%")
  assert.deepEqual(
    r.ocupacao.map((o) => o.rotulo),
    ["Ocupado", "Alugado por app", "Inadimplente", "Vago", "Desconhecido"],
  )
  assert.equal(r.evolucaoMensal.linhas[1].destaque, true)
  assert.equal(r.evolucaoMensal.linhas[0].destaque, false)
  assert.equal(r.atencao!.linhas[0].tom, "perigo")
})

test("escopo e nome do arquivo seguem os filtros selecionados", () => {
  const carteira = montarRelatorioIndicadores(dados(), AGORA)
  assert.deepEqual(carteira.escopo, ["Todas as empresas", "Todos os empreendimentos"])
  assert.equal(carteira.nomeArquivo, "indicadores-2026-07-carteira.pdf")

  const gm2 = montarRelatorioIndicadores(
    dados({
      filtros: {
        selecionados: { empresaId: "e1", empreendimentoId: "gm2", imovelId: null },
        competencias: [], empresas: [{ value: "e1", label: "ACR Empreendimentos" }],
        empreendimentos: [{ value: "gm2", label: "Guilherme Moreira II" }], imoveis: [],
      },
    }),
    AGORA,
  )
  assert.deepEqual(gm2.escopo, ["ACR Empreendimentos", "Guilherme Moreira II"])
  assert.equal(gm2.nomeArquivo, "indicadores-2026-07-guilherme-moreira-ii.pdf")
  assert.match(gm2.geradoEm, /17\/09\/2026/)
})
