import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  formatContractedRent,
  formatCurrency,
  formatHistoryCoverage,
  formatPortfolioContractedRent,
  formatReference,
  getFinancialReferences,
} from "./presentation.ts"

test("resume a cobertura histórica de cada unidade sem jargão técnico", () => {
  assert.equal(formatHistoryCoverage(0, 0, 6), "Sem histórico no período")
  assert.equal(formatHistoryCoverage(1, 1, 1), "1 de 1 mês com status")
  assert.equal(formatHistoryCoverage(5, 5, 6), "5 de 6 meses com status")
  assert.equal(formatHistoryCoverage(6, 1, 6), "6 de 6 registrados · 1 com status")
})

test("apresenta referência financeira mensal e dia isolado sem ambiguidade", () => {
  assert.equal(formatReference("2026-05"), "05/2026")
  assert.equal(formatReference("2026-05-10"), "05/2026")
  assert.equal(formatReference("10"), "Dia 10")
  assert.equal(formatReference("dia 08"), "Dia 8")
  assert.equal(formatReference(null), "—")
})

test("distingue dado ausente, zero confirmado e aluguel não aplicável", () => {
  assert.equal(formatCurrency(null), "—")
  assert.equal(formatCurrency(undefined), "—")
  assert.equal(formatCurrency(0), "R$ 0,00")
  assert.equal(formatContractedRent(0, "variavel"), "Não se aplica")
  assert.equal(formatContractedRent(null, "nao_aplicavel"), "Não se aplica")
  assert.equal(formatContractedRent(1250.5, "fixo"), "R$ 1.250,50")
  assert.equal(
    formatPortfolioContractedRent(null, {
      conhecidos: 0,
      naoAplicaveis: 1,
      ausentes: 0,
    }),
    "Não se aplica",
  )
  assert.equal(
    formatPortfolioContractedRent(null, {
      conhecidos: 0,
      naoAplicaveis: 0,
      ausentes: 1,
    }),
    "—",
  )
})

test("separa competência do aluguel, recebimento e vencimento", () => {
  assert.deepEqual(
    getFinancialReferences({
      competencia: "2026-05",
      vencimentoReferencia: "dia 08",
      competenciaAluguel: "2026-04",
      competenciaRecebimento: "2026-05",
    } as never),
    {
      rentCompetence: "04/2026",
      receiptCompetence: "05/2026",
      dueDay: "Dia 8",
    },
  )
  assert.deepEqual(
    getFinancialReferences({ competencia: "2026-05", vencimentoReferencia: null }),
    {
      rentCompetence: "—",
      receiptCompetence: "05/2026",
      dueDay: "—",
    },
  )
})

test("mantém a nomenclatura de negócio e remove termos técnicos da interface", () => {
  const files = [
    "../primitives/dashboard-ui.tsx",
    "../tabs/view-geral.tsx",
    "../tabs/view-receita.tsx",
    "../tabs/view-mapa.tsx",
    "../tabs/view-registro.tsx",
    "../../views/indicadores-view.tsx",
  ]
  const source = files
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n")

  for (const retiredTerm of [
    "PackageTotals",
    '"Receita total"',
    '"Receita & repasse"',
    '"Mapa de calor"',
    '"Receitas por imóvel"',
    '"Repasse apurado"',
    '"Resíduo da reconciliação"',
    '"Ref. financeira"',
    '"Snapshot nativo"',
    '"Histórico recomposto"',
    '"Histórico reconstruído"',
    "Reconstr.",
  ]) {
    assert.equal(source.includes(retiredTerm), false, `termo aposentado encontrado: ${retiredTerm}`)
  }

  for (const requiredTerm of [
    "Como ler este painel",
    "Conciliação financeira",
    "Riscos por imóvel",
    "Detalhamento por imóvel",
    "Repasse confirmado pelo banco",
    "Diferença não explicada",
  ]) {
    assert.equal(source.includes(requiredTerm), true, `termo obrigatório ausente: ${requiredTerm}`)
  }

  assert.equal(
    source.includes("motivosConfianca"),
    false,
    "motivos técnicos de confiança não devem aparecer no banner",
  )
  assert.equal(source.includes("Sem dados no mês"), true, "o mapa deve explicar células sem histórico")
  assert.equal(source.includes("formatHistoryCoverage"), true, "o mapa deve resumir a cobertura por unidade")
})
