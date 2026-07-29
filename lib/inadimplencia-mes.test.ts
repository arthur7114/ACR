import assert from "node:assert/strict"
import test from "node:test"
import { ehInadimplenteDoMes, receitaEsperadaInadimplente, type SnapshotReceita } from "./inadimplencia-mes.ts"

test("detecta inadimplente do mes por marcador INADIMPLENCIA + imovel vinculado", () => {
  assert.equal(ehInadimplenteDoMes({ imovel_id: "x", observacao: "INADIMPLÊNCIA" }), true)
  assert.equal(ehInadimplenteDoMes({ imovel_id: "x", observacao: "inadimplencia da unidade" }), true)
  // sem imovel vinculado nao conta (nao da pra buscar historico)
  assert.equal(ehInadimplenteDoMes({ imovel_id: null, observacao: "INADIMPLÊNCIA" }), false)
  // sem marcador nao conta
  assert.equal(ehInadimplenteDoMes({ imovel_id: "x", observacao: "IPTU de passagem" }), false)
})

// Cenario real Apto 7 GM II: junho zerado/inadimplente; maio foi o ultimo pago
// com receita_total 810,44 (que e o valor esperado que o cliente cobra).
const APTO7: SnapshotReceita[] = [
  { competencia: "2026-06-01", receita_total: 0, aluguel_recebido: 0, status_ocupacao: "inadimplente" },
  { competencia: "2026-05-01", receita_total: 810.44, aluguel_recebido: 716.31, status_ocupacao: "ocupado" },
  { competencia: "2026-04-01", receita_total: 810.44, aluguel_recebido: 716.31, status_ocupacao: "ocupado" },
  { competencia: "2026-03-01", receita_total: 926.37, aluguel_recebido: 716.31, status_ocupacao: "ocupado" },
]

test("usa a receita_total do snapshot pago mais recente (maio = 810,44)", () => {
  assert.equal(receitaEsperadaInadimplente(APTO7, 716.31), 810.44)
})

test("ignora o proprio mes inadimplente (zerado) ao escolher o valor", () => {
  const soInadimplente: SnapshotReceita[] = [
    { competencia: "2026-06-01", receita_total: 0, aluguel_recebido: 0, status_ocupacao: "inadimplente" },
  ]
  // sem historico pago -> cai no aluguel esperado do cadastro
  assert.equal(receitaEsperadaInadimplente(soInadimplente, 716.31), 716.31)
})

test("sem historico e sem aluguel esperado -> zero", () => {
  assert.equal(receitaEsperadaInadimplente([], null), 0)
})
