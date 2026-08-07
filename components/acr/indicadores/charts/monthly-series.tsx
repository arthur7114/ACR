"use client"

import { useState } from "react"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { formatCompactCurrency, formatCurrency, formatPercent, type DashboardMetric } from "../lib/presentation"

type MonthlyPoint = IndicadoresData["serieMensal"][number]

interface Series {
  key: string
  label: string
  color: string
  read: (point: MonthlyPoint) => number | null
  format: (value: number | null) => string
}

const VALUE_SERIES: Series[] = [
  { key: "receita", label: "Receitas", color: "var(--acr-green)", read: (point) => point.receitaTotal, format: formatCurrency },
  { key: "aluguel", label: "Aluguel recebido", color: "#78ad80", read: (point) => point.aluguelRecebido, format: formatCurrency },
  { key: "repasse", label: "Repasse", color: "var(--acr-muted)", read: (point) => point.repasseApurado, format: formatCurrency },
]

const PERCENT_SERIES: Series[] = [
  { key: "ocupacao", label: "Ocupação", color: "var(--acr-green)", read: (point) => point.ocupacaoPercentual, format: formatPercent },
  { key: "cobertura", label: "Cobertura", color: "#9ec7a5", read: (point) => point.coberturaPercentual, format: formatPercent },
]

const WIDTH = 760
const HEIGHT = 232
const PAD = { top: 14, right: 16, bottom: 28, left: 56 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom
const GRID_STEPS = 4

export function MonthlySeries({
  series,
  metric,
  selectedCompetencia,
}: {
  series: MonthlyPoint[]
  metric: DashboardMetric
  selectedCompetencia: string
}) {
  const definitions = metric === "percentual" ? PERCENT_SERIES : VALUE_SERIES
  const selectedIndex = Math.max(0, series.findIndex((point) => point.competencia === selectedCompetencia))
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered ?? selectedIndex

  if (series.length === 0) return null

  const maxValue = metric === "percentual"
    ? 100
    : niceCeiling(Math.max(1, ...series.flatMap((point) => definitions.map((item) => item.read(point) ?? 0))))

  const x = (index: number) =>
    series.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (index * PLOT_W) / (series.length - 1)
  const y = (value: number) => PAD.top + (1 - value / maxValue) * PLOT_H
  const band = series.length === 1 ? PLOT_W : PLOT_W / (series.length - 1)

  const activePoint = series[active]

  return (
    <div className="px-4 pb-4 pt-2 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <span className="text-sm font-bold text-acr-ink">{activePoint.label}</span>
        {definitions.map((item) => (
          <span key={item.key} className="inline-flex items-baseline gap-1.5">
            <span aria-hidden="true" className="size-2 translate-y-[-1px] rounded-full" style={{ background: item.color }} />
            <span className="text-xs text-acr-muted-2">{item.label}</span>
            <span className="text-xs font-semibold text-acr-ink tabular-nums">{item.format(item.read(activePoint))}</span>
          </span>
        ))}
      </div>

      {/* O SVG escala junto com a largura: abaixo de ~600px os rótulos ficariam
          ilegíveis, então a caixa rola em vez de encolher o texto. */}
      <div className="mt-3 overflow-x-auto overscroll-x-contain">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full min-w-[600px]"
        role="img"
        aria-label={`Série mensal por competência, ${series.length} ${series.length === 1 ? "mês" : "meses"}`}
      >
        {Array.from({ length: GRID_STEPS + 1 }, (_, step) => {
          const value = (maxValue / GRID_STEPS) * step
          const lineY = y(value)
          return (
            <g key={step}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={lineY}
                y2={lineY}
                stroke="var(--acr-line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 10} y={lineY + 4} textAnchor="end" className="fill-acr-muted text-[11px] tabular-nums">
                {metric === "percentual" ? `${value}%` : formatCompactCurrency(value)}
              </text>
            </g>
          )
        })}

        {series.map((point, index) => (
          <g key={point.competencia}>
            <text
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}
              className="fill-acr-muted text-[11px]"
            >
              {point.label}
            </text>
            <rect
              x={x(index) - band / 2}
              y={PAD.top}
              width={band}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}

        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={PAD.top + PLOT_H}
          stroke="var(--acr-line-2)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />

        {definitions.map((item) => (
          <g key={item.key}>
            {buildRuns(series, item.read).map((run, runIndex) => (
              <polyline
                key={runIndex}
                points={run.map(({ index, value }) => `${x(index)},${y(value)}`).join(" ")}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((point, index) => {
              const value = item.read(point)
              if (value === null) return null
              return (
                <circle
                  key={point.competencia}
                  cx={x(index)}
                  cy={y(value)}
                  r={index === active ? 4.5 : 2.5}
                  fill={index === active ? item.color : "#ffffff"}
                  stroke={item.color}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </g>
        ))}
      </svg>
      </div>

      <table className="sr-only">
        <caption>Série mensal por competência</caption>
        <thead>
          <tr>
            <th scope="col">Competência</th>
            {definitions.map((item) => <th key={item.key} scope="col">{item.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.competencia}>
              <th scope="row">{point.label}</th>
              {definitions.map((item) => <td key={item.key}>{item.format(item.read(point))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Uma linha não pode atravessar um mês sem dado: isso desenharia uma
// interpolação que ninguém mediu. Cada trecho contíguo com valor conhecido
// vira uma polyline separada, e a lacuna aparece como lacuna.
function buildRuns(series: MonthlyPoint[], read: (point: MonthlyPoint) => number | null) {
  const runs: Array<Array<{ index: number; value: number }>> = []
  let current: Array<{ index: number; value: number }> = []

  series.forEach((point, index) => {
    const value = read(point)
    if (value === null) {
      if (current.length > 0) runs.push(current)
      current = []
      return
    }
    current.push({ index, value })
  })
  if (current.length > 0) runs.push(current)

  return runs.filter((run) => run.length > 1)
}

function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
  const found = steps.find((step) => step * magnitude >= value)
  return (found ?? 10) * magnitude
}
