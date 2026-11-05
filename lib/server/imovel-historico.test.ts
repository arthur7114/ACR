import assert from "node:assert/strict"
import test from "node:test"

import { acordoParaEvento, eventosDeContrato } from "./imovel-historico.ts"

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

test("contrato vira evento de inicio e de fim no mes de cada data, com a data exata", () => {
  const eventos = eventosDeContrato(
    [
      { id: "a", imovel_id: "i", locatario: "ANA", inicio: "2024-01-01", termino: "2026-07-30", fonte: "Planilha" },
      { id: "b", imovel_id: "i", locatario: "ANA", inicio: "2026-07-31", termino: "2029-07-30", fonte: null },
    ],
    "2026-10-06",
  )
  assert.deepEqual(
    eventos.map((e) => [e.tipo, e.competencia]),
    [
      ["contrato_inicio", "2024-01-01"],
      ["contrato_fim", "2026-07-01"],
      ["contrato_inicio", "2026-07-01"],
      ["contrato_fim", "2029-07-01"],
    ],
  )
  assert.match(eventos[0].observacao ?? "", /Início em 01\/01\/24, com término previsto em 30\/07\/26\. Fonte: Planilha/)
  assert.match(eventos[1].observacao ?? "", /^Prazo terminou em 30\/07\/26/)
  assert.match(eventos[3].observacao ?? "", /^Término previsto em 30\/07\/29/)
  assert.equal(eventos[0].inquilino, "ANA")
})

test("contrato sem termino so tem evento de inicio", () => {
  const eventos = eventosDeContrato([{ id: "a", imovel_id: "i", locatario: null, inicio: "2025-05-10", termino: null, fonte: null }], "2026-10-06")
  assert.deepEqual(eventos.map((e) => e.tipo), ["contrato_inicio"])
  assert.equal(eventos[0].observacao, "Início em 10/05/25")
})
