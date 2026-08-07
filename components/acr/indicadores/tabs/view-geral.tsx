"use client"

// DIREÇÃO — Dossiê de competência (seed 296e8fba, estrutura 4 de 7)
//
// TESE: a Visão geral responde "posso confiar neste mês?" numa ordem de leitura
// única, de cima para baixo. Recusa a grade de cinco cartões de peso idêntico,
// cada um com frase de detalhe e linha de fonte sob o número.
// HIERARQUIA: resultado do mês → inadimplência e ocupação → valores de apoio →
// série. A escala do número carrega a ordem; nada de peso uniforme.
// LINGUAGEM: só rótulo e valor no corpo. Definição vive exclusivamente no
// tooltip, e nenhum termo é inventado (D21, D24).
// GRÁFICOS: composição e distribuição como barras segmentadas proporcionais
// (D23 — contagem em lista não é gráfico); série como linhas sobre o tempo
// (D22 — 18 barras com rótulo repetido era o problema).
// AUSÊNCIA: "—" recua em cor, nunca se confunde com zero confirmado.

import type { IndicadoresData, IndicadoresOccupancy } from "@/lib/indicadores-types"
import { MonthlySeries } from "../charts/monthly-series"
import { SegmentedBar, type BarSegment } from "../charts/segmented-bar"
import {
  confidenceLabel,
  formatCount,
  formatCurrency,
  formatPercent,
  formatPortfolioContractedRent,
  getConfidenceStatus,
  resolveMetricValue,
  sumKnownValues,
  type DashboardMetric,
} from "../lib/presentation"
import {
  EmptyState,
  Metric,
  MetricToggle,
  Panel,
  PanelHeader,
  StateChip,
} from "../primitives/dashboard-ui"

const OCCUPANCY_FILLS: Array<{ key: keyof IndicadoresOccupancy; label: string; fill: string }> = [
  { key: "ocupados", label: "Ocupado", fill: "bg-acr-green" },
  { key: "alugadosApp", label: "Alugado por app", fill: "bg-[#5b3f97]" },
  { key: "inadimplentes", label: "Inadimplente", fill: "bg-acr-red" },
  { key: "emRescisao", label: "Em rescisão", fill: "bg-[#315b88]" },
  { key: "vagos", label: "Vago", fill: "bg-acr-amber" },
  { key: "desconhecidos", label: "Desconhecido", fill: "bg-[#b9c2ba]" },
]

