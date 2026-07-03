import assert from "node:assert/strict"
import test from "node:test"
import { classificarLancamento } from "./despesas-locador.ts"

test("classifica comissao e intermediacao nos seus proprios baldes", () => {
  assert.equal(classificarLancamento("COMISSAO DA ADMINISTRADORA"), "comissao")
  assert.equal(classificarLancamento("Comissão 7%"), "comissao")
  assert.equal(classificarLancamento("INTERMEDIACAO 60%"), "intermediacao")
  assert.equal(classificarLancamento("Comissão de intermediação"), "intermediacao")
})

test("classifica taxas, descontos, reembolsos e utilidades como despesa do locador", () => {
  assert.equal(classificarLancamento("TED"), "despesa")
  assert.equal(classificarLancamento("Taxa de transferencia PIX"), "despesa")
  assert.equal(classificarLancamento("REEMBOLSO AO INQUILINO"), "despesa")
  assert.equal(classificarLancamento("DESC. LOCATARIO"), "despesa")
  assert.equal(classificarLancamento("CAGECE agua"), "despesa")
})
