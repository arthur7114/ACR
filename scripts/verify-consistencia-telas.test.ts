import assert from "node:assert/strict"
import test from "node:test"

import { compararMetricas } from "./verify-consistencia-telas.ts"

test("nao acusa divergencia dentro da tolerancia de um centavo", () => {
  const r = compararMetricas("X", [
    { rotulo: "repasse", revisao: 1000, indicadores: 1000.01 },
    { rotulo: "comissao", revisao: 50, indicadores: 50 },
  ])
  assert.equal(r.length, 0)
})

test("acusa divergencia acima da tolerancia com a diferenca calculada", () => {
  const r = compararMetricas("X", [{ rotulo: "repasse", revisao: 1000, indicadores: 900 }])
  assert.equal(r.length, 1)
  assert.equal(r[0].diferenca, 100)
  assert.equal(r[0].fechamento, "X")
})

test("um lado ausente e o outro com valor e divergencia", () => {
  const r = compararMetricas("X", [{ rotulo: "acumulada", revisao: 0, indicadores: null }])
  assert.equal(r.length, 1)
  assert.equal(r[0].diferenca, null)
})

test("ambos ausentes sao coerentes", () => {
  assert.equal(compararMetricas("X", [{ rotulo: "acumulada", revisao: null, indicadores: null }]).length, 0)
})
