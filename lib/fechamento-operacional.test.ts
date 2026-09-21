import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoAnalysis } from "./prestacao-types.ts"
import {
  calcularAluguelRecebidoMedio,
  calcularResumoComissaoFechamento,
  calcularIptuRecebidoExibicao,
  calcularResumoReceitasAdicionais,
  desdobrarDespesasFechamento,
  unidadeDaDescricao,
} from "./fechamento-operacional.ts"

test("Pompilio: mostra os dois IPTUs de passagem como recebido sem alterar o total contabil", () => {
  const prestacao = {
    receitas_por_imovel: [
      { iptu: 0, observacao: "IPTU de passagem (R$ 193.02) anulado: cobrado e repassado." },
      { iptu: 0, observacao: "IPTU de passagem (R$ 149.02) anulado: cobrado e repassado." },
    ],
  } as PrestacaoAnalysis

  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 342.04)
  assert.equal(calcularIptuRecebidoExibicao(prestacao, 100), 442.04)
})

test("Pompilio: reconhece observacoes legadas sem duplicar credito e debito", () => {
  const prestacao = {
    empreendimento: "Galpão Pompilio Gomes",
    receitas_por_imovel: [
      { observacao: "IPTU creditado R$ 193,02; debitado à prefeitura R$ 193,02." },
      { observacao: "IPTU R$ 149,02 repassado à prefeitura. Parcela 3/11." },
    ],
  } as PrestacaoAnalysis

  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 342.04)
})

test("IPTU legado ignora aluguel e comissao citados depois do valor", () => {
  const prestacao = {
    empreendimento: "Galpão Pompilio Gomes",
    receitas_por_imovel: [{ observacao: "IPTU creditado 193,02; debitado 193,02; aluguel 3.000,00; comissão 120,00" }],
  } as PrestacaoAnalysis

  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 193.02)
})

test("Pompilio: reconhece o valor legado mesmo quando a observacao traz apenas IPTU", () => {
  const prestacao = {
    empreendimento: "Galpão Pompilio Gomes",
    receitas_por_imovel: [
      { observacao: "IPTU R$ 193,02" },
      { observacao: "IPTU 149,02" },
    ],
  } as PrestacaoAnalysis

  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 342.04)
})

test("nao trata parcela ou referencia de IPTU sem repasse como valor recebido", () => {
  const prestacao = {
    receitas_por_imovel: [{ observacao: "IPTU ref. 05/2026, parcela 3/11." }],
  } as PrestacaoAnalysis

  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 0)
})

test("Pompilio: nao confunde aluguel posterior com valor de IPTU", () => {
  const prestacao = {
    empreendimento: "Galpão Pompilio Gomes",
    receitas_por_imovel: [{ observacao: "IPTU ref. 05/2026, parcela 3/11; aluguel 3.000,00" }],
  } as PrestacaoAnalysis
  assert.equal(calcularIptuRecebidoExibicao(prestacao, 0), 0)
})

test("GM II maio: discrimina comissao regular e de acordos sem alterar o total", () => {
  const prestacao = {
    receitas_por_imovel: [{ comissao: 1218.45 }],
    acordos_rescisoes_recebidos: [{ tipo: "atraso", comissao: 65.52 }],
    resumo_financeiro: { comissao_administracao: 1283.97 },
  } as PrestacaoAnalysis

  assert.deepEqual(calcularResumoComissaoFechamento(prestacao), {
    regular: 1218.45,
    acordos: 65.52,
    total: 1283.97,
  })
})

test("separa acordos, rescisoes e inadimplencia paga no breakdown da receita", () => {
  const prestacao = {
    acordos_rescisoes_recebidos: [
      { tipo: "acordo", inquilino: "A", valor: 300, confianca: 0.9 },
      { tipo: "rescisao", inquilino: "B", valor: 935.98, confianca: 0.9 },
      { tipo: "atraso", inquilino: "C", valor: 707.37, confianca: 0.9 },
      { tipo: "outro", inquilino: "D", valor: 50, confianca: 0.9 },
      { tipo: "intermediacao", inquilino: "E", valor: 900, confianca: 0.9 },
    ],
  } as PrestacaoAnalysis

  assert.deepEqual(calcularResumoReceitasAdicionais(prestacao), {
    acordos: 300,
    rescisoes: 935.98,
    inadimplenciasPagas: 707.37,
    // Antes a intermediacao era descartada aqui e o total ia a 1.993,35 — o que
    // fazia a decomposicao da tela nao fechar com o recebido. Linha propria.
    intermediacao: 900,
    outros: 50,
    total: 2893.35,
  })
})

