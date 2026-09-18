import assert from "node:assert/strict"
import test from "node:test"

import { aluguelCheioDoProporcional, contratosNovosDoFechamento } from "./contrato-novo-cadastro"

// Canários ago/2026 (validação de 2026-09-17): o proporcional declarado revela o
// aluguel cheio do contrato novo, e o cadastro ainda tinha o valor do inquilino
// anterior. LOCMAIS Galpão 02: 1.121,61 = 19/31 × 1.830,00 (cadastro 1.700).
// GM II 26: 474,19 = 21/31 × 700,00 (cadastro 660).
const linha = (apto: string, inquilino: string, aluguel: number, observacao: string) => ({
  apto, inquilino, aluguel, observacao,
})

test("aluguel cheio a partir do proporcional: inteiro quando reproduz o valor, centavos quando não", () => {
  assert.equal(aluguelCheioDoProporcional(1121.61, 19, 31), 1830)
  assert.equal(aluguelCheioDoProporcional(474.19, 21, 31), 700)
  assert.equal(aluguelCheioDoProporcional(22.58, 1, 31), 700)
  // Contrato com centavos: 690,63 × 21/31 = 467,85; 691 inteiro daria 468,10.
  // Centavos são ambíguos (690,63 e 690,64 produzem o mesmo 467,85): qualquer
  // um que reproduza serve, e o primeiro mês cheio corrige.
  const centavos = aluguelCheioDoProporcional(467.85, 21, 31)
  assert.ok(centavos !== null && Math.abs(centavos - 690.63) <= 0.01, String(centavos))
  assert.equal(aluguelCheioDoProporcional(0, 21, 31), null)
  assert.equal(aluguelCheioDoProporcional(474.19, 31, 31), null)
})

test("GM II ago/2026: proporcionais de contrato novo e intermediações viram aluguel cheio; rescisão e inadimplência não", () => {
  const itens = contratosNovosDoFechamento(
    {
      receitas_por_imovel: [
        linha("26", "SAMUEL VALENTE CORREIA", 474.19, "PROPORCIONAL DE 21 DIAS (11/08 A 31/08). IPTU (8/12). SEGURO (1/1)."),
        linha("12", "FRANCISCO IRANCESAR BRAGA RIOS", 22.58, "PROPORCIONAL DE 01 DIAS (31/08). IPTU (8/12)."),
        linha("11", "ALFREDO BEZERRA DE HOLANDA NETO", 44.59, "RESCISÃO. PROPORCIONAL DE 02 DIAS (01/08 A 02/08). IPTU (8/12)."),
        linha("25", "GEISA SILVA MOURA", 0, "INADIMPLÊNCIA"),
        linha("3", "VITOR SOUSA PINTO", 0, "INTERMEDIAÇÃO"),
        linha("6", "", 0, "DESOCUPADO"),
        linha("17", "ANDRÉ CASSIANO ALCANTARA", 655.96, "IPTU (8/12). SEGURO (1/1)."),
      ],
      acordos_rescisoes_recebidos: [
        { tipo: "intermediacao", apto: "3", inquilino: "VITOR SOUSA PINTO", valor: 700 },
        { tipo: "rescisao", apto: "11", inquilino: "ALFREDO BEZERRA DE HOLANDA NETO", valor: 1175 },
      ],
    },
    "2026-08-01",
    [],
  )
  assert.deepEqual(
    itens.map((i) => `${i.apto} ${i.inquilino} ${i.valorNovo} ${i.origem}`),
    ["26 SAMUEL VALENTE CORREIA 700 proporcional", "12 FRANCISCO IRANCESAR BRAGA RIOS 700 proporcional", "3 VITOR SOUSA PINTO 700 intermediacao"],
  )
  assert.equal(itens[0].vigencia, "2026-08-01")
})

test("LOCMAIS ago/2026: proporcional com isenção ainda revela o aluguel cheio", () => {
  const [item] = contratosNovosDoFechamento(
    {
      receitas_por_imovel: [
        { apto: "GALPÃO 02", inquilino: "J MAIS DISTRIBUIDORA DE ALIMENTOS LTDA", aluguel: 1121.61, observacao: "PROPORCIONAL DE 19 DIAS (13/08 A 31/08). ISENÇÃO DO ALUGUEL POR 30 DIAS (DE 13/08 A 13/09). SEGURO (1/1)." },
      ],
      acordos_rescisoes_recebidos: [],
    },
    "2026-08-01",
    [],
  )
  assert.equal(item.apto, "GALPÃO 02")
  assert.equal(item.valorNovo, 1830)
})

test("primeiro mês cheio de inquilino novo confirma o aluguel; mesmo inquilino com valor novo é reajuste, não contrato", () => {
  const itens = contratosNovosDoFechamento(
    {
      receitas_por_imovel: [
        linha("26", "SAMUEL VALENTE CORREIA", 700, "IPTU (9/12). SEGURO QUITADO."),
        linha("17", "ANDRÉ CASSIANO ALCANTARA", 680, "IPTU (9/12)."),
        linha("2", "LUIS AUGUSTO ATAIDE BORGES", 690.63, "IPTU (9/12)."),
      ],
      acordos_rescisoes_recebidos: [],
    },
    "2026-09-01",
    [
      { apto: "26", inquilino: "CIBELLY RIANE FERREIRA CARVALHO", statusOcupacao: "vago" },
      { apto: "17", inquilino: "ANDRÉ CASSIANO ALCANTARA", statusOcupacao: "ocupado" },
      { apto: "2", inquilino: "LUIS AUGUSTO ATAIDE BORGES", statusOcupacao: "ocupado" },
    ],
  )
  assert.deepEqual(itens.map((i) => `${i.apto} ${i.valorNovo} ${i.origem}`), ["26 700 primeiro_mes_cheio"])
})

test("sem mês anterior conhecido, mês cheio não afirma contrato novo", () => {
  const itens = contratosNovosDoFechamento(
    { receitas_por_imovel: [linha("26", "SAMUEL VALENTE CORREIA", 700, "IPTU (9/12).")], acordos_rescisoes_recebidos: [] },
    "2026-09-01",
    [],
  )
  assert.deepEqual(itens, [])
})
