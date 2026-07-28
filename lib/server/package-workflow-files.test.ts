import assert from "node:assert/strict"
import test from "node:test"
import { describeDocumentProcessingError, readAndValidateFiles } from "./package-workflow.ts"

test("normaliza PDF valido quando o navegador envia MIME vazio", async () => {
  const file = new File(["%PDF-1.4\n%%EOF"], "prestacao.pdf", { type: "" })
  const [document] = await readAndValidateFiles([file])
  assert.equal(document.fileType, "application/pdf")
})

test("bloqueia arquivo com extensao PDF e conteudo invalido antes da IA", async () => {
  const file = new File(["conteudo que nao e pdf"], "prestacao.pdf", { type: "application/pdf" })
  await assert.rejects(
    readAndValidateFiles([file]),
    /prestacao\.pdf não contém um PDF válido/,
  )
})

test("normaliza XLSX valido quando o navegador envia MIME vazio", async () => {
  const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], "prestacao.xlsx", { type: "" })
  const [document] = await readAndValidateFiles([file])
  assert.equal(document.fileType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
})

test("traduz rejeicao de arquivo da IA e identifica o documento", () => {
  const result = describeDocumentProcessingError(
    new Error("400 The file you uploaded is badly formatted or corrupted."),
    "prestacao-maio.pdf",
  )
  assert.match(result.message, /Não foi possível ler "prestacao-maio\.pdf"/)
  assert.doesNotMatch(result.message, /The file you uploaded/)
})
