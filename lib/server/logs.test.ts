import assert from "node:assert/strict"
import test from "node:test"
import { mesclarLogs } from "./logs.ts"

test("mescla correcoes e notificacoes ordenadas por data decrescente", () => {
  const correcoes = [
    { id: "c1", campo_alterado: "valor_repasse", valor_anterior: "100", valor_novo: "120", usuario: "ana@acr.com", justificativa: "ajuste manual", criado_em: "2026-07-01T10:00:00Z" },
  ]
  const notificacoes = [
    { id: "n1", tipo: "analise_concluida", titulo: "Análise concluída", corpo: "Fechamento X processado", criado_em: "2026-07-02T09:00:00Z" },
  ]
  const result = mesclarLogs(correcoes, notificacoes)
  assert.equal(result.length, 2)
  assert.equal(result[0].id, "n1")
  assert.equal(result[0].tipo, "notificacao")
  assert.equal(result[1].id, "c1")
  assert.equal(result[1].tipo, "correcao")
  assert.match(result[1].detalhe, /valor_repasse/)
  assert.match(result[1].detalhe, /ana@acr\.com/)
})

test("retorna lista vazia quando nao ha logs", () => {
  assert.deepEqual(mesclarLogs([], []), [])
})
