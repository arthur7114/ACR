import assert from "node:assert/strict"
import test from "node:test"
import { proximoVencimento, resolveEgestorDates } from "./egestor.ts"

test("vencimento sem comprovante cai no mes seguinte, no dia configurado", () => {
  // Jose Walter: competencia junho, dia 12 -> 12/julho
  assert.equal(proximoVencimento("2026-06-01", 12), "2026-07-12")
  // Pompilio Gomes: competencia junho, dia 10 -> 10/julho
  assert.equal(proximoVencimento("2026-06-01", 10), "2026-07-10")
})

test("dezembro rola para janeiro do ano seguinte", () => {
  assert.equal(proximoVencimento("2026-12-01", 10), "2027-01-10")
})

test("dia e limitado ao ultimo dia do mes de destino", () => {
  // competencia janeiro -> fevereiro; dia 31 vira 28 (2026 nao e bissexto)
  assert.equal(proximoVencimento("2026-01-01", 31), "2026-02-28")
})

test("sem dia configurado retorna null (mantem competencia no chamador)", () => {
  assert.equal(proximoVencimento("2026-06-01", null), null)
  assert.equal(proximoVencimento("2026-06-01", 0), null)
  assert.equal(proximoVencimento("2026-06-01", 32), null)
})

test("vencimento da prestacao liquida recebimento sem comprovante", () => {
  assert.deepEqual(
    resolveEgestorDates({
      tipo: "recebimento",
      competencia: "2026-07-01",
      diaVencimentoPadrao: null,
      repasseDate: null,
      statementDueDate: "2026-08-10",
    }),
    {
      dtVenc: "2026-08-10",
      dtCred: "2026-08-10",
      dtPgto: "2026-08-10",
      liquidado: true,
    },
  )
})

test("comprovante prevalece no credito e pagamento, sem mudar vencimento documental", () => {
  assert.deepEqual(
    resolveEgestorDates({
      tipo: "recebimento",
      competencia: "2026-07-01",
      diaVencimentoPadrao: 10,
      repasseDate: "2026-08-12",
      statementDueDate: "2026-08-10",
    }),
    {
      dtVenc: "2026-08-10",
      dtCred: "2026-08-12",
      dtPgto: "2026-08-12",
      liquidado: true,
    },
  )
})

test("vencimento da prestacao nao liquida pagamentos sem comprovante", () => {
  assert.deepEqual(
    resolveEgestorDates({
      tipo: "pagamento",
      competencia: "2026-07-01",
      diaVencimentoPadrao: 10,
      repasseDate: null,
      statementDueDate: "2026-08-10",
    }),
    {
      dtVenc: "2026-08-10",
      dtCred: "2026-07-01",
      dtPgto: "",
      liquidado: false,
    },
  )
})
