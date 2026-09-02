"use client"

import { useId, useState } from "react"
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  type DashboardMetric,
  type MonthlyPoint,
} from "../lib/presentation"

interface Series {
  key: string
  label: string
  color: string
  read: (point: MonthlyPoint) => number | null
  format: (value: number | null) => string
}

// Barras agrupadas por mês (decisão do cliente, 2026-09-02: "o de linha tá
// muito zoado e aparecendo muito texto"). Na tela fica só a legenda; o número
// de cada barra vive no hover/foco e na tabela acessível.
//
// A série de valores mede a REALIZAÇÃO do aluguel contratado. O contratado não
// é uma categoria ao lado das outras: é o teto do mês, então vira uma linha de
// referência por cima do grupo, e as barras são o recebido e as duas perdas que
// explicam a distância até ela. Cores validadas com o verificador de paleta
// (adjacências verde↔âmbar↔vermelho-escuro passam ΔE de daltonismo; o antigo
// par #b45309↔#c2410c tinha ΔE 0,1 para deutan — indistinguíveis).
const VALUE_SERIES: Series[] = [
  { key: "recebido", label: "Recebido da competência", color: "#2d8c3a", read: (point) => point.aluguelRecebido, format: formatCurrency },
  { key: "vacancia", label: "Vacância", color: "#d9a441", read: (point) => point.vacancia, format: formatCurrency },
  { key: "inadimplencia", label: "Inadimplência", color: "#9f2a2a", read: (point) => point.inadimplencia, format: formatCurrency },
]

const VALUE_CEILING: Series = {
  key: "contratado",
  label: "Aluguel contratado (teto)",
  color: "#6b7f6e",
  read: (point) => point.aluguelContratado,
  format: formatCurrency,
}

// Cobertura saiu: é qualidade do dado, não indicador de operação, e já vive no
// banner de confiança do topo. No lugar entra a inadimplência em percentual, que
// é a leitura que acompanha a ocupação.
const PERCENT_SERIES: Series[] = [
  { key: "ocupacao", label: "Ocupação", color: "#2d8c3a", read: (point) => point.ocupacaoPercentual, format: formatPercent },
  { key: "inadimplencia", label: "Inadimplentes", color: "#9f2a2a", read: (point) => point.inadimplenciaPercentual, format: formatPercent },
]

