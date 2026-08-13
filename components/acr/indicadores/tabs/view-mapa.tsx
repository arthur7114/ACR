"use client"

// Herda a direção da Visão geral (ver view-geral.tsx): rótulo e valor no corpo,
// definição só no tooltip.
//
// D26 — os três KPIs de inadimplência saíram: viraram parte da Visão geral e
//   repetidos aqui só somavam peso. Fica o que é exclusivo desta aba, a lista de
//   quem está em aberto e o histórico mês a mês.
// D27 — o mapa abre por empreendimento e expande para as unidades; uma linha por
//   unidade transformava a tela em rolagem interminável. A célula perdeu as
//   linhas de percentual e de qualidade: a cor já carrega a intensidade, e o
//   percentual e de qualidade: a cor já carrega a intensidade. O inquilino
//   histórico permanece porque identifica quem ocupava a unidade em cada mês.

import { Fragment, useState } from "react"
import { ChevronRight } from "lucide-react"
import type { IndicadoresData, IndicadoresHeatCell } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import {
  buildDelinquencySummary,
  buildHeatGroups,
  describeHeatCellDetail,
  formatCount,
  formatCurrency,
  occupancyLabel,
  type HeatGroupCell,
  type HeatMetric,
} from "../lib/presentation"
import { EmptyState, Metric, Panel, PanelHeader, StatusChip, ToggleButton } from "../primitives/dashboard-ui"

export type { HeatMetric }

