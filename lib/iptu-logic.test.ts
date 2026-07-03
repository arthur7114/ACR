import assert from "node:assert/strict"
import test from "node:test"
import { IPTU_PARCELAS_PADRAO, calcularNovasParcelas, calcularResponsavel, resolverImovelId } from "./iptu-logic.ts"

test("IPTU_PARCELAS_PADRAO e 10", () => {
  assert.equal(IPTU_PARCELAS_PADRAO, 10)
})

test("calcularResponsavel: ocupado, inadimplente e em_negociacao sao do inquilino", () => {
  assert.equal(calcularResponsavel("ocupado"), "inquilino")
  assert.equal(calcularResponsavel("inadimplente"), "inquilino")
  assert.equal(calcularResponsavel("em_negociacao"), "inquilino")
})

test("calcularResponsavel: vago e em_rescisao sao do proprietario", () => {
  assert.equal(calcularResponsavel("vago"), "proprietario")
  assert.equal(calcularResponsavel("em_rescisao"), "proprietario")
})

test("calcularResponsavel: inativo nao determina automaticamente", () => {
  assert.equal(calcularResponsavel("inativo"), null)
})

test("calcularNovasParcelas: delta positivo gera os numeros novos em ordem", () => {
  const r = calcularNovasParcelas(3, 6, 10)
  assert.deepEqual(r.numerosNovos, [4, 5, 6])
  assert.equal(r.anomalia, null)
})

test("calcularNovasParcelas: delta zero e idempotente (reimportacao)", () => {
  const r = calcularNovasParcelas(5, 5, 10)
  assert.deepEqual(r.numerosNovos, [])
  assert.equal(r.anomalia, null)
})

test("calcularNovasParcelas: delta negativo e anomalia de regressao, sem gerar parcelas", () => {
  const r = calcularNovasParcelas(6, 4, 10)
  assert.deepEqual(r.numerosNovos, [])
  assert.equal(r.anomalia, "regressao")
})

test("calcularNovasParcelas: informado excede numero_parcelas do carne, capa no limite", () => {
  const r = calcularNovasParcelas(8, 12, 10)
  assert.deepEqual(r.numerosNovos, [9, 10])
  assert.equal(r.anomalia, "excede_carne")
})

test("resolverImovelId: encontra por imobiliaria+empreendimento+unidade exatos", () => {
  const imoveis = [
    { id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" },
    { id: "im-2", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP02" },
  ]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "AP02"), "im-2")
})

test("resolverImovelId: nao encontrado retorna null", () => {
  const imoveis = [{ id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" }]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "AP99"), null)
})

test("resolverImovelId: ignora espacos ao redor da unidade", () => {
  const imoveis = [{ id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" }]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "  AP01  "), "im-1")
})
