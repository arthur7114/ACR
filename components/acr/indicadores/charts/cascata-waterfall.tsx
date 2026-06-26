"use client"

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { formatBRLk, formatPercent } from "@/lib/format"
import { fmt1 } from "../lib/heat"
import type { Metric } from "../primitives/metric-toggle"
import type { IndicadoresData } from "@/lib/indicadores-types"

const config: ChartConfig = {
  delta: { label: "Valor", color: "var(--acr-green)" },
}

type Kind = "base" | "loss" | "final"

interface WfRow {
  name: string
  base: number
  delta: number
  kind: Kind
  color: string
  topText: string
  subText: string | null
}

const COLOR: Record<Kind, string> = {
  base: "var(--acr-green-ink)",
  loss: "var(--acr-red)",
  final: "var(--acr-green)",
}

/** Cascata potencial -> ofensores -> recebido, via barras empilhadas com base transparente. */
export function CascataWaterfall({
  cascata,
  metric,
}: {
  cascata: IndicadoresData["cascata"]
  metric: Metric
}) {
  const { potencial, realizado, realizadoPct, ofensores } = cascata
  const pct = metric === "pct"

  const rows: WfRow[] = []
  rows.push({
    name: "Potencial",
    base: 0,
    delta: potencial,
    kind: "base",
    color: COLOR.base,
    topText: pct ? "100%" : formatBRLk(potencial),
    subText: pct ? null : "100%",
  })

  let top = potencial
  for (const o of ofensores) {
    const loss = o.pending ? 0 : o.valor
    const bottom = top - loss
    rows.push({
      name: o.label,
      base: bottom,
      delta: loss,
      kind: "loss",
      color: o.pending ? "var(--acr-line-2)" : COLOR.loss,
      topText: o.pending ? "s/ dados" : pct ? `−${fmt1(o.pct)}%` : `− ${formatBRLk(o.valor)}`,
      subText: o.pending || pct ? null : `−${fmt1(o.pct)}%`,
    })
    top = bottom
  }

  rows.push({
    name: "Recebido",
    base: 0,
    delta: realizado,
    kind: "final",
    color: COLOR.final,
    topText: pct ? formatPercent(realizadoPct) : formatBRLk(realizado),
    subText: pct ? null : formatPercent(realizadoPct),
  })

  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const row = props.index != null ? rows[props.index] : undefined
    if (!row) return <g />
    const x = Number(props.x) + Number(props.width) / 2
    const y = Number(props.y)
    const hasSub = row.subText !== null
    return (
      <text x={x} y={y} textAnchor="middle" fill={row.color}>
        <tspan x={x} dy={hasSub ? -22 : -9} fontSize={11} fontWeight={700}>
          {row.topText}
        </tspan>
        {hasSub && (
          <tspan x={x} dy={13} fontSize={10} fontWeight={600} fillOpacity={0.85}>
            {row.subText}
          </tspan>
        )}
      </text>
    )
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={rows} margin={{ top: 32, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={0} />
        <YAxis hide domain={[0, Math.max(potencial * 1.12, 1)]} />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="delta" stackId="wf" radius={4} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} />
          ))}
          <LabelList dataKey="delta" content={renderLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
