import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoRecheck } from "./prestacao-types"
import { nullifyCountBasedRecheckValues } from "./rechecks-contagem.ts"

function makeCheck(overrides: Partial<PrestacaoRecheck>): PrestacaoRecheck {
  return {
    id: "acordos_competencias",
    label: "Competencias de acordos e rescisoes",
    status: "warning",
    message: "3 acordo(s) ou rescisao(oes)...",
    ...overrides,
  }
}

test("zera actual/expected dos rechecks de contagem quando vieram como valor", () => {
  const result = nullifyCountBasedRecheckValues([
    makeCheck({ id: "acordos_competencias", actual: 3 }),
    makeCheck({ id: "duplicate_agreement_payment", status: "failed", actual: 1 }),
  ])
  assert.equal(result.changed, true)
  assert.equal(result.rechecks[0]?.actual, null)
  assert.equal(result.rechecks[0]?.expected, null)
  assert.equal(result.rechecks[1]?.actual, null)
})

test("nao mexe em rechecks ja corretos (actual/expected nulos) nem em outros ids", () => {
  const result = nullifyCountBasedRecheckValues([
    makeCheck({ id: "acordos_competencias", actual: null, expected: null }),
    makeCheck({ id: "total_linhas_receitas", status: "failed", actual: 17714.08, expected: 17714.04, difference: 0.04 }),
  ])
  assert.equal(result.changed, false)
  assert.equal(result.rechecks[1]?.actual, 17714.08)
})
