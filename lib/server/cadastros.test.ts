import assert from "node:assert/strict"
import test from "node:test"
import { matchesEmpreendimento, normalizeCadastroKey } from "./cadastros.ts"

test("normalizeCadastroKey ignora acentos, caixa e espacos duplicados", () => {
  assert.equal(normalizeCadastroKey("Locmais"), "locmais")
  assert.equal(normalizeCadastroKey("  LOCMAIS  II "), "locmais ii")
  assert.equal(normalizeCadastroKey(null), "")
})

test("matchesEmpreendimento casa pelo nome normalizado", () => {
  const row = { nome: "Locmais", aliases: [] }
  assert.equal(matchesEmpreendimento(row, "LOCMAIS"), true)
  assert.equal(matchesEmpreendimento(row, "locmais"), true)
  assert.equal(matchesEmpreendimento(row, "Grand Messejana I"), false)
})

// Caso real: "LOCMAIS II" deve resolver para o mesmo registro de "Locmais"
// (mesma regra comercial), em vez de criar um empreendimento novo sem taxas.
test("matchesEmpreendimento casa via alias cadastrado", () => {
  const row = { nome: "Locmais", aliases: ["LOCMAIS II"] }
  assert.equal(matchesEmpreendimento(row, "LOCMAIS II"), true)
  assert.equal(matchesEmpreendimento(row, "locmais ii"), true)
})

test("matchesEmpreendimento nao casa uma variacao sem alias cadastrado", () => {
  const row = { nome: "Locmais", aliases: [] }
  assert.equal(matchesEmpreendimento(row, "LOCMAIS II"), false)
})

test("matchesEmpreendimento tolera aliases ausentes (undefined/null)", () => {
  assert.equal(matchesEmpreendimento({ nome: "Locmais" }, "LOCMAIS II"), false)
  assert.equal(matchesEmpreendimento({ nome: "Locmais", aliases: null }, "LOCMAIS II"), false)
})
