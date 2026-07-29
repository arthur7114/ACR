"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"
import { formatBRL } from "@/lib/format"
import {
  resolveFechamentoListPresentation,
  type FechamentoListStatus,
} from "@/lib/fechamento-list"
import {
  EMPTY_FECHAMENTO_FILTERS,
  FECHAMENTO_STATUS_LABELS,
  filterFechamentos,
  hasFechamentoFilters,
  paginateFechamentos,
  sortFechamentos,
  type FechamentoFilters,
  type FechamentoSortKey,
  type FechamentoTableRow,
  type SortDirection,
} from "@/lib/fechamentos-table"

type Row = FechamentoTableRow

type Confirm = { title: string; description: string; confirmLabel: string; danger?: boolean; requireText?: string; onConfirm: () => Promise<void> }

interface TableState {
  filters: FechamentoFilters
  sortKey: FechamentoSortKey
  direction: SortDirection
  page: number
}

const DEFAULT_TABLE_STATE: TableState = {
  filters: EMPTY_FECHAMENTO_FILTERS,
  sortKey: "competencia",
  direction: "desc",
  page: 1,
}

const STATUS_OPTIONS = Object.entries(FECHAMENTO_STATUS_LABELS) as Array<[FechamentoListStatus, string]>
const SORT_KEYS: FechamentoSortKey[] = [
  "competencia",
  "imobiliaria",
  "empreendimento",
  "status",
  "aRepassar",
  "transferido",
  "diferenca",
]

const filterControlClass =
  "h-10 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#3D4F3F] outline-none transition-colors hover:border-[#AEBCAF] focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"

