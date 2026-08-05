import assert from "node:assert/strict"
import { test } from "node:test"
import { deriveContracts, type SnapshotMes } from "./contratos-derive"

function mes(
  competencia: string,
  status: SnapshotMes["statusOcupacao"],
  inquilino: string | null,
  aluguel: number | null,
): SnapshotMes {
  return {
    competencia,
    statusOcupacao: status,
    inquilinoNome: inquilino,
    aluguelCompetencia: aluguel,
    aluguelRecebido: aluguel,
  }
}

test("sequência contínua vira um contrato vigente", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "ocupado", "Fulano", 800),
    mes("2026-03-01", "ocupado", "Fulano", 820),
  ])
  assert.equal(contratos.length, 1)
  assert.equal(contratos[0].inicio, "2026-01-01")
  assert.equal(contratos[0].fim, null)
})

test("mês vago fecha o contrato", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "vago", null, null),
    mes("2026-03-01", "ocupado", "Sicrana", 900),
  ])
  assert.equal(contratos.length, 2)
  assert.equal(contratos[0].fim, "2026-02-01")
  assert.equal(contratos[1].inicio, "2026-03-01")
  assert.equal(contratos[1].fim, null)
})

test("inadimplente mantém o contrato aberto", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "inadimplente", "Fulano", 0),
  ])
  assert.equal(contratos.length, 1)
  assert.equal(contratos[0].fim, null)
})

test("desconhecido não fecha contrato se o locatário reaparece", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "desconhecido", null, null),
    mes("2026-03-01", "ocupado", "Fulano", 800),
  ])
  assert.equal(contratos.length, 1)
})

test("troca de locatário após gap de desconhecido fecha no mês seguinte à última evidência", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "desconhecido", null, null),
    mes("2026-03-01", "ocupado", "Sicrana", 900),
  ])
  assert.equal(contratos.length, 2)
  assert.equal(contratos[0].fim, "2026-02-01")
  assert.equal(contratos[1].inicio, "2026-03-01")
})

test("troca de locatário fecha e abre contrato", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 800),
    mes("2026-02-01", "ocupado", "Sicrana", 900),
  ])
  assert.equal(contratos.length, 2)
  assert.equal(contratos[0].fim, "2026-02-01")
})

test("alugado_app não gera contrato (D2)", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "alugado_app", "AIRBNB", null),
    mes("2026-02-01", "alugado_app", "AIRBNB", null),
  ])
  assert.equal(contratos.length, 0)
})

test("valor inferido ignora primeiro e último mês (proporcionais)", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 187.68),  // entrada proporcional
    mes("2026-02-01", "ocupado", "Fulano", 800),
    mes("2026-03-01", "ocupado", "Fulano", 810),
    mes("2026-04-01", "em_rescisao", "Fulano", 23.33), // saída proporcional
    mes("2026-05-01", "vago", null, null),
  ])
  assert.equal(contratos[0].valores.length, 1)
  assert.equal(contratos[0].valores[0].valor, 810)
  assert.equal(contratos[0].valores[0].origem, "inferido")
})

test("contrato sem valor conhecido fica com valores vazios", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "inadimplente", "Fulano", 0),
    mes("2026-02-01", "inadimplente", "Fulano", 0),
  ])
  assert.equal(contratos.length, 1)
  assert.deepEqual(contratos[0].valores, [])
})
