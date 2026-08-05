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
