"use client"

import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { formatCurrency, formatPercent } from "../lib/presentation"
import { DataNote, EmptyState, Panel, PanelHeader, StatusChip } from "../primitives/dashboard-ui"

export function ViewReceita({ data }: { data: IndicadoresData }) {
  const bridge = data.ponteFinanceira
  const realization = data.realizacaoAluguel
  const summary = data.resumo
  const byProperty = data.filtros.selecionados.imovelId !== null
  const hasUnclassifiedAdjustments =
    realization.outrosAjustes !== null && realization.outrosAjustes !== 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Panel>
          <PanelHeader
            title="Ponte financeira"
            description="Da receita declarada ao repasse apurado, sem misturar intermediação com outras despesas."
            source={byProperty ? "Snapshot do imóvel; retenções não atribuíveis ficam ausentes" : "PackageTotals e itens de intermediação"}
          />
          <div className="px-4 py-2 sm:px-5">
            <FinancialRow label="Receita total" value={bridge.receitaTotal} operation="=" strong />
            <FinancialRow label="Comissão administrativa" value={bridge.comissaoAdministracao} operation="−" />
            <FinancialRow label="Despesas retidas" value={bridge.despesasRetidas} operation="−" />
            <FinancialRow label="Comissão de intermediação" value={bridge.comissaoIntermediacao} operation="−" />
            <FinancialRow label="Repasse apurado" value={bridge.repasseApurado} operation="=" strong result />
            <FinancialRow label="Resíduo da reconciliação" value={bridge.residuo} operation="Δ" danger={bridge.alerta} />
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
                Resíduo acima da tolerância. Revise as retenções antes de consolidar a competência.
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
            description="Reconciliação do contrato até o aluguel efetivamente recebido."
            source="Snapshots e prestação da competência"
          />
          <div className="px-4 py-2 sm:px-5">
            <FinancialRow label="Aluguel contratado" value={realization.contratado} operation="=" strong />
            <FinancialRow label="Vacância" value={realization.vacancia} operation="−" />
            <FinancialRow label="Inadimplência do mês" value={realization.inadimplenciaMes} operation="−" />
            <FinancialRow label="Descontos documentados" value={realization.descontos} operation="−" />
            <FinancialRow label="Outros ajustes" value={realization.outrosAjustes} operation="±" />
            <FinancialRow label="Aluguel recebido" value={realization.recebido} operation="=" strong result />
          </div>
          <div className="border-t border-acr-line px-4 py-4 sm:px-5">
            {hasUnclassifiedAdjustments && (
              <div className="mb-3">
                <DataNote warning>
                  Há {formatCurrency(realization.outrosAjustes)} em ajustes ainda não classificados ({formatPercent(realization.outrosAjustesPercentualContratado)} do aluguel contratado). Revise os imóveis e a prestação antes de consolidar a competência.
                </DataNote>
              </div>
            )}
            <DataNote>Outros ajustes preservam excedentes, proporcionalidade e valores ainda não classificados; não são uma reconstrução circular de potencial.</DataNote>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Repasse apurado e evidências"
          description="Comprovante bancário e valor informado no extrato são fontes diferentes."
          source={byProperty ? "Snapshot do imóvel; evidências de repasse não são atribuídas por imóvel" : "Fechamento, comprovante e prestação"}
        />
        <dl className="grid gap-px bg-acr-line sm:grid-cols-2 xl:grid-cols-4">
          <EvidenceValue label="Repasse apurado" value={summary.repasseApurado} detail={byProperty ? "Atribuído no snapshot do imóvel" : "Calculado no fechamento"} />
          <EvidenceValue label="Repasse comprovado" value={summary.repasseComprovado} detail="Somente comprovante externo conhecido" />
          <EvidenceValue label="Informado no extrato" value={summary.repasseInformadoExtrato} detail="Declaração embutida na prestação" />
          <EvidenceValue
            label="Diferença comprovado − apurado"
            value={summary.diferencaRepasse}
            detail="Comprovante externo − apurado; o extrato permanece separado"
            warning={summary.diferencaRepasse !== null && summary.diferencaRepasse !== 0}
          />
        </dl>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Panel>
          <PanelHeader
            title="Imóveis que pedem atenção"
            description="Ordenados pelo maior gap de aluguel em reais."
            source="Snapshots da competência"
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
                    <RankingValue label="Esperado" value={item.esperado} />
                    <RankingValue label="Recebido" value={item.recebido} />
                    <RankingValue label="Gap" value={item.gapValor} danger />
                  </dl>
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-acr-muted-2 sm:block" />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhum imóvel em atenção" description="Não há gap positivo, inadimplência ou vacância classificada para os filtros atuais." />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Despesa operacional detalhada"
            description="Recorte de água, IPTU e seguro; não representa todas as despesas retidas."
            source="Itens detalhados da prestação"
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
  operation,
  strong = false,
  result = false,
  danger = false,
}: {
  label: string
  value: number | null
  operation: string
  strong?: boolean
  result?: boolean
  danger?: boolean
}) {
  return (
    <div className={`grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 py-3 ${result ? "border-t-2 border-acr-line-2" : "border-b border-acr-line last:border-0"}`}>
      <span aria-hidden="true" className="text-center text-sm font-bold text-acr-muted-2">{operation}</span>
      <span className={`text-sm ${strong ? "font-bold text-acr-ink" : "font-medium text-acr-muted-2"}`}>{label}</span>
      <span className={`text-sm font-bold tabular-nums ${danger ? "text-acr-red" : "text-acr-ink"}`}>{formatCurrency(value)}</span>
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

function RankingValue({ label, value, danger = false }: { label: string; value: number | null; danger?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-medium text-acr-muted-2">{label}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${danger ? "text-acr-red" : "text-acr-ink"}`}>{formatCurrency(value)}</dd>
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
