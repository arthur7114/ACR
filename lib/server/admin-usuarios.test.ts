import assert from "node:assert/strict"
import test from "node:test"
import { validarNovoUsuario, validarPerfilUsuario, gerarSenhaTemporaria } from "./admin-usuarios.ts"

test("valida email e usa senha temporaria quando senha nao informada", () => {
  const result = validarNovoUsuario({ email: "novo@acr.com", senha: undefined })
  assert.equal(result.email, "novo@acr.com")
  assert.equal(result.senha.length >= 10, true)
})

test("rejeita email vazio", () => {
  assert.throws(() => validarNovoUsuario({ email: "", senha: undefined }), /e-mail/i)
})

test("rejeita email sem @", () => {
  assert.throws(() => validarNovoUsuario({ email: "sem-arroba.com", senha: undefined }), /e-mail/i)
})

test("gerarSenhaTemporaria gera senhas diferentes a cada chamada", () => {
  const a = gerarSenhaTemporaria()
  const b = gerarSenhaTemporaria()
  assert.equal(a.length, 12)
  assert.notEqual(a, b)
})

test("valida perfis permitidos e rejeita valores desconhecidos", () => {
  assert.equal(validarPerfilUsuario("aprovador"), "aprovador")
  assert.throws(() => validarPerfilUsuario("superuser"), /perfil/i)
})
