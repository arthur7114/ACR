"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react"
import type { IndicadoresData, IndicadoresPropertyRevenue } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import { escapeCsv, formatCurrency, formatReference, occupancyLabel, qualityLabel } from "../lib/presentation"
import { EmptyState, Panel, PanelHeader, StatusChip } from "../primitives/dashboard-ui"

const PAGE_SIZE = 20

type SortKey = "unidade" | "empreendimentoNome" | "aluguelEsperado" | "aluguelRecebido" | "receitaTotal" | "repasseApurado" | "vencimentoReferencia"
type SortDirection = "asc" | "desc"

export function ViewRegistro({ data }: { data: IndicadoresData }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "unidade", direction: "asc" })
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => filterRows(data.receitasPorImovel, query), [data.receitasPorImovel, query])
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])
  const csvHref = useMemo(() => buildCsvHref(sorted), [sorted])
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function updateQuery(value: string) {
    setQuery(value)
    setPage(1)
  }

  function updateSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
    setPage(1)
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <PanelHeader
        title="Receitas por imóvel"
        description="Uma linha por imóvel e competência, conforme a prestação. Esta fonte não é um livro bancário."
        source="Prestação da competência + snapshots"
        action={
          <a
            href={sorted.length > 0 ? csvHref : undefined}
            download={`receitas-por-imovel-${data.meta.competencia}.csv`}
            aria-disabled={sorted.length === 0}
            tabIndex={sorted.length === 0 ? -1 : undefined}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-acr-green px-3.5 text-sm font-semibold text-acr-green-strong transition-colors motion-reduce:transition-none hover:bg-acr-green-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            <Download aria-hidden="true" className="size-4" /> Exportar CSV
          </a>
        }
      />

      <div className="flex flex-col gap-3 border-b border-acr-line px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <label htmlFor="indicadores-property-search" className="block min-w-0 flex-1 sm:max-w-lg">
          <span className="mb-1.5 block text-xs font-semibold text-acr-muted-2">Buscar imóvel, inquilino ou empreendimento</span>
          <span className="flex min-h-11 items-center gap-2 rounded-lg border border-acr-line-2 bg-white px-3 focus-within:border-acr-green focus-within:ring-2 focus-within:ring-acr-green/15">
            <Search aria-hidden="true" className="size-4 shrink-0 text-acr-muted-2" />
            <input
              id="indicadores-property-search"
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-acr-ink outline-none placeholder:text-acr-muted-2"
              placeholder="Ex.: Apto 204, Maria ou Grand Messejana"
            />
          </span>
        </label>
        <p aria-live="polite" className="text-xs text-acr-muted-2 tabular-nums">
          {sorted.length} imóvel(is) encontrado(s)
        </p>
      </div>

      {visible.length > 0 ? (
        <>
          <div className="hidden max-h-[68vh] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acr-green md:block" tabIndex={0} aria-label="Tabela de receitas com rolagem interna">
            <table className="min-w-[1180px] w-full border-collapse text-xs">
              <caption className="sr-only">Receitas por imóvel na competência {data.meta.competenciaLabel}</caption>
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-acr-line-2 text-acr-muted-2">
                  <SortableHeader label="Imóvel" sortKey="unidade" sort={sort} onSort={updateSort} />
                  <SortableHeader label="Empreendimento" sortKey="empreendimentoNome" sort={sort} onSort={updateSort} />
                  <th scope="col" className="px-3 py-3 text-left font-semibold">Inquilino / status</th>
                  <SortableHeader label="Aluguel esperado" sortKey="aluguelEsperado" sort={sort} onSort={updateSort} right />
                  <SortableHeader label="Aluguel recebido" sortKey="aluguelRecebido" sort={sort} onSort={updateSort} right />
                  <SortableHeader label="Receita total" sortKey="receitaTotal" sort={sort} onSort={updateSort} right />
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Desconto</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Comissão adm.</th>
                  <SortableHeader label="Repasse apurado" sortKey="repasseApurado" sort={sort} onSort={updateSort} right />
                  <SortableHeader label="Ref. financeira" sortKey="vencimentoReferencia" sort={sort} onSort={updateSort} />
                  <th scope="col" className="px-3 py-3 text-left font-semibold">Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={`${row.imovelId}-${row.competencia}`} className="border-b border-acr-line last:border-0">
                    <th scope="row" className="px-3 py-3 text-left font-bold text-acr-ink">{row.unidade}</th>
                    <td className="max-w-52 px-3 py-3 text-acr-muted-2"><span className="block truncate">{row.empreendimentoNome}</span></td>
                    <td className="max-w-52 px-3 py-3">
                      <span className="block truncate font-medium text-acr-ink">{row.inquilinoNome ?? "—"}</span>
                      <span className="mt-1 block"><StatusChip status={row.statusOcupacao} /></span>
                    </td>
                    <MoneyCell value={row.aluguelEsperado} />
                    <MoneyCell value={row.aluguelRecebido} strong />
                    <MoneyCell value={row.receitaTotal} />
                    <MoneyCell value={row.desconto} />
                    <MoneyCell value={row.comissaoAdministracao} />
                    <MoneyCell value={row.repasseApurado} strong />
                    <td className="px-3 py-3 text-acr-muted-2 tabular-nums">{formatReference(row.vencimentoReferencia)}</td>
                    <td className="px-3 py-3"><QualityCell row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-acr-line md:hidden">
            {visible.map((row) => <MobileRevenueRow key={`${row.imovelId}-${row.competencia}`} row={row} />)}
          </div>

          <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          title={data.receitasPorImovel.length === 0 ? "Sem receitas por imóvel" : "Nenhum resultado para a busca"}
          description={data.receitasPorImovel.length === 0 ? "A tabela aparecerá quando houver snapshots vinculados à competência." : "Tente buscar por outra unidade, pessoa ou empreendimento."}
        />
      )}
    </Panel>
  )
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function filterRows(rows: IndicadoresPropertyRevenue[], query: string): IndicadoresPropertyRevenue[] {
  const needle = normalizeSearch(query)
  if (!needle) return rows
  return rows.filter((row) => normalizeSearch([row.unidade, row.inquilinoNome ?? "", row.empreendimentoNome].join(" ")).includes(needle))
}

