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
// A série de valores mede a REALIZAÇÃO do aluguel potencial. O potencial não é
// uma categoria ao lado das outras: é o total do mês, e a barra inteira o
// representa.
// Pedido da cliente (set/2026): em vez de tres barras lado a lado com uma linha
// de teto por cima, UMA barra que sobe ate o aluguel potencial — verde o que
// entrou, cinza o que nao se concretizou. A distancia ate o teto deixa de ser
// um espaco vazio entre marcas e passa a ser um bloco com area propria.
//
// Vacancia e inadimplencia nao sumiram: elas explicam o cinza e vivem no
// tooltip, que e onde derivacao mora. Empilha-las com cor propria contrariaria
// o pedido ("a parte que nao foi recebida em cinza") e devolveria ao grafico a
// leitura de tres categorias que ele tinha.
const perda = (ler: (p: MonthlyPoint) => number | null): Series["read"] => (point) =>
  point.aluguelContratado === null || point.aluguelRecebido === null ? null : ler(point)

const centavos = (valor: number) => Math.round(valor * 100) / 100

// UMA barra que sobe ate o aluguel potencial (pedido da cliente, set/2026):
// verde o que entrou, e acima dele o que nao se concretizou. O que mudou em
// 21/09, a pedido dela de novo ("nao esta aparecendo na barra inadimplencia e
// vacancia"), e que o bloco de cima deixou de ser um cinza unico.
//
// Ele so pode ser aberto porque agora fecha. O ponto mensal carregava quatro
// causas que nao somavam o nao realizado em mes nenhum — ago/2026, 11.732,09
// contra 22.108,03 — porque `outrosAjustes` (= `valoresSemClassificacao`) e um
// agregado, nao uma parcela. Com as parcelas dele no ponto, a soma fecha na
// virgula em mai-ago/2026, e a identidade `serie_decomposicao_do_nao_realizado`
// impede que volte a nao fechar.
//
// Duas das parcelas NAO sao perda e por isso tem cor fria, nao quente: o mes
// cobrado na secao de intermediacao (o dinheiro entrou por la) e o mes
// proporcional de contrato novo (o mes cheio nunca foi devido). Em ago/2026 as
// duas somam R$ 5.451,62 de um bloco de R$ 22.108,03: pinta-las de vermelho
// chamaria de calote um dinheiro que entrou.
const VALUE_STACK: Series[] = [
  {
    key: "recebido",
    label: "Recebido da competência",
    color: "#2d8c3a",
    read: (point) => point.aluguelRecebido,
    format: formatCurrency,
  },
  {
    key: "vacancia",
    label: "Vacância",
    color: "#d9a441",
    // Liquida do que a unidade vaga recebeu: `recebidoEmVago` ja esta dentro do
    // verde, entao descontar aqui e o que faz as parcelas somarem o bloco.
    read: perda((point) =>
      point.vacancia === null ? null : centavos(point.vacancia - (point.recebidoEmVago ?? 0)),
    ),
    format: formatCurrency,
  },
  { key: "inadimplencia", label: "Inadimplência", color: "#9f2a2a", read: perda((point) => point.inadimplencia), format: formatCurrency },
  { key: "descontos", label: "Descontos", color: "#8a6f3f", read: perda((point) => point.descontos), format: formatCurrency },
  { key: "ocupado_sem_recebimento", label: "Ocupado sem recebimento", color: "#b4553a", read: perda((point) => point.ocupadoSemRecebimento), format: formatCurrency },
  { key: "ocupado_parcial", label: "Ocupado, pagou menos", color: "#c98a5e", read: perda((point) => point.ocupadoRecebimentoParcial), format: formatCurrency },
  { key: "intermediacao", label: "Cobrado como intermediação", color: "#4a7fa5", read: perda((point) => point.cobradoComoIntermediacao), format: formatCurrency },
  { key: "proporcional", label: "Mês proporcional (contrato novo)", color: "#7fa8c4", read: perda((point) => point.mesProporcionalContratoNovo), format: formatCurrency },
  {
    key: "outros",
    label: "Outros ajustes",
    color: "#c2c9c3",
    // Fecha o bloco: o que sobra depois das parcelas nomeadas. Piso em zero
    // porque segmento negativo nao se desenha — se isso acontecer, a identidade
    // `serie_decomposicao_do_nao_realizado` acusa antes de chegar na tela.
    read: perda((point) =>
      point.ajustesClassificados === null || point.restoNaoExplicado === null
        ? null
        : Math.max(0, centavos(-point.ajustesClassificados - point.restoNaoExplicado)),
    ),
    format: formatCurrency,
  },
]

