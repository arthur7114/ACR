import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import {
  buildInadimplenciasAcumuladas,
  buildReceitas,
  extractPdfTextLines,
  isCesarRegoConsolidado,
  parseCesarRegoHeader,
  parseCesarRegoPrestacao,
} from "./cesar-rego-parser.ts"

type Lancamento = Parameters<typeof buildReceitas>[1][number]

function lancamento(partial: Partial<Lancamento> & Pick<Lancamento, "codigo">): Lancamento {
  return {
    descricao: "",
    mesAno: null,
    debito: null,
    credito: null,
    saldo: null,
    inquilino: "",
    ...partial,
  }
}

test("aluguel de um unico mes gera uma linha com repasse = saldo final", () => {
  const receitas = buildReceitas(
    [{ codigo: "0002520", endereco: "Rua A", aluguel: 1237.05, ultimoPagamento: null, situacao: null }],
    [
      lancamento({ codigo: "0002520", descricao: "ALUGUEL", mesAno: "06/2026", credito: 1237.05, saldo: 1237.05, inquilino: "FULANO DA SILVA" }),
      lancamento({ codigo: "0002520", descricao: "COMISSAO DA ADMINISTRADORA (5,00%)", mesAno: "06/2026", debito: 61.85, saldo: 1175.2, inquilino: "FULANO DA SILVA" }),
    ],
  )

  assert.equal(receitas.length, 1)
  assert.equal(receitas[0].competencia_original, "06/2026")
  assert.equal(receitas[0].aluguel, 1237.05)
  assert.equal(receitas[0].total, 1237.05)
  assert.equal(receitas[0].comissao, 61.85)
  // caminho comum: repasse = saldo do ultimo lancamento do grupo
  assert.equal(receitas[0].repasse, 1175.2)
})

const APTO_B_JULHO = {
  codigo: "0002521",
  endereco: "JOAO CORDEIRO,488 APART. B",
  aluguel: 788.22,
  ultimoPagamento: "05/2026",
  situacao: "APTO ALUG",
}

test("contrato ALUG sem lancamento vira inadimplencia explicita, identificada e com aluguel do documento", () => {
  const receitas = buildReceitas([APTO_B_JULHO], [], "2026-07")

  assert.equal(receitas.length, 1)
  assert.equal(receitas[0].total, 0)
  assert.match(receitas[0].observacao ?? "", /INADIMPLENCIA/i)
  assert.doesNotMatch(receitas[0].observacao ?? "", /\bVAGO\b/i)
  // Mesma identificacao das linhas com lancamento: a Revisao nao mostra "-" e o
  // mapa nao diz "Inquilino nao informado" ao lado de Inadimplente.
  assert.equal(receitas[0].inquilino, "JOAO CORDEIRO,488 APART. B")
  assert.equal(receitas[0].competencia_original, "07/2026")
  // Base da inadimplencia do mes: coluna ALUGUEL da Relacao de Imoveis.
  assert.equal(receitas[0].aluguel_esperado, 788.22)
})

test("imovel sem contrato ativo e sem lancamento continua neutro (nao inadimplente)", () => {
  const receitas = buildReceitas([{ ...APTO_B_JULHO, situacao: "APTO DESALUG" }], [], "2026-07")

  assert.equal(receitas.length, 1)
  assert.doesNotMatch(receitas[0].observacao ?? "", /INADIMPLENCIA/i)
  assert.equal(receitas[0].competencia_original, null)
  assert.equal(receitas[0].aluguel_esperado, null)
})