function sortRows(rows: IndicadoresPropertyRevenue[], sort: { key: SortKey; direction: SortDirection }): IndicadoresPropertyRevenue[] {
  const direction = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((left, right) => {
    const a = left[sort.key]
    const b = right[sort.key]
    if (a === b) return left.imovelId.localeCompare(right.imovelId)
    if (a === null) return 1
    if (b === null) return -1
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR", { numeric: true })) * direction
  })
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  right = false,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; direction: SortDirection }
  onSort: (key: SortKey) => void
  right?: boolean
}) {
  const isActive = sort.key === sortKey
  const ariaSort = isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
  return (
    <th scope="col" aria-sort={ariaSort} className={cn("px-2 py-1 font-semibold", right ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green", right && "ml-auto")}
      >
        {label}
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform motion-reduce:transition-none", isActive && sort.direction === "asc" && "rotate-180", !isActive && "opacity-35")} />
      </button>
    </th>
  )
}

function MoneyCell({ value, strong = false }: { value: number | null; strong?: boolean }) {
  return <td className={cn("px-3 py-3 text-right text-acr-ink tabular-nums", strong && "font-bold")}>{formatCurrency(value)}</td>
}

function QualityCell({ row }: { row: IndicadoresPropertyRevenue }) {
  return (
    <span className="inline-flex flex-col gap-0.5 text-[10px] font-semibold text-acr-muted-2">
      <span>{qualityLabel(row.qualidade)}</span>
      <span className={row.origem === "backfill" ? "text-[#72500f]" : "text-acr-green-strong"}>{row.origem === "backfill" ? "Histórico recomposto" : "Snapshot nativo"}</span>
    </span>
  )
}

function MobileRevenueRow({ row }: { row: IndicadoresPropertyRevenue }) {
  return (
    <details className="group px-4 py-2">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-acr-ink">{row.unidade} · {row.empreendimentoNome}</p>
          <p className="mt-0.5 truncate text-xs text-acr-muted-2">{row.inquilinoNome ?? "Inquilino não informado"}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-acr-ink tabular-nums">{formatCurrency(row.aluguelRecebido)}</p>
          <p className="mt-0.5 text-[10px] text-acr-muted-2">Aluguel recebido</p>
        </div>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-acr-muted-2 transition-transform motion-reduce:transition-none group-open:rotate-180" />
      </summary>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-acr-line py-4 text-xs">
        <MobileValue label="Status" value={<StatusChip status={row.statusOcupacao} />} />
        <MobileValue label="Ref. financeira" value={formatReference(row.vencimentoReferencia)} />
        <MobileValue label="Aluguel esperado" value={formatCurrency(row.aluguelEsperado)} />
        <MobileValue label="Receita total" value={formatCurrency(row.receitaTotal)} />
        <MobileValue label="Desconto" value={formatCurrency(row.desconto)} />
        <MobileValue label="Comissão adm." value={formatCurrency(row.comissaoAdministracao)} />
        <MobileValue label="Repasse apurado" value={formatCurrency(row.repasseApurado)} />
        <MobileValue label="Qualidade" value={<QualityCell row={row} />} />
      </div>
    </details>
  )
}

function MobileValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-acr-muted-2">{label}</p>
      <div className="mt-1 font-semibold text-acr-ink tabular-nums">{value}</div>
    </div>
  )
}

function Pagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  return (
    <nav aria-label="Paginação das receitas" className="flex items-center justify-between gap-3 border-t border-acr-line px-4 py-3 sm:px-5">
      <p className="text-xs text-acr-muted-2 tabular-nums">Página {page} de {pageCount}</p>
      <div className="flex gap-2">
        <PageButton label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft aria-hidden="true" className="size-4" /></PageButton>
        <PageButton label="Próxima página" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight aria-hidden="true" className="size-4" /></PageButton>
      </div>
    </nav>
  )
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex size-11 items-center justify-center rounded-lg border border-acr-line-2 text-acr-muted-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  )
}

function buildCsvHref(rows: IndicadoresPropertyRevenue[]) {
  const header = ["competencia", "unidade", "inquilino", "empreendimento", "status", "aluguel_esperado", "aluguel_recebido", "receita_total", "desconto", "comissao_administracao", "repasse_apurado", "referencia_financeira", "origem", "qualidade"]
  const lines = rows.map((row) => [row.competencia, row.unidade, row.inquilinoNome, row.empreendimentoNome, occupancyLabel(row.statusOcupacao), row.aluguelEsperado, row.aluguelRecebido, row.receitaTotal, row.desconto, row.comissaoAdministracao, row.repasseApurado, row.vencimentoReferencia, row.origem, row.qualidade].map(escapeCsv).join(";"))
  const content = `\uFEFF${[header.join(";"), ...lines].join("\n")}`
  return `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`
}
