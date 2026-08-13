import assert from "node:assert/strict"
import test from "node:test"
import {
  canonicalizarCodigoImovel,
  normalizeCodigoImovel,
} from "./codigo-imovel.ts"

test("normaliza revisão contratual GA como o código canônico do imóvel", () => {
  assert.equal(canonicalizarCodigoImovel("GA0002/2"), "GA0002")
  assert.equal(normalizeCodigoImovel("GA0002/2"), normalizeCodigoImovel("GA0002"))
})

test("preserva barra quando ela faz parte de outro formato de unidade", () => {
  assert.notEqual(normalizeCodigoImovel("APTO 101/2"), normalizeCodigoImovel("APTO 101"))
})
