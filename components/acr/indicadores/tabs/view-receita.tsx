"use client"

import { AlertTriangle, Info } from "lucide-react"
import { formatBRLk, formatPercent } from "@/lib/format"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { Card, CardNote, ChartCardHeader } from "../primitives/chart-card"
import { MetricTile } from "../primitives/metric-tile"
import { MetricToggle, type Metric } from "../primitives/metric-toggle"
import { SectionHeader } from "../primitives/section-header"
import { StatusBadge } from "../primitives/status-badge"
import { Pendencias } from "../primitives/pendencias"
import { CascataWaterfall } from "../charts/cascata-waterfall"
import { realizColor, realizTag } from "../lib/realiz"

export function ViewReceita({
  data,
  metric,
  setMetric,
}: {
  data: IndicadoresData
  metric: Metric
  setMetric: (m: Metric) => void
}) {
  const { potencial, realizado, realizadoPct, inadimplenciaAcumulada } = data.cascata
  const naoRealizado = potencial - realizado
  const naoRealizadoPct = potencial > 0 ? (naoRealizado / potencial) * 100 : 0

  return (
    <>
      <div className="mb-3.5 flex justify-end">
        <MetricToggle metric={metric} setMetric={setMetric} />
      </div>

      <SectionHeader>Cascata de receita — do potencial ao recebido</SectionHeader>

      {/* Faixa de stats: o desfecho da cascata em 3 números escaneáveis */}
      <Card className="mb-4 p-0">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-acr-line">
          <MetricTile
            label="Faturamento potencial"
            value={metric === "pct" ? "100%" : formatBRLk(potencial)}
            sub="aluguel esperado do mês"
          />
          <MetricTile
            label="Não realizado no mês"
            value={metric === "pct" ? formatPercent(naoRealizadoPct) : formatBRLk(naoRealizado)}
            sub={`${formatPercent(naoRealizadoPct)} do potencial`}
            amber
          />
          <MetricTile
            label="Recebido de fato"
            value={metric === "pct" ? formatPercent(realizadoPct) : formatBRLk(realizado)}
            sub={`${formatPercent(realizadoPct)} do potencial`}
          />
        </div>
      </Card>

      <Card>
        <ChartCardHeader
          title="Faturamento potencial × realizado"
          desc={data.competenciaLabel}
          source="aluguel esperado vs. vacância + descontos"
        />
        <CascataWaterfall cascata={data.cascata} metric={metric} />
        <CardNote icon={<Info size={15} className="shrink-0 text-acr-green" />}>
          <b className="text-acr-ink tabular-nums">
            {formatBRLk(naoRealizado)} ({formatPercent(naoRealizadoPct)})
          </b>{" "}
          de receita não realizada no mês (vacância + descontos). As barras vermelhas mostram cada ofensor que corrói o
          percentual.
        </CardNote>
        {inadimplenciaAcumulada > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-acr-amber/30 bg-acr-amber-soft p-3 text-xs text-acr-muted-2">
            <AlertTriangle size={15} className="mt-px shrink-0 text-acr-amber" />
            <span>
              Inadimplência <b>acumulada</b> de{" "}
              <b className="text-acr-red tabular-nums">{formatBRLk(inadimplenciaAcumulada)}</b> — saldo de meses
              anteriores (insight), <b>não entra na cascata do mês</b>.
            </span>
          </div>
        )}
      </Card>

      <SectionHeader>Realização de receita por imóvel</SectionHeader>
      <Card>
        <ChartCardHeader
          title="Quanto cada imóvel entregou do esperado"
          desc="Recebido ÷ aluguel esperado"
          source="cadastro + prestação"
          right={
            <div className="flex items-center gap-2 text-[11.5px] text-acr-muted">
              <span>Atenção</span>
              <div className="flex h-3 w-[150px] overflow-hidden rounded-[5px]">
                {["var(--acr-heat-5)", "var(--acr-heat-4)", "var(--acr-heat-3)", "var(--acr-heat-2)", "var(--acr-green)"].map(
                  (c) => (
                    <i key={c} className="flex-1" style={{ background: c }} />
                  ),
                )}
              </div>
              <span>Realizado</span>
            </div>
          }
        />
        <div className="flex flex-col">
          {data.ranking.length === 0 && (
            <div className="px-0.5 py-2 text-[12.5px] text-acr-muted">Sem linhas de receita para os filtros atuais.</div>
          )}
          {data.ranking.map((it, i) => {
            const [tone, label] = realizTag(it.pct)
            const color = realizColor(it.pct)
            return (
              <div
                key={`${it.empreendimento}-${it.apto}-${i}`}
                className="flex items-center gap-3.5 border-b border-acr-line py-3.5 last:border-0"
              >
                <div className="w-6 text-center text-[13px] font-bold text-acr-muted tabular-nums">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold text-acr-ink">
                    {it.apto} · {it.inquilino}
                  </b>
                  <span className="text-[11.5px] text-acr-muted">{it.empreendimento}</span>
                </div>
                <div className="hidden max-w-[240px] flex-[1.4] min-[700px]:block">
                  <div className="h-2.5 overflow-hidden rounded-full bg-acr-green-soft">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(it.pct, 100)}%`, background: color }}
                    />
                  </div>
                </div>
                <div className="w-14 text-right text-[15px] font-bold tabular-nums" style={{ color }}>
                  {Math.round(it.pct)}%
                </div>
                <StatusBadge tone={tone}>{label}</StatusBadge>
              </div>
            )
          })}
        </div>
      </Card>

      <Pendencias data={data} />
    </>
  )
}