function formatCompetencia(date: string) {
  const [year, month] = date.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${months[parseInt(month) - 1]}/${year}`
}

function StatusBadge({ status }: { status: FechamentoListStatus }) {
  if (status === "rascunho") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-[#4B5563]">
        Aguardando documentos
      </span>
    )
  }
  if (status === "erro_processamento") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-3 py-1 text-xs font-medium text-[#991B1B]">
        <AlertTriangle size={12} />
        Erro na análise
      </span>
    )
  }
  if (status === "pendente") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Pendente revisão
      </span>
    )
  }
  if (status === "aprovado") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Aprovado
      </span>
    )
  }
  if (status === "preparado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#E0F2FE] text-[#075985] rounded-full px-3 py-1 text-xs font-medium">
        <Send size={12} />
        Pronto eGestor
      </span>
    )
  }
  if (status === "lancado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Lançado eGestor
      </span>
    )
  }
  if (status === "erro_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEE2E2] text-[#991B1B] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Erro eGestor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-[#DBEAFE] text-[#1E40AF] rounded-full px-3 py-1 text-xs font-medium">
      Processando
    </span>
  )
}

export function FechamentosView() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeArquivados, setIncludeArquivados] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [tableState, setTableState] = useState<TableState>(DEFAULT_TABLE_STATE)
  const [isUrlReady, setIsUrlReady] = useState(false)

  useEffect(() => {
    const urlState = getTableStateFromUrl()
    setTableState(urlState.tableState)
    setIncludeArquivados(urlState.includeArquivados)
    setIsUrlReady(true)
  }, [])

  useEffect(() => {
    if (!isUrlReady) return
    persistTableState(tableState, includeArquivados)
  }, [includeArquivados, isUrlReady, tableState])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/fechamentos${includeArquivados ? "?include_arquivados=true" : ""}`)
      const payload = await res.json()
      if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao carregar fechamentos.")
      const mapped: Row[] = (payload.fechamentos ?? []).map((f: {
        id: string
        imobiliaria_id: string
        empreendimento_id: string
        competencia: string
        status: string
        has_analysis: boolean
        processamento_status: string | null
        processamento_atualizado_em: string | null
        arquivado?: boolean
        total_repassar: number | null
        valor_repassado_comprovante: number | null
        diferenca_total: number | null
        imobiliarias: { nome: string }
        empreendimentos: { nome: string }
      }) => {
        const presentation = resolveFechamentoListPresentation({
          id: f.id,
          dbStatus: f.status,
          hasAnalysis: f.has_analysis,
          processamentoStatus: f.processamento_status,
          processamentoAtualizadoEm: f.processamento_atualizado_em,
        })
        return {
          id: f.id,
          competencia: formatCompetencia(f.competencia),
          competenciaValue: f.competencia,
          imobiliariaId: f.imobiliaria_id,
          imobiliaria: f.imobiliarias?.nome ?? "-",
          empreendimentoId: f.empreendimento_id,
          empreendimento: f.empreendimentos?.nome ?? "-",
          ...presentation,
          arquivado: Boolean(f.arquivado),
          aRepassar: f.total_repassar,
          transferido: f.valor_repassado_comprovante,
          diferenca: f.diferenca_total,
        }
      })
      setRows(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar fechamentos.")
    } finally {
      setLoading(false)
    }
  }, [includeArquivados])

  useEffect(() => {
    void reload()
  }, [reload])

  const options = useMemo(() => getFilterOptions(rows), [rows])
  const filteredRows = useMemo(
    () => filterFechamentos(rows, tableState.filters),
    [rows, tableState.filters],
  )
  const sortedRows = useMemo(
    () => sortFechamentos(filteredRows, tableState.sortKey, tableState.direction),
    [filteredRows, tableState.direction, tableState.sortKey],
  )
  const pagination = useMemo(
    () => paginateFechamentos(sortedRows, tableState.page),
    [sortedRows, tableState.page],
  )
  const hasActiveFilters = hasFechamentoFilters(tableState.filters)

  useEffect(() => {
    if (loading || tableState.page === pagination.currentPage) return
    setTableState((current) => ({ ...current, page: pagination.currentPage }))
  }, [loading, pagination.currentPage, tableState.page])

  function updateFilters(patch: Partial<FechamentoFilters>) {
    setTableState((current) => ({
      ...current,
      filters: { ...current.filters, ...patch },
      page: 1,
    }))
  }

  function clearFilters() {
    setTableState((current) => ({ ...current, filters: EMPTY_FECHAMENTO_FILTERS, page: 1 }))
  }

  function changeSort(sortKey: FechamentoSortKey) {
    setTableState((current) => ({
      ...current,
      sortKey,
      direction: current.sortKey === sortKey
        ? current.direction === "asc" ? "desc" : "asc"
        : defaultSortDirection(sortKey),
      page: 1,
    }))
  }

  function changePage(page: number) {
    setTableState((current) => ({ ...current, page }))
  }

  async function setArquivado(row: Row, arquivado: boolean) {
    const res = await fetch(`/api/fechamentos/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado }),
    })
    const payload = await res.json()
    if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao arquivar.")
    await reload()
  }

  async function excluir(row: Row) {
    const res = await fetch(`/api/fechamentos/${row.id}`, { method: "DELETE" })
    const payload = await res.json()
    if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao excluir.")
    await reload()
  }

  function label(row: Row) {
    return `${row.imobiliaria} · ${row.empreendimento} · ${row.competencia}`
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">Fechamentos</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">Conciliação mensal de repasses por imobiliária</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#3D4F3F]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#D5DDD6] accent-[#2D8C3A]"
              checked={includeArquivados}
              onChange={(event) => {
                setIncludeArquivados(event.target.checked)
                setTableState((current) => ({ ...current, page: 1 }))
              }}
            />
            Mostrar arquivados
          </label>
          <Link
            href="/fechamentos/novo"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
          >
            <Plus size={16} />
            Novo Fechamento
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#EEF1EE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#6B7F6E]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[14px]">Carregando fechamentos...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#DC2626]">
            <AlertTriangle size={18} />
            <span className="text-[14px]">{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#6B7F6E]">
            <p className="text-[14px]">Nenhum fechamento encontrado.</p>
            <Link
              href="/fechamentos/novo"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#2D8C3A] text-white text-[13px] font-medium hover:bg-[#1A5C24] transition-colors"
            >
              <Plus size={14} />
              Criar primeiro fechamento
            </Link>
          </div>
        ) : (
          <>
            <div className="border-b border-[#EEF1EE] bg-[#FCFDFC] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#3D4F3F]">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  Filtrar fechamentos
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[#3D4F3F] transition-colors hover:bg-[#EEF1EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D8C3A]"
                  >
                    <X aria-hidden="true" size={14} /> Limpar filtros
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-[240px] flex-[1_1_280px]">
                  <label htmlFor="fechamentos-search" className="sr-only">Buscar fechamentos</label>
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7F6E]" size={15} />
                  <input
                    id="fechamentos-search"
                    type="search"
                    value={tableState.filters.search}
                    onChange={(event) => updateFilters({ search: event.target.value })}
                    placeholder="Buscar por nome ou status"
                    className={`${filterControlClass} w-full pl-9 pr-9 placeholder:text-[#6B7F6E]`}
                  />
                  {tableState.filters.search && (
                    <button
                      type="button"
                      onClick={() => updateFilters({ search: "" })}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#6B7F6E] hover:bg-[#EEF1EE] hover:text-[#3D4F3F]"
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                </div>

                <FilterSelect
                  label="Filtrar por status"
                  value={tableState.filters.status}
                  onChange={(value) => updateFilters({ status: value as FechamentoListStatus | "" })}
                  options={STATUS_OPTIONS.map(([value, label]) => ({ value, label }))}
                  placeholder="Todos os status"
                />
                <FilterSelect
                  label="Filtrar por competência"
                  value={tableState.filters.competencia}
                  onChange={(value) => updateFilters({ competencia: value })}
                  options={options.competencias}
                  placeholder="Todas as competências"
                />
                <FilterSelect
                  label="Filtrar por imobiliária"
                  value={tableState.filters.imobiliariaId}
                  onChange={(value) => updateFilters({ imobiliariaId: value })}
                  options={options.imobiliarias}
                  placeholder="Todas as imobiliárias"
                />
                <FilterSelect
                  label="Filtrar por empreendimento"
                  value={tableState.filters.empreendimentoId}
                  onChange={(value) => updateFilters({ empreendimentoId: value })}
                  options={options.empreendimentos}
                  placeholder="Todos os empreendimentos"
                />
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6F0] text-[#2D8C3A]">
                  <Search aria-hidden="true" size={18} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#1A2B1C]">Nenhum fechamento corresponde aos filtros</p>
                  <p className="mt-1 text-[13px] text-[#6B7F6E]">Ajuste a busca ou limpe os filtros para voltar à lista completa.</p>
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-9 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1140px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[125px]" />
                      <col className="w-[128px]" />
                      <col className="w-[150px]" />
                      <col className="w-[150px]" />
                      {/* Colunas de moeda: largura suficiente para "R$ 11.859,02" sem cortar. */}
                      <col className="w-[128px]" />
                      <col className="w-[128px]" />
                      <col className="w-[122px]" />
                      {/* Ações: comporta o botão + arquivar + excluir sem estourar. */}
                      <col className="w-[210px]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                        <SortableHeader label="Competência" sortKey="competencia" tableState={tableState} onSort={changeSort} />
                        <SortableHeader label="Imobiliária" sortKey="imobiliaria" tableState={tableState} onSort={changeSort} />
                        <SortableHeader label="Empreendimento" sortKey="empreendimento" tableState={tableState} onSort={changeSort} />
                        <SortableHeader label="Status" sortKey="status" tableState={tableState} onSort={changeSort} />
                        <SortableHeader label="A repassar" sortKey="aRepassar" tableState={tableState} onSort={changeSort} align="right" />
                        <SortableHeader label="Transferido" sortKey="transferido" tableState={tableState} onSort={changeSort} align="right" />
                        <SortableHeader label="Diferença" sortKey="diferenca" tableState={tableState} onSort={changeSort} align="right" />
                        <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.rows.map((row, index) => (
                        <tr
                          key={row.id}
                          className={`border-b border-[#EEF1EE] last:border-0 transition-colors duration-150 hover:bg-[#EFF7F1] ${row.arquivado ? "opacity-60" : ""} ${index % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}
                        >
                          <td className="whitespace-nowrap px-4 py-3.5 font-medium text-[#3D4F3F]">
                            {row.competencia}
                            {row.arquivado && <span className="ml-2 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium text-[#4B5563]">arquivado</span>}
                          </td>
                          <td className="px-4 py-3.5 text-[#3D4F3F]">{row.imobiliaria}</td>
                          <td className="px-4 py-3.5 text-[#3D4F3F]">{row.empreendimento}</td>
                          <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={row.status} /></td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-[#3D4F3F]">{row.aRepassar !== null ? formatBRL(row.aRepassar) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-[#3D4F3F]">{row.transferido !== null ? formatBRL(row.transferido) : "—"}</td>
                          <td className={`whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums ${differenceColor(row.diferenca)}`}>
                            {row.diferenca !== null ? `${row.diferenca < 0 ? "−" : ""}${formatBRL(Math.abs(row.diferenca))}` : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={row.href}
                                className={`inline-flex h-8 min-w-[104px] items-center justify-center rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D8C3A] ${
                                  row.status === "pendente" || row.status === "rascunho"
                                    ? "bg-[#2D8C3A] text-white hover:bg-[#1A5C24]"
                                    : "border border-[#D5DDD6] bg-white text-[#3D4F3F] hover:border-[#BBD6BE] hover:bg-[#EFF7F1]"
                                }`}
                              >
                                {row.actionLabel}
                              </Link>
                              {/* Ferramentas da linha: recuadas em cinza; a cor/intencao aparece
                                  no hover/foco para nao competir com os numeros a cada linha. */}
                              <div className="ml-1 flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirm({
                                      title: row.arquivado ? "Desarquivar fechamento" : "Arquivar fechamento",
                                      description: row.arquivado
                                        ? `"${label(row)}" volta para a lista principal.`
                                        : `"${label(row)}" será ocultado da lista (sem apagar nada).`,
                                      confirmLabel: row.arquivado ? "Desarquivar" : "Arquivar",
                                      onConfirm: () => setArquivado(row, !row.arquivado),
                                    })
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-[#8A9A8C] transition-colors hover:bg-[#FEF3C7] hover:text-[#92400E] focus-visible:bg-[#FEF3C7] focus-visible:text-[#92400E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92400E]"
                                  aria-label={`${row.arquivado ? "Desarquivar" : "Arquivar"} ${label(row)}`}
                                  title={row.arquivado ? "Desarquivar" : "Arquivar"}
                                >
                                  {row.arquivado ? <ArchiveRestore aria-hidden="true" size={15} /> : <Archive aria-hidden="true" size={15} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirm({
                                      title: "Excluir fechamento",
                                      description: `Isto apaga "${label(row)}" DEFINITIVAMENTE, junto com documentos, movimentações e lançamentos eGestor. Não pode ser desfeito. Digite EXCLUIR para confirmar.`,
                                      confirmLabel: "Excluir definitivamente",
                                      danger: true,
                                      requireText: "EXCLUIR",
                                      onConfirm: () => excluir(row),
                                    })
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-[#8A9A8C] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] focus-visible:bg-[#FEF2F2] focus-visible:text-[#DC2626] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
                                  aria-label={`Excluir definitivamente ${label(row)}`}
                                  title="Excluir definitivamente"
                                >
                                  <Trash2 aria-hidden="true" size={15} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1EE] bg-white px-4 py-3">
                  <span className="text-[13px] tabular-nums text-[#6B7F6E]">
                    Exibindo {pagination.start}–{pagination.end} de {filteredRows.length} {filteredRows.length === 1 ? "fechamento" : "fechamentos"}
                    {hasActiveFilters && ` · ${rows.length} no total`}
                  </span>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="mr-1 text-[12px] tabular-nums text-[#6B7F6E]">Página {pagination.currentPage} de {pagination.totalPages}</span>
                      <PageButton
                        label="Página anterior"
                        disabled={pagination.currentPage === 1}
                        onClick={() => changePage(pagination.currentPage - 1)}
                      >
                        <ChevronLeft aria-hidden="true" size={14} /> Anterior
                      </PageButton>
                      <PageButton
                        label="Próxima página"
                        disabled={pagination.currentPage === pagination.totalPages}
                        onClick={() => changePage(pagination.currentPage + 1)}
                      >
                        Próxima <ChevronRight aria-hidden="true" size={14} />
                      </PageButton>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} onError={setError} />}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${filterControlClass} min-w-[150px] flex-[1_1_155px]`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

function SortableHeader({
  label,
  sortKey,
  tableState,
  onSort,
  align = "left",
}: {
  label: string
  sortKey: FechamentoSortKey
  tableState: TableState
  onSort: (sortKey: FechamentoSortKey) => void
  align?: "left" | "right"
}) {
  const isActive = tableState.sortKey === sortKey
  const ariaSort = isActive ? (tableState.direction === "asc" ? "ascending" : "descending") : "none"
  const Icon = !isActive ? ArrowUpDown : tableState.direction === "asc" ? ArrowUp : ArrowDown

  return (
    <th aria-sort={ariaSort} className={`px-2 py-1 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-[11px] font-medium uppercase tracking-wide transition-colors hover:bg-[#EEF1EE] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2D8C3A] ${
          align === "right" ? "justify-end" : "justify-start"
        } ${isActive ? "text-[#1A5C24]" : "text-[#6B7F6E]"}`}
        title={`Ordenar por ${label.toLocaleLowerCase("pt-BR")}`}
      >
        {label}
        <Icon aria-hidden="true" size={13} className={isActive ? "opacity-100" : "opacity-55"} />
      </button>
    </th>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[12px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D8C3A] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function differenceColor(value: number | null) {
  if (value === null) return "text-[#6B7F6E]"
  return value === 0 ? "text-[#167326]" : "text-[#B42318]"
}

function defaultSortDirection(sortKey: FechamentoSortKey): SortDirection {
  return sortKey === "competencia" || sortKey === "aRepassar" || sortKey === "transferido" || sortKey === "diferenca"
    ? "desc"
    : "asc"
}

function getFilterOptions(rows: Row[]) {
  const competencias = new Map(rows.map((row) => [row.competenciaValue, row.competencia]))
  const imobiliarias = new Map(rows.map((row) => [row.imobiliariaId, row.imobiliaria]))
  const empreendimentos = new Map(rows.map((row) => [row.empreendimentoId, row.empreendimento]))

  return {
    competencias: [...competencias].sort(([left], [right]) => right.localeCompare(left)).map(toOption),
    imobiliarias: [...imobiliarias].sort(([, left], [, right]) => left.localeCompare(right, "pt-BR")).map(toOption),
    empreendimentos: [...empreendimentos].sort(([, left], [, right]) => left.localeCompare(right, "pt-BR")).map(toOption),
  }
}

function toOption([value, label]: [string, string]) {
  return { value, label }
}

function getTableStateFromUrl(): { tableState: TableState; includeArquivados: boolean } {
  if (typeof window === "undefined") {
    return { tableState: DEFAULT_TABLE_STATE, includeArquivados: false }
  }

  const params = new URLSearchParams(window.location.search)
  const rawStatus = params.get("status") ?? ""
  const rawSortKey = params.get("ordem") ?? ""
  const rawPage = Number(params.get("pagina"))

  return {
    tableState: {
      filters: {
        search: params.get("busca") ?? "",
        status: isFechamentoStatus(rawStatus) ? rawStatus : "",
        competencia: params.get("competencia") ?? "",
        imobiliariaId: params.get("imobiliaria") ?? "",
        empreendimentoId: params.get("empreendimento") ?? "",
      },
      sortKey: isSortKey(rawSortKey) ? rawSortKey : DEFAULT_TABLE_STATE.sortKey,
      direction: params.get("direcao") === "asc" ? "asc" : "desc",
      page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    },
    includeArquivados: params.get("arquivados") === "true",
  }
}

function persistTableState(tableState: TableState, includeArquivados: boolean) {
  const url = new URL(window.location.href)
  setUrlParam(url, "busca", tableState.filters.search.trim())
  setUrlParam(url, "status", tableState.filters.status)
  setUrlParam(url, "competencia", tableState.filters.competencia)
  setUrlParam(url, "imobiliaria", tableState.filters.imobiliariaId)
  setUrlParam(url, "empreendimento", tableState.filters.empreendimentoId)
  setUrlParam(url, "ordem", tableState.sortKey === DEFAULT_TABLE_STATE.sortKey ? "" : tableState.sortKey)
  setUrlParam(url, "direcao", tableState.direction === DEFAULT_TABLE_STATE.direction ? "" : tableState.direction)
  setUrlParam(url, "pagina", tableState.page === 1 ? "" : String(tableState.page))
  setUrlParam(url, "arquivados", includeArquivados ? "true" : "")
  window.history.replaceState(window.history.state, "", url)
}

function setUrlParam(url: URL, key: string, value: string) {
  if (value) url.searchParams.set(key, value)
  else url.searchParams.delete(key)
}

function isFechamentoStatus(value: string): value is FechamentoListStatus {
  return value in FECHAMENTO_STATUS_LABELS
}

function isSortKey(value: string): value is FechamentoSortKey {
  return SORT_KEYS.includes(value as FechamentoSortKey)
}

function ConfirmDialog({
  state,
  onClose,
  onError,
}: {
  state: Confirm
  onClose: () => void
  onError: (message: string | null) => void
}) {
  const [text, setText] = useState("")
  const [working, setWorking] = useState(false)
  const blocked = Boolean(state.requireText) && text.trim().toUpperCase() !== state.requireText!.trim().toUpperCase()

  async function handleConfirm() {
    if (blocked || working) return
    setWorking(true)
    try {
      await state.onConfirm()
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : "A ação não foi concluída.")
      onClose()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#EEF1EE] bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          {state.danger && <AlertTriangle size={18} className="text-[#DC2626]" />}
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">{state.title}</h2>
        </div>
        <p className="text-[13px] leading-relaxed text-[#6B7F6E]">{state.description}</p>
        {state.requireText && (
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={state.requireText}
            className="mt-3 h-9 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#3D4F3F] outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]">
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={blocked || working}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              state.danger ? "bg-[#DC2626] hover:bg-[#991B1B]" : "bg-[#2D8C3A] hover:bg-[#1A5C24]"
            }`}
          >
            {working && <Loader2 size={14} className="animate-spin" />}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
