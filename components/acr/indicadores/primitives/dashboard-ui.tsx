"use client"

import { useId, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  AlertTriangle,
  CircleHelp,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  occupancyLabel,
  type DashboardMetric,
  type OccupancyStatus,
} from "../lib/presentation"

export interface MetricHelpContent {
  short: string
  title: string
  definition: string
  formula?: string
  source?: string
  limitation?: string
}

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
  help,
}: {
  title: string
  description?: string
  source?: string
  action?: ReactNode
  help?: MetricHelpContent
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-acr-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-acr-ink text-pretty">{title}</h2>
          {help && <MetricHelp {...help} />}
        </div>
        {description && <p className="mt-1 max-w-[70ch] text-sm leading-5 text-acr-muted-2">{description}</p>}
        {/* PROVENIÊNCIA (não renderizada — D7): a prop `source` documenta no código
            de onde a métrica vem. Consulte-a nos call sites; o usuário final não a vê. */}
        {void source}
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
  tone = "default",
  help,
}: {
  label: string
  value: string
  detail: string
  source: string
  tone?: "default" | "warning" | "danger"
  help?: MetricHelpContent
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
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-acr-muted-2">{label}</p>
        {help && <MetricHelp {...help} />}
      </div>
      <p className="mt-3 break-words text-[1.55rem] font-bold leading-tight tracking-[-0.025em] text-acr-ink tabular-nums" title={value}>
        {value}
      </p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-acr-muted-2">{detail}</p>
      {/* PROVENIÊNCIA (não renderizada — D7): prop `source` mantida como documentação. */}
      {void source}
    </article>
  )
}

export function MetricHelp({
  short,
  title,
  definition,
  formula,
  source,
  limitation,
}: MetricHelpContent) {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="group relative -my-1.5 inline-flex size-11 shrink-0">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-describedby={tooltipId}
            aria-label={`Saiba mais sobre ${title}`}
            className="inline-flex size-11 touch-manipulation items-center justify-center rounded-md text-acr-muted-2 transition-colors motion-reduce:transition-none hover:bg-acr-green-tint hover:text-acr-green-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green"
            onKeyDown={(event) => toggleHelpFromKeyboard(event, () => setOpen((current) => !current))}
          >
            <CircleHelp aria-hidden="true" className="size-4" />
          </button>
        </PopoverTrigger>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute left-1/2 top-full z-40 mt-1 w-max max-w-64 -translate-x-1/2 rounded-md bg-acr-ink px-3 py-1.5 text-xs text-white opacity-0 shadow-md transition motion-reduce:transition-none group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          {short}
        </span>
      </span>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] border-acr-line bg-white p-0">
        <div className="border-b border-acr-line px-4 py-3">
          <h3 className="text-sm font-bold text-acr-ink">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-acr-muted-2">{definition}</p>
        </div>
        <dl className="space-y-3 px-4 py-3 text-xs leading-5">
          {formula && <HelpDetail label="Fórmula" value={formula} />}
          {source && <HelpDetail label="Fonte" value={source} />}
          {limitation && <HelpDetail label="Limitação" value={limitation} />}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function toggleHelpFromKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  toggle: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return
  event.preventDefault()
  toggle()
}

function HelpDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-acr-ink">{label}</dt>
      <dd className="text-acr-muted-2">{value}</dd>
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
        "min-h-11 rounded-md px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green",
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
        status === "alugado_app" && "bg-[#ece7f7] text-[#5b3f97]",
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
