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
import { Check, ChevronRight } from "lucide-react"
import type { IndicadoresData, IndicadoresHeatCell, IndicadoresHeatDivida } from "@/lib/indicadores-types"
import { cn } from "@/lib/utils"
import { Hint } from "@/components/acr/hint-tooltip"
import {
  buildDelinquencySummary,
  buildHeatGroups,
  formatCompetenciaCurta,
  formatCount,
  formatCurrency,
  isInadimplenciaQuitada,
  occupancyLabel,
  type HeatGroup,
  type HeatGroupCell,
  type HeatGroupDetalhe,
  type HeatMetric,
} from "../lib/presentation"
import { EmptyState, Metric, Panel, PanelHeader, ToggleButton } from "../primitives/dashboard-ui"

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
  const labelDoMes = new Map(data.heat.meses.map((month) => [month.competencia, month.label]))

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
                              tenantName={inquilinoDaUnicaUnidade(group, cell.competencia)}
                              monthLabel={labelDoMes.get(cell.competencia) ?? cell.competencia}
                            />
                          ))}
                        </tr>
                        {isOpen && group.linhas.map((row) => (
                          <tr key={`${group.empreendimentoId}-${row.imovelId}`}>
                            <th scope="row" className="sticky left-0 z-10 min-w-64 max-w-64 border-b border-r border-acr-line bg-acr-page py-2.5 pl-10 pr-4 text-left">
                              <span className="block truncate font-semibold text-acr-ink">{row.unidade}</span>
                              {row.inquilinoAtual && (
                                <span
                                  className="mt-0.5 block truncate font-normal text-acr-muted-2"
                                  title={row.inquilinoAtual}
                                >
                                  Inquilino atual: {row.inquilinoAtual}
                                </span>
                              )}
                            </th>
                            {data.heat.meses.map((month) => (
                              <UnitCell
                                key={month.competencia}
                                cell={row.celulas.find((candidate) => candidate.competencia === month.competencia) ?? null}
                                metric={heatMetric}
                                month={month.label}
                                unit={row.unidade}
                                fallbackTenant={row.inquilinoAtual}
                              />
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <HeatLegend metric={heatMetric} />
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

// Empreendimento de uma unidade so mostra o inquilino na propria linha do grupo.
// Vago nao tem inquilino: devolve `undefined` para a celula nao imprimir nome
// nenhum, em vez de nomear quem morava ali ao lado de "Vago".
function inquilinoDaUnicaUnidade(group: HeatGroup, competencia: string) {
  if (group.linhas.length !== 1) return undefined
  const row = group.linhas[0]
  const celula = row.celulas.find((candidate) => candidate.competencia === competencia)
  if (!celula || celula.statusOcupacao === "vago") return undefined
  return celula.inquilinoNome ?? row.inquilinoAtual
}

// Hover do grupo: uma linha por unidade inadimplente no mes, quitada ou nao.
// A primeira linha resume; as demais dizem quem, quanto e — quando houve
// pagamento posterior — em que competencia e quanto foi pago.
function descreverDetalhes(cell: HeatGroupCell, monthLabel: string): string[] {
  if (cell.detalhes.length === 0) return []
  const emAberto = cell.detalhes.length - cell.unidadesQuitadas
  const quitadas = `${formatCount(cell.unidadesQuitadas)} ${cell.unidadesQuitadas === 1 ? "quitada" : "quitadas"}`
  return [`${monthLabel}: ${formatCount(emAberto)} em aberto · ${quitadas}`, ...cell.detalhes.map(descreverDetalhe)]
}

function descreverDetalhe(detalhe: HeatGroupDetalhe): string {
  const quem = `${detalhe.unidade} · ${detalhe.inquilino?.trim() || "inquilino não informado"}`
  const valor =
    detalhe.valor !== null
      ? formatCurrency(detalhe.valor)
      : detalhe.saldoDivida !== null
        ? `saldo ${formatCurrency(detalhe.saldoDivida)}`
        : "valor não apurado"
  if (detalhe.quitacao === null) return `${quem} — ${valor}, ${detalhe.quitada ? "quitada" : "em aberto"}`
  const pagamento = `${formatCurrency(detalhe.quitacao.valor)} em ${formatCompetenciaCurta(detalhe.quitacao.competencia)}`
  if (detalhe.quitada) return `${quem} — ${valor}, quitada: ${pagamento}`
  const saldo = detalhe.valor === null ? null : Math.max(0, detalhe.valor - detalhe.quitacao.valor)
  return `${quem} — ${valor}, pago ${pagamento}${saldo === null ? "" : ` · em aberto ${formatCurrency(saldo)}`}`
}

function GroupCell({
  cell,
  tenantName,
  monthLabel,
}: {
  cell: HeatGroupCell
  tenantName?: string | null
  monthLabel: string
}) {
  if (cell.unidadesComDado === 0) {
    return (
      <td aria-label="sem dado" className="min-w-32 max-w-32 border-b border-white/70 bg-[#f4f6f4] px-2 py-3 text-center align-middle text-acr-muted-2">
        —
      </td>
    )
  }

  const quitadasAria = cell.unidadesQuitadas > 0 ? `, ${formatCount(cell.unidadesQuitadas)} quitadas depois` : ""
  return (
    <td
      aria-label={`${formatCount(cell.unidadesEmRisco)} de ${formatCount(cell.unidadesComDado)} unidades em risco${quitadasAria}${tenantName === undefined ? "" : `, ${tenantAriaLabel(tenantName)}`}${cell.valor === null ? "" : `, ${formatCurrency(cell.valor)}`}`}
      className={cn("min-w-32 max-w-32 border-b border-white/70 p-0 text-center align-middle tabular-nums", heatTone(cell.percentual))}
    >
      <Hint lines={descreverDetalhes(cell, monthLabel)} side="bottom" className="px-2 py-3 text-center">
        <span className="block text-sm font-bold">
          {formatCount(cell.unidadesEmRisco)}
          <span className="font-normal"> / {formatCount(cell.unidadesComDado)}</span>
          {cell.unidadesQuitadas > 0 && <Check aria-hidden className="ml-1 inline size-3.5 align-[-2px]" />}
        </span>
        {cell.valor !== null && cell.valor > 0 && (
          <span className="mt-0.5 block text-[10px] font-semibold">{formatCurrency(cell.valor)}</span>
        )}
        {tenantName !== undefined && <TenantName name={tenantName} />}
      </Hint>
    </td>
  )
}

const UNIT_CELL_BASE = "min-w-32 max-w-32 border-b border-white/70 px-2 py-2.5 text-center align-middle tabular-nums"

function UnitCell({
  cell,
  metric,
  month,
  unit,
  fallbackTenant,
}: {
  cell: IndicadoresHeatCell | null
  metric: HeatMetric
  month: string
  unit: string
  /** Inquilino atual da linha: cobre a celula cujo snapshot veio sem nome. */
  fallbackTenant: string | null
}) {
  const status = cell?.statusOcupacao ?? null

  if (cell === null || status === null) {
    return (
      <td aria-label={`${unit}, ${month}: sem dado`} className={cn(UNIT_CELL_BASE, "bg-[#f4f6f4] text-acr-muted-2")}>
        —
      </td>
    )
  }

  if (metric === "vac") {
    // Modo vacancia: status escrito + inquilino, como antes. Vacancia e binaria
    // e a cor ja carrega o 0/100.
    return (
      <td
        aria-label={`${unit}, ${month}: ${occupancyLabel(status)}${status === "vago" ? "" : `, ${tenantAriaLabel(cell.inquilinoNome ?? fallbackTenant)}`}`}
        className={cn(UNIT_CELL_BASE, heatTone(cell.vacanciaPercentual))}
      >
        <span className="block font-semibold">{occupancyLabel(status)}</span>
        {status !== "vago" && <TenantName name={cell.inquilinoNome ?? fallbackTenant} />}
      </td>
    )
  }

  // Modo inadimplencia (regra do cliente, 2026-09-02): a celula mostra so o
  // inquilino e a cor diz o estado. Vago fica branco e escrito; desconhecido
  // continua escrito porque nao ha inquilino a mostrar.
  const dividaLinhas = cell.divida ? descreverDivida(cell.divida, month) : []
  if (status === "vago") {
    // Rescisao no mes: a unidade terminou vaga, mas o que aconteceu foi uma
    // saida com proporcional. A celula diz "Rescisao" e o hover traz o
    // recebido e a observacao do documento (dias, periodo).
    const rescisao = cell.eventos?.includes("rescisao") ?? false
    const linhas = rescisao
      ? [
          `Rescisão em ${month}`,
          cell.aluguelRecebido !== null && cell.aluguelRecebido !== undefined
            ? `Recebido proporcional: ${formatCurrency(cell.aluguelRecebido)}`
            : null,
          cell.observacao,
          ...dividaLinhas,
        ]
      : dividaLinhas
    return (
      <td
        aria-label={`${unit}, ${month}: ${rescisao ? "Rescisão" : "Vago"}${linhas.filter(Boolean).slice(1).map((linha) => `, ${linha}`).join("")}`}
        className={cn(UNIT_CELL_BASE, "p-0 bg-white text-acr-muted-2 ring-1 ring-inset ring-acr-line")}
      >
        <Hint lines={linhas} side="bottom" className="px-2 py-2.5 text-center">
          <span className="block font-semibold">{rescisao ? "Rescisão" : "Vago"}</span>
          {rescisao && <TenantName name={inquilinoOuAtual(cell, fallbackTenant)} />}
        </Hint>
      </td>
    )
  }
  if (status === "desconhecido") {
    return (
      <td aria-label={`${unit}, ${month}: Desconhecido`} className={cn(UNIT_CELL_BASE, "bg-[#f4f6f4] text-acr-muted-2")}>
        <span className="block font-semibold">Desconhecido</span>
      </td>
    )
  }

  // O snapshot pode vir sem nome (Plural jun/jul deixou o campo vazio no
  // Galpao Jose Walter); o inquilino atual da linha e a melhor evidencia.
  const inquilino = inquilinoOuAtual(cell, fallbackTenant)

  if (status !== "inadimplente") {
    return (
      <td
        aria-label={`${unit}, ${month}: ${occupancyLabel(status)}, ${tenantAriaLabel(inquilino)}${dividaLinhas.map((linha) => `, ${linha}`).join("")}`}
        className={cn(UNIT_CELL_BASE, dividaLinhas.length > 0 && "p-0", heatTone(cell.inadimplenciaPercentual))}
      >
        {dividaLinhas.length > 0 ? (
          <Hint lines={dividaLinhas} side="bottom" className="px-2 py-2.5 text-center">
            <TenantName name={inquilino} emphasis />
          </Hint>
        ) : (
          <TenantName name={inquilino} emphasis />
        )}
      </td>
    )
  }

  // Inadimplente: vermelho enquanto em aberto; verde com o sinal de quitacao
  // quando um mes posterior recuperou o atraso desta competencia. O historico
  // nao apaga que a inadimplencia existiu — o hover conta quanto e quando.
  const quitada = isInadimplenciaQuitada(cell)
  const valorLabel = cell.valor === null ? "valor não apurado" : formatCurrency(cell.valor)
  const quitacaoLinhas =
    !cell.quitacao
      ? []
      : [
          `Inadimplência de ${month}: ${valorLabel}`,
          quitada
            ? `Quitada em ${formatCompetenciaCurta(cell.quitacao.competencia)}: ${formatCurrency(cell.quitacao.valor)}`
            : `Pago ${formatCurrency(cell.quitacao.valor)} em ${formatCompetenciaCurta(cell.quitacao.competencia)}${
                cell.valor === null ? "" : ` · em aberto ${formatCurrency(Math.max(0, cell.valor - cell.quitacao.valor))}`
              }`,
        ]
  const linhas = [...quitacaoLinhas, ...dividaLinhas]
  // Sem valor do mes, a celula mostra o saldo da divida registrada depois.
  const valorCelula = cell.valor ?? cell.divida?.saldo ?? null

  return (
    <td
      aria-label={`${unit}, ${month}: ${quitada ? "inadimplência quitada" : "Inadimplente"}, ${tenantAriaLabel(inquilino)}${
        cell.valor === null ? "" : `, ${valorLabel}`
      }${linhas.slice(1).map((linha) => `, ${linha}`).join("")}`}
      className={cn(UNIT_CELL_BASE, "p-0", quitada ? "acr-heat-q0" : "acr-heat-q5")}
    >
      <Hint lines={linhas} side="bottom" className="px-2 py-2.5 text-center">
        <span className="flex items-center justify-center gap-1 text-[11px] font-semibold leading-tight">
          <span className="truncate" title={inquilino?.trim() || undefined}>
            {inquilino?.trim() || "Inquilino não informado"}
          </span>
          {quitada && <Check aria-hidden className="size-3.5 shrink-0" />}
        </span>
        {!quitada && valorCelula !== null && valorCelula > 0 && (
          <span className="mt-0.5 block text-[10px]">
            {cell.valor === null ? "saldo " : ""}
            {formatCurrency(valorCelula)}
          </span>
        )}
      </Hint>
    </td>
  )
}

// `emphasis`: o inquilino e o unico texto da celula (modo inadimplencia) e
// ocupa o lugar que era do status.
function inquilinoOuAtual(cell: IndicadoresHeatCell, fallbackTenant: string | null) {
  return cell.inquilinoNome ?? fallbackTenant
}

// Linhas do hover para a divida registrada pela acumulada de fechamentos
// posteriores: de onde veio, saldo mais recente (o documento reafirma e
// corrige o valor todo mes), pagamentos e quitacao.
function descreverDivida(divida: IndicadoresHeatDivida, month: string): string[] {
  const linhas: Array<string | null> = [
    divida.retroativa
      ? `Inadimplência de ${month} registrada no fechamento de ${formatCompetenciaCurta(divida.registradaEm)}`
      : null,
    `${divida.inquilino ?? "Inquilino não informado"}: saldo ${formatCurrency(divida.saldo)} em ${formatCompetenciaCurta(divida.saldoEm)}${
      divida.condicao ? ` — ${divida.condicao}` : ""
    }`,
    ...divida.pagamentos.map(
      (pagamento) =>
        `Pago em ${formatCompetenciaCurta(pagamento.competencia)}: ${formatCurrency(pagamento.valor)}${
          pagamento.descricao ? ` — ${pagamento.descricao}` : ""
        }`,
    ),
    divida.quitada ? `Quitada: não consta mais no fechamento seguinte a ${formatCompetenciaCurta(divida.saldoEm)}` : null,
  ]
  return linhas.filter((linha): linha is string => Boolean(linha))
}

function TenantName({ name, emphasis = false }: { name: string | null; emphasis?: boolean }) {
  const label = name?.trim() || "Inquilino não informado"
  return (
    <span
      className={cn(
        "block truncate leading-tight",
        emphasis ? "text-[11px] font-semibold" : "mt-0.5 text-[10px] font-normal",
      )}
      title={name?.trim() || undefined}
    >
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

function HeatLegend({ metric }: { metric: HeatMetric }) {
  const ranges = ["0–1%", "1–10%", "10–25%", "25–50%", "50–75%", "75%+"]

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-acr-line px-5 py-4 text-[11px] text-acr-muted-2 sm:px-6">
      {ranges.map((range, index) => (
        <span key={range} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-3 rounded-sm acr-heat-q${index}`} /> {range}
        </span>
      ))}
      {metric === "inad" && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-white ring-1 ring-inset ring-acr-line" /> vago
        </span>
      )}
      {metric === "inad" && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-flex size-3 items-center justify-center rounded-sm acr-heat-q0">
            <Check className="size-2.5" />
          </span>{" "}
          inadimplência quitada depois
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-sm bg-[#f4f6f4] ring-1 ring-inset ring-acr-line-2" /> sem dado
      </span>
    </div>
  )
}