test("ALUG que pagou meses anteriores mas nao o da competencia: mes corrente inadimplente vem primeiro", () => {
  // Joao Cordeiro jun/26: 0002521 pagou abril e maio dentro do fechamento de
  // junho e nao pagou junho. A Revisao conta 1 unidade = primeira linha do apto,
  // entao a competencia em aberto precisa abrir a lista.
  const receitas = buildReceitas(
    [{ ...APTO_B_JULHO, ultimoPagamento: "03/2026" }],
    [
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "04/2026", credito: 788.22, saldo: 788.22 }),
      lancamento({ codigo: "0002521", descricao: "COMISSAO DA ADMINISTRADORA (5,00%)", mesAno: "04/2026", debito: 39.41, saldo: 748.81 }),
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "05/2026", credito: 788.22, saldo: 1537.03 }),
      lancamento({ codigo: "0002521", descricao: "COMISSAO DA ADMINISTRADORA (5,00%)", mesAno: "05/2026", debito: 39.41, saldo: 1497.62 }),
    ],
    "2026-06",
  )

  assert.deepEqual(
    receitas.map((row) => row.competencia_original),
    ["06/2026", "04/2026", "05/2026"],
  )
  assert.match(receitas[0].observacao ?? "", /INADIMPLENCIA.*06\/2026/i)
  assert.equal(receitas[0].aluguel, null)
  assert.equal(receitas[0].aluguel_esperado, 788.22)
  assert.equal(receitas[0].inquilino, "JOAO CORDEIRO,488 APART. B")
  // As linhas pagas nao mudam.
  assert.equal(receitas[1].aluguel, 788.22)
  assert.equal(receitas[2].aluguel, 788.22)
})

test("ALUG com aluguel da competencia lancado nao ganha linha inadimplente", () => {
  const receitas = buildReceitas(
    [{ ...APTO_B_JULHO, ultimoPagamento: "06/2026" }],
    [lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "07/2026", credito: 788.22, saldo: 788.22 })],
    "2026-07",
  )
  assert.equal(receitas.length, 1)
  assert.doesNotMatch(receitas[0].observacao ?? "", /INADIMPLENCIA/i)
})

test("credito de ALUGUEL sem mes legivel impede a inferencia de inadimplencia", () => {
  const receitas = buildReceitas(
    [APTO_B_JULHO],
    [lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: null, credito: 788.22, saldo: 788.22 })],
    "2026-07",
  )
  assert.equal(receitas.length, 1)
  assert.doesNotMatch(receitas[0].observacao ?? "", /INADIMPLENCIA/i)
})

test("acumulada inferida: ult. pg 05/2026 na competencia 07/2026 deve junho, no valor do aluguel da Relacao", () => {
  const { itens, semBase } = buildInadimplenciasAcumuladas([APTO_B_JULHO], [], "2026-07")

  assert.deepEqual(semBase, [])
  assert.equal(itens.length, 1)
  assert.equal(itens[0].apto, "0002521")
  assert.equal(itens[0].inquilino, "JOAO CORDEIRO,488 APART. B")
  assert.equal(itens[0].valor, 788.22)
  assert.equal(itens[0].competencia_original, "06/2026")
  assert.match(itens[0].condicao ?? "", /06\/2026/)
})

test("acumulada inferida desconta os meses pagos no proprio documento (atraso quitado)", () => {
  // Jun/26: ult. pg 03/2026, pagou abril e maio neste fechamento -> nada acumulado.
  const { itens } = buildInadimplenciasAcumuladas(
    [{ ...APTO_B_JULHO, ultimoPagamento: "03/2026" }],
    [
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "04/2026", credito: 788.22 }),
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "05/2026", credito: 788.22 }),
    ],
    "2026-06",
  )
  assert.deepEqual(itens, [])
})

test("acumulada inferida atravessa o ano e ignora contrato desalugado", () => {
  const { itens } = buildInadimplenciasAcumuladas(
    [
      { codigo: "0000001", endereco: "Rua A", aluguel: 500, ultimoPagamento: "11/2025", situacao: "APTO ALUG" },
      { codigo: "0000002", endereco: "Rua B", aluguel: 500, ultimoPagamento: "01/2025", situacao: "APTO DESALUG" },
    ],
    [],
    "2026-03",
  )
  assert.deepEqual(
    itens.map((item) => `${item.apto}:${item.competencia_original}`),
    ["0000001:12/2025", "0000001:01/2026", "0000001:02/2026"],
  )
})

