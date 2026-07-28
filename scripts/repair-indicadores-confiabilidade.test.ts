import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis } from "../lib/prestacao-types"
import {
  analysesAreEquivalent,
  auditExistingAnalysis,
  parseReliabilityRepairArgs,
} from "./repair-indicadores-confiabilidade.ts"

test("reparador é dry-run por padrão e valida os filtros", () => {
  assert.deepEqual(parseReliabilityRepairArgs([]), {
    mode: "dry-run",
    competence: null,
    fechamentoId: null,
  })
  assert.deepEqual(
    parseReliabilityRepairArgs([
      "--commit",
      "--competencia",
      "2026-06",
      "--fechamento",
      "e94a8c98-8ee1-43ac-b81f-c04e95465496",
    ]),
    {
      mode: "commit",
      competence: "2026-06-01",
      fechamentoId: "e94a8c98-8ee1-43ac-b81f-c04e95465496",
    },
  )
  assert.throws(() => parseReliabilityRepairArgs(["--force"]), /desconhecido/)
})

test("auditoria usa passagem e tarifa sem confundir com receita econômica", () => {
  const analysis = {
    totals: {
      total_receitas: 3_200,
      entradas_passagem: 445.95,
      total_comissoes: 256,
      total_despesas: 0,
      total_tarifas: 0,
      saidas_passagem: 0,
      total_a_repassar: 3_389.95,
      repasse_declarado: 3_389.95,
    },
  } as unknown as PackageAnalysis
  const result = auditExistingAnalysis(analysis)
  assert.equal(result.repasseCalculado, 3_389.95)
  assert.equal(result.diferencaNaoExplicada, 0)
  assert.equal(result.reconciliado, true)
})

test("segunda execução não propõe nova escrita para análise já corrigida", () => {
  const repaired = {
    totals: {
      total_receitas: 3_200,
      total_comissoes: 256,
      total_despesas: 0,
      total_a_repassar: 2_944,
    },
    prestacao: {
      receitas_por_imovel: [{ apto: "3", aluguel_recebido: 707.37 }],
    },
  } as unknown as PackageAnalysis

  assert.equal(analysesAreEquivalent(structuredClone(repaired), repaired), true)
  assert.equal(
    analysesAreEquivalent(
      {
        prestacao: structuredClone(repaired.prestacao),
        totals: {
          total_a_repassar: 2_944,
          total_despesas: 0,
          total_comissoes: 256,
          total_receitas: 3_200,
        },
      } as unknown as PackageAnalysis,
      repaired,
    ),
    true,
  )
  assert.equal(
    analysesAreEquivalent(
      {
        ...structuredClone(repaired),
        totals: { ...repaired.totals, total_a_repassar: 2_943.99 },
      },
      repaired,
    ),
    false,
  )
})
