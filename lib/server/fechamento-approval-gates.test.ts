import assert from "node:assert/strict"
import test from "node:test"
import type { ReceitaPorImovel } from "@/lib/prestacao-types"
import { countMovementInconsistencies } from "./fechamento-approval-gates.ts"

const row = {
  apto: "101",
  inquilino: "Maria",
  aluguel: 1000,
  total: 1000,
  competencia_original: "2026-03",
  imovel_id: "11111111-1111-4111-8111-111111111111",
} as ReceitaPorImovel

test("bloqueia aprovação quando movimentação está ausente ou divergente", () => {
  const matching = {
    id: "movimento-1",
    data_competencia: "2026-03-01",
    imovel_id: row.imovel_id!,
    dados_extraidos: { apto: "101", inquilino: "Maria" },
  }

  assert.equal(countMovementInconsistencies([row], [matching]), 0)
  assert.equal(countMovementInconsistencies([row], []), 1)
  assert.equal(countMovementInconsistencies([row], [{ ...matching, data_competencia: "2026-05-01" }]), 1)
  assert.equal(countMovementInconsistencies([row], [{ ...matching, imovel_id: null }]), 1)
})