export function ViewGeral({
  data,
  metric,
  onMetricChange,
}: {
  data: IndicadoresData
  metric: DashboardMetric
  onMetricChange: (metric: DashboardMetric) => void
}) {
  const { resumo, ponteFinanceira: bridge, realizacaoAluguel: realizacao } = data
  const resultado = resolveMetricValue(resumo.repasseCalculado, resumo.repasseApurado)
  const comprovantes = data.cobertura.comprovantes
  const conference = describeConference(
    resumo.repasseCalculadoComprovado,
    resumo.repasseConfirmadoBanco,
    comprovantes,
    getConfidenceStatus(data),
  )

  const comissoes = resolveMetricValue(
    bridge.comissoes,
    sumKnownValues([resumo.comissaoAdministracao, resumo.comissaoIntermediacao]),
  )
  const despesas = resolveMetricValue(bridge.despesas, resumo.despesasRetidas)
  const tarifas = resolveMetricValue(bridge.tarifas, resumo.tarifas)

  const composition: BarSegment[] = [
    { key: "resultado", label: "Resultado", value: resultado, fill: "bg-acr-green", display: formatCurrency(resultado) },
    { key: "comissoes", label: "Comissões", value: comissoes, fill: "bg-[#78ad80]", display: formatCurrency(comissoes) },
    { key: "despesas", label: "Despesas", value: despesas, fill: "bg-acr-amber", display: formatCurrency(despesas) },
    { key: "tarifas", label: "Tarifas", value: tarifas, fill: "bg-acr-muted", display: formatCurrency(tarifas) },
  ]

  return (
    <div className="space-y-3">
      <Panel className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <Metric
            label="Resultado do mês"
            value={formatCurrency(resultado)}
            rank="hero"
            help={{
              short: "Valor líquido do mês após comissões e despesas.",
              title: "Resultado do mês",
              definition: "O que sobra da receita da competência depois de comissões, despesas e tarifas.",
              formula: "receitas + entradas de passagem − comissões − despesas − tarifas − saídas de passagem",
            }}
          />
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <StateChip label={conference.label} tone={conference.tone} />
            {comprovantes.esperados > 0 && comprovantes.ausentes > 0 && (
              <p className="text-xs text-acr-muted-2 tabular-nums">
                {formatCount(comprovantes.presentes)} de {formatCount(comprovantes.esperados)} comprovantes
              </p>
            )}
          </div>
        </div>
        <SegmentedBar segments={composition} caption="Composição da receita" className="mt-6" />
      </Panel>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel className="px-5 py-5 sm:px-6">
          <Metric
            label="Inadimplência do mês"
            value={formatCurrency(realizacao.inadimplenciaMes)}
            tone="danger"
            help={{
              short: "Aluguel desta competência que não foi pago.",
              title: "Inadimplência do mês",
              definition: "Aluguel da competência selecionada que venceu e não foi pago.",
              limitation: "Dívida de meses anteriores aparece em Acumulada.",
            }}
          >
            <p className="mt-2 text-xs text-acr-muted-2 tabular-nums">
              {formatCount(resumo.ocupacaoCompetencia.inadimplentes)} de {formatCount(resumo.ocupacaoCompetencia.denominador)} imóveis
            </p>
          </Metric>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-acr-line pt-4">
            <Metric
              label="Acumulada"
              value={formatCurrency(resumo.inadimplenciaAcumulada)}
              rank="compact"
              tone="danger"
              help={{
                short: "Dívida de competências anteriores ainda em aberto.",
                title: "Inadimplência acumulada",
                definition: "Aluguel de meses anteriores que venceu e segue sem pagamento.",
              }}
            />
            <Metric
              label="Vacância"
              value={formatCurrency(realizacao.vacancia)}
              rank="compact"
              tone="warning"
              help={{
                short: "Aluguel não gerado por imóvel vago.",
                title: "Vacância",
                definition: "Aluguel contratado que a competência não gerou porque o imóvel estava vago.",
              }}
            />
          </div>
        </Panel>

        <Panel className="px-5 py-5 sm:px-6">
          <Metric
            label="Ocupação"
            value={formatPercent(resumo.ocupacaoCompetencia.percentual)}
            tone={resumo.ocupacaoCompetencia.desconhecidos > 0 ? "warning" : "default"}
            help={{
              short: "Imóveis ocupados entre os que têm situação conhecida.",
              title: "Ocupação",
              definition: "Proporção de imóveis ocupados entre os imóveis com situação conhecida na competência.",
              formula: "ocupados ÷ imóveis com situação conhecida × 100",
              limitation: "Imóveis sem histórico ficam fora da conta e aparecem como Desconhecido.",
            }}
          >
            <p className="mt-2 text-xs text-acr-muted-2 tabular-nums">
              {formatCount(resumo.ocupacaoCompetencia.numerador)} de {formatCount(resumo.ocupacaoCompetencia.denominador)} imóveis
            </p>
          </Metric>
          <div className="mt-5 space-y-4">
            <OccupancyDistribution label={data.meta.competenciaLabel} occupancy={resumo.ocupacaoCompetencia} />
            <OccupancyDistribution label="Hoje" occupancy={resumo.ocupacaoHoje} />
          </div>
        </Panel>
      </div>

      <Panel className="px-5 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
          <Metric
            label="Aluguel contratado"
            value={formatPortfolioContractedRent(resumo.aluguelContratado, data.cobertura.contratos)}
            rank="compact"
            help={{
              short: "Aluguel fixo previsto nos contratos vigentes.",
              title: "Aluguel contratado",
              definition: "Soma do aluguel fixo previsto nos contratos vigentes na competência.",
              limitation: "Contratos de receita variável não entram na soma.",
            }}
          />
          <Metric
            label="Aluguel recebido"
            value={formatCurrency(resumo.aluguelRecebidoCompetencia)}
            rank="compact"
            help={{
              short: "Aluguel desta competência que entrou.",
              title: "Aluguel recebido",
              definition: "Aluguel da competência selecionada efetivamente recebido.",
              limitation: "Aluguel de meses anteriores recebido agora não entra aqui.",
            }}
          />
          <Metric
            label="Comissões"
            value={formatCurrency(comissoes)}
            rank="compact"
            help={{
              short: "Administração e intermediação da imobiliária.",
              title: "Comissões",
              definition: "Soma da comissão de administração e da comissão de intermediação.",
            }}
          />
          <Metric
            label="Despesas"
            value={formatCurrency(despesas)}
            rank="compact"
            help={{
              short: "Despesas descontadas do repasse.",
              title: "Despesas",
              definition: "Despesas do imóvel descontadas do repasse, como água, IPTU e seguro.",
            }}
          />
          <Metric
            label="Tarifas"
            value={formatCurrency(tarifas)}
            rank="compact"
            help={{
              short: "Tarifas bancárias e de cobrança.",
              title: "Tarifas",
              definition: "Tarifas bancárias e de cobrança descontadas no fechamento.",
            }}
          />
        </div>
      </Panel>

      <Panel className="min-w-0 overflow-hidden">
        <PanelHeader
          title="Evolução mensal"
          action={<MetricToggle value={metric} onChange={onMetricChange} />}
          help={metric === "valor" ? {
            short: "Cada mês conta na competência de origem do aluguel.",
            title: "Evolução mensal",
            definition: "Cada mês soma os valores na competência de origem do aluguel, não no mês em que o dinheiro entrou. Um aluguel de março pago em maio conta em março.",
            limitation: "Por isso um mês pode diferir do resultado do topo, que segue o caixa do fechamento.",
          } : {
            short: "Ocupação e cobertura do histórico mês a mês.",
            title: "Evolução mensal",
            definition: "Ocupação e cobertura do histórico mensal em cada competência.",
          }}
        />
        {data.serieMensal.length > 0 ? (
          <MonthlySeries series={data.serieMensal} metric={metric} selectedCompetencia={data.meta.competencia} />
        ) : (
          <EmptyState title="Sem série histórica" description="A série aparece quando houver competências até o mês selecionado." />
        )}
      </Panel>
    </div>
  )
}

