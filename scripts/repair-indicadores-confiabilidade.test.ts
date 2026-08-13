import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis, PrestacaoAnalysis } from "../lib/prestacao-types"
import { buildPrestacaoMovimentacoes } from "../lib/server/persist-package.ts"
import {
  attachAnalysisToExistingProperties,
  analysesAreEquivalent,
  assertRepairCommitAllowed,
  auditExistingAnalysis,
  parseReliabilityRepairArgs,
  preparePluralRepairAnalysis,
} from "./repair-indicadores-confiabilidade.ts"

test("commit bloqueia qualquer fechamento incompleto", () => {
  assert.throws(
    () =>
      assertRepairCommitAllowed([
        { kind: "incomplete", reconciliation: null },
      ]),
    /incompleto/,
  )
  assert.doesNotThrow(() =>
    assertRepairCommitAllowed([
      {
        kind: "repaired",
        reconciliation: { reconciliado: true } as never,
      },
    ]),
  )
})

test("reparador é dry-run por padrão e valida os filtros", () => {
  assert.deepEqual(parseReliabilityRepairArgs([]), {
    mode: "dry-run",
    competence: null,
    fechamentoId: null,
    cesarOnly: false,
  })
  assert.deepEqual(
    parseReliabilityRepairArgs([
      "--commit",
      "--competencia",
      "2026-06",
      "--fechamento",
      "e94a8c98-8ee1-43ac-b81f-c04e95465496",
      "--cesar-rego",
    ]),
    {
      mode: "commit",
      competence: "2026-06-01",
      fechamentoId: "e94a8c98-8ee1-43ac-b81f-c04e95465496",
      cesarOnly: true,
    },
  )
  assert.throws(() => parseReliabilityRepairArgs(["--force"]), /desconhecido/)
  assert.equal(
    parseReliabilityRepairArgs(["--competencia", "2026-07"]).competence,
    "2026-07-01",
  )
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

test("commit envia receitas e rateio TED ao RPC atomico", () => {
  const prestacao = {
    receitas_por_imovel: [
      {
        apto: "0002526",
        inquilino: "INQUILINO",
        aluguel: 1_000,
        total: 1_000,
        competencia_original: "06/2026",
        confianca: 1,
        imovel_id: "imovel-2526",
      },
    ],
    acordos_rescisoes_recebidos: [],
    resumo_financeiro: {
      outras_comissoes_despesas: [{ descricao: "TED", valor: 11.1, confianca: 1 }],
    },
  } as unknown as PrestacaoAnalysis

  const todas = buildPrestacaoMovimentacoes({
    fechamentoId: "fechamento",
    documentoId: null,
    prestacao,
  })
  assert.ok(
    todas.some((row) => row.tipo_movimentacao === "despesa"),
    "pré-condição: buildPrestacaoMovimentacoes deve emitir a despesa de rateio TED",
  )

  const movimentacoes = buildPrestacaoMovimentacoes({
    fechamentoId: "fechamento",
    documentoId: null,
    prestacao,
    competencia: "2026-07",
  })
  assert.deepEqual(
    movimentacoes.map((row) => row.tipo_movimentacao),
    ["receita_aluguel", "despesa"],
  )
  assert.equal(movimentacoes[1].origem_documental, "rateio_ted")
})

test("reparo histórico persiste o vínculo exato já existente", () => {
  const analysis = {
    prestacao: {
      receitas_por_imovel: [
        {
          apto: "0002520",
          inquilino: "JOAO CORDEIRO,488 APART. A",
          aluguel: 1100,
          total: 1100,
        },
      ],
    },
  } as unknown as PackageAnalysis

  const linked = attachAnalysisToExistingProperties(analysis, [
    {
      id: "imovel-2520",
      codigo_imobiliaria: "2520",
      unidade: "0002520",
      inquilino_nome: "JOAO CORDEIRO,488 APART. A",
      status: "ocupado",
      valor_aluguel_esperado: 1100,
    },
  ])

  assert.equal(linked.prestacao?.receitas_por_imovel[0]?.imovel_id, "imovel-2520")
})

test("reparo histórico substitui vínculo removido de GA0002/2 pelo cadastro GA0002", () => {
  const analysis = {
    prestacao: {
      receitas_por_imovel: [
        {
          apto: "GA0002/2",
          imovel_id: "imovel-duplicado-removido",
          inquilino: "",
          aluguel: 3_348.52,
          total: 3_348.52,
        },
      ],
    },
  } as unknown as PackageAnalysis

  const linked = attachAnalysisToExistingProperties(analysis, [
    {
      id: "imovel-ga0002",
      codigo_imobiliaria: "GA0002",
      unidade: "GA0002",
      inquilino_nome: "Galpão José Walter",
      status: "ocupado",
      valor_aluguel_esperado: 3_200,
    },
  ])

  assert.equal(linked.prestacao?.receitas_por_imovel[0]?.imovel_id, "imovel-ga0002")
})

test("reparo Plural vincula o cadastro ativo antes de reconstruir junho", () => {
  const analysis = {
    totals: {
      total_receitas: 3_200,
      total_comissoes: 256,
      total_despesas: 0,
      total_a_repassar: 3_389.95,
      repasse_embutido: true,
    },
    prestacao: {
      receitas_por_imovel: [
        {
          apto: "GA0002/2",
          imovel_id: "imovel-duplicado-removido",
          inquilino: "",
          aluguel: 3_200,
          iptu: 445.95,
          total: 3_200,
          comissao: 256,
          repasse: 3_389.95,
        },
      ],
    },
  } as unknown as PackageAnalysis

  const repaired = preparePluralRepairAnalysis(
    analysis,
    [{
      id: "imovel-ga0002",
      codigo_imobiliaria: "GA0002",
      unidade: "GA0002",
      inquilino_nome: "Galpão José Walter",
      status: "ocupado",
      valor_aluguel_esperado: 3_200,
    }],
    "2026-06",
  )

  assert.equal(
    repaired.analysisRepaired.prestacao?.receitas_por_imovel[0]?.imovel_id,
    "imovel-ga0002",
  )
  assert.equal(
    repaired.analysisRepaired.prestacao?.resumo_financeiro.repasse_embutido,
    true,
  )
})
