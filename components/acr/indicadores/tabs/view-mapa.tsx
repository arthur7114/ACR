"use client"

import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HeatRow, IndicadoresData } from "@/lib/indicadores-types"
import { Card, CardNote, ChartCardHeader } from "../primitives/chart-card"
import { fmt1, heatClass, HEAT_SCALE_TOKENS } from "../lib/heat"

export type HeatMetric = "inad" | "vac"

export function ViewMapa({
  data,
  heatMetric,
  setHeatMetric,
}: {
  data: IndicadoresData
  heatMetric: HeatMetric
  setHeatMetric: (m: HeatMetric) => void
}) {
  const meses = data.heat.meses
  const rows: HeatRow[] = heatMetric === "inad" ? data.heat.inad : data.heat.vac
  const max = heatMetric === "inad" ? data.heat.inadMax : data.heat.vacMax
  const media = heatMetric === "inad" ? data.heat.inadMediaCarteira : data.heat.vacMediaCarteira
  const titulo =
    heatMetric === "inad"
      ? "Inadimplência acumulada (% da receita do mês) por empreendimento"
      : "Vacância (%) por empreendimento"

  return (
    <>
      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-acr-ink">
            {heatMetric === "inad" ? "Mapa de inadimplência" : "Mapa de vacância"}
          </h2>
          <p className="mt-1 text-[13.5px] text-acr-muted">
            Por empreendimento, mês a mês — preenche conforme os fechamentos mensais são processados.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-acr-line bg-white p-0.5">
          <HeatBtn on={heatMetric === "inad"} dot="var(--acr-red)" onClick={() => setHeatMetric("inad")}>
            Inadimplência
          </HeatBtn>
          <HeatBtn on={heatMetric === "vac"} dot="var(--acr-amber)" onClick={() => setHeatMetric("vac")}>
            Vacância
          </HeatBtn>
        </div>
      </div>

      <Card>
        <ChartCardHeader
          title={titulo}
          desc="Passe o mouse nas células para o valor exato"
          source="fechamentos mensais"
          right={
            <div className="flex items-center gap-2 text-[11.5px] text-acr-muted">
              <span>0%</span>
              <div className="flex h-3 w-[150px] overflow-hidden rounded-[5px]">
                {HEAT_SCALE_TOKENS.map((c) => (
                  <i key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <span className="tabular-nums">{max}%+</span>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[180px] bg-white p-1 text-left text-[11px] font-semibold text-acr-muted">
                  Empreendimento
                </th>
                {meses.map((m) => (
                  <th key={m.value} className="p-1 text-center text-[11px] font-semibold text-acr-muted">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.empreendimento}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-left text-[12.5px] font-medium text-acr-ink">
                    {r.empreendimento}
                    <small className="block text-[10.5px] font-normal text-acr-muted">
                      {r.media !== null ? `média ${fmt1(r.media)}%` : "—"}
                    </small>
                  </td>
                  {r.valores.map((v, j) => (
                    <HeatCell key={j} value={v} max={max} title={`${r.empreendimento} · ${meses[j]?.label}`} />
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={meses.length + 1} className="py-2 text-left text-[12.5px] text-acr-muted">
                    Sem dados para esta métrica ainda.
                  </td>
                </tr>
              )}
              <tr>
                <td className="sticky left-0 z-10 border-t-2 border-acr-line bg-white pt-2 text-left text-[12.5px] font-semibold text-acr-ink">
                  Carteira (média)
                </td>
                {media.map((v, j) => (
                  <HeatCell key={j} value={v} max={max} bold title={`Carteira · ${meses[j]?.label}`} className="border-t-2 border-acr-line" />
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <CardNote icon={<Info size={15} className="shrink-0 text-acr-green" />}>
          Verde = saudável · vermelho = atenção. A linha inferior consolida a carteira em cada mês e segue a mesma escala
          de cores.{" "}
          {heatMetric === "vac" ? "Vacância usa o estado atual do cadastro (sem histórico mensal ainda)." : ""}
        </CardNote>
      </Card>
    </>
  )
}

function HeatCell({
  value,
  max,
  title,
  bold,
  className,
}: {
  value: number | null
  max: number
  title: string
  bold?: boolean
  className?: string
}) {
  return (
    <td
      className={cn(
        "h-9 min-w-[42px] rounded-lg text-center text-[11.5px] font-semibold tabular-nums transition-transform hover:scale-[1.08]",
        heatClass(value, max),
        bold && "font-bold",
        className,
      )}
      title={`${title}: ${value === null ? "sem dados" : fmt1(value) + "%"}`}
    >
      {value === null ? "" : fmt1(value)}
    </td>
  )
}

function HeatBtn({
  on,
  dot,
  onClick,
  children,
}: {
  on: boolean
  dot: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
        on ? "bg-acr-green text-white" : "text-acr-muted hover:text-acr-ink",
      )}
    >
      <span className="size-2 rounded-[3px]" style={{ background: on ? "#fff" : dot }} />
      {children}
    </button>
  )
}
