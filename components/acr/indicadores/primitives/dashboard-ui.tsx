import type { ReactNode } from "react"
import { AlertTriangle, CheckCircle2, CircleHelp, Database, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { IndicadoresData } from "@/lib/indicadores-types"
import {
  formatCount,
  formatPercent,
  occupancyLabel,
  type DashboardMetric,
  type OccupancyStatus,
} from "../lib/presentation"

export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border border-acr-line bg-white", className)}>
      {children}
    </section>
  )
}

export function PanelHeader({
  title,
  description,
  source,
  action,
}: {
  title: string
  description?: string
  source?: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-acr-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-acr-ink text-pretty">{title}</h2>
        {description && <p className="mt-1 max-w-[70ch] text-sm leading-5 text-acr-muted-2">{description}</p>}
        {source && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-acr-muted-2">
            <Database aria-hidden="true" className="size-3.5" /> Fonte: {source}
          </p>
        )}
      </div>
      {action}
    </header>
  )
}

export function Kpi({
  label,
  value,
  detail,
  source,
  quality,
  tone = "default",
}: {
  label: string
  value: string
  detail: string
  source: string
  quality: "completa" | "preliminar"
  tone?: "default" | "warning" | "danger"
}) {
  return (
    <article
      className={cn(
        "min-w-0 border-t-2 bg-white px-4 py-4 sm:px-5",
        tone === "default" && "border-acr-green",
        tone === "warning" && "border-acr-amber",
        tone === "danger" && "border-acr-red",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-acr-muted-2">{label}</p>
        <QualityBadge quality={quality} compact />
      </div>
      <p className="mt-3 truncate text-[1.65rem] font-bold leading-none tracking-[-0.025em] text-acr-ink tabular-nums" title={value}>
        {value}
      </p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-acr-muted-2">{detail}</p>
      <p className="mt-2 flex items-center gap-1.5 border-t border-acr-line pt-2 text-[11px] leading-4 text-acr-muted-2">
        <Database aria-hidden="true" className="size-3" /> {source}
      </p>
    </article>
  )
}

export function QualityBadge({
  quality,
  compact = false,
}: {
  quality: "completa" | "preliminar"
  compact?: boolean
}) {
  const isComplete = quality === "completa"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        isComplete ? "bg-acr-green-soft text-acr-green-strong" : "bg-acr-amber-soft text-[#72500f]",
      )}
    >
      {isComplete ? <CheckCircle2 aria-hidden="true" className="size-3" /> : <AlertTriangle aria-hidden="true" className="size-3" />}
      {isComplete ? "Completa" : "Preliminar"}
    </span>
  )
}

export function CoverageBanner({ data }: { data: IndicadoresData }) {
  const isComplete = data.meta.qualidade === "completa"
  return (
    <section
      aria-label="Cobertura da competência"
      className={cn(
        "mb-4 rounded-xl border p-4",
        isComplete ? "border-acr-green/30 bg-acr-green-tint" : "border-acr-amber/35 bg-acr-amber-soft",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {isComplete ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-green" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-amber" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-acr-ink">Competência {data.meta.competenciaLabel}</h2>
              <QualityBadge quality={data.meta.qualidade} />
              {data.meta.historicoRecomposto && (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-acr-muted-2">
                  Histórico recomposto
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-5 text-acr-muted-2">
              {data.cobertura.pares.processados} de {data.cobertura.pares.esperados} pares processados. Valores pendentes entram como preliminares; rascunhos não entram nos totais.
            </p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
          <CoverageItem label="Pares" value={formatPercent(data.cobertura.pares.percentual)} />
          <CoverageItem label="Snapshots" value={formatPercent(data.cobertura.imoveis.percentual)} />
          <CoverageItem label="Ausentes" value={formatCount(data.cobertura.pares.ausentes)} />
          <CoverageItem label="Linhas sem vínculo" value={formatCount(data.cobertura.linhasNaoVinculadas)} />
        </dl>
      </div>
      {data.cobertura.lacunas.length > 0 && (
        <details className="mt-3 border-t border-current/10 pt-3 text-sm text-acr-muted-2">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green">
            Ver {data.cobertura.lacunas.length} lacuna(s) da base
          </summary>
          <ul className="space-y-1.5 pb-1 pl-5">
            {data.cobertura.lacunas.map((gap) => (
              <li key={gap.codigo} className="list-disc">
                {gap.mensagem} ({gap.quantidade})
                {gap.detalhes.length > 0 && (
                  <ul className="mt-1.5 space-y-1 border-l border-current/20 pl-3 text-xs">
                    {gap.detalhes.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-acr-muted-2">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-acr-ink tabular-nums">{value}</dd>
    </div>
  )
}

export function MetricToggle({
  value,
  onChange,
}: {
  value: DashboardMetric
  onChange: (value: DashboardMetric) => void
}) {
  return (
    <div className="inline-flex min-h-11 rounded-lg border border-acr-line-2 bg-white p-1" role="group" aria-label="Modo de visualização">
      <ToggleButton selected={value === "valor"} onClick={() => onChange("valor")}>Valores</ToggleButton>
      <ToggleButton selected={value === "percentual"} onClick={() => onChange("percentual")}>Percentuais</ToggleButton>
    </div>
  )
}

export function ToggleButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-md px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green",
        selected ? "bg-acr-green-strong text-white" : "text-acr-muted-2 hover:bg-acr-green-tint hover:text-acr-ink",
      )}
    >
      {children}
    </button>
  )
}

export function StatusChip({ status }: { status: OccupancyStatus }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-[11px] font-semibold",
        status === "ocupado" && "bg-acr-green-soft text-acr-green-strong",
        status === "inadimplente" && "bg-acr-red-soft text-acr-red",
        status === "vago" && "bg-acr-amber-soft text-[#72500f]",
        status === "em_rescisao" && "bg-[#e8eef6] text-[#315b88]",
        status === "desconhecido" && "bg-[#edf0ed] text-acr-muted-2",
      )}
    >
      {occupancyLabel(status)}
    </span>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <CircleHelp aria-hidden="true" className="size-7 text-acr-muted-2" />
      <h3 className="mt-3 text-sm font-bold text-acr-ink">{title}</h3>
      <p className="mt-1 max-w-[58ch] text-sm leading-5 text-acr-muted-2">{description}</p>
    </div>
  )
}

export function DataNote({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5 text-xs leading-5", warning ? "text-[#72500f]" : "text-acr-muted-2")}>
      {warning ? <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-acr-green" />}
      <p>{children}</p>
    </div>
  )
}