const VALUE_TOTAL: Series = {
  key: "contratado",
  label: "Aluguel potencial",
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
  // Valores empilham numa barra so; percentuais seguem lado a lado, porque
  // ocupacao e inadimplencia sao duas leituras independentes e somar as duas
  // nao significaria nada.
  const stacked = metric !== "percentual"
  const definitions = stacked ? VALUE_STACK : PERCENT_SERIES
  // Tudo que o tooltip e a tabela acessivel mostram, na ordem de leitura.
  const detalhamento = stacked ? [VALUE_TOTAL, ...VALUE_STACK] : PERCENT_SERIES
  const selectedIndex = resolveSelectedIndex(series, selectedCompetencia)
  const [hovered, setHovered] = useState<{ index: number; key: string | null } | null>(null)
  const tooltipId = useId()

  if (series.length === 0) return null

  const width = Math.max(WIDTH, PAD.left + PAD.right + series.length * MONTH_WIDTH)
  const plotWidth = width - PAD.left - PAD.right
  const band = plotWidth / series.length
  const colunas = stacked ? 1 : definitions.length
  const barWidth = Math.min(stacked ? BAR_MAX * 1.5 : BAR_MAX, (band - BAND_PADDING * 2 - BAR_GAP * (colunas - 1)) / colunas)
  const groupWidth = barWidth * colunas + BAR_GAP * (colunas - 1)
  // Empilhado, o topo e a soma da pilha — que e o proprio aluguel potencial.
  const maxValue = stacked
    ? niceCeiling(
        Math.max(
          1,
          ...series.map((point) => definitions.reduce((total, item) => total + (item.read(point) ?? 0), 0)),
        ),
      )
    : 100

  const bandStart = (index: number) => PAD.left + index * band
  const barX = (index: number, seriesIndex: number) =>
    bandStart(index) + (band - groupWidth) / 2 + (stacked ? 0 : seriesIndex * (barWidth + BAR_GAP))
  const y = (value: number) => PAD.top + (1 - Math.min(value, maxValue) / maxValue) * PLOT_H
  const baseline = PAD.top + PLOT_H

  const activePoint = hovered ? series[hovered.index] : null

  return (
    <div className="px-4 pb-4 pt-2 sm:px-5">
      {/* Legenda: só o que é cada segmento da barra. O total da pilha é o
          aluguel potencial e não precisa de chave própria — é a barra inteira. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5" aria-hidden="true">
        {definitions.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-xs text-acr-muted-2">
            <span className="h-3 w-2.5 rounded-[3px]" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        {stacked && (
          <span className="text-xs text-acr-muted-2">
            A barra inteira é o aluguel potencial do mês.
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

            {series.map((point, index) => {
              // Empilhado, cada segmento comeca onde o anterior parou.
              let acumulado = 0
              return definitions.map((item, seriesIndex) => {
                const value = item.read(point)
                if (value === null) return null
                const base = stacked ? acumulado : 0
                acumulado += value
                const top = y(base + value)
                const height = Math.max(0, y(base) - top)
                const x = barX(index, seriesIndex)
                const isActive = hovered?.index === index && (hovered.key === null || hovered.key === item.key)
                return (
                  <g key={`${point.competencia}-${item.key}`}>
                    <path
                      // So o segmento do topo arredonda: cantos no meio da
                      // pilha abririam fresta entre um bloco e outro.
                      d={
                        stacked && seriesIndex < definitions.length - 1
                          ? squareBar(x, top, barWidth, height)
                          : roundedTopBar(x, top, barWidth, height)
                      }
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
              })
            })}
          </svg>

          {activePoint && hovered && (
            <SeriesTooltip
              id={tooltipId}
              point={activePoint}
              items={detalhamento}
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
              {detalhamento.map((item) => <th key={item.key} scope="col">{item.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.competencia}>
                <th scope="row">{point.label}</th>
                {detalhamento.map((item) => <td key={item.key}>{item.format(item.read(point))}</td>)}
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
// Segmento do meio da pilha: sem cantos, para nao abrir fresta entre blocos.
function squareBar(x: number, top: number, width: number, height: number): string {
  if (height <= 0) return ""
  return `M${x} ${top}h${width}v${height}h${-width}Z`
}

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