function OccupancyDistribution({ label, occupancy }: { label: string; occupancy: IndicadoresOccupancy }) {
  const segments: BarSegment[] = OCCUPANCY_FILLS.filter((item) => (occupancy[item.key] as number) > 0).map((item) => ({
    key: item.key,
    label: item.label,
    value: occupancy[item.key] as number,
    fill: item.fill,
    display: formatCount(occupancy[item.key] as number),
  }))

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold text-acr-ink">{label}</h3>
        <span className="text-xs font-semibold text-acr-ink tabular-nums">{formatPercent(occupancy.percentual)}</span>
      </div>
      <SegmentedBar segments={segments} caption={`Situação dos imóveis em ${label}`} className="mt-2" />
    </div>
  )
}

// O veredito só é honesto entre iguais: compara-se o resultado dos fechamentos
// que TÊM comprovante contra o que o banco confirmou. Medir o calculado total
// contra o comprovado transformaria comprovante ausente em divergência — falso
// alarme numa tela cujo trabalho é dizer se o mês pode ser confiado. Quando
// ainda falta comprovante, "confere" é verdadeiro mas não é final: fica neutro,
// nunca verde, e a contagem de comprovantes acompanha o selo.
function describeConference(
  comprovado: number | null,
  banco: number | null,
  comprovantes: { presentes: number; ausentes: number; esperados: number },
  status: ReturnType<typeof getConfidenceStatus>,
): { label: string; tone: "positive" | "warning" | "danger" | "neutral" } {
  if (comprovado !== null && banco !== null) {
    const delta = Math.abs(comprovado - banco)
    if (delta > 0.01) return { label: `Difere do banco em ${formatCurrency(delta)}`, tone: "danger" }
    return { label: "Confere com o banco", tone: comprovantes.ausentes === 0 ? "positive" : "neutral" }
  }
  if (status === "confirmado") return { label: confidenceLabel(status), tone: "positive" }
  if (status === "com_divergencia") return { label: confidenceLabel(status), tone: "danger" }
  if (status === "incompleto") return { label: confidenceLabel(status), tone: "warning" }
  return { label: confidenceLabel(status), tone: "neutral" }
}
