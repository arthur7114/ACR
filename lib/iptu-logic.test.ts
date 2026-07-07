import assert from "node:assert/strict"
import test from "node:test"
import {
  IPTU_PARCELAS_PADRAO,
  calcularNovasParcelas,
  calcularResponsavel,
  calcularStatusParcela,
  detectarConflitos,
  gerarParcelasImovel,
  planejarAjusteParcelas,
  resolverImovelId,
  validarBaixa,
  validarEdicaoParcela,
} from "./iptu-logic.ts"

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

// --- Contas a pagar ---

test("calcularStatusParcela: parcela com baixa e paga", () => {
  assert.equal(
    calcularStatusParcela({ dataBaixa: "2026-03-10", dataVencimento: "2026-03-15" }, "2026-07-07"),
    "pago",
  )
})

test("calcularStatusParcela: sem baixa e vencimento passado e vencida", () => {
  assert.equal(
    calcularStatusParcela({ dataBaixa: null, dataVencimento: "2026-06-30" }, "2026-07-07"),
    "vencido",
  )
})

test("calcularStatusParcela: vencimento hoje conta como aberta", () => {
  assert.equal(
    calcularStatusParcela({ dataBaixa: null, dataVencimento: "2026-07-07" }, "2026-07-07"),
    "aberto",
  )
})

test("calcularStatusParcela: vencimento futuro e aberta", () => {
  assert.equal(
    calcularStatusParcela({ dataBaixa: null, dataVencimento: "2026-08-01" }, "2026-07-07"),
    "aberto",
  )
})

test("calcularStatusParcela: sem vencimento e sem baixa e aberta", () => {
  assert.equal(calcularStatusParcela({ dataBaixa: null, dataVencimento: null }, "2026-07-07"), "aberto")
})

test("gerarParcelasImovel: gera parcelas numeradas com valor padrao", () => {
  const parcelas = gerarParcelasImovel({
    numeroParcelas: 3,
    vencimentos: ["2026-01-10", "2026-02-10", "2026-03-10"],
    valorPadrao: 150.5,
    responsavel: "inquilino",
  })
  assert.equal(parcelas.length, 3)
  assert.deepEqual(
    parcelas.map((p) => p.numero),
    [1, 2, 3],
  )
  assert.equal(parcelas[0].data_vencimento, "2026-01-10")
  assert.equal(parcelas[1].valor_previsto, 150.5)
  assert.equal(parcelas[2].responsavel, "inquilino")
})

test("gerarParcelasImovel: valor padrao ausente vira zero", () => {
  const parcelas = gerarParcelasImovel({ numeroParcelas: 1, vencimentos: ["2026-01-10"] })
  assert.equal(parcelas[0].valor_previsto, 0)
  assert.equal(parcelas[0].responsavel, null)
})

test("gerarParcelasImovel: quantidade de vencimentos diferente do numero lanca", () => {
  assert.throws(() => gerarParcelasImovel({ numeroParcelas: 2, vencimentos: ["2026-01-10"] }))
})

test("detectarConflitos: retorna imoveis que ja tem carne no ano", () => {
  const existentes = [
    { imovel_id: "a", ano_referencia: 2026 },
    { imovel_id: "b", ano_referencia: 2025 },
  ]
  assert.deepEqual(detectarConflitos(existentes, ["a", "b", "c"], 2026), ["a"])
})

test("detectarConflitos: sem conflitos retorna vazio", () => {
  const existentes = [{ imovel_id: "a", ano_referencia: 2025 }]
  assert.deepEqual(detectarConflitos(existentes, ["a", "b"], 2026), [])
})

test("validarBaixa: data ausente lanca", () => {
  assert.throws(() => validarBaixa({ dataBaixa: null, valorPago: 100 }))
})

test("validarBaixa: valor negativo lanca", () => {
  assert.throws(() => validarBaixa({ dataBaixa: "2026-07-07", valorPago: -1 }))
})

test("validarBaixa: valida com data e valor >= 0", () => {
  assert.doesNotThrow(() => validarBaixa({ dataBaixa: "2026-07-07", valorPago: 0 }))
})

test("validarEdicaoParcela: vencimento vazio lanca", () => {
  assert.throws(() => validarEdicaoParcela({ dataVencimento: "" }))
})

test("validarEdicaoParcela: valor negativo lanca", () => {
  assert.throws(() => validarEdicaoParcela({ valorPrevisto: -5 }))
})

test("validarEdicaoParcela: campos ausentes nao lancam", () => {
  assert.doesNotThrow(() => validarEdicaoParcela({}))
})

test("planejarAjusteParcelas: aumentar cria somente as parcelas adicionais", () => {
  const atuais = [
    { id: "1", numero: 1, pago: true, dataBaixa: "2026-01-10" },
    { id: "2", numero: 2, pago: false, dataBaixa: null },
  ]
  const plano = planejarAjusteParcelas(atuais, 4)
  assert.deepEqual(plano.criar, [3, 4])
  assert.deepEqual(plano.remover, [])
})

test("planejarAjusteParcelas: reduzir remove apenas futuras nao pagas", () => {
  const atuais = [
    { id: "1", numero: 1, pago: true, dataBaixa: "2026-01-10" },
    { id: "2", numero: 2, pago: false, dataBaixa: null },
    { id: "3", numero: 3, pago: false, dataBaixa: null },
  ]
  const plano = planejarAjusteParcelas(atuais, 1)
  assert.deepEqual(plano.criar, [])
  assert.deepEqual(plano.remover, ["2", "3"])
})

test("planejarAjusteParcelas: bloqueia reducao abaixo de parcela paga", () => {
  const atuais = [
    { id: "1", numero: 1, pago: false, dataBaixa: null },
    { id: "2", numero: 2, pago: true, dataBaixa: "2026-02-10" },
  ]
  assert.throws(() => planejarAjusteParcelas(atuais, 1))
})
