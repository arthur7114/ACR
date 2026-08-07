import assert from "node:assert/strict"
import { test } from "node:test"
import { deriveContracts, fimDoBanco, fimParaBanco, type SnapshotMes } from "./contratos-derive"

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

// Antes este teste fixava um valor único por contrato. Agora a série de valores
// acompanha reajuste (é o que `contrato_valores.vigencia_inicio` existe para
// guardar); o que continua descartado é o mês proporcional de entrada e saída.
test("valor inferido descarta proporcionais de entrada e saída e acompanha reajuste", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 187.68),  // entrada proporcional
    mes("2026-02-01", "ocupado", "Fulano", 800),
    mes("2026-03-01", "ocupado", "Fulano", 810),
    mes("2026-04-01", "em_rescisao", "Fulano", 23.33), // saída proporcional
    mes("2026-05-01", "vago", null, null),
  ])
  assert.deepEqual(
    contratos[0].valores.map((v) => [v.vigenciaInicio, v.valor]),
    [["2026-01-01", 800], ["2026-03-01", 810]],
  )
  assert.equal(contratos[0].valores[0].origem, "inferido")
})

test("reajuste no ultimo mes da janela entra na serie (nao e confundido com proporcional)", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 722.39),
    mes("2026-02-01", "ocupado", "Fulano", 722.39),
    mes("2026-03-01", "ocupado", "Fulano", 722.39),
    mes("2026-04-01", "ocupado", "Fulano", 722.39),
    mes("2026-05-01", "ocupado", "Fulano", 722.39),
    mes("2026-06-01", "ocupado", "Fulano", 756.52),
  ])
  assert.deepEqual(
    contratos[0].valores.map((v) => [v.vigenciaInicio, v.valor]),
    [["2026-01-01", 722.39], ["2026-06-01", 756.52]],
  )
})

test("mes inadimplente nao interrompe nem altera a serie de valores", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 690),
    mes("2026-02-01", "ocupado", "Fulano", 690),
    mes("2026-03-01", "ocupado", "Fulano", 716.31),
    mes("2026-04-01", "ocupado", "Fulano", 716.31),
    mes("2026-05-01", "inadimplente", "Fulano", 0),
    mes("2026-06-01", "inadimplente", "Fulano", 0),
  ])
  assert.deepEqual(
    contratos[0].valores.map((v) => [v.vigenciaInicio, v.valor]),
    [["2026-01-01", 690], ["2026-03-01", 716.31]],
  )
})

test("queda no ultimo mes e tratada como proporcional, preservando o valor cheio", () => {
  const contratos = deriveContracts([
    mes("2026-04-01", "ocupado", "Fulano", 400),
    mes("2026-05-01", "ocupado", "Fulano", 400),
    mes("2026-06-01", "em_rescisao", "Fulano", 13.33),
  ])
  assert.deepEqual(
    contratos[0].valores.map((v) => [v.vigenciaInicio, v.valor]),
    [["2026-04-01", 400]],
  )
})

test("contrato sem valor conhecido fica com valores vazios", () => {
  const contratos = deriveContracts([
    mes("2026-01-01", "inadimplente", "Fulano", 0),
    mes("2026-02-01", "inadimplente", "Fulano", 0),
  ])
  assert.equal(contratos.length, 1)
  assert.deepEqual(contratos[0].valores, [])
})

test("fimParaBanco converte fim exclusivo para o ultimo mes coberto", () => {
  assert.equal(fimParaBanco("2026-02-01"), "2026-01-01")
  assert.equal(fimParaBanco(null), null)
})

test("fimDoBanco e fimParaBanco sao inversas", () => {
  assert.equal(fimDoBanco(fimParaBanco("2026-07-01")), "2026-07-01")
})

test("oscilacao pequena no ultimo mes nao e proporcional: o valor mais recente vale", () => {
  // Caso real de uma unidade cujo aluguel varia por centavos mes a mes. Sem
  // limiar, 417,66 depois de 424,28 era lido como saida proporcional e o
  // contrato ficava com o valor de abril, mais antigo.
  const contratos = deriveContracts([
    mes("2026-01-01", "ocupado", "Fulano", 414.86),
    mes("2026-02-01", "ocupado", "Fulano", 414.61),
    mes("2026-03-01", "ocupado", "Fulano", 417.61),
    mes("2026-04-01", "ocupado", "Fulano", 424.28),
    mes("2026-05-01", "ocupado", "Fulano", 417.66),
  ])

  const ultimo = contratos[0].valores[contratos[0].valores.length - 1]
  assert.equal(ultimo.valor, 417.66)
  assert.equal(ultimo.vigenciaInicio, "2026-05-01")
})
