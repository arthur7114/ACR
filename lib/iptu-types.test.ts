import assert from "node:assert/strict"
import test from "node:test"
import { iptuExtracaoSchema } from "./iptu-types.ts"

test("aceita payload valido com um apartamento", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [{ unidade: "AP0361/1", parcelas_pagas: 3, ano_carne: 2026 }],
  }
  const parsed = iptuExtracaoSchema.parse(payload)
  assert.equal(parsed.apartamentos.length, 1)
  assert.equal(parsed.apartamentos[0].parcelas_pagas, 3)
})

test("aceita payload com varios apartamentos e ano_carne nulo", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [
      { unidade: "AP01", parcelas_pagas: 1, ano_carne: null },
      { unidade: "AP02", parcelas_pagas: 5, ano_carne: 2026 },
    ],
  }
  const parsed = iptuExtracaoSchema.parse(payload)
  assert.equal(parsed.apartamentos.length, 2)
})

test("rejeita competencia_relatorio em formato invalido", () => {
  const payload = {
    competencia_relatorio: "2026-03",
    apartamentos: [],
  }
  assert.throws(() => iptuExtracaoSchema.parse(payload))
})

test("rejeita parcelas_pagas negativo", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [{ unidade: "AP01", parcelas_pagas: -1, ano_carne: null }],
  }
  assert.throws(() => iptuExtracaoSchema.parse(payload))
})
