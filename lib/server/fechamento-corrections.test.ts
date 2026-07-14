import assert from "node:assert/strict"
import test from "node:test"
import type { ReceitaPorImovel } from "@/lib/prestacao-types"
import { ensureReceitaLineIds, resolveReceitaMovement } from "./fechamento-corrections.ts"

test("resolve a movimentacao pela ocorrencia da receita em vez da posicao global", () => {
  const rows = [
    { apto: "101", inquilino: "Ana" },
    { apto: "101", inquilino: "Ana" },
    { apto: "102", inquilino: "Beto" },
  ] as ReceitaPorImovel[]
  const movements = [
    { id: "mov-beto", dados_extraidos: { apto: "102", inquilino: "Beto" } },
    { id: "mov-ana-1", dados_extraidos: { apto: "101", inquilino: "Ana" } },
    { id: "mov-ana-2", dados_extraidos: { apto: "101", inquilino: "Ana" } },
  ]

  assert.equal(resolveReceitaMovement(movements, rows, 1)?.id, "mov-ana-2")
  assert.equal(resolveReceitaMovement(movements, rows, 2)?.id, "mov-beto")
})

test("resolve linhas duplicadas pela identidade persistida, independente da ordem", () => {
  const rows = [
    { linha_id: "receita-1", apto: "101", inquilino: "Ana" },
    { linha_id: "receita-2", apto: "101", inquilino: "Ana" },
  ] as ReceitaPorImovel[]
  const movements = [
    { id: "mov-2", dados_extraidos: { linha_id: "receita-2", apto: "101", inquilino: "Ana" } },
    { id: "mov-1", dados_extraidos: { linha_id: "receita-1", apto: "101", inquilino: "Ana" } },
  ]
  assert.equal(resolveReceitaMovement(movements, rows, 0)?.id, "mov-1")
  assert.equal(resolveReceitaMovement(movements, rows, 1)?.id, "mov-2")
})

test("atribui identidades deterministicas e substitui duplicatas", () => {
  const result = ensureReceitaLineIds({ receitas_por_imovel: [
    { linha_id: "mantida", apto: "1" }, { linha_id: "mantida", apto: "2" }, { apto: "3" },
  ] as ReceitaPorImovel[] })
  assert.deepEqual(result.receitas_por_imovel.map((row) => row.linha_id), ["mantida", "receita-0002", "receita-0003"])
})
