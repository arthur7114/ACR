import assert from "node:assert/strict"
import test from "node:test"
import {
  aggregateSnapshotLines,
  buildPropertyKey,
  calculateOccupancy,
  calculateRentRealization,
  classifyOccupancy,
  normalizePropertyKeyPart,
  reconcileFinancialBridge,
  roundMoney,
} from "./indicadores-domain.ts"

test("normalizePropertyKeyPart remove acentos, normaliza espacos e ignora caixa", () => {
  assert.equal(normalizePropertyKeyPart("  Grand   MessêJANA II  "), "grand messejana ii")
})

test("buildPropertyKey distingue a mesma unidade em empreendimentos diferentes", () => {
  const grandMessejana = buildPropertyKey({
    realEstateAgency: "Alive Imóveis",
    development: "Grand Messejana II",
    unit: "Apto 101",
  })
  const grandCastelao = buildPropertyKey({
    realEstateAgency: "Alive Imóveis",
    development: "Grand Castelão",
    unit: "Apto 101",
  })

  assert.notEqual(grandMessejana, grandCastelao)
})

test("classifyOccupancy prioriza rescisao sobre todos os demais sinais", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: "Airbnb",
      observation: "Imovel vago e inadimplente",
      rentReceived: 1_200,
      hasTermination: true,
      hasDelinquency: true,
      hasVacancy: true,
    }),
    "em_rescisao",
  )
})

test("classifyOccupancy preserva inadimplencia explícita mesmo em imóvel Airbnb", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: "Hospedagem mensal",
      observation: "Locacao Airbnb",
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: true,
      hasVacancy: true,
    }),
    "inadimplente",
  )
})

test("classifyOccupancy não deixa recebimento antigo apagar inadimplencia explícita", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: "Maria",
      observation: null,
      rentReceived: 0.01,
      hasTermination: false,
      hasDelinquency: true,
      hasVacancy: true,
    }),
    "inadimplente",
  )
})

test("classifyOccupancy classifica recebimento positivo como ocupado sem inadimplencia explícita", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: "Maria",
      observation: null,
      rentReceived: 0.01,
      hasTermination: false,
      hasDelinquency: false,
      hasVacancy: false,
    }),
    "ocupado",
  )
})

test("classifyOccupancy prioriza inadimplencia explicita sobre vacancia", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: "Joao",
      observation: "Sem recebimento no mes",
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: true,
      hasVacancy: true,
    }),
    "inadimplente",
  )
})

test("classifyOccupancy classifica vacancia apenas quando ela e explicita", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: null,
      observation: "Imovel desocupado",
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: false,
      hasVacancy: true,
    }),
    "vago",
  )
})

test("classifyOccupancy mantem linha zerada sem evidencia como desconhecida", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: null,
      observation: null,
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: false,
      hasVacancy: false,
    }),
    "desconhecido",
  )
})

test("classifyOccupancy trata receita variavel sem evidencia como ocupada, nao desconhecida", () => {
  // Airbnb (receita variável) sem linha na prestação do mês: o cadastro já sabe
  // que é operação de temporada, então não é dado desconhecido.
  assert.equal(
    classifyOccupancy({
      tenantName: null,
      observation: null,
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: false,
      hasVacancy: false,
      isVariableRevenue: true,
    }),
    "ocupado",
  )
})

test("classifyOccupancy nao deixa receita variavel encobrir vacancia ou inadimplencia explicita", () => {
  assert.equal(
    classifyOccupancy({
      tenantName: null,
      observation: "Imovel desocupado",
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: false,
      hasVacancy: true,
      isVariableRevenue: true,
    }),
    "vago",
  )
  assert.equal(
    classifyOccupancy({
      tenantName: "Airbnb",
      observation: null,
      rentReceived: 0,
      hasTermination: false,
      hasDelinquency: true,
      hasVacancy: false,
      isVariableRevenue: true,
    }),
    "inadimplente",
  )
})

test("aggregateSnapshotLines usa aluguel com desconto e nunca receita total como aluguel", () => {
  const result = aggregateSnapshotLines([
    {
      rent: 1_000,
      discountedRent: 950,
      revenueTotal: 1_100,
      discount: 50,
      administrationCommission: 70,
      assessedTransfer: 980,
    },
    {
      rent: null,
      discountedRent: null,
      revenueTotal: 75,
      discount: null,
      administrationCommission: null,
      assessedTransfer: null,
    },
  ])

  assert.equal(result.rentReceived, 950)
  assert.equal(result.revenueTotal, 1_175)
})