const WIDTH = 760
const HEIGHT = 232
const PAD = { top: 14, right: 16, bottom: 28, left: 56 }
const PLOT_H = HEIGHT - PAD.top - PAD.bottom
const GRID_STEPS = 4
const MONTH_WIDTH = 84
const BAR_MAX = 24
const BAR_GAP = 2
const BAND_PADDING = 10
const CORNER = 4

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
  const ceiling = metric === "percentual" ? null : VALUE_CEILING
  const selectedIndex = resolveSelectedIndex(series, selectedCompetencia)
  const [hovered, setHovered] = useState<{ index: number; key: string | null } | null>(null)
  const tooltipId = useId()

  if (series.length === 0) return null

  const width = Math.max(WIDTH, PAD.left + PAD.right + series.length * MONTH_WIDTH)
  const plotWidth = width - PAD.left - PAD.right
  const band = plotWidth / series.length
  const barWidth = Math.min(BAR_MAX, (band - BAND_PADDING * 2 - BAR_GAP * (definitions.length - 1)) / definitions.length)
  const groupWidth = barWidth * definitions.length + BAR_GAP * (definitions.length - 1)
  const maxValue = metric === "percentual"
    ? 100
    : niceCeiling(
        Math.max(
          1,
          ...series.flatMap((point) => [...definitions, ...(ceiling ? [ceiling] : [])].map((item) => item.read(point) ?? 0)),
        ),
      )

  const bandStart = (index: number) => PAD.left + index * band
  const barX = (index: number, seriesIndex: number) =>
    bandStart(index) + (band - groupWidth) / 2 + seriesIndex * (barWidth + BAR_GAP)
  const y = (value: number) => PAD.top + (1 - Math.min(value, maxValue) / maxValue) * PLOT_H
  const baseline = PAD.top + PLOT_H

  const activePoint = hovered ? series[hovered.index] : null

  return (
    <div className="px-4 pb-4 pt-2 sm:px-5">
      {/* Legenda: só o que é cada coisa. Barras têm chave retangular, o teto
          tem chave de linha, como a marca que representam. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5" aria-hidden="true">
        {definitions.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-xs text-acr-muted-2">
            <span className="h-3 w-2.5 rounded-[3px]" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        {ceiling && (
          <span className="inline-flex items-center gap-1.5 text-xs text-acr-muted-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: ceiling.color }} />
            {ceiling.label}
          </span>
        )}
      </div>

      {/* O SVG escala junto com a largura: abaixo de ~600px os rótulos ficariam
          ilegíveis, então a caixa rola em vez de encolher o texto. O tooltip é
          posicionado em percentual do próprio SVG, então acompanha a escala. */}
      <div className="mt-3 overflow-x-auto overscroll-x-contain">
        <div className="relative" style={{ minWidth: Math.max(600, width) }}>
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Série mensal por competência, ${series.length} ${series.length === 1 ? "mês" : "meses"}`}
            onMouseLeave={() => setHovered(null)}
          >
            {Array.from({ length: GRID_STEPS + 1 }, (_, step) => {
              const value = (maxValue / GRID_STEPS) * step
              const lineY = y(value)
              return (
                <g key={step}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
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

            {series.map((point, index) => {
              const isSelected = index === selectedIndex
              const isActive = hovered?.index === index
              return (
                <g key={point.competencia}>
                  {(isSelected || isActive) && (
                    <rect
                      x={bandStart(index)}
                      y={PAD.top}
                      width={band}
                      height={PLOT_H}
                      fill={isActive ? "var(--acr-line)" : "var(--acr-page)"}
                      opacity={isActive ? 0.9 : 1}
                    />
                  )}
                  <text
                    x={bandStart(index) + band / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className={isSelected ? "fill-acr-ink text-[11px] font-semibold" : "fill-acr-muted text-[11px]"}
                  >
                    {point.label}
                  </text>
                  {/* A faixa inteira do mês é alvo: quem mira na competência e
                      não na barra também recebe o detalhamento. */}
                  <rect
                    x={bandStart(index)}
                    y={PAD.top}
                    width={band}
                    height={PLOT_H}
                    fill="transparent"
                    onMouseEnter={() => setHovered({ index, key: null })}
                  />
                </g>
              )
            })}

            {series.map((point, index) =>
              definitions.map((item, seriesIndex) => {
                const value = item.read(point)
                if (value === null) return null
                const top = y(value)
                const height = Math.max(0, baseline - top)
                const x = barX(index, seriesIndex)
                const isActive = hovered?.index === index && (hovered.key === null || hovered.key === item.key)
                return (
                  <g key={`${point.competencia}-${item.key}`}>
                    <path
                      d={roundedTopBar(x, top, barWidth, height)}
                      fill={item.color}
                      opacity={hovered && !isActive ? 0.45 : 1}
                    />
                    {/* Alvo maior que a barra: a faixa da barra até o topo do
                        gráfico, com a folga do espaçador. */}
                    <rect
                      x={x - BAR_GAP / 2}
                      y={PAD.top}
                      width={barWidth + BAR_GAP}
                      height={PLOT_H}
                      fill="transparent"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-describedby={tooltipId}
                      aria-label={`${point.label}, ${item.label}: ${item.format(value)}`}
                      onMouseEnter={() => setHovered({ index, key: item.key })}
                      onFocus={() => setHovered({ index, key: item.key })}
                      onBlur={() => setHovered(null)}
                      className="outline-none focus-visible:stroke-acr-green focus-visible:[stroke-width:2px]"
                    />
                  </g>
                )
              }),
            )}

            {ceiling &&
              series.map((point, index) => {
                const value = ceiling.read(point)
                if (value === null) return null
                const lineY = y(value)
                const x = bandStart(index) + (band - groupWidth) / 2
                return (
                  <line
                    key={`teto-${point.competencia}`}
                    x1={x - 4}
                    x2={x + groupWidth + 4}
                    y1={lineY}
                    y2={lineY}
                    stroke={ceiling.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
          </svg>

          {activePoint && hovered && (
            <SeriesTooltip
              id={tooltipId}
              point={activePoint}
              items={[...(ceiling ? [ceiling] : []), ...definitions]}
              highlighted={hovered.key}
              leftPercent={((bandStart(hovered.index) + band / 2) / width) * 100}
              alignRight={hovered.index >= series.length / 2}
            />
          )}
        </div>
      </div>

      <div className="sr-only">
        <table>
          <caption>Série mensal por competência</caption>
          <thead>
            <tr>
              <th scope="col">Competência</th>
              {[...(ceiling ? [ceiling] : []), ...definitions].map((item) => <th key={item.key} scope="col">{item.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.competencia}>
                <th scope="row">{point.label}</th>
                {[...(ceiling ? [ceiling] : []), ...definitions].map((item) => <td key={item.key}>{item.format(item.read(point))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Um tooltip, todas as séries do mês: o leitor mira na competência e recebe o
// detalhamento inteiro, com a barra sob o ponteiro em destaque. Valor forte,
// rótulo secundário — aqui ele já sabe a série e quer o número.
function SeriesTooltip({
  id,
  point,
  items,
  highlighted,
  leftPercent,
  alignRight,
}: {
  id: string
  point: MonthlyPoint
  items: Series[]
  highlighted: string | null
  leftPercent: number
  alignRight: boolean
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute top-2 z-10 min-w-[220px] rounded-lg border border-acr-line bg-white px-3 py-2 text-xs shadow-[0_4px_16px_rgba(26,43,28,0.12)]"
      style={{
        left: `${leftPercent}%`,
        transform: alignRight ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
      }}
    >
      <p className="font-semibold text-acr-ink">{point.label}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => {
          const value = item.read(point)
          const isHighlighted = highlighted === item.key
          return (
            <li
              key={item.key}
              className={`flex items-center justify-between gap-4 rounded px-1 -mx-1 ${isHighlighted ? "bg-acr-page" : ""}`}
            >
              <span className="inline-flex items-center gap-1.5 text-acr-muted-2">
                <span className="h-0.5 w-3 rounded-full" style={{ background: item.color }} />
                {item.label}
              </span>
              <span className={`tabular-nums ${isHighlighted ? "font-bold text-acr-ink" : "font-semibold text-acr-ink"}`}>
                {value === null ? "sem dado" : item.format(value)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Barra com o topo arredondado (4px) e a base reta na linha zero.
function roundedTopBar(x: number, top: number, width: number, height: number): string {
  if (height <= 0) return ""
  const r = Math.min(CORNER, width / 2, height)
  const right = x + width
  const bottom = top + height
  return [
    `M${x},${bottom}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${right - r}`,
    `Q${right},${top} ${right},${top + r}`,
    `V${bottom}`,
    "Z",
  ].join(" ")
}

function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
  const found = steps.find((step) => step * magnitude >= value)
  return (found ?? 10) * magnitude
}

function resolveSelectedIndex(series: MonthlyPoint[], selectedCompetencia: string) {
  const selected = series.findIndex((point) => point.competencia === selectedCompetencia)
  return selected >= 0 ? selected : Math.max(0, series.length - 1)
}
