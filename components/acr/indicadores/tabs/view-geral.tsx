"use client"

import { Info } from "lucide-react"
import { formatBRL, formatBRLk, formatPercent } from "@/lib/format"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { Card, CardNote, ChartCardHeader } from "../primitives/chart-card"
import { KpiCard } from "../primitives/kpi-card"
import { MetricRow } from "../primitives/metric-row"
import { MetricTile } from "../primitives/metric-tile"
import { MetricToggle, type Metric } from "../primitives/metric-toggle"
import { ProgressBar } from "../primitives/progress-bar"
import { SectionHeader } from "../primitives/section-header"
import { Pendencias } from "../primitives/pendencias"
import { FaturamentoBarChart } from "../charts/faturamento-bar-chart"
import { OcupacaoDonut } from "../charts/ocupacao-donut"

export function ViewGeral({
  data,
  metric,
  setMetric,
}: {
  data: IndicadoresData
  metric: Metric
  setMetric: (m: Metric) => void
}) {
  const receita = data.receita
  const pctOfReceita = (v: number) => (receita > 0 ? (v / receita) * 100 : 0)
  const showFin = (v: number) => (metric === "pct" ? formatPercent(pctOfReceita(v)) : formatBRLk(v))
  const p = data.percentuais
  const mov = data.movimentacoes

  return (
    <>
      <div className="mb-3.5 flex justify-end">
        <MetricToggle metric={metric} setMetric={setMetric} />
      </div>

      {/* KPIs principais: ocupação, receita, despesa, repasse, taxa total (sem inadimplência) */}
      <div className="grid grid-cols-2 gap-4 min-[1100px]:grid-cols-5">
        <KpiCard
          label="Taxa de ocupação"
          dot="var(--acr-green)"
          value={formatPercent(data.ocupacao.pct)}
          sub={`${data.ocupacao.ocupados} de ${data.ocupacao.total} imóveis ocupados`}
        />
        <KpiCard
          label="Receita do mês"
          dot="var(--acr-amber)"
          value={metric === "pct" ? "100%" : formatBRLk(receita)}
          sub="recebido em nome do locador"
        />
        <KpiCard
          label="Despesa total"
          dot="var(--acr-red)"
          value={showFin(data.despesaOperacional)}
          sub="água + IPTU + seguro (operacional)"
        />
        <KpiCard
          label="Total repassado"
          dot="var(--acr-muted-2)"
          value={showFin(data.totalRepassar)}
          sub="após comissões e despesas"
        />
        <KpiCard
          label="Taxa total"
          dot="var(--acr-blue)"
          value={showFin(data.taxaTotal)}
          sub="comissão de administração"
        />
      </div>

      <SectionHeader>Ocupação &amp; vacância</SectionHeader>
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.5fr_1fr]">
        <Card>
          <ChartCardHeader
            title="Evolução do faturamento"
            desc={`Receita realizada — últimos ${data.serieMensal.length} fechamentos`}
            source="fechamentos processados"
          />
          <FaturamentoBarChart serie={data.serieMensal} />
        </Card>
        <Card>
          <ChartCardHeader title="Situação dos imóveis" desc={data.competenciaLabel} source="cadastro de imóveis (status)" />
          <OcupacaoDonut ocupacao={data.ocupacao} />
        </Card>
      </div>

      <SectionHeader>Movimentações do mês</SectionHeader>
      <Card className="p-0">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-acr-line min-[1100px]:grid-cols-4">
          <MetricTile label="Acordos recebidos" value={String(mov.acordos.count)} sub={formatBRLk(mov.acordos.valor)} />
          <MetricTile label="Rescisões" value={String(mov.rescisoes.count)} sub={formatBRLk(mov.rescisoes.valor)} />
          <MetricTile
            label="Reajustes (unidades)"
            value={mov.reajustes.pending ? "—" : String(mov.reajustes.count)}
            sub={mov.reajustes.pending ? "aguardando dados" : "unidades reajustadas"}
            pending={mov.reajustes.pending}
          />
          <MetricTile label="Desconto aplicado" value={formatBRLk(mov.descontos)} sub="no mês" amber />
          <MetricTile label="IPTU" value={formatBRLk(mov.despesaPorCategoria.iptu)} sub="despesa do mês" />
          <MetricTile label="Água" value={formatBRLk(mov.despesaPorCategoria.agua)} sub="despesa do mês" />
          <MetricTile label="Seguro incêndio" value={formatBRLk(mov.despesaPorCategoria.seguro)} sub="despesa do mês" />
          <MetricTile
            label="Despesa operacional"
            value={formatBRLk(data.despesaOperacional)}
            sub={`${formatPercent(p.despesaOperacionalPct)} da receita`}
          />
        </div>
        <div className="px-5 pb-4">
          <CardNote icon={<Info size={15} className="shrink-0 text-acr-green" />}>
            Acordos, rescisões, descontos e despesas vêm direto da extração da prestação de contas.
          </CardNote>
        </div>
      </Card>

      <SectionHeader>Financeiro — taxas &amp; despesas</SectionHeader>
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.5fr_1fr]">
        <Card>
          <ChartCardHeader
            title="Despesa operacional &amp; de venda"
            desc="Operacional (repasses) e de venda (intermediação)"
            source="prestação + regras comerciais"
          />
          <div className="flex flex-col">
            <MetricRow
              label="Taxa de administração"
              value={formatBRL(data.taxaTotal)}
              sub={p.administracaoPct !== null ? formatPercent(p.administracaoPct) : undefined}
            />
            <MetricRow
              label="Despesa operacional"
              value={formatBRL(data.despesaOperacional)}
              sub={`${formatPercent(p.despesaOperacionalPct)} da receita`}
              danger
            />
            <MetricRow
              label="Despesa de venda (intermediação)"
              value={data.despesas.vendaPct !== null ? formatPercent(data.despesas.vendaPct) : "aguardando dados"}
              sub={data.despesas.venda === null ? "valor por contrato não extraído" : undefined}
              pending={data.despesas.venda === null}
            />
          </div>
        </Card>
        <Card>
          <ChartCardHeader title="Percentuais aplicados" desc="Parâmetros do fechamento" source="regras comerciais" />
          <ProgressBar label="% Administração" value={p.administracaoPct} width={p.administracaoPct ?? 0} />
          <ProgressBar label="% Intermediação" value={p.intermediacaoPct} width={p.intermediacaoPct ?? 0} />
          <ProgressBar label="% Ocupação" value={p.ocupacaoPct} width={p.ocupacaoPct} />
          <ProgressBar label="% Despesa operacional" value={p.despesaOperacionalPct} width={p.despesaOperacionalPct} amber />
        </Card>
      </div>

      <Pendencias data={data} />
    </>
  )
}
