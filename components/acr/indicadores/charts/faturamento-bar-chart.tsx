"use client"

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatBRLk } from "@/lib/format"
import type { SerieMensalPonto } from "@/lib/indicadores-types"

const config: ChartConfig = {
  receita: { label: "Receita", color: "var(--acr-green)" },
}

/** Barras de receita realizada por competência; última barra destacada. */
export function FaturamentoBarChart({ serie }: { serie: SerieMensalPonto[] }) {
  if (serie.length === 0) {
    return <div className="px-0.5 py-2 text-[12.5px] text-acr-muted">Sem histórico mensal ainda.</div>
  }
  const last = serie.length - 1
  return (
    <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
      <BarChart data={serie} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-acr-muted">Receita</span>
                  <span className="font-mono font-medium tabular-nums text-acr-ink">{formatBRLk(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="receita" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {serie.map((_, i) => (
            <Cell key={i} fill={i === last ? "var(--acr-green)" : "var(--acr-green-soft)"} />
          ))}
          <LabelList
            dataKey="receita"
            position="top"
            offset={8}
            fontSize={10.5}
            fontWeight={600}
            fill="var(--acr-ink)"
            formatter={(value: number) => formatBRLk(value)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
