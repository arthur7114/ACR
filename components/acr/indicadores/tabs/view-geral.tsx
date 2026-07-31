"use client"

import type { IndicadoresData, IndicadoresOccupancy } from "@/lib/indicadores-types"
import { MonthlySeries } from "../charts/monthly-series"
import {
  formatCurrency,
  formatCount,
  formatPortfolioContractedRent,
  formatPercent,
  resolveMetricValue,
  type DashboardMetric,
} from "../lib/presentation"
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
  const byProperty = data.filtros.selecionados.imovelId !== null

  return (
    <div className="space-y-4">
      <section aria-label="Resumo financeiro" className="grid overflow-hidden rounded-xl border border-acr-line bg-acr-line sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Receitas do fechamento"
          value={formatCurrency(resolveMetricValue(resumo.receitasEconomicas, resumo.receitaTotal))}
          detail={byProperty ? "Receitas econômicas atribuídas ao imóvel." : "Receitas econômicas dos fechamentos da competência."}
          source={byProperty ? "Histórico mensal por imóvel" : "Fechamentos da competência"}
          help={{
            short: "Receitas econômicas reconhecidas no fechamento.",
            title: "Receitas do fechamento",
            definition: "Soma das receitas econômicas da competência, sem movimentos de passagem.",
            source: "Fechamentos da competência.",
            limitation: "Entradas como IPTU de passagem aparecem apenas na conciliação financeira. Este é o caixa do fechamento da competência; a evolução mensal atribui a receita à competência de origem, então o valor por mês no gráfico pode diferir deste total.",
          }}
        />
        <Kpi
          label="Aluguel contratado"
          value={formatPortfolioContractedRent(
            resumo.aluguelContratado,
            data.cobertura.contratos,
          )}
          detail="Aluguéis fixos conhecidos nos contratos vigentes."
          source="Contratos históricos"
          help={{
            short: "Valor contratual fixo vigente na competência.",
            title: "Aluguel contratado",
            definition: "Soma dos aluguéis fixos previstos nos contratos históricos vigentes.",
            source: "Contratos históricos por imóvel.",
            limitation: "Receitas variáveis são Não se aplica; contratos ausentes aparecem como —.",
          }}
        />
        <Kpi
          label="Aluguel recebido da competência"
          value={formatCurrency(resumo.aluguelRecebidoCompetencia)}
          detail="Somente aluguel referente à competência selecionada."
          source="Histórico mensal por imóvel"
          help={{
            short: "Aluguel da competência, sem atrasos recuperados.",
            title: "Aluguel recebido da competência",
            definition: "Valor do aluguel desta competência efetivamente recebido no mês.",
            source: "Histórico mensal por imóvel gerado no fechamento.",
            limitation: "Recebimentos de competências anteriores são mostrados separadamente.",
          }}
        />
        <Kpi
          label="Ocupação da competência"
          value={`${formatPercent(resumo.ocupacaoCompetencia.percentual)} dos classificados`}
          detail={`${formatCount(resumo.ocupacaoCompetencia.numerador)} de ${formatCount(resumo.ocupacaoCompetencia.denominador)} imóveis · cobertura ${formatPercent(resumo.ocupacaoCompetencia.coberturaPercentual)}.`}
          source="Histórico mensal por imóvel"
          tone={resumo.ocupacaoCompetencia.desconhecidos > 0 ? "warning" : "default"}
          help={{
            short: "Percentual ocupado e base efetivamente classificada.",
            title: "Ocupação da competência",
            definition: "Proporção de imóveis ocupados entre os imóveis com situação mensal classificada.",
            formula: "ocupados ÷ imóveis classificados × 100",
            source: "Histórico mensal por imóvel.",
            limitation: "Leia sempre junto com a cobertura; imóveis sem histórico não entram no denominador.",
          }}
        />
        <Kpi
          label="Repasse calculado"
          value={formatCurrency(resolveMetricValue(resumo.repasseCalculado, resumo.repasseApurado))}
          detail={byProperty ? "Valor líquido atribuído ao imóvel." : "Valor líquido resultante da conciliação financeira."}
          source={byProperty ? "Histórico mensal por imóvel" : "Fechamentos da competência"}
          help={{
            short: "Valor líquido calculado pela ponte financeira.",
            title: "Repasse calculado",
            definition: "Resultado financeiro após receitas, passagens, comissões, despesas e tarifas.",
            formula: "receitas econômicas + entradas de passagem − comissões − despesas − tarifas − saídas de passagem",
            source: "Fechamentos da competência.",
            limitation: "Confirmação de pagamento depende de comprovante bancário externo.",
          }}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <Panel className="min-w-0 overflow-hidden">
          <PanelHeader
            title="Evolução até a competência selecionada"
            description={metric === "valor" ? "Receita, aluguel recebido e repasse por mês, atribuídos à competência de origem do aluguel." : "Ocupação e cobertura do histórico mensal."}
            source={byProperty ? "Histórico mensal por imóvel" : "Fechamentos da competência e histórico mensal por imóvel"}
            help={metric === "valor" ? {
              short: "Cada mês segue a competência de origem do aluguel.",
              title: "Evolução por competência",
              definition: "Cada mês soma a receita e o aluguel na competência de origem do aluguel, não no mês em que o valor entrou no caixa. Um aluguel de março pago em maio conta em março.",
              source: "Fechamentos da competência e histórico mensal por imóvel.",
              limitation: "Por isso o valor de um mês pode diferir do card “Receitas do fechamento” do topo, que mostra o caixa do fechamento da competência selecionada. Atrasos recuperados movem só receita, nunca o aluguel recebido. Recebimentos cuja competência de origem fica fora do histórico permanecem no mês do recebimento.",
            } : undefined}
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
            title="Competência versus hoje"
            description="A competência usa o histórico mensal; Hoje usa a situação cadastral atual."
            source="Histórico mensal por imóvel e cadastro de imóveis"
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
          source={byProperty ? "Histórico mensal por imóvel; campos não atribuíveis aparecem como —" : "Fechamentos da competência"}
        />
        <dl className="grid gap-px bg-acr-line sm:grid-cols-2 xl:grid-cols-5">
          <SummaryValue label="Comissão administrativa" value={formatCurrency(resumo.comissaoAdministracao)} />
          <SummaryValue label="Comissão de intermediação" value={formatCurrency(resumo.comissaoIntermediacao)} />
          <SummaryValue label="Despesas retidas" value={formatCurrency(resumo.despesasRetidas)} />
          <SummaryValue label="Tarifas" value={formatCurrency(resolveMetricValue(resumo.tarifas))} />
          <SummaryValue label="Inadimplência acumulada" value={formatCurrency(resumo.inadimplenciaAcumulada)} warning />
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
        <span className="text-right text-sm font-bold text-acr-ink tabular-nums">
          {formatPercent(occupancy.percentual)} dos classificados
        </span>
      </div>
      <p className="mt-1 text-xs text-acr-muted-2">
        {formatCount(occupancy.numerador)} de {formatCount(occupancy.denominador)} imóveis · cobertura {formatPercent(occupancy.coberturaPercentual)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {occupancy.ocupados > 0 && <CountChip status="ocupado" count={occupancy.ocupados} />}
        {occupancy.alugadosApp > 0 && <CountChip status="alugado_app" count={occupancy.alugadosApp} />}
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
