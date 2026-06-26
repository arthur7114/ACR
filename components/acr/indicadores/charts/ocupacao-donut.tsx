"use client"

import { Cell, Pie, PieChart } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatBRLk, formatPercent } from "@/lib/format"
import type { IndicadoresData } from "@/lib/indicadores-types"

const config: ChartConfig = {
  ocupados: { label: "Ocupados", color: "var(--acr-green)" },
  vagos: { label: "Vagos", color: "var(--acr-green-soft)" },
}

/** Rosca de ocupação + legenda com contagens, percentuais e vacância em valor. */
export function OcupacaoDonut({ ocupacao }: { ocupacao: IndicadoresData["ocupacao"] }) {
  const { ocupados, vagos, total, pct, vacanciaValor } = ocupacao
  const vagosPct = total > 0 ? (vagos / total) * 100 : 0
  const slices = [
    { key: "ocupados", label: "Ocupados", value: ocupados, fill: "var(--acr-green)" },
    { key: "vagos", label: "Vagos", value: vagos, fill: "var(--acr-green-soft)" },
  ]

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <ChartContainer config={config} className="aspect-square h-[150px] w-[150px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="capitalize text-acr-muted">{String(name)}</span>
                      <span className="font-mono font-medium tabular-nums text-acr-ink">{Number(value)}</span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={74}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-[27px] font-bold leading-none tabular-nums text-acr-ink">{ocupados}</b>
          <span className="text-[11px] text-acr-muted">de {total}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 text-[13px] text-acr-muted-2">
        <div className="flex items-center gap-2.5">
          <span className="size-[11px] rounded-[4px] bg-acr-green" /> Ocupados{" "}
          <b className="text-acr-ink tabular-nums">
            {ocupados} · {formatPercent(pct)}
          </b>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="size-[11px] rounded-[4px] bg-acr-green-soft" /> Vagos{" "}
          <b className="text-acr-ink tabular-nums">
            {vagos} · {formatPercent(vagosPct)}
          </b>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          Vacância em valor <b className="text-acr-red tabular-nums">{formatBRLk(vacanciaValor)}</b>
        </div>
      </div>
    </div>
  )
}
