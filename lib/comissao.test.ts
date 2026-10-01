import assert from "node:assert/strict"
import test from "node:test"
import type { ReceitaPorImovel } from "./prestacao-types"
import { calculatedAdminCommission, commissionBaseComponents, realizedCommissionBase } from "./comissao"

function row(overrides: Partial<ReceitaPorImovel>): ReceitaPorImovel {
  return {
    apto: "1",
    inquilino: "",
    aluguel: null,
    desconto: null,
    aluguel_com_desconto: null,
    garagem: null,
    vagas_garagem: null,
    agua: null,
    iptu: null,
    seguro_incendio: null,
    total: 0,
    comissao: null,
    repasse: null,
    vencimento: null,
    observacao: null,
    confianca: 1,
    ...overrides,
  }
}

test("base da comissão inclui o IPTU, não só o aluguel bruto", () => {
  // César Rêgo / Galpão Pompílio Gomes junho: a comissão de 4% incide sobre
  // aluguel + IPTU. 4% × (12.032,74 + 342,04) = 494,99 (comissão real).
  const rows = [
    row({ apto: "0002526", aluguel: 6684.85, iptu: 193.02, total: 6684.85, comissao: 275.11 }),
    row({ apto: "0002527", aluguel: 5347.89, iptu: 149.02, total: 5347.89, comissao: 219.88 }),
  ]
  const base = commissionBaseComponents(rows)
  assert.equal(base.totalAluguel, 12_032.74)
  assert.equal(base.totalIptu, 342.04)
  assert.equal(base.base, 12_374.78)
  assert.equal(calculatedAdminCommission(base.base, 4), 494.99)
})

test("aluguel com desconto tem precedência sobre o aluguel cheio na base", () => {
  const rows = [row({ aluguel: 1000, aluguel_com_desconto: 900, garagem: 50, agua: 10, seguro_incendio: 5 })]
  const base = commissionBaseComponents(rows)
  assert.equal(base.totalAluguel, 900)
  assert.equal(base.base, 965)
})

test("comissão calculada é nula quando não há taxa cadastrada", () => {
  assert.equal(calculatedAdminCommission(1000, null), null)
  assert.equal(calculatedAdminCommission(1000, undefined), null)
})

test("encargo financeiro por atraso entra na base da comissao", () => {
  // Joao Cordeiro jun/2026: a comissao das linhas somava R$ 149,47 e o calculo
  // dava R$ 140,66 porque os encargos por atraso ficavam fora da base. O
  // fechamento travava num alerta impossivel de resolver.
  const linhas = [
    { apto: "0002520", aluguel: 1237.05, outros_recebimentos: null },
    { apto: "0002521", aluguel: 788.22, outros_recebimentos: 90.26 },
    { apto: "0002521", aluguel: 788.22, aluguel_com_desconto: 787.96, outros_recebimentos: 85.84 },
  ] as never

  const base = commissionBaseComponents(linhas)

  assert.equal(base.totalOutrosRecebimentos, 176.1)
  assert.equal(base.base, 2989.33)
  assert.equal(calculatedAdminCommission(base.base, 5), 149.47)
})

test("taxa realizada inclui o IPTU de passagem comissionado (Pompilio Gomes ago/2026)", () => {
  const rows = [
    row({ aluguel: 6896.75, iptu: 193.02, total: 6896.75, comissao: 283.59, entradas_passagem: 193.02, saidas_passagem: 193.02 }),
    row({ aluguel: 5517.41, iptu: 149.02, total: 5517.41, comissao: 226.66, entradas_passagem: 149.02, saidas_passagem: 149.02 }),
  ]
  const base = realizedCommissionBase(rows)
  assert.equal(base, 12756.2)
  assert.equal(Math.round((510.25 / base) * 10000) / 100, 4)
})

test("sem IPTU de passagem a base da taxa realizada e o total das linhas", () => {
  assert.equal(realizedCommissionBase([row({ total: 1000 }), row({ total: 500.5 })]), 1500.5)
})

test("devolucao de IPTU (credito sem debito) nao entra na base da taxa realizada (Jose Walter jun/2026)", () => {
  const rows = [row({ aluguel: 3200, iptu: 445.95, total: 3200, comissao: 256, entradas_passagem: 445.95, saidas_passagem: null })]
  assert.equal(realizedCommissionBase(rows), 3200)
})