test("aggregateSnapshotLines soma cada campo proprio em varias linhas", () => {
  const result = aggregateSnapshotLines([
    {
      rent: 700,
      discountedRent: null,
      revenueTotal: 800,
      discount: 0,
      administrationCommission: 56,
      assessedTransfer: 744,
    },
    {
      rent: 500,
      discountedRent: 475,
      revenueTotal: 525,
      discount: 25,
      administrationCommission: 38,
      assessedTransfer: 487,
    },
  ])

  assert.equal(result.rentReceived, 1_175)
  assert.equal(result.revenueTotal, 1_325)
  assert.equal(result.discount, 25)
  assert.equal(result.administrationCommission, 94)
  assert.equal(result.assessedTransfer, 1_231)
})

test("aggregateSnapshotLines preserva ausencia como null", () => {
  const result = aggregateSnapshotLines([
    {
      rent: null,
      discountedRent: null,
      revenueTotal: null,
      discount: null,
      administrationCommission: null,
      assessedTransfer: null,
    },
  ])

  assert.equal(result.rentReceived, null)
  assert.equal(result.revenueTotal, null)
  assert.equal(result.discount, null)
  assert.equal(result.administrationCommission, null)
  assert.equal(result.assessedTransfer, null)
})

test("aggregateSnapshotLines preserva zero confirmado como zero", () => {
  const result = aggregateSnapshotLines([
    {
      rent: 900,
      discountedRent: 0,
      revenueTotal: 0,
      discount: 0,
      administrationCommission: 0,
      assessedTransfer: 0,
    },
  ])

  assert.equal(result.rentReceived, 0)
  assert.equal(result.revenueTotal, 0)
  assert.equal(result.discount, 0)
  assert.equal(result.administrationCommission, 0)
  assert.equal(result.assessedTransfer, 0)
})

test("calculateOccupancy exclui desconhecidos do denominador", () => {
  const result = calculateOccupancy([
    "ocupado",
    "inadimplente",
    "em_rescisao",
    "vago",
    "desconhecido",
  ])

  assert.equal(result.occupied, 1)
  assert.equal(result.delinquent, 1)
  assert.equal(result.inTermination, 1)
  assert.equal(result.vacant, 1)
  assert.equal(result.unknown, 1)
  assert.equal(result.numerator, 3)
  assert.equal(result.denominator, 4)
  assert.equal(result.percentage, 75)
})

test("calculateOccupancy retorna percentual null quando nao ha denominador conhecido", () => {
  const result = calculateOccupancy(["desconhecido", "desconhecido"])

  assert.equal(result.numerator, 0)
  assert.equal(result.denominator, 0)
  assert.equal(result.percentage, null)
})

test("reconcileFinancialBridge aceita residuo de ate R$ 0,01", () => {
  const result = reconcileFinancialBridge({
    revenueTotal: 1_000,
    administrationCommission: 100,
    retainedExpenses: 50,
    brokerageCommission: 25,
    assessedTransfer: 825.01,
  })

  assert.equal(result.calculatedTransfer, 825)
  assert.equal(result.residual, -0.01)
  assert.equal(result.isReconciled, true)
  assert.equal(result.hasAlert, false)
})

test("reconcileFinancialBridge alerta residuo acima de R$ 0,01", () => {
  const result = reconcileFinancialBridge({
    revenueTotal: 1_000,
    administrationCommission: 100,
    retainedExpenses: 50,
    brokerageCommission: 25,
    assessedTransfer: 824.98,
  })

  assert.equal(result.calculatedTransfer, 825)
  assert.equal(result.residual, 0.02)
  assert.equal(result.isReconciled, false)
  assert.equal(result.hasAlert, true)
})

test("reconcileFinancialBridge inclui entradas e saídas de passagem e tarifas", () => {
  const result = reconcileFinancialBridge({
    revenueTotal: 1_000,
    passageEntries: 100,
    administrationCommission: 80,
    retainedExpenses: 40,
    bankingFees: 10,
    brokerageCommission: 20,
    passageExits: 100,
    assessedTransfer: 850,
  })

  assert.equal(result.calculatedTransfer, 850)
  assert.equal(result.residual, 0)
  assert.equal(result.isReconciled, true)
})

test("calculateRentRealization calcula outros ajustes e reconcilia o recebido", () => {
  const result = calculateRentRealization({
    contractedRent: 10_000,
    vacancy: 1_000,
    currentDelinquency: 500,
    discounts: 200,
    receivedRent: 8_250,
  })

  assert.equal(result.otherAdjustments, -50)
  assert.equal(result.reconciledReceived, 8_250)
  assert.equal(result.isReconciled, true)
})

test("roundMoney arredonda em centavos sem propagar imprecisao binaria", () => {
  assert.equal(roundMoney(10.005), 10.01)
  assert.equal(roundMoney(-2.675), -2.68)
  assert.equal(roundMoney(0.1 + 0.2), 0.3)
})
