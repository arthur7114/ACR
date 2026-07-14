import type { FechamentoListStatus } from "@/lib/fechamento-list"

export const FECHAMENTOS_PAGE_SIZE = 25

export const FECHAMENTO_STATUS_LABELS: Record<FechamentoListStatus, string> = {
  rascunho: "Aguardando documentos",
  erro_processamento: "Erro na análise",
  pendente: "Pendente revisão",
  processando: "Processando",
  aprovado: "Aprovado",
  preparado_egestor: "Pronto eGestor",
  lancado_egestor: "Lançado eGestor",
  erro_egestor: "Erro eGestor",
}

export type FechamentoSortKey =
  | "competencia"
  | "imobiliaria"
  | "empreendimento"
  | "status"
  | "aRepassar"
  | "transferido"
  | "diferenca"

export type SortDirection = "asc" | "desc"

export interface FechamentoTableRow {
  id: string
  competencia: string
  competenciaValue: string
  imobiliariaId: string
  imobiliaria: string
  empreendimentoId: string
  empreendimento: string
  status: FechamentoListStatus
  href: string
  actionLabel: string
  arquivado: boolean
  aRepassar: number | null
  transferido: number | null
  diferenca: number | null
}

export interface FechamentoFilters {
  search: string
  status: FechamentoListStatus | ""
  competencia: string
  imobiliariaId: string
  empreendimentoId: string
}

export const EMPTY_FECHAMENTO_FILTERS: FechamentoFilters = {
  search: "",
  status: "",
  competencia: "",
  imobiliariaId: "",
  empreendimentoId: "",
}

export function filterFechamentos(rows: FechamentoTableRow[], filters: FechamentoFilters) {
  const search = normalizeSearch(filters.search)

  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false
    if (filters.competencia && row.competenciaValue !== filters.competencia) return false
    if (filters.imobiliariaId && row.imobiliariaId !== filters.imobiliariaId) return false
    if (filters.empreendimentoId && row.empreendimentoId !== filters.empreendimentoId) return false
    if (!search) return true

    return [row.competencia, row.imobiliaria, row.empreendimento, FECHAMENTO_STATUS_LABELS[row.status]]
      .some((value) => normalizeSearch(value).includes(search))
  })
}

export function sortFechamentos(
  rows: FechamentoTableRow[],
  sortKey: FechamentoSortKey,
  direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1

  return [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sortKey)
    const rightValue = getSortValue(right, sortKey)

    if (leftValue === null && rightValue === null) return left.id.localeCompare(right.id)
    if (leftValue === null) return 1
    if (rightValue === null) return -1

    const comparison = typeof leftValue === "number"
      ? leftValue - (rightValue as number)
      : leftValue.localeCompare(rightValue as string, "pt-BR", { numeric: true, sensitivity: "base" })

    return comparison === 0 ? left.id.localeCompare(right.id) : comparison * multiplier
  })
}

export function paginateFechamentos(rows: FechamentoTableRow[], page: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / FECHAMENTOS_PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const start = (currentPage - 1) * FECHAMENTOS_PAGE_SIZE

  return {
    rows: rows.slice(start, start + FECHAMENTOS_PAGE_SIZE),
    currentPage,
    totalPages,
    start: rows.length === 0 ? 0 : start + 1,
    end: Math.min(start + FECHAMENTOS_PAGE_SIZE, rows.length),
  }
}

export function hasFechamentoFilters(filters: FechamentoFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0)
}

function getSortValue(row: FechamentoTableRow, sortKey: FechamentoSortKey) {
  if (sortKey === "competencia") return row.competenciaValue
  if (sortKey === "status") return FECHAMENTO_STATUS_LABELS[row.status]
  return row[sortKey]
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
}
