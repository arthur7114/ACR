"use client"

import { useId, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Info,
  ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { IndicadoresData } from "@/lib/indicadores-types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  formatCount,
  formatPercent,
  getClosingsCoverage,
  getConfidenceStatus,
  occupancyLabel,
  type ConfidenceStatus,
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

export function CoverageBanner({ data }: { data: IndicadoresData }) {
  const status = getConfidenceStatus(data)
  const closings = getClosingsCoverage(data)
  const coverage = data.cobertura as unknown as {
    contratos?: { conhecidos: number; naoAplicaveis: number; ausentes: number }
    comprovantes?: { esperados: number; presentes: number; ausentes: number; percentual: number | null }
  }
  const confidence = confidenceContent(status)

  return (
    <section
      aria-label={`Confiança da competência: ${confidence.label}`}
      className={cn(
        "mb-4 rounded-xl border p-4",
        status === "confirmado" && "border-acr-green/30 bg-acr-green-tint",
        (status === "em_conferencia" || status === "incompleto") && "border-acr-amber/35 bg-acr-amber-soft",
        status === "com_divergencia" && "border-acr-red/30 bg-acr-red-soft",
      )}
    >
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.35fr)] xl:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <ConfidenceIcon status={status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-acr-ink">Competência {data.meta.competenciaLabel}</h2>
              <span className={cn(
                "rounded-md bg-white/85 px-2 py-1 text-xs font-bold",
                status === "confirmado" && "text-acr-green-strong",
                (status === "em_conferencia" || status === "incompleto") && "text-[#72500f]",
                status === "com_divergencia" && "text-acr-red",
              )}>
                {confidence.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-acr-muted-2">
              {confidence.description} {closings.processados} de {closings.esperados} fechamentos esperados estão processados.
            </p>
            <div className="mt-2">
              <HowToReadPanel />
            </div>
          </div>
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 2xl:grid-cols-4">
          <CoverageItem label="Fechamentos esperados" value={`${formatCount(closings.processados)}/${formatCount(closings.esperados)}`} />
          <CoverageItem label="Histórico por imóvel" value={formatPercent(data.cobertura.imoveis.percentual)} />
          <CoverageItem label="Contratos conhecidos" value={coverage.contratos ? formatCount(coverage.contratos.conhecidos) : "—"} />
          <CoverageItem label="Contratos não aplicáveis" value={coverage.contratos ? formatCount(coverage.contratos.naoAplicaveis) : "—"} />
          <CoverageItem label="Contratos ausentes" value={coverage.contratos ? formatCount(coverage.contratos.ausentes) : "—"} />
          <CoverageItem
            label="Comprovantes bancários"
            value={coverage.comprovantes ? `${formatCount(coverage.comprovantes.presentes)}/${formatCount(coverage.comprovantes.esperados)} · ${formatPercent(coverage.comprovantes.percentual)}` : "—"}
          />
          <CoverageItem label="Fechamentos ausentes" value={formatCount(closings.ausentes)} />
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

function HowToReadPanel() {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="group relative inline-flex">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-describedby={tooltipId}
            className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-md px-2 text-xs font-bold text-acr-green-strong transition-colors motion-reduce:transition-none hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acr-green"
            onKeyDown={(event) => toggleHelpFromKeyboard(event, () => setOpen((current) => !current))}
          >
            <BookOpen aria-hidden="true" className="size-3.5" />
            Como ler este painel
          </button>
        </PopoverTrigger>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute left-0 top-full z-40 mt-1 w-max max-w-64 rounded-md bg-acr-ink px-3 py-1.5 text-xs text-white opacity-0 shadow-md transition motion-reduce:transition-none group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          Entenda fontes, fórmulas e ausências.
        </span>
      </span>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] border-acr-line bg-white">
        <h3 className="text-sm font-bold text-acr-ink">Como ler este painel</h3>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-acr-muted-2">
          <li><strong className="text-acr-ink">Fonte da verdade:</strong> fechamento aprovado para valores financeiros, comprovante bancário para pagamento e contrato histórico para aluguel contratado.</li>
          <li><strong className="text-acr-ink">R$ 0,00</strong> é zero confirmado. <strong className="text-acr-ink">—</strong> indica dado ausente. <strong className="text-acr-ink">Não se aplica</strong> identifica receita variável.</li>
          <li>Os botões de ajuda abrem definição, fórmula, fonte e limitação da métrica.</li>
          <li>Uma diferença não explicada acima de R$ 0,01 impede o estado Confirmado.</li>
        </ul>
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

function ConfidenceIcon({ status }: { status: ConfidenceStatus }) {
  if (status === "confirmado") {
    return <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-green" />
  }
  if (status === "com_divergencia") {
    return <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-red" />
  }
  if (status === "incompleto") {
    return <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-amber" />
  }
  return <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-acr-amber" />
}

function confidenceContent(status: ConfidenceStatus) {
  if (status === "confirmado") {
    return {
      label: "Confirmado",
      description: "Fechamento final, reconciliação íntegra e comprovantes necessários presentes.",
    }
  }
  if (status === "com_divergencia") {
    return {
      label: "Com divergência",
      description: "Há diferença documental ou valor ainda não explicado.",
    }
  }
  if (status === "incompleto") {
    return {
      label: "Incompleto",
      description: "Falta fechamento, contrato, vínculo ou histórico mensal necessário.",
    }
  }
  return {
    label: "Em conferência",
    description: "Os dados estão visíveis, mas a aprovação ou comprovação bancária ainda não está completa.",
  }
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
