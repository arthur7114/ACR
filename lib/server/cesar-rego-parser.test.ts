import assert from "node:assert/strict"
import test from "node:test"
import { buildReceitas } from "./cesar-rego-parser.ts"

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