test("breakdown usa o total recebido resolvido, nao o principal bruto", () => {
  const prestacao = {
    acordos_rescisoes_recebidos: [
      {
        tipo: "rescisao",
        inquilino: "EX-LOCATÁRIO",
        valor: 1890,
        total_recebido: 1663.56,
        comissao: 116.45,
        repasse: 1547.11,
        confianca: 0.9,
      },
    ],
  } as PrestacaoAnalysis

  assert.equal(calcularResumoReceitasAdicionais(prestacao).rescisoes, 1663.56)
})

test("item pendente (sem vinculo ou confianca) fica fora do breakdown confirmado", () => {
  const prestacao = {
    acordos_rescisoes_recebidos: [
      { tipo: "acordo", inquilino: "A", valor: 300, confianca: 0.9 },
      { tipo: "acordo", apto: null, inquilino: null, valor: 999, confianca: 0.9 },
      { tipo: "rescisao", inquilino: "B", valor: 100, confianca: 0.4 },
    ],
  } as PrestacaoAnalysis

  const resumo = calcularResumoReceitasAdicionais(prestacao)
  assert.equal(resumo.acordos, 300)
  assert.equal(resumo.rescisoes, 0)
  assert.equal(resumo.total, 300)
})

test("desdobra despesas em categorias auditaveis e preserva descricao, referencia e valor", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 735.62,
    resumoItens: [
      { descricao: "ENEL unidade 101 ref. 05/2026", valor: 300, confianca: 1 },
      { descricao: "CAGECE unidade 102", valor: 100, confianca: 1 },
      { descricao: "IPTU 2026 GALPÃO 02 (5/7)", valor: 91.39, confianca: 1 },
      { descricao: "SEGURO SALA 03", valor: 200, confianca: 1 },
      { descricao: "Tarifa PIX", valor: 20, confianca: 1 },
      { descricao: "Estorno de pagamento duplicado", valor: 24.23, confianca: 1 },
    ],
  })

  assert.deepEqual(
    result.map((group) => [group.categoria, group.total]),
    [
      ["energia", 300],
      ["agua_esgoto", 100],
      ["iptu", 91.39],
      ["seguro", 200],
      ["tarifas", 20],
      ["ajustes", 24.23],
    ],
  )
  assert.equal(result[0].itens[0].descricao, "ENEL unidade 101 ref. 05/2026")
  assert.equal(result[0].itens[0].referencia, "05/2026")
  assert.equal(result[0].itens[0].valor, 300)
})

test("explicita como outros a parcela do total que nao possui item discriminado", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 120,
    resumoItens: [{ descricao: "ENEL", valor: 100, confianca: 1 }],
  })

  const outros = result.find((group) => group.categoria === "outros")
  assert.equal(outros?.total, 20)
  assert.equal(outros?.itens[0].descricao, "Valor ainda não discriminado no documento")
})

test("mantem o breakdown quando o documento informa somente o total de despesas", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 275.4,
  })

  assert.deepEqual(result, [
    {
      categoria: "outros",
      label: "Outros",
      total: 275.4,
      itens: [
        {
          descricao: "Valor ainda não discriminado no documento",
          referencia: null,
          valor: 275.4,
        },
      ],
    },
  ])
})

test("usa o documento de despesas quando ele define o total do fechamento", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 400,
    resumoItens: [{ descricao: "Outras despesas", valor: 400, confianca: 1 }],
    despesas: [
      {
        tipo: "energia",
        fornecedor: "ENEL",
        valor: 250,
        vencimento: null,
        referencia: "05/2026",
        observacao: "Conta de energia da unidade 101",
        endereco: null,
        unidade_consumidora: null,
        pago_em: null,
        pago_por: null,
        confianca: 1,
      },
      {
        tipo: "agua",
        fornecedor: "CAGECE",
        valor: 150,
        vencimento: null,
        referencia: "05/2026",
        observacao: "Conta de água da unidade 102",
        endereco: null,
        unidade_consumidora: null,
        pago_em: null,
        pago_por: null,
        confianca: 1,
      },
    ],
  })

  assert.deepEqual(
    result.map((group) => [group.categoria, group.total]),
    [
      ["energia", 250],
      ["agua_esgoto", 150],
    ],
  )
})

test("aluguel recebido medio divide pelas unidades com cobranca ativa, nao so pelas que pagaram", () => {
  // Joao Cordeiro julho: Apart. A pagou 1.237,05, Apart. B nao pagou nada.
  // Dividir por 1 exibia 1.237,05 e escondia metade da carteira sem receber.
  const resultado = calcularAluguelRecebidoMedio([
    { aluguel: 1237.05 },
    { aluguel: null },
  ])

  assert.equal(resultado.unidades, 2)
  assert.equal(resultado.valor, 618.53)
  assert.equal(resultado.recebido, 1237.05)
})

