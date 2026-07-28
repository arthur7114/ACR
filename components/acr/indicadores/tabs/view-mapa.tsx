"use client"

import type { IndicadoresData, IndicadoresHeatCell } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import { formatCurrency, formatPercent, occupancyLabel, type HeatMetric } from "../lib/presentation"
import { EmptyState, Panel, PanelHeader, StatusChip, ToggleButton } from "../primitives/dashboard-ui"

export type { HeatMetric }

export function ViewMapa({
  data,
  heatMetric,
  onHeatMetricChange,
}: {
  data: IndicadoresData
  heatMetric: HeatMetric
  onHeatMetricChange: (metric: HeatMetric) => void
}) {
  return (
    <Panel className="min-w-0 overflow-hidden">
      <PanelHeader
        title={heatMetric === "inad" ? "Riscos por imóvel · inadimplência" : "Riscos por imóvel · vacância"}
        description="O histórico mensal não é inferido a partir da posição atual. A coluna Hoje usa o cadastro vigente."
        source="Histórico mensal por imóvel e cadastro atual"
        help={{
          short: "Mostra riscos mensais sem inventar o passado.",
          title: "Riscos por imóvel",
          definition: "Histórico de inadimplência ou vacância para cada imóvel e competência.",
          source: "Histórico mensal por imóvel; apenas a coluna Hoje vem do cadastro atual.",
          limitation: "— significa ausência de dado e não equivale a risco zero.",
        }}
        action={
          <div className="inline-flex min-h-11 shrink-0 rounded-lg border border-acr-line-2 bg-white p-1" role="group" aria-label="Risco exibido">
            <ToggleButton selected={heatMetric === "inad"} onClick={() => onHeatMetricChange("inad")}>Inadimplência</ToggleButton>
            <ToggleButton selected={heatMetric === "vac"} onClick={() => onHeatMetricChange("vac")}>Vacância</ToggleButton>
          </div>
        }
      />

      {data.heat.linhas.length > 0 ? (
        <>
          <div className="max-h-[68vh] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acr-green" tabIndex={0} aria-label="Riscos por imóvel com rolagem interna">
            <table className="min-w-max border-separate border-spacing-0 text-xs">
              <caption className="sr-only">
                {heatMetric === "inad" ? "Inadimplência" : "Vacância"} por imóvel e competência, com posição atual em coluna separada.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-30 min-w-56 border-b border-r border-acr-line-2 bg-white px-4 py-3 text-left font-semibold text-acr-muted-2">
                    Imóvel
                  </th>
                  {data.heat.meses.map((month) => (
                    <th key={month.competencia} scope="col" className="sticky top-0 z-20 min-w-28 border-b border-acr-line-2 bg-white px-2 py-3 text-center font-semibold text-acr-muted-2">
                      {month.label}
                    </th>
                  ))}
                  <th scope="col" className="sticky right-0 top-0 z-30 min-w-32 border-b border-l-2 border-acr-green/25 bg-acr-green-tint px-3 py-3 text-center font-bold text-acr-green-strong">
                    Hoje
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.heat.linhas.map((row) => (
                  <tr key={row.imovelId}>
                    <th scope="row" className="sticky left-0 z-10 max-w-56 border-b border-r border-acr-line bg-white px-4 py-3 text-left">
                      <span className="block truncate font-bold text-acr-ink">{row.unidade}</span>
                      <span className="mt-0.5 block truncate font-normal text-acr-muted-2">{row.empreendimentoNome}</span>
                    </th>
                    {data.heat.meses.map((month) => {
                      const cell = row.celulas.find((candidate) => candidate.competencia === month.competencia) ?? null
                      return <HeatCell key={month.competencia} cell={cell} metric={heatMetric} month={month.label} unit={row.unidade} />
                    })}
                    <td className="sticky right-0 z-10 border-b border-l-2 border-acr-green/20 bg-acr-green-tint px-3 py-3 text-center">
                      <StatusChip status={row.hoje} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HeatLegend metric={heatMetric} />
        </>
      ) : (
        <EmptyState
          title="Sem histórico para o mapa"
          description="Nenhum histórico mensal foi encontrado para os filtros e a competência selecionados. A posição atual não é usada para inventar meses anteriores."
        />
      )}
    </Panel>
  )
}

function HeatCell({
  cell,
  metric,
  month,
  unit,
}: {
  cell: IndicadoresHeatCell | null
  metric: HeatMetric
  month: string
  unit: string
}) {
  const percentage = cell ? (metric === "inad" ? cell.inadimplenciaPercentual : cell.vacanciaPercentual) : null
  const status = cell?.statusOcupacao ?? null
  const isBackfill = cell?.origem === "backfill"
  const qualityDescription = cell?.qualidade === "parcial" ? ", qualidade parcial" : cell?.qualidade === "sem_linha" ? ", sem linha vinculada" : ""
  const accessible = cell === null || status === null || percentage === null
    ? `${unit}, ${month}: sem dado`
    : `${unit}, ${month}: ${occupancyLabel(status)}, ${formatPercent(percentage)}, valor não recebido ${formatCurrency(cell.valor)}${isBackfill ? ", histórico reconstruído" : ""}${qualityDescription}`

  return (
    <td
      aria-label={accessible}
      className={cn(
        "min-w-28 border-b border-white/70 px-2 py-2 text-center align-middle tabular-nums",
        heatTone(percentage, metric),
      )}
    >
      {percentage === null || status === null ? (
        <span className="text-sm font-bold text-acr-muted-2">—</span>
      ) : (
        <div className="flex min-h-14 flex-col items-center justify-center">
          <span className="text-sm font-bold">{formatPercent(percentage)}</span>
          <span className="mt-0.5 text-[10px] font-medium">{occupancyLabel(status)}</span>
          <span className="mt-0.5 text-[10px]">{formatCurrency(cell?.valor ?? null)}</span>
          {isBackfill && <span className="mt-1 rounded bg-white/75 px-1.5 py-0.5 text-[9px] font-bold">Histórico reconstruído</span>}
          {cell?.qualidade === "parcial" && <span className="mt-1 rounded bg-white/75 px-1.5 py-0.5 text-[9px] font-bold">Parcial</span>}
          {cell?.qualidade === "sem_linha" && <span className="mt-1 rounded bg-white/75 px-1.5 py-0.5 text-[9px] font-bold">Sem linha</span>}
        </div>
      )}
    </td>
  )
}

function heatTone(value: number | null, metric: HeatMetric): string {
  if (value === null) return "bg-[#f4f6f4] text-acr-muted-2"
  if (metric === "vac") return value >= 100 ? "acr-heat-q5" : "acr-heat-q0"
  if (value <= 1) return "acr-heat-q0"
  if (value <= 10) return "acr-heat-q1"
  if (value <= 25) return "acr-heat-q2"
  if (value <= 50) return "acr-heat-q3"
  if (value <= 75) return "acr-heat-q4"
  return "acr-heat-q5"
}

function HeatLegend({ metric }: { metric: HeatMetric }) {
  const ranges = ["0–1%", "1–10%", "10–25%", "25–50%", "50–75%", "75%+"]
  return (
    <div className="border-t border-acr-line px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold text-acr-ink">Escala de {metric === "inad" ? "inadimplência" : "vacância"}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-acr-muted-2">
        {metric === "inad" ? ranges.map((range, index) => (
          <span key={range} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-sm acr-heat-q${index}`} /> {range}
          </span>
        )) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-sm acr-heat-q0" /> 0% · não vago
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-sm acr-heat-q5" /> 100% · vago
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-[#f4f6f4] ring-1 ring-inset ring-acr-line-2" /> — sem dado
        </span>
        <span className="font-semibold">“Histórico reconstruído” identifica competências recompostas a partir dos documentos.</span>
        {metric === "vac" && <span className="font-semibold">Vacância é um estado mensal por imóvel, não uma escala contínua.</span>}
      </div>
    </div>
  )
}
