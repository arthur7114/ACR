import assert from "node:assert/strict"
import test from "node:test"
import {
  ehInadimplenteDoMes,
  receitaEsperadaInadimplente,
  resumirInadimplencia,
  type SnapshotInadimplente,
  type SnapshotReceita,
} from "./inadimplencia-mes.ts"

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

test("aluguel esperado zerado NAO e zero confirmado: e ausencia de dado", () => {
  // Invertido em 2026-09-16 (classe C do registro de incidentes). Zero no
  // cadastro veio da migracao como placeholder; afirmar que a unidade
  // inadimplente devia R$ 0,00 escondia que ninguem sabe o aluguel dela.
  assert.equal(receitaEsperadaInadimplente([], 0), null)
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


test("aluguel de cadastro em zero nao vira inadimplencia de R$ 0,00: fica desconhecida", () => {
  // TERRENO CASTELAO mai/2026: cadastro migrado com zero, sem cobranca esperada
  // e sem receita anterior. Zero e placeholder; a divida do mes e desconhecida.
  assert.equal(receitaEsperadaInadimplente([], 0), null)
  // Cobranca esperada em zero (vigencia migrada) e o mesmo placeholder.
  assert.equal(receitaEsperadaInadimplente([], 500, 0), 500)
  assert.equal(receitaEsperadaInadimplente([], 0, 0), null)
})


// Cenario real Luana, apto 7 GM II (queixa de set/2026: "consta 3
// inadimplencias mas atualmente so tem 1 em aberto"). Junho foi pago em julho
// e julho foi pago em agosto; so agosto segue devendo.
const LUANA: SnapshotInadimplente[] = [
  { competencia: "2026-05-01", statusOcupacao: "ocupado", cobrancaEsperada: 716.31, aluguelEsperado: 716.31, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  { competencia: "2026-06-01", statusOcupacao: "inadimplente", cobrancaEsperada: 741.31, aluguelEsperado: 716.31, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  { competencia: "2026-07-01", statusOcupacao: "inadimplente", cobrancaEsperada: 741.31, aluguelEsperado: 716.31, atrasosRecuperados: 894.18, atrasosCompetenciaOrigem: "2026-06-01" },
  { competencia: "2026-08-01", statusOcupacao: "inadimplente", cobrancaEsperada: 741.31, aluguelEsperado: 716.31, atrasosRecuperados: 894.18, atrasosCompetenciaOrigem: "2026-07-01" },
]

test("separa inadimplencia em aberto de inadimplencia ja quitada", () => {
  const r = resumirInadimplencia(LUANA)
  assert.equal(r.meses, 3)
  assert.equal(r.quitadas, 2)
  assert.equal(r.emAberto, 1)
  assert.deepEqual(r.competenciasEmAberto, ["2026-08-01"])
  assert.equal(r.valorEmAberto, 741.31)
})

test("mes quitado no proprio mes seguinte nao conta duas vezes", () => {
  // Dois pagamentos apontando para a MESMA competencia quitam uma divida so.
  const r = resumirInadimplencia([
    { competencia: "2026-06-01", statusOcupacao: "inadimplente", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
    { competencia: "2026-07-01", statusOcupacao: "ocupado", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: 350, atrasosCompetenciaOrigem: "2026-06-01" },
    { competencia: "2026-08-01", statusOcupacao: "ocupado", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: 350, atrasosCompetenciaOrigem: "2026-06-01" },
  ])
  assert.equal(r.meses, 1)
  assert.equal(r.quitadas, 1)
  assert.equal(r.emAberto, 0)
  assert.equal(r.valorEmAberto, 0)
})

test("pagamento ANTERIOR a divida nao a quita", () => {
  // Atraso recuperado em maio nao pode quitar a inadimplencia de junho: quitar
  // uma divida que ainda nao existia e erro de atribuicao, nao adiantamento.
  const r = resumirInadimplencia([
    { competencia: "2026-05-01", statusOcupacao: "ocupado", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: 700, atrasosCompetenciaOrigem: "2026-06-01" },
    { competencia: "2026-06-01", statusOcupacao: "inadimplente", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  ])
  assert.equal(r.emAberto, 1)
  assert.equal(r.valorEmAberto, 700)
})

test("sem base de calculo o valor em aberto e desconhecido, nunca R$ 0,00", () => {
  // Mesma regra de `receitaEsperadaInadimplente`: zero afirmaria que a unidade
  // inadimplente nao devia nada. Contagem continua sendo exibida.
  const r = resumirInadimplencia([
    { competencia: "2026-06-01", statusOcupacao: "inadimplente", cobrancaEsperada: null, aluguelEsperado: null, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  ])
  assert.equal(r.emAberto, 1)
  assert.equal(r.valorEmAberto, null)
})

test("cobranca esperada vence o aluguel esperado na soma em aberto", () => {
  // A cobranca inclui a vaga; o aluguel sozinho subestima (conserto de set/2026).
  const r = resumirInadimplencia([
    { competencia: "2026-08-01", statusOcupacao: "inadimplente", cobrancaEsperada: 741.31, aluguelEsperado: 716.31, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  ])
  assert.equal(r.valorEmAberto, 741.31)
})

test("unidade sem inadimplencia devolve zero em aberto, nao desconhecido", () => {
  const r = resumirInadimplencia([
    { competencia: "2026-08-01", statusOcupacao: "ocupado", cobrancaEsperada: 700, aluguelEsperado: 700, atrasosRecuperados: null, atrasosCompetenciaOrigem: null },
  ])
  assert.equal(r.meses, 0)
  assert.equal(r.emAberto, 0)
  assert.equal(r.valorEmAberto, 0)
})
