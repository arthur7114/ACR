import assert from "node:assert/strict"
import test from "node:test"
import type { PrestacaoRecheck } from "@/lib/prestacao-types"
import { derivePendencias, getValidationSummary } from "./revisao-pendencias.ts"

function check(partial: Partial<PrestacaoRecheck> & Pick<PrestacaoRecheck, "id" | "status">): PrestacaoRecheck {
  return {
    label: partial.id,
    message: "",
    ...partial,
  } as PrestacaoRecheck
}

// Cenário legado: documentos opcionais e despesas zeradas chegaram a ser
// persistidos como warnings. Eles permanecem auditáveis no banco, mas não são
// trabalho operacional e não devem poluir a revisão.
const GMII_JUNHO: PrestacaoRecheck[] = [
  check({ id: "despesas_confidence", status: "warning" }),
  check({ id: "reajuste_confidence", status: "warning" }),
  check({ id: "optional_despesas_comprovantes", status: "warning" }),
  check({ id: "optional_relatorio_reajuste", status: "warning" }),
  check({ id: "total_despesas", status: "warning" }),
  check({ id: "total_linhas_receitas", status: "warning" }),
  check({ id: "repasse_conciliation", status: "passed" }),
  check({ id: "rows_present", status: "passed" }),
]

test("alerta nao bloqueante nunca aparece: nem em lista, nem em contagem", () => {
  const summary = getValidationSummary(GMII_JUNHO)
  const { failed, resolved } = derivePendencias(GMII_JUNHO)

  assert.equal(summary.blocked, 0)
  assert.equal(failed.length, 0)
  assert.equal(resolved.length, 0)
  assert.ok(!("warnings" in summary))
  // Warning nao conta como "ok" tampouco: so os dois checks aprovados.
  assert.equal(summary.passed, 2)
})

test("warning resolvido tambem fica fora do grupo de resolvidos", () => {
  const mix: PrestacaoRecheck[] = [
    check({ id: "acordos_competencias", status: "warning", dbStatus: "resolvida" }),
    check({ id: "total_linhas_repasse", status: "failed", dbStatus: "ignorada_com_justificativa" }),
  ]
  const { resolved } = derivePendencias(mix)
  assert.deepEqual(resolved.map((c) => c.id), ["total_linhas_repasse"])
})

test("scores de confianca nunca entram na contagem nem na lista", () => {
  const mix: PrestacaoRecheck[] = [
    check({ id: "prestacao_confidence", status: "failed" }),
    check({ id: "required_prestacao_contas", status: "failed" }),
  ]
  assert.deepEqual(derivePendencias(mix).failed.map((c) => c.id), ["required_prestacao_contas"])
  assert.equal(getValidationSummary(mix).blocked, 1)
})

test("invariante contagem==lista vale para bloqueios em qualquer entrada", () => {
  const mix: PrestacaoRecheck[] = [
    check({ id: "required_prestacao_contas", status: "failed" }),
    check({ id: "total_linhas_repasse", status: "failed" }),
    check({ id: "total_despesas", status: "warning" }),
    check({ id: "acordos_competencias", status: "warning", dbStatus: "resolvida" }),
    check({ id: "prestacao_confidence", status: "failed" }),
    check({ id: "rows_present", status: "passed" }),
  ]
  const summary = getValidationSummary(mix)
  const { failed, resolved } = derivePendencias(mix)
  assert.equal(summary.blocked, failed.length)
  assert.equal(summary.blocked, 2) // confidence failed nao conta
  assert.equal(summary.passed, 1)
  assert.equal(resolved.length, 0) // warning resolvido nao e exibido
})
