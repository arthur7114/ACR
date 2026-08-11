import assert from "node:assert/strict"
import test from "node:test"
import { dedupeDocumentsByHash, enforceClassificationConfidence, mergeRepasses } from "./package-workflow.ts"

test("classificacao abaixo de 80% fica pendente em vez de alimentar o parser errado", () => {
  const result = enforceClassificationConfidence({
    fileName: "duplicado.pdf",
    fileType: "application/pdf",
    fileSize: 10,
    documentType: "prestacao_contas",
    confidence: 0.79,
    reason: "incerto",
  })
  assert.equal(result.documentType, "desconhecido")
  assert.match(result.reason, /limiar/)
})

test("dois comprovantes parciais sao somados sem perder observacoes", () => {
  const base = {
    data: "2026-08-10",
    origem_nome: "Imobiliaria",
    destino_nome: "Locador",
    destino_banco: "Banco",
    destino_agencia: "1",
    destino_conta: "2",
    protocolo: "p1",
    campos_ausentes: [] as string[],
    observacoes: ["primeiro"],
    confianca_geral: 0.99,
  }
  const result = mergeRepasses({ ...base, valor: 10.01 }, { ...base, valor: 5.55, protocolo: "p2", observacoes: ["segundo"] })
  assert.equal(result.valor, 15.56)
  assert.equal(result.protocolo, null)
  assert.deepEqual(result.observacoes.slice(0, 2), ["primeiro", "segundo"])
})

test("arquivo repetido dentro da mesma remessa entra uma unica vez", () => {
  const first = { id: "primeiro", fileBuffer: Buffer.from("igual") }
  const duplicate = { id: "duplicado", fileBuffer: Buffer.from("igual") }
  const other = { id: "outro", fileBuffer: Buffer.from("diferente") }
  assert.deepEqual(dedupeDocumentsByHash([first, duplicate, other]).map((item) => item.id), ["primeiro", "outro"])
})