test("acumulada sem base (ALUG sem ult. pg ou sem aluguel) fica declarada, nunca zero", () => {
  const { itens, semBase } = buildInadimplenciasAcumuladas(
    [
      { ...APTO_B_JULHO, codigo: "0000001", ultimoPagamento: null },
      { ...APTO_B_JULHO, codigo: "0000002", aluguel: null },
    ],
    [],
    "2026-07",
  )
  assert.deepEqual(itens, [])
  assert.deepEqual(semBase, ["0000001", "0000002"])
})

test("cabecalho Cesar Rego extrai numero, vencimento e emissao", () => {
  const result = parseCesarRegoHeader([
    {
      text: "Proprietário ACR Número: 41460",
      cells: [
        { text: "Número:", x: 428, width: 32 },
        { text: "41460", x: 541, width: 22 },
      ],
    },
    {
      text: "Endereço : PONTES VIEIRA 10/08/2026",
      cells: [{ text: "10/08/2026", x: 522, width: 40 }],
    },
    {
      text: "Vencimento:",
      cells: [{ text: "Vencimento:", x: 430, width: 47 }],
    },
    {
      text: "Emissão: 10/08/2026",
      cells: [
        { text: "Emissão:", x: 429, width: 35 },
        { text: "10/08/2026", x: 523, width: 40 },
      ],
    },
  ])

  assert.deepEqual(result, {
    numeroDocumento: "41460",
    dataVencimento: "2026-08-10",
    dataEmissao: "2026-08-10",
  })
})

test("aluguel de 2 meses (atraso) gera uma linha por competencia, valores atribuidos ao mes certo", () => {
  const receitas = buildReceitas(
    [{ codigo: "0002521", endereco: "Rua B", aluguel: 788.22, ultimoPagamento: null, situacao: null }],
    [
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "04/2026", credito: 788.22, saldo: 788.22, inquilino: "BELTRANO SOUZA" }),
      lancamento({ codigo: "0002521", descricao: "COMISSAO DA ADMINISTRADORA (5,00%)", mesAno: "04/2026", debito: 39.41, saldo: 748.81, inquilino: "BELTRANO SOUZA" }),
      lancamento({ codigo: "0002521", descricao: "ALUGUEL", mesAno: "05/2026", credito: 788.22, saldo: 1537.03, inquilino: "BELTRANO SOUZA" }),
      lancamento({ codigo: "0002521", descricao: "COMISSAO DA ADMINISTRADORA (5,00%)", mesAno: "05/2026", debito: 39.41, saldo: 1497.62, inquilino: "BELTRANO SOUZA" }),
    ],
  )

  assert.equal(receitas.length, 2)

  const abril = receitas.find((r) => r.competencia_original === "04/2026")
  const maio = receitas.find((r) => r.competencia_original === "05/2026")
  assert.ok(abril, "linha de abril")
  assert.ok(maio, "linha de maio")

  assert.equal(abril!.aluguel, 788.22)
  assert.equal(abril!.total, 788.22)
  assert.equal(abril!.comissao, 39.41)
  assert.equal(abril!.repasse, 748.81) // 788.22 - 39.41 (liquido do mes)

  assert.equal(maio!.aluguel, 788.22)
  assert.equal(maio!.total, 788.22)
  assert.equal(maio!.repasse, 748.81)

  // conservacao: soma dos totais das linhas == soma de todos os creditos de aluguel
  const somaTotais = receitas.reduce((s, r) => s + (r.total ?? 0), 0)
  assert.equal(somaTotais, 1576.44)
})

