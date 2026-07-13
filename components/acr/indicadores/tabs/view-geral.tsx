"use client"

import type { IndicadoresData, IndicadoresOccupancy } from "@/lib/indicadores-types"
import { MonthlySeries } from "../charts/monthly-series"
import { formatCompactCurrency, formatCount, formatPercent, type DashboardMetric } from "../lib/presentation"
import { EmptyState, Kpi, MetricToggle, Panel, PanelHeader, StatusChip } from "../primitives/dashboard-ui"

export function ViewGeral({
  data,
  metric,
  onMetricChange,
}: {
  data: IndicadoresData
  metric: DashboardMetric
  onMetricChange: (metric: DashboardMetric) => void
}) {
  const { resumo } = data
  const quality = data.meta.qualidade

  return (
    <div className="space-y-4">
      <section aria-label="Resumo financeiro" className="grid overflow-hidden rounded-xl border border-acr-line bg-acr-line sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Receita total"
          value={formatCompactCurrency(resumo.receitaTotal)}
          detail="Receitas declaradas nos fechamentos elegíveis."
          source="PackageTotals · total_receitas"
          quality={quality}
        />
        <Kpi
          label="Aluguel contratado"
          value={formatCompactCurrency(resumo.aluguelContratado)}
          detail="Aluguéis esperados conhecidos na competência."
          source="Snapshots · aluguel esperado"
          quality={quality}
        />
        <Kpi
          label="Aluguel recebido"
          value={formatCompactCurrency(resumo.aluguelRecebido)}
          detail="Aluguel com desconto; sem usar o total da linha."
          source="Prestação · receitas por imóvel"
          quality={quality}
        />
        <Kpi
          label="Ocupação da competência"
          value={formatPercent(resumo.ocupacaoCompetencia.percentual)}
          detail={`${formatCount(resumo.ocupacaoCompetencia.numerador)} de ${formatCount(resumo.ocupacaoCompetencia.denominador)} imóveis classificados.`}
          source="Snapshots mensais"
          quality={quality}
          tone={resumo.ocupacaoCompetencia.desconhecidos > 0 ? "warning" : "default"}
        />
        <Kpi
          label="Repasse apurado"
          value={formatCompactCurrency(resumo.repasseApurado)}
          detail="Valor líquido calculado nos fechamentos."
          source="PackageTotals · total_a_repassar"
          quality={quality}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <Panel className="min-w-0 overflow-hidden">
          <PanelHeader
            title="Evolução até a competência selecionada"
            description={metric === "valor" ? "Receita, aluguel recebido e repasse apurado por mês." : "Ocupação e cobertura histórica dos snapshots."}
            source="Fechamentos elegíveis e snapshots mensais"
            action={<MetricToggle value={metric} onChange={onMetricChange} />}
          />
          {data.serieMensal.length > 0 ? (
            <div className="overflow-x-auto overscroll-x-contain">
              <MonthlySeries series={data.serieMensal} metric={metric} />
            </div>
          ) : (
            <EmptyState title="Sem série histórica" description="A série aparecerá quando existirem competências elegíveis até o mês selecionado." />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Competência versus Hoje"
            description="O histórico usa snapshots; Hoje usa o cadastro atual."
            source="Snapshots + cadastro de imóveis"
          />
          <div className="divide-y divide-acr-line px-4 sm:px-5">
            <OccupancyBlock label={data.meta.competenciaLabel} occupancy={resumo.ocupacaoCompetencia} />
            <OccupancyBlock label="Hoje" occupancy={resumo.ocupacaoHoje} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Retenções e inadimplência"
          description="Valores preservam a diferença entre zero confirmado e dado ausente."
          source="Fechamentos elegíveis da competência"
        />
        <dl className="grid gap-px bg-acr-line sm:grid-cols-2 xl:grid-cols-4">
          <SummaryValue label="Comissão administrativa" value={formatCompactCurrency(resumo.comissaoAdministracao)} />
          <SummaryValue label="Comissão de intermediação" value={formatCompactCurrency(resumo.comissaoIntermediacao)} />
          <SummaryValue label="Despesas retidas" value={formatCompactCurrency(resumo.despesasRetidas)} />
          <SummaryValue label="Inadimplência acumulada" value={formatCompactCurrency(resumo.inadimplenciaAcumulada)} warning />
        </dl>
      </Panel>
    </div>
  )
}

function OccupancyBlock({ label, occupancy }: { label: string; occupancy: IndicadoresOccupancy }) {
  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-acr-ink">{label}</h3>
        <span className="text-lg font-bold text-acr-ink tabular-nums">{formatPercent(occupancy.percentual)}</span>
      </div>
      <p className="mt-1 text-xs text-acr-muted-2">Cobertura classificada: {formatPercent(occupancy.coberturaPercentual)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {occupancy.ocupados > 0 && <CountChip status="ocupado" count={occupancy.ocupados} />}
        {occupancy.inadimplentes > 0 && <CountChip status="inadimplente" count={occupancy.inadimplentes} />}
        {occupancy.emRescisao > 0 && <CountChip status="em_rescisao" count={occupancy.emRescisao} />}
        {occupancy.vagos > 0 && <CountChip status="vago" count={occupancy.vagos} />}
        {occupancy.desconhecidos > 0 && <CountChip status="desconhecido" count={occupancy.desconhecidos} />}
      </div>
    </div>
  )
}

function CountChip({ status, count }: { status: Parameters<typeof StatusChip>[0]["status"]; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusChip status={status} />
      <span className="text-xs font-bold text-acr-ink tabular-nums">{formatCount(count)}</span>
    </span>
  )
}

function SummaryValue({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <dt className="text-xs font-medium text-acr-muted-2">{label}</dt>
      <dd className={`mt-2 text-xl font-bold tabular-nums ${warning ? "text-acr-red" : "text-acr-ink"}`}>{value}</dd>
    </div>
  )
}
