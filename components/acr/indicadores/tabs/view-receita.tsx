"use client"

import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react"
import type { IndicadoresData } from "@/lib/indicadores-types"
import {
  formatContractedRent,
  formatCurrency,
  formatPortfolioContractedRent,
  formatPercent,
  resolveMetricValue,
  sumKnownValues,
} from "../lib/presentation"
import { DataNote, EmptyState, Panel, PanelHeader, StatusChip } from "../primitives/dashboard-ui"

export function ViewReceita({ data }: { data: IndicadoresData }) {
  const bridge = data.ponteFinanceira
  const realization = data.realizacaoAluguel
  const summary = data.resumo
  const byProperty = data.filtros.selecionados.imovelId !== null
  const bridgeValues = {
    receitasEconomicas: resolveMetricValue(bridge.receitasEconomicas, bridge.receitaTotal),
    entradasPassagem: resolveMetricValue(bridge.entradasPassagem),
    comissoes: resolveMetricValue(
      bridge.comissoes,
      sumKnownValues([bridge.comissaoAdministracao, bridge.comissaoIntermediacao]),
    ),
    despesas: resolveMetricValue(bridge.despesas, bridge.despesasRetidas),
    tarifas: resolveMetricValue(bridge.tarifas),
    saidasPassagem: resolveMetricValue(bridge.saidasPassagem),
    repasseCalculado: resolveMetricValue(bridge.repasseCalculado, bridge.repasseApurado),
    diferencaNaoExplicada: resolveMetricValue(bridge.diferencaNaoExplicada, bridge.residuo),
  }
  const valoresSemClassificacao = resolveMetricValue(
    realization.valoresSemClassificacao,
    realization.outrosAjustes,
  )
  const hasUnclassifiedAdjustments =
    valoresSemClassificacao !== null
    && Math.abs(valoresSemClassificacao) > 0.01
  const contractedRentLabel = formatPortfolioContractedRent(
    realization.contratado,
    data.cobertura.contratos,
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Panel>
          <PanelHeader
            title="Conciliação financeira"
            description="Das receitas econômicas ao repasse calculado, com movimentos de passagem e tarifas separados."
            source={byProperty ? "Histórico mensal por imóvel; retenções não atribuíveis ficam ausentes" : "Fechamentos da competência"}
            help={{
              short: "Ponte entre receitas e repasse calculado.",
              title: "Conciliação financeira",
              definition: "Explica como as receitas econômicas e os movimentos de caixa resultam no repasse.",
              formula: "receitas econômicas + entradas de passagem − comissões − despesas − tarifas − saídas de passagem = repasse calculado",
              source: "Fechamentos da competência.",
              limitation: "Qualquer diferença não explicada acima de R$ 0,01 bloqueia a confirmação.",
            }}
          />
          <div className="px-4 py-2 sm:px-5">
            <FinancialRow label="Receitas do fechamento" value={bridgeValues.receitasEconomicas} operation="=" strong />
            <FinancialRow label="Entradas de passagem" value={bridgeValues.entradasPassagem} operation="+" />
            <FinancialRow label="Comissões" value={bridgeValues.comissoes} operation="−" />
            <FinancialRow label="Despesas" value={bridgeValues.despesas} operation="−" />
            <FinancialRow label="Tarifas" value={bridgeValues.tarifas} operation="−" />
            <FinancialRow label="Saídas de passagem" value={bridgeValues.saidasPassagem} operation="−" />
            <FinancialRow label="Repasse calculado" value={bridgeValues.repasseCalculado} operation="=" strong result />
            <FinancialRow label="Diferença não explicada" value={bridgeValues.diferencaNaoExplicada} operation="Δ" danger={bridge.alerta} />
          </div>
          <div className="border-t border-acr-line px-4 py-4 sm:px-5">
            {bridge.reconciliada === true && (
              <div className="flex items-start gap-2 text-sm font-semibold text-acr-green-strong">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Ponte reconciliada dentro da tolerância de {formatCurrency(bridge.tolerancia)}.
              </div>
            )}
            {bridge.alerta && (
              <div role="alert" className="flex items-start gap-2 text-sm font-semibold text-acr-red">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Diferença não explicada acima da tolerância. Revise os valores antes de confirmar a competência.
              </div>
            )}
            {bridge.reconciliada === null && (
              <DataNote>Não há dados suficientes para reconciliar esta ponte.</DataNote>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Realização do aluguel contratado"
            description="Do contrato vigente ao aluguel da competência e aos atrasos recuperados no mês."
            source="Contratos históricos e histórico mensal por imóvel"
            help={{
              short: "Reconcilia contrato, perdas e recebimentos.",
              title: "Realização do aluguel contratado",
              definition: "Separa o aluguel desta competência dos recebimentos recuperados de meses anteriores.",
              formula: "contratado − vacância − inadimplência − descontos + ajustes classificados = recebido da competência",
              source: "Contratos históricos e histórico mensal por imóvel.",
              limitation: "Receitas variáveis são Não se aplica e não entram no aluguel contratado.",
            }}
          />
          <div className="px-4 py-2 sm:px-5">
            <FinancialRow
              label="Aluguel contratado"
              value={realization.contratado}
              formattedValue={contractedRentLabel}
              operation="="
              strong
            />
            <FinancialRow label="Vacância" value={realization.vacancia} operation="−" />
            <FinancialRow label="Inadimplência do mês" value={realization.inadimplenciaMes} operation="−" />
            <FinancialRow label="Descontos documentados" value={realization.descontos} operation="−" />
            <FinancialRow label="Ajustes classificados" value={resolveMetricValue(realization.ajustesClassificados)} operation="±" />
            <FinancialRow label="Recebido da competência" value={resolveMetricValue(realization.recebidoCompetencia, realization.recebido)} operation="=" strong result />
            <FinancialRow label="Atrasos recuperados" value={resolveMetricValue(realization.atrasosRecuperados)} operation="+" />
            <FinancialRow label="Aluguéis recebidos no mês" value={resolveMetricValue(realization.alugueisRecebidosMes, realization.recebido)} operation="=" strong result />
            <FinancialRow label="Valores ainda sem classificação" value={valoresSemClassificacao} operation="Δ" danger={hasUnclassifiedAdjustments} />
          </div>
          <div className="border-t border-acr-line px-4 py-4 sm:px-5">
            {hasUnclassifiedAdjustments && (
              <div className="mb-3">
                <DataNote warning>
                  Há {formatCurrency(valoresSemClassificacao)} ainda sem classificação ({formatPercent(realization.outrosAjustesPercentualContratado)} do aluguel contratado). Revise os imóveis e o fechamento antes de confirmar a competência.
                </DataNote>
              </div>
            )}
            <DataNote>Ajustes classificados têm origem documentada. Valores sem classificação permanecem visíveis e impedem a confirmação quando superam a tolerância.</DataNote>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Repasse e evidências"
          description="Repasse calculado, declaração da imobiliária e confirmação bancária são fontes distintas."
          source={byProperty ? "Histórico mensal por imóvel; evidências bancárias não são atribuídas por imóvel" : "Fechamentos da competência e comprovante bancário"}
          help={{
            short: "Compara o cálculo somente ao universo comprovado.",
            title: "Repasse e evidências",
            definition: "Mantém separados o valor calculado, o declarado pela imobiliária e o confirmado pelo banco.",
            source: "Fechamentos da competência e comprovantes bancários externos.",
            limitation: "Declarações embutidas nunca são tratadas como comprovante bancário.",
          }}
        />
        <dl className="grid gap-px bg-acr-line sm:grid-cols-2 xl:grid-cols-4">
          <EvidenceValue label="Repasse calculado" value={resolveMetricValue(summary.repasseCalculado, summary.repasseApurado)} detail={byProperty ? "Atribuído no histórico do imóvel" : "Calculado pela conciliação financeira"} />
          <EvidenceValue label="Repasse confirmado pelo banco" value={resolveMetricValue(summary.repasseConfirmadoBanco, summary.repasseComprovado)} detail="Somente comprovante bancário externo" />
          <EvidenceValue label="Repasse declarado pela imobiliária" value={resolveMetricValue(summary.repasseDeclarado, summary.repasseInformadoExtrato)} detail="Declaração presente no fechamento" />
          <EvidenceValue
            label="Diferença no universo comprovado"
            value={summary.diferencaRepasse}
            detail="Banco − calculado, somente nos fechamentos com comprovante"
            warning={summary.diferencaRepasse !== null && Math.abs(summary.diferencaRepasse) > 0.01}
          />
        </dl>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Panel>
          <PanelHeader
            title="Imóveis que pedem atenção"
            description="Ordenados pelo maior valor não recebido."
            source="Histórico mensal por imóvel"
          />
          {data.rankingAtencao.length > 0 ? (
            <ol className="divide-y divide-acr-line px-4 sm:px-5">
              {data.rankingAtencao.map((item, index) => (
                <li key={item.imovelId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-acr-page text-xs font-bold text-acr-muted-2 tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-acr-ink">{item.unidade} · {item.empreendimentoNome}</p>
                      <p className="mt-0.5 truncate text-xs text-acr-muted-2">{item.inquilinoNome ?? "Inquilino não informado"}</p>
                      <div className="mt-2"><StatusChip status={item.statusOcupacao} /></div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-right text-xs sm:min-w-[310px]">
                    <RankingValue
                      label="Esperado"
                      value={item.esperado}
                      formattedValue={formatContractedRent(
                        item.esperado,
                        item.modeloReceita,
                      )}
                    />
                    <RankingValue label="Recebido" value={item.recebido} />
                    <RankingValue label="Valor não recebido" value={item.gapValor} danger />
                  </dl>
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-acr-muted-2 sm:block" />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhum imóvel em atenção" description="Não há valor não recebido, inadimplência ou vacância classificada para os filtros atuais." />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Despesa operacional detalhada"
            description="Recorte de água, IPTU e seguro; não representa todas as despesas retidas."
            source="Fechamentos da competência"
          />
          <dl className="divide-y divide-acr-line px-4 sm:px-5">
            <DetailValue label="Água" value={summary.despesaOperacionalDetalhada.agua} />
            <DetailValue label="IPTU" value={summary.despesaOperacionalDetalhada.iptu} />
            <DetailValue label="Seguro" value={summary.despesaOperacionalDetalhada.seguro} />
            <DetailValue label="Total detalhado" value={summary.despesaOperacionalDetalhada.total} strong />
          </dl>
          <div className="border-t border-acr-line px-4 py-4 sm:px-5">
            <DataNote warning>“Despesa operacional detalhada” não é sinônimo de despesa total.</DataNote>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function FinancialRow({
  label,
  value,
  formattedValue,
  operation,
  strong = false,
  result = false,
  danger = false,
}: {
  label: string
  value: number | null
  formattedValue?: string
  operation: string
  strong?: boolean
  result?: boolean
  danger?: boolean
}) {
  return (
    <div className={`grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 py-3 ${result ? "border-t-2 border-acr-line-2" : "border-b border-acr-line last:border-0"}`}>
      <span aria-hidden="true" className="text-center text-sm font-bold text-acr-muted-2">{operation}</span>
      <span className={`text-sm ${strong ? "font-bold text-acr-ink" : "font-medium text-acr-muted-2"}`}>{label}</span>
      <span className={`text-sm font-bold tabular-nums ${danger ? "text-acr-red" : "text-acr-ink"}`}>{formattedValue ?? formatCurrency(value)}</span>
    </div>
  )
}

function EvidenceValue({ label, value, detail, warning = false }: { label: string; value: number | null; detail: string; warning?: boolean }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <dt className="text-xs font-medium text-acr-muted-2">{label}</dt>
      <dd className={`mt-2 text-lg font-bold tabular-nums ${warning ? "text-acr-red" : "text-acr-ink"}`}>{formatCurrency(value)}</dd>
      <p className="mt-1 text-xs leading-4 text-acr-muted-2">{detail}</p>
    </div>
  )
}

function RankingValue({
  label,
  value,
  formattedValue,
  danger = false,
}: {
  label: string
  value: number | null
  formattedValue?: string
  danger?: boolean
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium text-acr-muted-2">{label}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${danger ? "text-acr-red" : "text-acr-ink"}`}>{formattedValue ?? formatCurrency(value)}</dd>
    </div>
  )
}

function DetailValue({ label, value, strong = false }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <dt className={`text-sm ${strong ? "font-bold text-acr-ink" : "font-medium text-acr-muted-2"}`}>{label}</dt>
      <dd className="text-sm font-bold text-acr-ink tabular-nums">{formatCurrency(value)}</dd>
    </div>
  )
}
