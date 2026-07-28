import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDocumentHashPlan,
  type HashedDocument,
} from "./backfill-document-hashes.ts"

function document(
  id: string,
  fechamentoId: string,
  sha256: string,
  criadoEm: string,
): HashedDocument {
  return {
    id,
    fechamento_id: fechamentoId,
    arquivo_url: `alive-gmii/${id}.pdf`,
    nome_arquivo: `${id}.pdf`,
    mime_type: "application/pdf",
    tamanho_bytes: 100,
    tamanho_real: 100,
    criado_em: criadoEm,
    sha256,
  }
}

test("preserva redundante no mesmo fechamento e aponta para o canônico", () => {
  const plan = buildDocumentHashPlan([
    document("doc-2", "fechamento-1", "a".repeat(64), "2026-01-02"),
    document("doc-1", "fechamento-1", "a".repeat(64), "2026-01-01"),
  ])

  assert.deepEqual(
    plan.map((item) => ({
      id: item.id,
      duplicadoDe: item.duplicado_de_id,
      fonte: item.fonte_arquivo_url,
    })),
    [
      {
        id: "doc-1",
        duplicadoDe: null,
        fonte: "alive-gmii/doc-1.pdf",
      },
      {
        id: "doc-2",
        duplicadoDe: "doc-1",
        fonte: "alive-gmii/doc-1.pdf",
      },
    ],
  )
})

test("compartilha a fonte sem marcar documentos de fechamentos distintos como redundantes", () => {
  const plan = buildDocumentHashPlan([
    document("doc-1", "fechamento-1", "b".repeat(64), "2026-01-01"),
    document("doc-2", "fechamento-2", "b".repeat(64), "2026-02-01"),
  ])

  assert.equal(plan[0].duplicado_de_id, null)
  assert.equal(plan[1].duplicado_de_id, null)
  assert.equal(plan[0].fonte_arquivo_url, plan[1].fonte_arquivo_url)
})

test("conteúdos distintos nunca compartilham fonte", () => {
  const plan = buildDocumentHashPlan([
    document("doc-1", "fechamento-1", "a".repeat(64), "2026-01-01"),
    document("doc-2", "fechamento-1", "b".repeat(64), "2026-01-01"),
  ])

  assert.notEqual(plan[0].fonte_arquivo_url, plan[1].fonte_arquivo_url)
  assert.equal(plan.every((item) => item.duplicado_de_id === null), true)
})
