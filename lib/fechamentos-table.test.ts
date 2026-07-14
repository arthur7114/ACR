import assert from "node:assert/strict"
import test from "node:test"
import {
  EMPTY_FECHAMENTO_FILTERS,
  FECHAMENTOS_PAGE_SIZE,
  filterFechamentos,
  paginateFechamentos,
  sortFechamentos,
  type FechamentoTableRow,
} from "./fechamentos-table"

function row(overrides: Partial<FechamentoTableRow> = {}): FechamentoTableRow {
  return {
    id: "fechamento-1",
    competencia: "Jul/2026",
    competenciaValue: "2026-07",
    imobiliariaId: "imobiliaria-1",
    imobiliaria: "César Rêgo",
    empreendimentoId: "empreendimento-1",
    empreendimento: "Grand Messejana II",
    status: "pendente",
    href: "/fechamentos/fechamento-1/revisao",
    actionLabel: "Revisar",
    arquivado: false,
    aRepassar: 10_000,
    transferido: 9_900,
    diferenca: 100,
    ...overrides,
  }
}

test("busca ignora acentos e encontra campos de contexto e status", () => {
  const rows = [row()]

  assert.equal(filterFechamentos(rows, { ...EMPTY_FECHAMENTO_FILTERS, search: "cesar" }).length, 1)
  assert.equal(filterFechamentos(rows, { ...EMPTY_FECHAMENTO_FILTERS, search: "revisao" }).length, 1)
  assert.equal(filterFechamentos(rows, { ...EMPTY_FECHAMENTO_FILTERS, search: "plural" }).length, 0)
})

test("combina filtros exatos sem alterar a coleção original", () => {
  const rows = [
    row(),
    row({ id: "fechamento-2", status: "aprovado", imobiliariaId: "imobiliaria-2" }),
  ]

  const result = filterFechamentos(rows, {
    ...EMPTY_FECHAMENTO_FILTERS,
    status: "pendente",
    competencia: "2026-07",
    imobiliariaId: "imobiliaria-1",
  })

  assert.deepEqual(result.map((item) => item.id), ["fechamento-1"])
  assert.equal(rows.length, 2)
})

test("ordena competência mais recente primeiro", () => {
  const rows = [
    row({ id: "marco", competencia: "Mar/2026", competenciaValue: "2026-03" }),
    row({ id: "julho", competencia: "Jul/2026", competenciaValue: "2026-07" }),
    row({ id: "dezembro", competencia: "Dez/2025", competenciaValue: "2025-12" }),
  ]

  const result = sortFechamentos(rows, "competencia", "desc")

  assert.deepEqual(result.map((item) => item.id), ["julho", "marco", "dezembro"])
  assert.equal(rows[0].id, "marco")
})

test("mantém valores ausentes no final em ambas as direções", () => {
  const rows = [
    row({ id: "sem-valor", aRepassar: null }),
    row({ id: "maior", aRepassar: 20_000 }),
    row({ id: "menor", aRepassar: 5_000 }),
  ]

  assert.deepEqual(sortFechamentos(rows, "aRepassar", "asc").map((item) => item.id), ["menor", "maior", "sem-valor"])
  assert.deepEqual(sortFechamentos(rows, "aRepassar", "desc").map((item) => item.id), ["maior", "menor", "sem-valor"])
})

test("pagina em lotes de 25 e limita páginas inválidas", () => {
  const rows = Array.from({ length: FECHAMENTOS_PAGE_SIZE + 1 }, (_, index) => row({ id: String(index + 1) }))

  const firstPage = paginateFechamentos(rows, 1)
  const lastPage = paginateFechamentos(rows, 99)

  assert.equal(firstPage.rows.length, FECHAMENTOS_PAGE_SIZE)
  assert.deepEqual({ start: firstPage.start, end: firstPage.end, totalPages: firstPage.totalPages }, { start: 1, end: 25, totalPages: 2 })
  assert.deepEqual({ currentPage: lastPage.currentPage, start: lastPage.start, end: lastPage.end }, { currentPage: 2, start: 26, end: 26 })
})
