"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AlertTriangle, CalendarDays, LoaderCircle, RefreshCw } from "lucide-react"
import type { IndicadoresData, IndicadoresFiltroOption } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import { EmptyState } from "../indicadores/primitives/dashboard-ui"
import { formatDateTime, getClosingsCoverage, type DashboardMetric, type DashboardTab, type HeatMetric } from "../indicadores/lib/presentation"
import { ViewGeral } from "../indicadores/tabs/view-geral"
import { ViewReceita } from "../indicadores/tabs/view-receita"
import { ViewMapa } from "../indicadores/tabs/view-mapa"
import { ViewRegistro } from "../indicadores/tabs/view-registro"

type Filters = { competencia: string; empresaId: string; empreendimentoId: string; imovelId: string }

const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "geral", label: "Visão geral" },
  { id: "receita", label: "Conciliação financeira" },
  { id: "mapa", label: "Riscos por imóvel" },
  { id: "imoveis", label: "Detalhamento por imóvel" },
]

export function IndicadoresView() {
  const [data, setData] = useState<IndicadoresData | null>(null)
  const [filters, setFilters] = useState<Filters>({ competencia: "", empresaId: "", empreendimentoId: "", imovelId: "" })
  const [tab, setTab] = useState<DashboardTab>("geral")
  const [metric, setMetric] = useState<DashboardMetric>("valor")
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("inad")
  const [isUrlReady, setIsUrlReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    if (!isUrlReady) return
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    const params = new URLSearchParams()
    if (filters.competencia) params.set("competencia", filters.competencia)
    if (filters.empresaId) params.set("empresaId", filters.empresaId)
    if (filters.empreendimentoId) params.set("empreendimentoId", filters.empreendimentoId)
    if (filters.imovelId) params.set("imovelId", filters.imovelId)

    setIsLoading(true)
    setError(null)

    async function load() {
      try {
        const response = await fetch(`/api/indicadores?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
        const payload: unknown = await response.json()
        const indicadores = isRecord(payload) ? payload.indicadores : undefined
        if (!response.ok || !isIndicadoresData(indicadores)) {
          throw new Error(
            getApiErrorMessage(payload)
              || (response.ok
                ? "A API retornou uma versão incompatível dos indicadores. Atualize e tente novamente."
                : "Não foi possível carregar os indicadores."),
          )
        }
        if (requestId.current !== currentRequest) return
        setData(indicadores)
        if (!filters.competencia && indicadores.meta.competencia) {
          replaceUrl({ competencia: indicadores.meta.competencia })
        }
      } catch (loadError) {
        if (controller.signal.aborted || requestId.current !== currentRequest) return
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os indicadores.")
      } finally {
        if (!controller.signal.aborted && requestId.current === currentRequest) setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [filters.competencia, filters.empresaId, filters.empreendimentoId, filters.imovelId, isUrlReady, retry])

  useEffect(() => {
    function syncFromHistory() {
      const next = getUrlState()
      setFilters(next.filters)
      setTab(next.tab)
      setMetric(next.metric)
      setHeatMetric(next.heatMetric)
    }
    syncFromHistory()
    setIsUrlReady(true)
    window.addEventListener("popstate", syncFromHistory)
    return () => window.removeEventListener("popstate", syncFromHistory)
  }, [])

  function updateFilters(patch: Partial<Filters>) {
    const next = { ...filters, ...patch }
    setFilters(next)
    setUrlState(next, tab, metric, heatMetric)
  }

  function changeFilter(key: keyof Filters, value: string) {
    const competence = filters.competencia || data?.meta.competencia || ""
    if (key === "empresaId") {
      updateFilters({ competencia: competence, empresaId: value, empreendimentoId: "", imovelId: "" })
      return
    }
    if (key === "empreendimentoId") {
      updateFilters({ competencia: competence, empreendimentoId: value, imovelId: "" })
      return
    }
    updateFilters({ competencia: competence, [key]: value })
  }

  function changeTab(next: DashboardTab) {
    setTab(next)
    setUrlState(filtersWithDefaultCompetence(filters, data), next, metric, heatMetric)
  }

  function changeMetric(next: DashboardMetric) {
    setMetric(next)
    setUrlState(filtersWithDefaultCompetence(filters, data), tab, next, heatMetric)
  }

  function changeHeatMetric(next: HeatMetric) {
    setHeatMetric(next)
    setUrlState(filtersWithDefaultCompetence(filters, data), tab, metric, next)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TABS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length
    const next = TABS[nextIndex]
    changeTab(next.id)
    document.getElementById(`indicadores-tab-${next.id}`)?.focus()
  }

  const hasNoData = data
    && getClosingsCoverage(data).esperados === 0
    && data.receitasPorImovel.length === 0
    && data.serieMensal.length === 0

  return (
    <div className="min-w-0 max-w-full text-acr-ink" aria-busy={isLoading}>
      <header className="mb-4 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-[-0.025em] text-acr-ink text-balance">Operação financeira da carteira</h1>
            {isLoading && data && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-acr-green-tint px-2.5 py-1 text-xs font-semibold text-acr-green-strong" role="status">
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> Atualizando
              </span>
            )}
          </div>
          {data && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-acr-muted-2">
              <CalendarDays aria-hidden="true" className="size-3.5" /> Atualizado em {formatDateTime(data.meta.atualizadoEm)} · cálculo {data.meta.calculoVersao}
            </p>
          )}
        </div>
        <FiltersBar data={data} filters={filters} onChange={changeFilter} disabled={isLoading && !data} />
      </header>

      {isLoading && !data && <DashboardSkeleton />}

      {error && !data && (
        <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />
      )}

      {data && (
        <>
          {error && (
            <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-acr-red/30 bg-acr-red-soft p-4 text-sm text-acr-red sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> A atualização falhou. Os dados anteriores continuam visíveis: {error}</span>
              <RetryButton onClick={() => setRetry((value) => value + 1)} />
            </div>
          )}

          <nav className="mb-4 overflow-x-auto border-b border-acr-line overscroll-x-contain" aria-label="Seções dos indicadores">
            <div role="tablist" aria-label="Indicadores" className="flex min-w-max gap-1">
              {TABS.map((item, index) => (
                <button
                  key={item.id}
                  id={`indicadores-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`indicadores-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => changeTab(item.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn(
                    "min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acr-green",
                    tab === item.id ? "border-acr-green text-acr-green-strong" : "border-transparent text-acr-muted-2 hover:bg-acr-green-tint hover:text-acr-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          {hasNoData ? (
            <section className="rounded-xl border border-acr-line bg-white">
              <EmptyState title="Carteira ainda sem dados" description="Cadastre imóveis ou processe o primeiro fechamento para iniciar os indicadores. Nenhum histórico foi inventado a partir do cadastro atual." />
            </section>
          ) : (
            <div id={`indicadores-panel-${tab}`} role="tabpanel" aria-labelledby={`indicadores-tab-${tab}`} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green">
              {tab === "geral" && <ViewGeral data={data} metric={metric} onMetricChange={changeMetric} />}
              {tab === "receita" && <ViewReceita data={data} />}
              {tab === "mapa" && <ViewMapa data={data} heatMetric={heatMetric} onHeatMetricChange={changeHeatMetric} />}
              {tab === "imoveis" && <ViewRegistro data={data} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FiltersBar({
  data,
  filters,
  onChange,
  disabled,
}: {
  data: IndicadoresData | null
  filters: Filters
  onChange: (key: keyof Filters, value: string) => void
  disabled: boolean
}) {
  return (
    <div className="grid min-w-0 w-full gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:w-auto" aria-label="Filtros dos indicadores">
      <FilterSelect name="competencia" label="Competência" value={filters.competencia || data?.meta.competencia || ""} options={data?.filtros.competencias ?? []} onChange={(value) => onChange("competencia", value)} disabled={disabled} emptyLabel="Sem competências" />
      <FilterSelect name="empresa" label="Empresa" value={filters.empresaId} options={data?.filtros.empresas ?? []} onChange={(value) => onChange("empresaId", value)} disabled={disabled} emptyLabel="Todas as empresas" allowAll />
      <FilterSelect name="empreendimento" label="Empreendimento" value={filters.empreendimentoId} options={data?.filtros.empreendimentos ?? []} onChange={(value) => onChange("empreendimentoId", value)} disabled={disabled} emptyLabel="Todos os empreendimentos" allowAll />
      <FilterSelect name="imovel" label="Imóvel" value={filters.imovelId} options={data?.filtros.imoveis ?? []} onChange={(value) => onChange("imovelId", value)} disabled={disabled} emptyLabel="Todos os imóveis" allowAll />
    </div>
  )
}

function FilterSelect({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
  emptyLabel,
  allowAll = false,
}: {
  name: string
  label: string
  value: string
  options: IndicadoresFiltroOption[]
  onChange: (value: string) => void
  disabled: boolean
  emptyLabel: string
  allowAll?: boolean
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold text-acr-muted-2">{label}</span>
      <select
        name={`indicadores-${name}`}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-11 w-full min-w-0 rounded-lg border border-acr-line-2 bg-white px-3 text-sm font-medium text-acr-ink outline-none focus:border-acr-green focus:ring-2 focus:ring-acr-green/15 disabled:cursor-not-allowed disabled:opacity-55 2xl:w-44"
      >
        {(allowAll || options.length === 0) && <option value="">{emptyLabel}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Carregando indicadores" className="animate-pulse space-y-4 motion-reduce:animate-none">
      <div className="h-12 rounded-lg bg-[#edf0ed]" />
      <div className="h-40 rounded-xl bg-[#edf0ed]" />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="h-32 rounded-xl bg-[#edf0ed]" />
        <div className="h-52 rounded-xl bg-[#edf0ed]" />
      </div>
      <div className="h-28 rounded-xl bg-[#edf0ed]" />
      <div className="h-72 rounded-xl bg-[#edf0ed]" />
      <span className="sr-only">Carregando indicadores…</span>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section role="alert" className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-acr-red/30 bg-acr-red-soft px-6 py-10 text-center">
      <AlertTriangle aria-hidden="true" className="size-8 text-acr-red" />
      <h2 className="mt-3 text-base font-bold text-acr-ink">Falha ao carregar os indicadores</h2>
      <p className="mt-1 max-w-[60ch] text-sm leading-5 text-acr-muted-2">{message}</p>
      <div className="mt-4"><RetryButton onClick={onRetry} /></div>
    </section>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-acr-green-strong px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green-strong">
      <RefreshCw aria-hidden="true" className="size-4" /> Tentar novamente
    </button>
  )
}

function filtersWithDefaultCompetence(filters: Filters, data: IndicadoresData | null): Filters {
  return { ...filters, competencia: filters.competencia || data?.meta.competencia || "" }
}

function setUrlState(filters: Filters, tab: DashboardTab, metric: DashboardMetric, heatMetric: HeatMetric) {
  const url = new URL(window.location.href)
  updateUrlParam(url, "competencia", filters.competencia)
  updateUrlParam(url, "empresaId", filters.empresaId)
  updateUrlParam(url, "empreendimentoId", filters.empreendimentoId)
  updateUrlParam(url, "imovelId", filters.imovelId)
  updateUrlParam(url, "tab", tab)
  updateUrlParam(url, "metric", metric)
  updateUrlParam(url, "heatMetric", heatMetric)
  window.history.replaceState(window.history.state, "", url)
}

function replaceUrl(patch: Partial<Filters>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(patch)) updateUrlParam(url, key, value ?? "")
  window.history.replaceState(window.history.state, "", url)
}

function updateUrlParam(url: URL, key: string, value: string) {
  if (value) url.searchParams.set(key, value)
  else url.searchParams.delete(key)
}

function getUrlState(): { filters: Filters; tab: DashboardTab; metric: DashboardMetric; heatMetric: HeatMetric } {
  if (typeof window === "undefined") {
    return { filters: { competencia: "", empresaId: "", empreendimentoId: "", imovelId: "" }, tab: "geral", metric: "valor", heatMetric: "inad" }
  }
  const params = new URLSearchParams(window.location.search)
  const rawTab = params.get("tab")
  const tab: DashboardTab = rawTab === "receita" || rawTab === "mapa" || rawTab === "imoveis" ? rawTab : rawTab === "registro" ? "imoveis" : "geral"
  const rawMetric = params.get("metric")
  const metric: DashboardMetric = rawMetric === "percentual" || rawMetric === "pct" ? "percentual" : "valor"
  const heatMetric: HeatMetric = params.get("heatMetric") === "vac" ? "vac" : "inad"
  return {
    filters: {
      competencia: params.get("competencia") ?? "",
      empresaId: params.get("empresaId") ?? "",
      empreendimentoId: params.get("empreendimentoId") ?? "",
      imovelId: params.get("imovelId") ?? "",
    },
    tab,
    metric,
    heatMetric,
  }
}

function isIndicadoresData(value: unknown): value is IndicadoresData {
  if (!isRecord(value)) return false

  const meta = value.meta
  const heat = value.heat
  const hasConfidence = isRecord(meta)
    && (
      meta.statusConfianca === "confirmado"
      || meta.statusConfianca === "em_conferencia"
      || meta.statusConfianca === "incompleto"
      || meta.statusConfianca === "com_divergencia"
      || meta.qualidade === "completa"
      || meta.qualidade === "preliminar"
    )
  return isRecord(meta)
    && typeof meta.competencia === "string"
    && hasConfidence
    && isRecord(value.cobertura)
    && isRecord(value.resumo)
    && isRecord(value.ponteFinanceira)
    && isRecord(value.realizacaoAluguel)
    && Array.isArray(value.serieMensal)
    && Array.isArray(value.rankingAtencao)
    && isRecord(heat)
    && Array.isArray(heat.meses)
    && Array.isArray(heat.linhas)
    && Array.isArray(value.receitasPorImovel)
    && isRecord(value.filtros)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getApiErrorMessage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return null
  return typeof payload.error.message === "string" ? payload.error.message : null
}
