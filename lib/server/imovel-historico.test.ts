import assert from "node:assert/strict"
import test from "node:test"

import { acordoParaEvento } from "./imovel-historico.ts"

test("evento de acordo no historico usa os valores resolvidos, nao formula local", () => {
  const evento = acordoParaEvento(
    {
      tipo: "rescisao",
      apto: "12",
      inquilino: "EX-LOCATÁRIO",
      valor: 1890,
      total_recebido: 1663.56,
      comissao: 116.45,
      repasse: 1547.11,
      competencia_original: null,
      competencia_recebimento: "2026-07",
      observacao: null,
      confianca: 0.9,
    },
    "2026-07-01",
    "Julho de 2026",
  )

  assert.equal(evento.total, 1663.56)
  assert.equal(evento.comissao, 116.45)
  assert.equal(evento.repasse, 1547.11)
})

test("evento pendente preserva o bruto sem inventar repasse", () => {
  const evento = acordoParaEvento(
    {
      tipo: "acordo",
      apto: "12",
      inquilino: null,
      valor: 300,
      competencia_original: null,
      competencia_recebimento: "2026-07",
      observacao: null,
      confianca: 0.4,
    },
    "2026-07-01",
    "Julho de 2026",
  )

  assert.equal(evento.total, 300)
  assert.equal(evento.repasse, null)
})
