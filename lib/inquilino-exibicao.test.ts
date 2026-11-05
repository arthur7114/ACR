import assert from "node:assert/strict"
import test from "node:test"
import { inquilinoParaCadastro, inquilinoParaExibir, pareceIdentificacaoDoImovel } from "./inquilino-exibicao.ts"

test("troca o endereco extraido pelo inquilino do cadastro", () => {
  assert.equal(inquilinoParaExibir("RUA EXEMPLO,230", "EMPRESA LOCATARIA LTDA"), "EMPRESA LOCATARIA LTDA")
  assert.equal(inquilinoParaExibir("RUA MODELO,100 APART. A", "FULANO DE TAL"), "FULANO DE TAL")
})

test("mantem o nome do documento, mesmo divergente do cadastro", () => {
  assert.equal(inquilinoParaExibir("MARIA SILVA", "JOSE SOUZA"), "MARIA SILVA")
})

test("mantem o endereco quando o cadastro nao tem nome", () => {
  assert.equal(inquilinoParaExibir("RUA EXEMPLO,230", null), "RUA EXEMPLO,230")
  assert.equal(inquilinoParaExibir("RUA EXEMPLO,230", "  "), "RUA EXEMPLO,230")
})

test("linha sem inquilino nao herda o cadastro", () => {
  assert.equal(inquilinoParaExibir("", "EMPRESA LOCATARIA LTDA"), null)
  assert.equal(inquilinoParaExibir(null, "EMPRESA LOCATARIA LTDA"), null)
})

test("nao grava endereco como inquilino no cadastro", () => {
  assert.equal(inquilinoParaCadastro("RUA EXEMPLO,240"), null)
  assert.equal(inquilinoParaCadastro(" EMPRESA LOCATARIA LTDA "), "EMPRESA LOCATARIA LTDA")
})

test("reconhece endereco por ter numero", () => {
  assert.equal(pareceIdentificacaoDoImovel("Galpão na Av. Exemplo 207, Fortaleza-CE"), true)
  assert.equal(pareceIdentificacaoDoImovel("CICRANO DA SILVA"), false)
})
