import assert from "node:assert/strict"
import test from "node:test"
import { parseSubmittedFechamentoId } from "./fechamento-context-server.ts"

test("aceita somente UUID do fechamento e ignora nomes enviados pelo cliente", () => {
  const id = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"
  assert.equal(parseSubmittedFechamentoId(JSON.stringify({ id, imobiliariaNome: "forjado" })), id)
})

test("rejeita contexto malformado", () => {
  assert.equal(parseSubmittedFechamentoId("{}"), null)
  assert.equal(parseSubmittedFechamentoId("nao-json"), null)
  assert.equal(parseSubmittedFechamentoId(null), null)
})