test("aluguel recebido medio expoe a formula que o cliente reproduz: aluguel das alugadas / alugadas", () => {
  // GM II jul/26: 22 pagantes (12.811,93), 1 inadimplente (0) e 1 intermediacao (0)
  // sao 24 alugadas. O tile imprime "R$ 12.811,93 ÷ 24 alugadas".
  const pagantes = Array.from({ length: 21 }, () => ({ aluguel: 600 }))
  const resultado = calcularAluguelRecebidoMedio([...pagantes, { aluguel: 211.93 }, { aluguel: 0 }, { aluguel: null }])
  assert.equal(resultado.unidades, 24)
  assert.equal(resultado.recebido, 12811.93)
  assert.equal(resultado.valor, 533.83)
})

test("aluguel recebido medio e nulo sem unidade com cobranca ativa", () => {
  assert.equal(calcularAluguelRecebidoMedio([]).valor, null)
})

test("aluguel recebido medio trata aluguel zero como recebimento zero", () => {
  const resultado = calcularAluguelRecebidoMedio([{ aluguel: 600 }, { aluguel: 0 }, { aluguel: 300 }])
  assert.equal(resultado.unidades, 3)
  assert.equal(resultado.valor, 300)
})

test("desdobramento usa o tipo estruturado do documento, nao o texto da observacao", () => {
  // GM II julho: o documento traz tipo="energia" e tipo="seguro" em cada item,
  // mas a observacao e um texto de nota fiscal/boleto que nao cita a categoria.
  // Classificar pelo texto jogava a segunda ENEL e os 8 seguros em "Outros".
  const despesa = (tipo: "energia" | "agua" | "seguro" | "outro", valor: number, observacao: string) => ({
    tipo,
    fornecedor: "FORNECEDOR",
    valor,
    vencimento: null,
    referencia: null,
    observacao,
    endereco: null,
    unidade_consumidora: null,
    pago_em: null,
    pago_por: null,
    confianca: 1,
  })

  const result = desdobrarDespesasFechamento({
    totalDespesas: 490.41,
    despesas: [
      despesa("energia", 104.75, "Nota fiscal nº 225045233. Comprovante Pix."),
      despesa("energia", 106.43, "Nota fiscal nº 220723216. Comprovante de pagamento."),
      despesa("seguro", 139.83, "Boleto com Nosso Numero 175/43497383-1."),
      despesa("agua", 139.4, "Nota fiscal numero 1959588."),
    ],
  })

  const porCategoria = new Map(result.map((grupo) => [grupo.categoria, grupo.total]))
  assert.equal(porCategoria.get("energia"), 211.18)
  assert.equal(porCategoria.get("seguro"), 139.83)
  assert.equal(porCategoria.get("agua_esgoto"), 139.4)
  assert.equal(porCategoria.get("outros"), undefined)
})

test("sem tipo estruturado, o desdobramento continua classificando pelo texto", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 300,
    resumoItens: [
      { descricao: "ENEL unidade 101", valor: 200, confianca: 1 },
      { descricao: "SEGURO APTO 02", valor: 100, confianca: 1 },
    ],
  })
  const porCategoria = new Map(result.map((grupo) => [grupo.categoria, grupo.total]))
  assert.equal(porCategoria.get("energia"), 200)
  assert.equal(porCategoria.get("seguro"), 100)
})

// Canário GM II ago/2026 (ponto #9 do feedback de 2026-09-17): a prestação diz
// "SEGURO APTO 12 · R$ 141,04", "SEGURO APTO 17 · R$ 139,83" e "SEGURO APTO 26
// · R$ 139,13", mas o documento de despesas pagas traz os três como "PORTO
// SEGURO COMPANHIA DE SEGUROS GERAIS" sem apto. A tela mostrava três seguros
// indistinguíveis.
const seguroPago = (valor: number) => ({
  tipo: "seguro" as const,
  fornecedor: "PORTO SEGURO COMPANHIA DE SEGUROS GERAIS",
  valor,
  vencimento: null,
  referencia: null,
  observacao: "Boleto com Nosso Número.",
  endereco: null,
  unidade_consumidora: null,
  pago_em: null,
  pago_por: null,
  confianca: 1,
})

test("GM II ago/2026: o apto do resumo alcança a despesa paga do mesmo valor", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 420,
    resumoItens: [
      { descricao: "SEGURO APTO 12", valor: 141.04, confianca: 1 },
      { descricao: "SEGURO APTO 17", valor: 139.83, confianca: 1 },
      { descricao: "SEGURO APTO 26", valor: 139.13, confianca: 1 },
    ],
    despesas: [seguroPago(141.04), seguroPago(139.83), seguroPago(139.13)],
  })

  const seguros = result.find((grupo) => grupo.categoria === "seguro")
  assert.deepEqual(
    seguros?.itens.map((item) => [item.valor, item.unidade]),
    [
      [141.04, "apto 12"],
      [139.83, "apto 17"],
      [139.13, "apto 26"],
    ],
  )
})

