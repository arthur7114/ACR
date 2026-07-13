import assert from "node:assert/strict"
import test from "node:test"
import { calcularIntermediacao } from "./intermediacao"

test("separa IPTU do aluguel sem alterar a base percentual da intermediação", () => {
  const result = calcularIntermediacao({
    valor: 900,
    comissao: 540,
    percentual: null,
    observacao: "INTERMEDIAÇÃO DE ABRIL DE 2026. SEGURO QUITADO. IPTU (5/12). Total R$ 938,08; repasse R$ 398,08.",
  })

  assert.deepEqual(result, {
    baseAluguel: 900,
    iptu: 38.08,
    totalRecebido: 938.08,
    comissao: 540,
    percentual: 60,
    repasse: 398.08,
  })
})

test("mantém o valor como total quando não existe IPTU", () => {
  const result = calcularIntermediacao({
    valor: 1000,
    comissao: 600,
    percentual: 60,
    observacao: "INTERMEDIAÇÃO 60%",
  })

  assert.deepEqual(result, {
    baseAluguel: 1000,
    iptu: 0,
    totalRecebido: 1000,
    comissao: 600,
    percentual: 60,
    repasse: 400,
  })
})

test("soma o IPTU estruturado quando o documento não repete o total", () => {
  const result = calcularIntermediacao({
    valor: 900,
    iptu: 38.08,
    total_recebido: null,
    repasse: null,
    comissao: 540,
    percentual: 60,
    observacao: "INTERMEDIAÇÃO. IPTU R$ 38,08.",
  })

  assert.deepEqual(result, {
    baseAluguel: 900,
    iptu: 38.08,
    totalRecebido: 938.08,
    comissao: 540,
    percentual: 60,
    repasse: 398.08,
  })
})

test("prioriza totais estruturados sobre a observação legada", () => {
  const result = calcularIntermediacao({
    valor: 900,
    iptu: 38.08,
    total_recebido: 938.08,
    repasse: 398.08,
    comissao: 540,
    percentual: 60,
    observacao: "IPTU R$ 10,00. Total R$ 910,00; repasse R$ 370,00.",
  })

  assert.equal(result.iptu, 38.08)
  assert.equal(result.totalRecebido, 938.08)
  assert.equal(result.repasse, 398.08)
})

test("observação malformada não gera valores inválidos", () => {
  const result = calcularIntermediacao({
    valor: 900,
    comissao: 540,
    observacao: "IPTU indisponível. Total R$ --; repasse ilegível.",
  })

  assert.equal(result.iptu, 0)
  assert.equal(result.totalRecebido, 900)
  assert.equal(result.repasse, 360)
})
