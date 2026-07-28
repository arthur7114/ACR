import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoAnalysis } from "./prestacao-types.ts"
import {
  calcularResumoComissaoFechamento,
  calcularIptuRecebidoExibicao,
  calcularResumoReceitasAdicionais,
  desdobrarDespesasFechamento,
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
      { tipo: "acordo", valor: 300 },
      { tipo: "rescisao", valor: 935.98 },
      { tipo: "atraso", valor: 707.37 },
      { tipo: "outro", valor: 50 },
      { tipo: "intermediacao", valor: 900 },
    ],
  } as PrestacaoAnalysis

  assert.deepEqual(calcularResumoReceitasAdicionais(prestacao), {
    acordos: 300,
    rescisoes: 935.98,
    inadimplenciasPagas: 707.37,
    outros: 50,
    total: 1993.35,
  })
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
