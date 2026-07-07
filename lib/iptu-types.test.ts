import assert from "node:assert/strict"
import test from "node:test"
import {
  baixarIptuSchema,
  gerarIptuSchema,
  iptuExtracaoSchema,
  iptuParcelaPatchSchema,
} from "./iptu-types.ts"

const UUID = "11111111-1111-1111-1111-111111111111"

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

// --- Schemas de contas a pagar ---

test("gerarIptuSchema: aceita payload valido", () => {
  const parsed = gerarIptuSchema.parse({
    ano: 2026,
    imovelIds: [UUID],
    numeroParcelas: 2,
    vencimentos: ["2026-01-10", "2026-02-10"],
    valorPadrao: 120.5,
  })
  assert.equal(parsed.numeroParcelas, 2)
})

test("gerarIptuSchema: rejeita quando vencimentos difere do numero de parcelas", () => {
  assert.throws(() =>
    gerarIptuSchema.parse({
      ano: 2026,
      imovelIds: [UUID],
      numeroParcelas: 3,
      vencimentos: ["2026-01-10"],
    }),
  )
})

test("gerarIptuSchema: rejeita lista de imoveis vazia", () => {
  assert.throws(() =>
    gerarIptuSchema.parse({ ano: 2026, imovelIds: [], numeroParcelas: 1, vencimentos: ["2026-01-10"] }),
  )
})

test("gerarIptuSchema: rejeita data de vencimento invalida", () => {
  assert.throws(() =>
    gerarIptuSchema.parse({ ano: 2026, imovelIds: [UUID], numeroParcelas: 1, vencimentos: ["10/01/2026"] }),
  )
})

test("baixarIptuSchema: aceita baixa com valores por parcela", () => {
  const parsed = baixarIptuSchema.parse({
    parcelaIds: [UUID],
    dataBaixa: "2026-07-07",
    valoresPagos: { [UUID]: 100 },
  })
  assert.equal(parsed.parcelaIds.length, 1)
})

test("baixarIptuSchema: exige dataBaixa", () => {
  assert.throws(() => baixarIptuSchema.parse({ parcelaIds: [UUID] }))
})

test("baixarIptuSchema: rejeita valor pago negativo", () => {
  assert.throws(() =>
    baixarIptuSchema.parse({ parcelaIds: [UUID], dataBaixa: "2026-07-07", valoresPagos: { [UUID]: -5 } }),
  )
})

test("iptuParcelaPatchSchema: aceita atualizacao parcial", () => {
  const parsed = iptuParcelaPatchSchema.parse({ valorPrevisto: 200 })
  assert.equal(parsed.valorPrevisto, 200)
})

test("iptuParcelaPatchSchema: rejeita payload vazio", () => {
  assert.throws(() => iptuParcelaPatchSchema.parse({}))
})

test("iptuParcelaPatchSchema: rejeita valor previsto negativo", () => {
  assert.throws(() => iptuParcelaPatchSchema.parse({ valorPrevisto: -1 }))
})
