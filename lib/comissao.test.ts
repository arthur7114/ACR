import assert from "node:assert/strict"
import test from "node:test"
import type { ReceitaPorImovel } from "./prestacao-types"
import { calculatedAdminCommission, commissionBaseComponents } from "./comissao"

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
