import type { IndicadoresData } from "@/lib/indicadores-types"
import { formatCurrency, formatPercent, type DashboardMetric } from "../lib/presentation"

type MonthlyPoint = IndicadoresData["serieMensal"][number]

export function MonthlySeries({
  series,
  metric,
}: {
  series: MonthlyPoint[]
  metric: DashboardMetric
}) {
  if (series.length === 0) return null

  if (metric === "percentual") {
    return (
      <div className="min-w-[680px] px-4 py-5 sm:px-5">
        <div className="grid grid-cols-[7rem_1fr_18rem] gap-x-3 gap-y-3 text-xs">
          {series.map((point) => (
            <PercentageRow key={point.competencia} point={point} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-acr-line pt-3 text-xs text-acr-muted-2">
          <Legend color="bg-acr-green" label="Ocupação" />
          <Legend color="bg-acr-green-soft ring-1 ring-acr-green/30" label="Cobertura do histórico mensal" />
        </div>
      </div>
    )
  }

  const max = Math.max(
    1,
    ...series.flatMap((point) => [point.receitaTotal ?? 0, point.aluguelRecebido ?? 0, point.repasseApurado ?? 0]),
  )

  return (
    <div className="min-w-[860px] px-4 py-5 sm:px-5">
      <div className="grid grid-cols-[6rem_1fr_27rem] gap-x-3 gap-y-4 text-xs">
        {series.map((point) => (
          <ValueRow key={point.competencia} point={point} max={max} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-acr-line pt-3 text-xs text-acr-muted-2">
        <Legend color="bg-acr-green" label="Receitas do fechamento" />
        <Legend color="bg-[#78ad80]" label="Aluguel recebido da competência" />
        <Legend color="bg-acr-muted" label="Repasse calculado" />
      </div>
    </div>
  )
}

function ValueRow({ point, max }: { point: MonthlyPoint; max: number }) {
  return (
    <>
      <div className="self-center font-semibold text-acr-muted-2">{point.label}</div>
      <div className="space-y-1" aria-label={`${point.label}: receitas ${formatCurrency(point.receitaTotal)}, aluguel ${formatCurrency(point.aluguelRecebido)}, repasse ${formatCurrency(point.repasseApurado)}`}>
        <Bar value={point.receitaTotal} max={max} className="bg-acr-green" />
        <Bar value={point.aluguelRecebido} max={max} className="bg-[#78ad80]" />
        <Bar value={point.repasseApurado} max={max} className="bg-acr-muted" />
      </div>
      <div className="flex items-center justify-end gap-3 text-right text-[10px] font-semibold text-acr-ink tabular-nums">
        <span>Receitas {formatCurrency(point.receitaTotal)}</span>
        <span>Aluguel {formatCurrency(point.aluguelRecebido)}</span>
        <span>Repasse {formatCurrency(point.repasseApurado)}</span>
      </div>
    </>
  )
}

function PercentageRow({ point }: { point: MonthlyPoint }) {
  return (
    <>
      <div className="self-center font-semibold text-acr-muted-2">{point.label}</div>
      <div className="space-y-1" aria-label={`${point.label}: ocupação ${formatPercent(point.ocupacaoPercentual)}, cobertura ${formatPercent(point.coberturaPercentual)}`}>
        <Bar value={point.ocupacaoPercentual} max={100} className="bg-acr-green" />
        <Bar value={point.coberturaPercentual} max={100} className="bg-acr-green-soft ring-1 ring-inset ring-acr-green/30" />
      </div>
      <div className="flex items-center justify-end gap-3 text-right text-[10px] font-semibold text-acr-ink tabular-nums">
        <span>Ocupação {formatPercent(point.ocupacaoPercentual)}</span>
        <span>Cobertura {formatPercent(point.coberturaPercentual)}</span>
      </div>
    </>
  )
}

function Bar({ value, max, className }: { value: number | null; max: number; className: string }) {
  if (value === null) return <div className="h-2 rounded-sm bg-[#edf0ed]" />
  const width = Math.max(value === 0 ? 0 : 2, Math.min(100, (value / max) * 100))
  return (
    <div className="h-2 overflow-hidden rounded-sm bg-acr-page">
      <div className={`h-full rounded-sm ${className}`} style={{ width: `${width}%` }} />
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 rounded-sm ${color}`} /> {label}
    </span>
  )
}
