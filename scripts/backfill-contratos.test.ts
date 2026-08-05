import assert from "node:assert/strict"
import { test } from "node:test"
import { buildBackfillRows } from "./backfill-contratos"

test("gera contrato, valor e lançamentos vinculados", () => {
  const rows = buildBackfillRows(
    [{ id: "im-1", tipo: "apartamento" }],
    [
      { imovel_id: "im-1", competencia: "2026-05-01", status_ocupacao: "ocupado", inquilino_nome: "Fulano", aluguel_competencia: 800, aluguel_recebido: 800, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
      { imovel_id: "im-1", competencia: "2026-06-01", status_ocupacao: "inadimplente", inquilino_nome: "Fulano", aluguel_competencia: 0, aluguel_recebido: 0, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
    ],
  )
  assert.equal(rows.contratos.length, 1)
  assert.equal(rows.valores.length, 1)
  const emAberto = rows.lancamentos.filter((l) => l.situacao === "em_aberto")
  assert.equal(emAberto.length, 1)
  assert.equal(emAberto[0].valor, 800)
  assert.equal(emAberto[0].competencia_origem, "2026-06-01")
})

test("airbnb não gera contrato nem lançamento em aberto", () => {
  const rows = buildBackfillRows(
    [{ id: "im-2", tipo: "airbnb" }],
    [
      { imovel_id: "im-2", competencia: "2026-06-01", status_ocupacao: "ocupado", inquilino_nome: "AIRBNB", aluguel_competencia: 0, aluguel_recebido: 0, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
    ],
  )
  assert.equal(rows.contratos.length, 0)
  assert.equal(rows.lancamentos.length, 0)
})

test("airbnb detectado por inquilino_nome quando tipo é nulo (dados reais não populam imoveis.tipo)", () => {
  const rows = buildBackfillRows(
    [{ id: "im-3", tipo: null, inquilino_nome: "AIRBNB" }],
    [
      { imovel_id: "im-3", competencia: "2026-06-01", status_ocupacao: "ocupado", inquilino_nome: "AIRBNB", aluguel_competencia: 0, aluguel_recebido: 0, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
    ],
  )
  assert.equal(rows.contratos.length, 0)
  assert.equal(rows.lancamentos.length, 0)
})

test("aluguel do mes corrente mantem competencia_origem propria mesmo com atraso na mesma linha", () => {
  const rows = buildBackfillRows(
    [{ id: "im-4", tipo: "apartamento" }],
    [
      { imovel_id: "im-4", competencia: "2026-05-01", status_ocupacao: "ocupado", inquilino_nome: "Fulano", aluguel_competencia: 800, aluguel_recebido: 800, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
      { imovel_id: "im-4", competencia: "2026-06-01", status_ocupacao: "ocupado", inquilino_nome: "Fulano", aluguel_competencia: 800, aluguel_recebido: 1300, atrasos_recuperados: 500, outros_recebimentos: null, competencia_original: "2026-05-01" },
    ],
  )
  const aluguelJunho = rows.lancamentos.find(
    (l) => l.rubrica === "aluguel" && l.valor === 800 && l.competencia_recebimento === "2026-06-01" && l.descricao === null,
  )
  const atrasoRecuperado = rows.lancamentos.find((l) => l.descricao === "Atraso recuperado")
  assert.ok(aluguelJunho, "deveria existir um lançamento de aluguel do mês corrente")
  assert.equal(aluguelJunho?.competencia_origem, "2026-06-01")
  assert.ok(atrasoRecuperado, "deveria existir um lançamento de atraso recuperado")
  assert.equal(atrasoRecuperado?.competencia_origem, "2026-05-01")
})

test("mes pago integralmente nao gera lancamento em_aberto mesmo com status inadimplente", () => {
  const rows = buildBackfillRows(
    [{ id: "im-5", tipo: "apartamento" }],
    [
      { imovel_id: "im-5", competencia: "2026-05-01", status_ocupacao: "ocupado", inquilino_nome: "Fulano", aluguel_competencia: 690, aluguel_recebido: 690, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
      { imovel_id: "im-5", competencia: "2026-06-01", status_ocupacao: "inadimplente", inquilino_nome: "Fulano", aluguel_competencia: 690, aluguel_recebido: 690, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
    ],
  )
  const emAberto = rows.lancamentos.filter((l) => l.situacao === "em_aberto")
  const recebido = rows.lancamentos.filter(
    (l) => l.situacao === "recebido" && l.rubrica === "aluguel" && l.competencia_origem === "2026-06-01",
  )
  assert.equal(emAberto.length, 0, "não deveria gerar em_aberto quando o mês foi pago integralmente")
  assert.equal(recebido.length, 1, "o aluguel recebido em junho continua sendo lançado normalmente")
  assert.equal(recebido[0]?.valor, 690)
})

test("fim do contrato gravado é o último mês coberto, não o mês seguinte (convenção da constraint do banco)", () => {
  const rows = buildBackfillRows(
    [{ id: "im-3", tipo: "apartamento" }],
    [
      { imovel_id: "im-3", competencia: "2026-01-01", status_ocupacao: "ocupado", inquilino_nome: "Fulano", aluguel_competencia: 800, aluguel_recebido: 800, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
      { imovel_id: "im-3", competencia: "2026-02-01", status_ocupacao: "ocupado", inquilino_nome: "Sicrana", aluguel_competencia: 900, aluguel_recebido: 900, atrasos_recuperados: null, outros_recebimentos: null, competencia_original: null },
    ],
  )
  assert.equal(rows.contratos.length, 2)
  const fulano = rows.contratos.find((c) => c.locatario_nome === "Fulano")
  const sicrana = rows.contratos.find((c) => c.locatario_nome === "Sicrana")
  assert.equal(fulano?.fim, "2026-01-01")
  assert.equal(sicrana?.inicio, "2026-02-01")
})
