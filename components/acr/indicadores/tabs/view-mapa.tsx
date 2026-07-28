"use client"

import type { IndicadoresData, IndicadoresHeatCell } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import {
  formatCurrency,
  formatHistoryCoverage,
  formatPercent,
  occupancyLabel,
  type HeatMetric,
} from "../lib/presentation"
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
        description="Cada linha acompanha uma unidade mês a mês. O estado vem primeiro; percentual e valor completam a leitura."
        source="Histórico mensal por imóvel e cadastro atual"
        help={{
          short: "Acompanha o histórico mensal de cada unidade.",
          title: "Riscos por imóvel",
          definition: "Histórico de inadimplência ou vacância para cada imóvel e competência.",
          source: "Histórico mensal por imóvel; apenas a coluna Hoje vem do cadastro atual.",
          limitation: "Sem dados no mês não equivale a risco zero.",
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
                {data.heat.linhas.map((row) => {
                  const recordedMonths = row.celulas.filter((cell) => cell.origem !== null).length
                  const classifiedMonths = row.celulas.filter(
                    (cell) => cell.statusOcupacao !== null && cell.statusOcupacao !== "desconhecido",
                  ).length
                  return (
                    <tr key={row.imovelId}>
                      <th scope="row" className="sticky left-0 z-10 min-w-64 max-w-64 border-b border-r border-acr-line bg-white px-4 py-3 text-left">
                        <span className="block truncate font-bold text-acr-ink">{row.unidade}</span>
                        <span className="mt-0.5 block truncate font-normal text-acr-muted-2">{row.empreendimentoNome}</span>
                        <span className="mt-2 block text-[10px] font-semibold leading-4 text-acr-green-strong">
                          {formatHistoryCoverage(recordedMonths, classifiedMonths, data.heat.meses.length)}
                        </span>
                      </th>
                      {data.heat.meses.map((month) => {
                        const cell = row.celulas.find((candidate) => candidate.competencia === month.competencia) ?? null
                        return <HeatCell key={month.competencia} cell={cell} metric={heatMetric} month={month.label} unit={row.unidade} />
                      })}
                      <td className="sticky right-0 z-10 border-b border-l-2 border-acr-green/20 bg-acr-green-tint px-3 py-3 text-center">
                        <StatusChip status={row.hoje} />
                      </td>
                    </tr>
                  )
                })}
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
  const metricDescription = metric === "inad" ? "de inadimplência" : "de vacância"
  const valueDescription = cell === null || cell.valor === null
    ? "valor indisponível"
    : metric === "inad" && percentage === 0 && cell.valor > 0
      ? `${formatCurrency(cell.valor)} de diferença`
      : `${formatCurrency(cell.valor)} não recebido`
  const qualityDescription = cell?.qualidade === "parcial" ? ", dados parciais" : cell?.qualidade === "sem_linha" ? ", vínculo pendente" : ""
  const accessible = cell === null || status === null
    ? `${unit}, ${month}: sem dado`
    : `${unit}, ${month}: ${occupancyLabel(status)}, ${percentage === null ? "percentual indisponível" : `${formatPercent(percentage)} ${metricDescription}`}, ${valueDescription}${qualityDescription}`

  return (
    <td
      aria-label={accessible}
      className={cn(
        "min-w-28 border-b border-white/70 px-2 py-2 text-center align-middle tabular-nums",
        heatTone(percentage, metric),
      )}
    >
      {status === null ? (
        <div className="flex min-h-20 flex-col items-center justify-center">
          <span className="text-sm font-bold text-acr-muted-2">—</span>
          <span className="mt-1 text-[10px] font-medium text-acr-muted-2">Sem dados no mês</span>
        </div>
      ) : (
        <div className="flex min-h-20 flex-col items-center justify-center">
          <span className="text-xs font-bold text-acr-ink">{occupancyLabel(status)}</span>
          {percentage === null && (cell === null || cell.valor === null) ? (
            <span className="mt-1 text-[10px] font-medium">Sem cálculo financeiro</span>
          ) : (
            <>
              <span className="mt-1 text-[11px] font-semibold">
                {percentage === null ? "Percentual indisponível" : `${formatPercent(percentage)} ${metricDescription}`}
              </span>
              <span className="mt-0.5 text-[10px]">{valueDescription}</span>
            </>
          )}
          {cell?.qualidade === "parcial" && <span className="mt-1 text-[9px] font-bold">Dados parciais</span>}
          {cell?.qualidade === "sem_linha" && <span className="mt-1 text-[9px] font-bold">Vínculo pendente</span>}
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
        {metric === "vac" && <span className="font-semibold">Vacância é um estado mensal por imóvel, não uma escala contínua.</span>}
      </div>
    </div>
  )
}