test("valor repetido em aptos diferentes deixa a unidade desconhecida", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 280,
    resumoItens: [
      { descricao: "SEGURO APTO 12", valor: 140, confianca: 1 },
      { descricao: "SEGURO APTO 17", valor: 140, confianca: 1 },
    ],
    despesas: [seguroPago(140), seguroPago(140)],
  })

  const seguros = result.find((grupo) => grupo.categoria === "seguro")
  assert.deepEqual(seguros?.itens.map((item) => item.unidade), [null, null])
})

test("a unidade dita pela própria despesa tem precedência sobre o cruzamento", () => {
  const result = desdobrarDespesasFechamento({
    totalDespesas: 141.04,
    resumoItens: [{ descricao: "SEGURO APTO 12", valor: 141.04, confianca: 1 }],
    despesas: [{ ...seguroPago(141.04), endereco: "RUA X, 100 - APTO 31" }],
  })

  assert.equal(result[0].itens[0].unidade, "apto 31")
})

test("unidadeDaDescricao lê apto, sala e galpão, e não inventa unidade", () => {
  assert.equal(unidadeDaDescricao("SEGURO APTO 12"), "apto 12")
  assert.equal(unidadeDaDescricao("IPTU 2026 GALPÃO 02 (5/7)"), "galpao 02")
  assert.equal(unidadeDaDescricao("SEGURO SALA 03"), "sala 03")
  assert.equal(unidadeDaDescricao("Apartamento 7 - seguro"), "apto 7")
  assert.equal(unidadeDaDescricao("Tarifa PIX"), null)
  assert.equal(unidadeDaDescricao(null), null)
})

// Grand Castelao I ago/2026 (feedback do cliente, 2026-09-21): a decomposicao de
// RECEITAS somava R$ 14.003,51 e o total exibido era R$ 15.447,13. A diferenca
// eram os R$ 1.443,63 recebidos na secao de intermediacao, que o breakdown
// pulava — dinheiro que entrou, dentro do total, ausente das partes.
test("intermediacao entra no breakdown: as partes tem que somar o total exibido", () => {
  const prestacao = {
    acordos_rescisoes_recebidos: [
      { tipo: "intermediacao", apto: "3", inquilino: "E", valor: 670, total_recebido: 721.82, comissao: 402, repasse: 319.82, confianca: 0.95 },
      { tipo: "intermediacao", apto: "8", inquilino: "F", valor: 670, total_recebido: 721.81, comissao: 402, repasse: 319.81, confianca: 0.95 },
      { tipo: "atraso", apto: "5", inquilino: "G", valor: 846.47, total_recebido: 846.47, comissao: 0, confianca: 0.95 },
    ],
  } as PrestacaoAnalysis

  const resumo = calcularResumoReceitasAdicionais(prestacao)
  assert.equal(resumo.intermediacao, 1443.63)
  assert.equal(resumo.inadimplenciasPagas, 846.47)
  // Vigencia 13.157,04 + estas adicionais = 15.447,14, o recebido do documento
  // (um centavo de arredondamento das linhas impressas).
  assert.equal(resumo.total, 2290.1)
})

// Galpao Jose Walter ago/2026 (feedback do cliente, 2026-09-21: "comissao esta
// indo para as despesas"). A NFS-e da propria administradora, R$ 267,88, e a
// MESMA taxa ja deduzida na linha do aluguel. A conciliacao sabe disso e poe a
// despesa em zero; o card listava o item cru e exibia "Outros R$ 267,88" com
// "Abatido do repasse - R$ 0,00" logo abaixo. A comissao aparecia como despesa
// do locador, e as partes nao somavam o total.
test("despesa ja retida como comissao nao e listada como despesa do locador", () => {
  const grupos = desdobrarDespesasFechamento({
    totalDespesas: 0,
    resumoItens: [],
    despesas: [
      {
        tipo: "outro",
        valor: 267.88,
        fornecedor: "PLURAL ADMINISTRAÇÃO DE IMÓVEIS LTDA",
        observacao: "Taxa de administração.",
        referencia: "NFS-e",
        endereco: null,
        pago_em: null,
        pago_por: null,
        vencimento: null,
        unidade_consumidora: null,
        confianca: 0.94,
      },
    ] as never,
  })

  const itens = grupos.flatMap((grupo) => grupo.itens)
  const soma = Math.round(itens.reduce((total, item) => total + item.valor, 0) * 100) / 100
  assert.equal(soma, 0)
  assert.ok(itens.some((item) => /já retido como comissão/i.test(item.descricao)))
})
