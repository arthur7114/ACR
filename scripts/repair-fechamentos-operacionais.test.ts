import assert from "node:assert/strict"
import test from "node:test"
import type { ReceitaPorImovel } from "../lib/prestacao-types.ts"
import type { PackageAnalysis } from "../lib/prestacao-types.ts"
import {
  assertFinancialInvariant,
  collectCompetenciaRepairs,
  collectImovelRepairs,
  isOperationalRepairTarget,
} from "./repair-fechamentos-operacionais.ts"

test("seleciona somente os quatro fechamentos operacionais acordados em maio", () => {
  assert.equal(isOperationalRepairTarget("Terreno Castelão", "2026-05-01"), true)
  assert.equal(isOperationalRepairTarget("Terreno Castelão Ricardo", "2026-05-01"), true)
  assert.equal(isOperationalRepairTarget("João Cordeiro", "2026-05-01"), true)
  assert.equal(isOperationalRepairTarget("Galpão Pompilio Gomes", "2026-05-01"), true)
  assert.equal(isOperationalRepairTarget("Grand Messejana II", "2026-05-01"), true)
  assert.equal(isOperationalRepairTarget("Outro empreendimento", "2026-05-01"), false)
  assert.equal(isOperationalRepairTarget("João Cordeiro", "2026-06-01"), false)
})

test("gera auditoria de vínculo somente quando o imovel_id muda", () => {
  const before = [{ apto: "101" }, { apto: "102", imovel_id: "imovel-102" }] as ReceitaPorImovel[]
  const after = [{ apto: "101", imovel_id: "imovel-101" }, { ...before[1] }] as ReceitaPorImovel[]

  assert.deepEqual(collectImovelRepairs(before, after), [
    { indice: 0, apto: "101", antes: null, depois: "imovel-101" },
  ])
})

test("gera auditoria antes/depois apenas para linhas alteradas", () => {
  const before = [
    { apto: "0002521", competencia_original: undefined, competencia_recebimento: undefined, dia_vencimento: undefined },
    { apto: "101", competencia_original: "2026-05", competencia_recebimento: "2026-05", dia_vencimento: 10 },
  ] as ReceitaPorImovel[]
  const after = [
    { ...before[0], competencia_original: "2026-03", competencia_recebimento: "2026-05", dia_vencimento: null },
    { ...before[1] },
  ] as ReceitaPorImovel[]

  const repairs = collectCompetenciaRepairs(before, after)
  assert.equal(repairs.length, 1)
  assert.equal(repairs[0].indice, 0)
  assert.equal(repairs[0].apto, "0002521")
  assert.deepEqual(repairs[0].depois, {
    competencia_original: "2026-03",
    competencia_recebimento: "2026-05",
    dia_vencimento: null,
  })
})

test("reparo de competencia preserva os valores financeiros", () => {
  const before = {
    totals: { total_receitas: 100, total_despesas: 10, total_comissoes: 7, total_a_repassar: 83 },
    prestacao: {
      receitas_por_imovel: [{ apto: "101", total: 100, competencia_original: null }],
      resumo_financeiro: { comissao_administracao: 7 },
    },
  } as PackageAnalysis
  const after = {
    ...before,
    prestacao: {
      ...before.prestacao!,
      receitas_por_imovel: [{ ...before.prestacao!.receitas_por_imovel[0], competencia_original: "2026-03" }],
    },
  } as PackageAnalysis

  assert.doesNotThrow(() => assertFinancialInvariant(before, after))
  assert.doesNotThrow(() => assertFinancialInvariant(before, {
    ...after,
    prestacao: {
      ...after.prestacao!,
      receitas_por_imovel: [{ ...after.prestacao!.receitas_por_imovel[0], imovel_id: "11111111-1111-4111-8111-111111111111" }],
    },
  }))
  assert.throws(
    () => assertFinancialInvariant(before, { ...after, totals: { ...after.totals, total_receitas: 101 } }),
    /alterar valores/,
  )
})
