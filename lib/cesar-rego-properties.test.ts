import assert from "node:assert/strict"
import test from "node:test"
import {
  findCesarRegoPropertyScopeConflict,
  getCesarRegoDevelopmentByPropertyCode,
} from "./cesar-rego-properties.ts"

test("identifica o empreendimento canônico dos imóveis César Rêgo", () => {
  assert.equal(getCesarRegoDevelopmentByPropertyCode("0002520"), "João Cordeiro")
  assert.equal(getCesarRegoDevelopmentByPropertyCode("2521"), "João Cordeiro")
  assert.equal(getCesarRegoDevelopmentByPropertyCode("0002526"), "Galpão Pompílio Gomes")
  assert.equal(getCesarRegoDevelopmentByPropertyCode("2527"), "Galpão Pompílio Gomes")
  assert.equal(getCesarRegoDevelopmentByPropertyCode("101"), null)
})

test("bloqueia a criação de imóvel César Rêgo no empreendimento errado", () => {
  assert.deepEqual(
    findCesarRegoPropertyScopeConflict({
      agencyName: "Cesar Rego Imoveis",
      developmentName: "Galpão Pompilio Gomes",
      propertyCode: "0002520",
    }),
    {
      propertyCode: "0002520",
      expectedDevelopment: "João Cordeiro",
    },
  )
  assert.equal(
    findCesarRegoPropertyScopeConflict({
      agencyName: "César Rêgo Imóveis",
      developmentName: "João Cordeiro",
      propertyCode: "2520",
    }),
    null,
  )
  assert.equal(
    findCesarRegoPropertyScopeConflict({
      agencyName: "Alive Imóveis",
      developmentName: "Grand Messejana II",
      propertyCode: "0002520",
    }),
    null,
  )
})
