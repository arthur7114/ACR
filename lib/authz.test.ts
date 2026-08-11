import assert from "node:assert/strict"
import test from "node:test"
import { authorizeRequest, parseUserRole } from "./authz.ts"

test("perfil ausente ou invalido recebe acesso somente de leitura", () => {
  assert.equal(parseUserRole(undefined), "visualizador")
  assert.equal(parseUserRole("superuser"), "visualizador")
  assert.equal(authorizeRequest("visualizador", "GET", "/api/fechamentos").allowed, true)
  assert.equal(authorizeRequest("visualizador", "POST", "/api/fechamentos").allowed, false)
})

test("operador pode processar, mas nao aprovar nem administrar", () => {
  assert.equal(authorizeRequest("operador", "POST", "/api/fechamentos/process").allowed, true)
  assert.equal(authorizeRequest("operador", "POST", "/api/fechamentos/abc/aprovar").allowed, false)
  assert.equal(authorizeRequest("operador", "GET", "/api/admin/usuarios").allowed, false)
  assert.equal(authorizeRequest("operador", "PATCH", "/api/egestor/config").allowed, false)
})

test("aprovador aprova e admin acessa configuracoes", () => {
  assert.equal(authorizeRequest("aprovador", "POST", "/api/fechamentos/abc/aprovar").allowed, true)
  assert.equal(authorizeRequest("admin", "GET", "/api/admin/usuarios").allowed, true)
  assert.equal(authorizeRequest("admin", "PATCH", "/api/egestor/config").allowed, true)
})

test("marcar notificacoes como lidas e permitido a todos os perfis", () => {
  assert.equal(authorizeRequest("visualizador", "POST", "/api/notificacoes/marcar-lidas").allowed, true)
})
