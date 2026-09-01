import assert from "node:assert/strict"
import test from "node:test"
import { ehInadimplenteDoMes, receitaEsperadaInadimplente, type SnapshotReceita } from "./inadimplencia-mes.ts"

test("detecta inadimplente do mes pelo marcador INADIMPLENCIA da observacao", () => {
  assert.equal(ehInadimplenteDoMes({ observacao: "INADIMPLÊNCIA" }), true)
  assert.equal(ehInadimplenteDoMes({ observacao: "inadimplencia da unidade" }), true)
  // sem marcador nao conta
  assert.equal(ehInadimplenteDoMes({ observacao: "IPTU de passagem" }), false)
  assert.equal(ehInadimplenteDoMes({ observacao: null }), false)
})

test("vinculo ausente nao desmarca a inadimplencia declarada pelo documento", () => {
  // GM I maio/2026: as 23 linhas foram gravadas sem `imovel_id` e a Revisao
  // exibia R$ 0,00 com 4 unidades marcadas como INADIMPLENCIA no documento.
  // Quem trata a falta de vinculo e o loader (pendencia), nao este detector.
  assert.equal(ehInadimplenteDoMes({ observacao: "RESCISÃO. INADIMPLÊNCIA." }), true)
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

test("sem historico e sem aluguel esperado -> desconhecido, nunca zero", () => {
  // Zero afirmaria que a unidade inadimplente nao devia nada. Sem base, o
  // valor e desconhecido e o loader registra a pendencia.
  assert.equal(receitaEsperadaInadimplente([], null), null)
})

test("aluguel esperado zerado continua sendo zero confirmado", () => {
  assert.equal(receitaEsperadaInadimplente([], 0), 0)
})

test("cobranca esperada tem precedencia sobre o proxy de receita paga", async () => {
  const { receitaEsperadaInadimplente } = await import("./inadimplencia-mes.ts")
  const snapshots = [
    { competencia: "2026-06-01", receita_total: 810.44, aluguel_recebido: 700, status_ocupacao: "ocupado" },
  ]
  // Com cobrança esperada auditável (aluguel + garagem da vigência), o valor
  // do mês inadimplente é ela — não a receita encargo-inclusiva do mês pago.
  assert.equal(receitaEsperadaInadimplente(snapshots, 414.86, 466.93), 466.93)
  // Sem cobrança esperada, mantém o comportamento anterior (proxy do último pago).
  assert.equal(receitaEsperadaInadimplente(snapshots, 414.86, null), 810.44)
})