export function ViewMapa({
  data,
  heatMetric,
  onHeatMetricChange,
}: {
  data: IndicadoresData
  heatMetric: HeatMetric
  onHeatMetricChange: (metric: HeatMetric) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const groups = buildHeatGroups({ meses: data.heat.meses, linhas: data.heat.linhas, metric: heatMetric })

  function toggleGroup(empreendimentoId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(empreendimentoId)) next.delete(empreendimentoId)
      else next.add(empreendimentoId)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {heatMetric === "inad" && <DelinquencyPanel data={data} />}

      <Panel className="min-w-0 overflow-hidden">
        <PanelHeader
          title="Histórico por empreendimento"
          help={{
            short: "Intensidade do risco mês a mês, por empreendimento.",
            title: "Histórico por empreendimento",
            definition: "Cada célula mostra quantas unidades do empreendimento estavam em risco naquele mês, entre as que tinham dado. Abra o empreendimento para ver unidade por unidade.",
            limitation: "Mês sem dado não é risco zero: fica fora da conta e aparece em cinza.",
          }}
          action={
            <div className="inline-flex min-h-11 shrink-0 rounded-lg border border-acr-line-2 bg-white p-1" role="group" aria-label="Risco exibido">
              <ToggleButton selected={heatMetric === "inad"} onClick={() => onHeatMetricChange("inad")}>Inadimplência</ToggleButton>
              <ToggleButton selected={heatMetric === "vac"} onClick={() => onHeatMetricChange("vac")}>Vacância</ToggleButton>
            </div>
          }
        />

        {groups.length > 0 ? (
          <>
            <div
              className="max-h-[68vh] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acr-green"
              tabIndex={0}
              aria-label="Histórico de risco com rolagem interna"
            >
              <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
                <caption className="sr-only">
                  {heatMetric === "inad" ? "Inadimplência" : "Vacância"} por empreendimento e competência, com a posição atual em coluna separada.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 top-0 z-30 min-w-64 border-b border-r border-acr-line-2 bg-white px-4 py-3 text-left font-semibold text-acr-muted-2">
                      Empreendimento
                    </th>
                    {data.heat.meses.map((month) => (
                      <th key={month.competencia} scope="col" className="sticky top-0 z-20 min-w-24 border-b border-acr-line-2 bg-white px-2 py-3 text-center font-semibold text-acr-muted-2">
                        {month.label}
                      </th>
                    ))}
                    <th scope="col" className="sticky right-0 top-0 z-30 min-w-28 border-b border-l-2 border-acr-green/25 bg-acr-green-tint px-3 py-3 text-center font-bold text-acr-green-strong">
                      Hoje
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isOpen = expanded.has(group.empreendimentoId)
                    return (
                      <Fragment key={group.empreendimentoId}>
                        <tr>
                          <th scope="row" className="sticky left-0 z-10 min-w-64 max-w-64 border-b border-r border-acr-line bg-white p-0 text-left">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => toggleGroup(group.empreendimentoId)}
                              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-acr-green-tint focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acr-green"
                            >
                              <ChevronRight
                                aria-hidden="true"
                                className={cn("size-4 shrink-0 text-acr-muted-2 transition-transform motion-reduce:transition-none", isOpen && "rotate-90")}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold text-acr-ink">{group.empreendimentoNome}</span>
                                <span className="mt-0.5 block font-normal text-acr-muted-2 tabular-nums">
                                  {formatCount(group.linhas.length)} {group.linhas.length === 1 ? "unidade" : "unidades"}
                                </span>
                              </span>
                            </button>
                          </th>
                          {group.celulas.map((cell) => (
                            <GroupCell
                              key={cell.competencia}
                              cell={cell}
                              tenantName={group.linhas.length === 1
                                ? group.linhas[0].celulas.find((candidate) => candidate.competencia === cell.competencia)?.inquilinoNome ?? null
                                : undefined}
                            />
                          ))}
                          <td className="sticky right-0 z-10 border-b border-l-2 border-acr-green/20 bg-acr-green-tint px-3 py-3 text-center font-bold text-acr-ink tabular-nums">
                            {group.unidadesEmRiscoHoje > 0 ? formatCount(group.unidadesEmRiscoHoje) : "—"}
                          </td>
                        </tr>
                        {isOpen && group.linhas.map((row) => (
                          <tr key={`${group.empreendimentoId}-${row.imovelId}`}>
                            <th scope="row" className="sticky left-0 z-10 min-w-64 max-w-64 border-b border-r border-acr-line bg-acr-page py-2.5 pl-10 pr-4 text-left">
                              <span className="block truncate font-semibold text-acr-ink">{row.unidade}</span>
                              {row.inquilinoNome && (
                                <span className="mt-0.5 block truncate font-normal text-acr-muted-2">{row.inquilinoNome}</span>
                              )}
                            </th>
                            {data.heat.meses.map((month) => (
                              <UnitCell
                                key={month.competencia}
                                cell={row.celulas.find((candidate) => candidate.competencia === month.competencia) ?? null}
                                metric={heatMetric}
                                month={month.label}
                                unit={row.unidade}
                              />
                            ))}
                            <td className="sticky right-0 z-10 border-b border-l-2 border-acr-green/20 bg-acr-green-tint px-3 py-2.5 text-center">
                              <StatusChip status={row.hoje} />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <HeatLegend />
          </>
        ) : (
          <EmptyState
            title="Sem histórico para o mapa"
            description="Nenhum histórico mensal foi encontrado para os filtros e a competência selecionados."
          />
        )}
      </Panel>
    </div>
  )
}

function DelinquencyPanel({ data }: { data: IndicadoresData }) {
  const summary = buildDelinquencySummary({
    competenciaAtual: data.meta.competencia,
    meses: data.heat.meses,
    linhas: data.heat.linhas,
    inadimplenciaAcumulada: data.resumo.inadimplenciaAcumulada,
  })

  return (
    <Panel className="min-w-0 overflow-hidden">
      {/* O herói é a contagem, não o total: uma única unidade inadimplente sem
          valor conhecido zera a soma (por projeto — ver buildDelinquencySummary),
          e um traço gigante no topo do painel não informa nada. A contagem é
          sempre conhecida e é o que dispara ação; os valores estão nas linhas, e
          a inadimplência do mês e a acumulada vivem na Visão geral. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-6">
        <Metric
          label="Unidades em aberto"
          value={formatCount(summary.unidades.length)}
          tone={summary.unidades.length > 0 ? "danger" : "default"}
          help={{
            short: "Unidades inadimplentes na competência.",
            title: "Unidades em aberto",
            definition: "Unidades que estavam inadimplentes na competência selecionada.",
            limitation: "Quem já quitou não aparece, mesmo com meses inadimplentes no histórico.",
          }}
        />
        {summary.acumulada !== null && (
          <Metric
            label="Acumulada"
            value={formatCurrency(summary.acumulada)}
            rank="compact"
            tone="danger"
            help={{
              short: "Dívida de competências anteriores.",
              title: "Inadimplência acumulada",
              definition: "Aluguel de meses anteriores que segue sem pagamento.",
            }}
          />
        )}
      </div>
      {summary.unidades.length > 0 ? (
        <ul className="divide-y divide-acr-line border-t border-acr-line">
          {summary.unidades.map((unit) => (
            <li key={unit.imovelId} className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                {/* Empreendimento primeiro: a unidade costuma ser um número cru
                    ("22"), que sozinho e em negrito lê como quantidade. */}
                <p className="truncate text-sm font-semibold text-acr-ink">
                  {unit.empreendimentoNome} · {unit.unidade}
                </p>
                <p className="mt-0.5 truncate text-xs text-acr-muted-2">
                  {unit.meses.map((mes) => mes.label).join(", ")}
                </p>
              </div>
              {/* Vermelho só quando há dinheiro em aberto: unidade classificada
                  como inadimplente com R$ 0,00 existe na base (resíduo conhecido
                  de classificação) e pintá-la de alarme mente sobre o risco. */}
              <span
                className={cn(
                  "shrink-0 text-sm font-bold tabular-nums",
                  (unit.valorEmAberto ?? 0) > 0 ? "text-acr-red" : "text-acr-muted-2",
                )}
              >
                {formatCurrency(unit.valorEmAberto)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-acr-line">
          <EmptyState title="Nenhuma unidade inadimplente" description="Nenhuma unidade está inadimplente na competência selecionada." />
        </div>
      )}
    </Panel>
  )
}

function GroupCell({
  cell,
  tenantName,
}: {
  cell: HeatGroupCell
  tenantName?: string | null
}) {
  if (cell.unidadesComDado === 0) {
    return (
      <td aria-label="sem dado" className="min-w-32 max-w-32 border-b border-white/70 bg-[#f4f6f4] px-2 py-3 text-center align-middle text-acr-muted-2">
        —
      </td>
    )
  }

  return (
    <td
      aria-label={`${formatCount(cell.unidadesEmRisco)} de ${formatCount(cell.unidadesComDado)} unidades em risco${tenantName === undefined ? "" : `, ${tenantAriaLabel(tenantName)}`}${cell.valor === null ? "" : `, ${formatCurrency(cell.valor)}`}`}
      className={cn("min-w-32 max-w-32 border-b border-white/70 px-2 py-3 text-center align-middle tabular-nums", heatTone(cell.percentual))}
    >
      <span className="block text-sm font-bold">
        {formatCount(cell.unidadesEmRisco)}
        <span className="font-normal"> / {formatCount(cell.unidadesComDado)}</span>
      </span>
      {cell.valor !== null && cell.valor > 0 && (
        <span className="mt-0.5 block text-[10px] font-semibold">{formatCurrency(cell.valor)}</span>
      )}
      {tenantName !== undefined && <TenantName name={tenantName} />}
    </td>
  )
}

function UnitCell({
  cell,
  metric,
  month,
  unit,
}: {
  cell: IndicadoresHeatCell | null
  metric: HeatMetric
  month: string
  unit: string
}) {
  const status = cell?.statusOcupacao ?? null

  if (cell === null || status === null) {
    return (
      <td aria-label={`${unit}, ${month}: sem dado`} className="min-w-32 max-w-32 border-b border-white/70 bg-[#f4f6f4] px-2 py-2.5 text-center align-middle text-acr-muted-2">
        —
      </td>
    )
  }

  const percentage = metric === "inad" ? cell.inadimplenciaPercentual : cell.vacanciaPercentual
  // describeHeatCellDetail já decide quando um número acrescenta informação
  // (0% de inadimplência é dupla negativa; vacância é binária). A célula mostra
  // só a moeda; a frase completa vai para o rótulo acessível.
  const detail = describeHeatCellDetail({ metric, percentage, valor: cell.valor })

  return (
    <td
      aria-label={`${unit}, ${month}: ${occupancyLabel(status)}, ${tenantAriaLabel(cell.inquilinoNome)}${detail.kind === "detalhado" ? `, ${detail.valorLabel}` : ""}`}
      className={cn("min-w-32 max-w-32 border-b border-white/70 px-2 py-2.5 text-center align-middle tabular-nums", heatTone(percentage))}
    >
      <span className="block font-semibold">{occupancyLabel(status)}</span>
      <TenantName name={cell.inquilinoNome} />
      {detail.kind === "detalhado" && <span className="mt-0.5 block text-[10px]">{formatCurrency(cell.valor)}</span>}
    </td>
  )
}

function TenantName({ name }: { name: string | null }) {
  const label = name?.trim() || "Inquilino não informado"
  return (
    <span className="mt-0.5 block truncate text-[10px] font-normal leading-tight" title={name?.trim() || undefined}>
      {label}
    </span>
  )
}

function tenantAriaLabel(name: string | null) {
  return name?.trim() ? `inquilino ${name.trim()}` : "inquilino não informado"
}

function heatTone(value: number | null): string {
  if (value === null) return "bg-[#f4f6f4] text-acr-muted-2"
  if (value <= 1) return "acr-heat-q0"
  if (value <= 10) return "acr-heat-q1"
  if (value <= 25) return "acr-heat-q2"
  if (value <= 50) return "acr-heat-q3"
  if (value <= 75) return "acr-heat-q4"
  return "acr-heat-q5"
}

function HeatLegend() {
  const ranges = ["0–1%", "1–10%", "10–25%", "25–50%", "50–75%", "75%+"]

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-acr-line px-5 py-4 text-[11px] text-acr-muted-2 sm:px-6">
      {ranges.map((range, index) => (
        <span key={range} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-3 rounded-sm acr-heat-q${index}`} /> {range}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-sm bg-[#f4f6f4] ring-1 ring-inset ring-acr-line-2" /> sem dado
      </span>
    </div>
  )
}
