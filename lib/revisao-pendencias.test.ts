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

// Cenario real GM II junho: 6 warnings, sendo 2 scores de confianca (nao contam)
// e 4 objetivos. Dois deles (optional_*) e total_despesas NAO estavam na antiga
// lista branca isActionableWarning e sumiam da abinha, embora contados no topo.
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

test("contagem de alertas == alertas listados (os 4 objetivos, sem os _confidence)", () => {
  const summary = getValidationSummary(GMII_JUNHO)
  const { warning } = derivePendencias(GMII_JUNHO)

  assert.equal(summary.warnings, 4)
  assert.equal(warning.length, 4)
  assert.equal(summary.warnings, warning.length)
})

test("os warnings antes escondidos agora aparecem na lista", () => {
  const ids = derivePendencias(GMII_JUNHO).warning.map((c) => c.id)
  assert.ok(ids.includes("optional_despesas_comprovantes"))
  assert.ok(ids.includes("optional_relatorio_reajuste"))
  assert.ok(ids.includes("total_despesas"))
})

test("scores de confianca nunca entram na contagem nem na lista", () => {
  const ids = derivePendencias(GMII_JUNHO).warning.map((c) => c.id)
  assert.ok(!ids.includes("despesas_confidence"))
  assert.ok(!ids.includes("reajuste_confidence"))
})

test("invariante contagem==lista vale para bloqueios e alertas em qualquer entrada", () => {
  const mix: PrestacaoRecheck[] = [
    check({ id: "required_prestacao_contas", status: "failed" }),
    check({ id: "total_linhas_repasse", status: "failed" }),
    check({ id: "total_despesas", status: "warning" }),
    check({ id: "acordos_competencias", status: "warning", dbStatus: "resolvida" }),
    check({ id: "prestacao_confidence", status: "failed" }),
  ]
  const summary = getValidationSummary(mix)
  const { failed, warning, resolved } = derivePendencias(mix)
  assert.equal(summary.blocked, failed.length)
  assert.equal(summary.warnings, warning.length)
  assert.equal(summary.blocked, 2) // confidence failed nao conta
  assert.equal(summary.warnings, 1) // o resolvido saiu dos alertas
  assert.equal(resolved.length, 1)
})
