import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { authorizeRequest, hasExplicitRole, parseUserRole } from "./authz.ts"

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

test("conta sem perfil explicito nao e reconhecida", () => {
  assert.equal(hasExplicitRole(undefined), false)
  assert.equal(hasExplicitRole("superuser"), false)
  assert.equal(hasExplicitRole("visualizador"), true)
  assert.equal(hasExplicitRole("admin"), true)
})

test("toda rota de API confere perfil dentro do proprio handler", () => {
  const rotas: string[] = []
  const varrer = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, item.name)
      if (item.isDirectory()) varrer(caminho)
      else if (item.name === "route.ts") rotas.push(caminho)
    }
  }
  varrer(join(process.cwd(), "app", "api"))
  assert.ok(rotas.length > 0)

  for (const rota of rotas) {
    const fonte = readFileSync(rota, "utf8")
    const handlers = fonte.match(/export async function (GET|POST|PATCH|PUT|DELETE)\(/g) ?? []
    const guardas = fonte.match(/await requireApiRole\("(visualizador|operador|aprovador|admin)"\)/g) ?? []
    assert.equal(guardas.length, handlers.length, `${rota}: ${handlers.length} handlers, ${guardas.length} guardas`)
  }
})

test("guarda das rotas sensiveis exige o perfil certo", () => {
  const ler = (...partes: string[]) => readFileSync(join(process.cwd(), "app", "api", ...partes, "route.ts"), "utf8")
  assert.match(ler("admin", "usuarios"), /requireApiRole\("admin"\)/)
  assert.doesNotMatch(ler("admin", "usuarios"), /requireApiRole\("(visualizador|operador|aprovador)"\)/)
  assert.match(ler("fechamentos", "[id]", "aprovar"), /requireApiRole\("aprovador"\)/)
  assert.doesNotMatch(ler("egestor", "config"), /requireApiRole\("(visualizador|operador|aprovador)"\)/)
})