test("lancamento sem mes vai para a primeira competencia no split", () => {
  const receitas = buildReceitas(
    [{ codigo: "0002599", endereco: "Rua C", aluguel: 500, ultimoPagamento: null, situacao: null }],
    [
      lancamento({ codigo: "0002599", descricao: "ALUGUEL", mesAno: "04/2026", credito: 500, saldo: 500, inquilino: "FULANO" }),
      lancamento({ codigo: "0002599", descricao: "ALUGUEL", mesAno: "05/2026", credito: 500, saldo: 1000, inquilino: "FULANO" }),
      lancamento({ codigo: "0002599", descricao: "ENCARGOS FINANCEIROS POR ATRASO", mesAno: null, credito: 20, saldo: 1020, inquilino: "FULANO" }),
    ],
  )

  const abril = receitas.find((r) => r.competencia_original === "04/2026")
  const maio = receitas.find((r) => r.competencia_original === "05/2026")
  // o encargo sem mes entra no total de abril (primeira competencia)
  assert.equal(abril!.total, 520)
  assert.equal(maio!.total, 500)
})

const FIXTURE = join(
  process.cwd(),
  "docs/Artefatos/extratoagrupado - cesar rego - REF 03-26 (1).pdf",
)

test("César Rêgo março usa o resumo como verdade e separa IPTU de passagem", async () => {
  const lines = await extractPdfTextLines(readFileSync(FIXTURE))
  assert.equal(isCesarRegoConsolidado(lines), true)

  const result = parseCesarRegoPrestacao(lines, "2026-03")
  const entradasPassagem = result.receitas_por_imovel.reduce(
    (total, row) => total + (row.entradas_passagem ?? 0),
    0,
  )
  const saidasPassagem = result.receitas_por_imovel.reduce(
    (total, row) => total + (row.saidas_passagem ?? 0),
    0,
  )
  const receitasEconomicas = result.receitas_por_imovel.reduce(
    (total, row) => total + row.total,
    0,
  )

  assert.equal(result.totais.total_receitas, 13_132.74)
  assert.equal(result.resumo_financeiro.recebidos_em_nome_locador, 13_132.74)
  assert.equal(result.totais.total_repassar, 12_566.32)
  assert.equal(Number(receitasEconomicas.toFixed(2)), 13_132.74)
  assert.equal(Number(entradasPassagem.toFixed(2)), 448.69)
  assert.equal(Number(saidasPassagem.toFixed(2)), 448.69)
  assert.equal(
    result.receitas_por_imovel.find((row) => row.apto === "0002520")?.total,
    1_100,
  )
})

test("extrato consolidado infere a inadimplencia acumulada da Relacao de Imoveis", async () => {
  const lines = await extractPdfTextLines(readFileSync(FIXTURE))
  const result = parseCesarRegoPrestacao(lines, "2026-03")

  // Marco/26: 0002521 esta ALUG com ult. pg 12/2025 e sem lancamento -> deve
  // janeiro e fevereiro (acumulada) e marco (inadimplencia do mes). Todos os
  // contratos ativos tem base, entao a metrica deixa de ser "campo ausente".
  assert.deepEqual(
    result.inadimplencias_acumuladas.map((item) => `${item.apto}:${item.competencia_original}:${item.valor}`),
    ["0002521:01/2026:788.22", "0002521:02/2026:788.22"],
  )
  assert.deepEqual(result.campos_ausentes, [])
  assert.ok(
    !result.plano_extracao.alertas.some((alerta) => /inadimplencia acumulada/i.test(alerta)),
    "sem base faltando, nao deve haver alerta de acumulada nao apuravel",
  )
  const aptoB = result.receitas_por_imovel.find((row) => row.apto === "0002521")
  assert.match(aptoB?.observacao ?? "", /INADIMPLENCIA/)
  assert.equal(aptoB?.inquilino, "JOAO CORDEIRO,488 APART. B")
  assert.equal(aptoB?.competencia_original, "03/2026")
  assert.equal(aptoB?.aluguel_esperado, 788.22)
})
