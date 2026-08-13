import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoAnalysis } from "@/lib/prestacao-types"
import {
  construirVinculosImoveis,
  sugerirStatusImovel,
  vincularReceitasExistentes,
} from "./fechamento-imoveis.ts"

const prestacao = {
  receitas_por_imovel: [
    { apto: "101", imovel_id: "imovel-101", inquilino: "Maria", aluguel: 1000, total: 1000, observacao: null },
    { apto: "0002520", inquilino: "João", aluguel: 1500, total: 1500, observacao: null },
    { apto: "102", inquilino: "", aluguel: null, total: 0, observacao: "IMÓVEL VAGO" },
  ],
} as PrestacaoAnalysis

test("considera resolvida somente a receita com vinculo persistido", () => {
  const result = construirVinculosImoveis(prestacao, [
    {
      id: "imovel-101",
      codigo_imobiliaria: "101",
      unidade: "AP 101",
      inquilino_nome: "Maria",
      status: "ocupado",
      valor_aluguel_esperado: 1000,
    },
    {
      id: "imovel-102",
      codigo_imobiliaria: "COD-102",
      unidade: "102",
      inquilino_nome: null,
      status: "vago",
      valor_aluguel_esperado: null,
    },
  ])

  assert.equal(result.total_receitas, 3)
  assert.equal(result.total_vinculadas, 1)
  assert.equal(result.pendentes.length, 2)
  assert.deepEqual(result.pendentes.map((item) => item.indice), [1, 2])
})

test("sugere status sem sobrescrever o cadastro", () => {
  assert.equal(sugerirStatusImovel(prestacao.receitas_por_imovel[0]), "ocupado")
  assert.equal(sugerirStatusImovel(prestacao.receitas_por_imovel[2]), "vago")
})

test("persiste automaticamente somente correspondencia exata e univoca", () => {
  const linked = vincularReceitasExistentes(prestacao, [
    { id: "imovel-101", codigo_imobiliaria: "101", unidade: "AP 101", inquilino_nome: null, status: "ocupado", valor_aluguel_esperado: 1000 },
    { id: "imovel-102", codigo_imobiliaria: "COD-102", unidade: "102", inquilino_nome: null, status: "vago", valor_aluguel_esperado: null },
  ])

  assert.equal(linked?.receitas_por_imovel[0].imovel_id, "imovel-101")
  assert.equal(linked?.receitas_por_imovel[1].imovel_id, undefined)
  assert.equal(linked?.receitas_por_imovel[2].imovel_id, "imovel-102")
})

test("vincula revisão contratual GA ao cadastro canônico", () => {
  const plural = {
    ...prestacao,
    receitas_por_imovel: [
      {
        ...prestacao.receitas_por_imovel[0],
        apto: "GA0002/2",
        imovel_id: undefined,
      },
    ],
  } as PrestacaoAnalysis

  const linked = vincularReceitasExistentes(plural, [
    {
      id: "imovel-ga0002",
      codigo_imobiliaria: "GA0002",
      unidade: "GA0002",
      inquilino_nome: "Galpão José Walter",
      status: "ocupado",
      valor_aluguel_esperado: 3_200,
    },
  ])

  assert.equal(linked?.receitas_por_imovel[0].imovel_id, "imovel-ga0002")
})
