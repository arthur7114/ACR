"use client"

// Herda a direção da Visão geral (ver view-geral.tsx): rótulo e valor no corpo,
// definição só no tooltip, hierarquia pela escala do número.
//
// D24 — vocabulário do motor de conciliação não vaza mais para a tela (termos
// antigos escritos sem aspas de propósito: o teste de nomenclatura procura a
// forma citada e um comentário não deve reintroduzi-la):
//   Entradas/Saídas de passagem     -> IPTU recebido / IPTU pago
//   Diferença não explicada         -> Diferença
//   Ajustes classificados           -> Ajustes documentados
//   Valores ainda sem classificação -> selo "fora do previsto" (agregado)
//   Resto após as causas nomeadas   -> Sem explicação
// D25 — o antigo bloco de repasse com evidências (três repasses de rótulo
// burocrático mais a diferença no universo comprovado) virou uma conferência: o
// número que o banco confirma na frente, o par comparável ao lado, veredito no selo.

import type { IndicadoresData } from "@/lib/indicadores-types"
import {
  describeConference,
  formatContractedRent,
  formatCount,
  formatCurrency,
  formatPortfolioContractedRent,
  getConfidenceStatus,
  notaCobrancaEsperada,
  resolveMetricValue,
  sumKnownValues,
} from "../lib/presentation"
import { EmptyState, Metric, Panel, PanelHeader, StateChip, StatusChip } from "../primitives/dashboard-ui"

export function ViewReceita({ data }: { data: IndicadoresData }) {
  const bridge = data.ponteFinanceira
  const realization = data.realizacaoAluguel
  const summary = data.resumo
  const comprovantes = data.cobertura.comprovantes

  // ATENÇÃO ao rotular entradas/saídas de passagem: o campo é genérico, mas hoje
  // só IPTU trafega por ele — cesar-rego-parser.ts mapeia crédito/débito de IPTU
  // ("IPTU é movimento de passagem") e nenhum outro parser preenche os campos.
  // Conferido em jun/2026 nas três imobiliárias: a passagem da carteira é a soma
  // exata do IPTU de Cesar Rego e Plural, e água e seguro correm por despesas.
  // Se algum parser passar a rotear água, luz ou condomínio para cá, os rótulos
  // "IPTU recebido"/"IPTU pago" abaixo deixam de dizer a verdade e mudam.
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
    diferenca: resolveMetricValue(bridge.diferencaNaoExplicada, bridge.residuo),
  }
  const valoresSemDocumento = resolveMetricValue(
    realization.valoresSemClassificacao,
    realization.outrosAjustes,
  )
  const hasUndocumented = valoresSemDocumento !== null && Math.abs(valoresSemDocumento) > 0.01
  // A cadeia acima nomeia as tres causas do desvio; o que sobra depois delas e
  // o unico valor que continua sem explicacao. `valoresSemClassificacao` segue
  // intacto no dado e no bloqueio de confirmacao — aqui e so leitura.
  const restoNaoExplicado = resolveMetricValue(realization.restoNaoExplicado)
  const hasUnexplained = restoNaoExplicado !== null && Math.abs(restoNaoExplicado) > 0.01
  const conference = describeConference({
    comprovado: summary.repasseCalculadoComprovado,
    banco: resolveMetricValue(summary.repasseConfirmadoBanco, summary.repasseComprovado),
    comprovantes,
    status: getConfidenceStatus(data),
  })

  return (
    <div className="space-y-3">
      <Panel className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <Metric
            label="Confirmado pelo banco"
            value={formatCurrency(resolveMetricValue(summary.repasseConfirmadoBanco, summary.repasseComprovado))}
            rank="hero"
            help={{
              short: "Repasse que o comprovante bancário confirma.",
              title: "Confirmado pelo banco",
              definition: "Valor do repasse que o comprovante bancário confirma.",
              limitation: "Declaração da imobiliária nunca conta como comprovante.",
            }}
          />
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <StateChip label={conference.label} tone={conference.tone} />
            {comprovantes.esperados > 0 && (
              <p className="text-xs text-acr-muted-2 tabular-nums">
                {formatCount(comprovantes.presentes)} de {formatCount(comprovantes.esperados)} comprovantes
              </p>
            )}
            {(comprovantes.detalhesAusentes ?? []).length > 0 && (
              <p className="max-w-[280px] text-right text-[11px] leading-snug text-acr-muted-2">
                Sem comprovante: {(comprovantes.detalhesAusentes ?? []).join("; ")}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-acr-line pt-5 sm:grid-cols-3">
          <Metric
            label="Calculado com comprovante"
            value={formatCurrency(summary.repasseCalculadoComprovado)}
            rank="compact"
            help={{
              short: "Cálculo restrito aos fechamentos com comprovante.",
              title: "Calculado com comprovante",
              definition: "Repasse calculado apenas nos fechamentos que têm comprovante bancário. É o valor comparável ao confirmado pelo banco.",
            }}
          />
          <Metric
            label="Calculado no total"
            value={formatCurrency(resolveMetricValue(summary.repasseCalculado, summary.repasseApurado))}
            rank="compact"
            help={{
              short: "Cálculo de todos os fechamentos da competência.",
              title: "Calculado no total",
              definition: "Repasse calculado em todos os fechamentos, inclusive os que ainda não têm comprovante.",
              limitation: "Comparar este valor com o do banco acusa divergência onde só falta comprovante.",
            }}
          />
          <Metric
            label="Declarado pela imobiliária"
            value={formatCurrency(resolveMetricValue(summary.repasseDeclarado, summary.repasseInformadoExtrato))}
            rank="compact"
            help={{
              short: "Valor que a imobiliária informou no fechamento.",
              title: "Declarado pela imobiliária",
              definition: "Valor de repasse que a própria imobiliária informou no fechamento.",
            }}
          />
        </div>
      </Panel>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Das receitas ao repasse"
            help={{
              short: "Como as receitas chegam ao repasse calculado.",
              title: "Das receitas ao repasse",
              definition: "Sequência que leva das receitas do fechamento ao repasse calculado. O IPTU entra e sai porque a imobiliária cobra do inquilino e paga à prefeitura: o valor passa, não é receita nem despesa.",
              formula: "receitas + IPTU recebido − comissões − despesas − tarifas − IPTU pago = repasse",
              limitation: "Diferença acima de R$ 0,01 impede confirmar a competência.",
            }}
            action={<BridgeState reconciled={bridge.reconciliada} alert={bridge.alerta} />}
          />
          <div className="px-5 py-2 sm:px-6">
            <FinancialRow label="Receitas do fechamento" value={bridgeValues.receitasEconomicas} operation="=" strong />
            <FinancialRow label="IPTU recebido" value={bridgeValues.entradasPassagem} operation="+" />
            <FinancialRow label="Comissões" value={bridgeValues.comissoes} operation="−" />
            <FinancialRow label="Despesas" value={bridgeValues.despesas} operation="−" />
            <FinancialRow label="Tarifas" value={bridgeValues.tarifas} operation="−" />
            <FinancialRow label="IPTU pago" value={bridgeValues.saidasPassagem} operation="−" />
            <FinancialRow label="Repasse calculado" value={bridgeValues.repasseCalculado} operation="=" strong result />
            <FinancialRow label="Diferença" value={bridgeValues.diferenca} operation="Δ" danger={bridge.alerta} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Do contrato ao recebido"
            help={{
              short: "Por que o aluguel contratado não entrou inteiro.",
              title: "Do contrato ao recebido",
              definition: "Mostra o que separou o aluguel previsto nos contratos do que efetivamente entrou.",
              formula:
                "contratado − vacância − inadimplência − descontos ± ajustes documentados − ocupado sem recebimento − ocupado parcial + recebido em vago = recebido da competência",
              limitation: "Contratos de receita variável não entram no aluguel contratado.",
            }}
            action={<UndocumentedState value={valoresSemDocumento} flagged={hasUndocumented} />}
          />
          <div className="px-5 py-2 sm:px-6">
            <FinancialRow
              label="Aluguel contratado"
              value={realization.contratado}
              formattedValue={formatPortfolioContractedRent(realization.contratado, data.cobertura.contratos)}
              operation="="
              strong
            />
            <FinancialRow
              label="Vacância"
              value={realization.vacancia}
              operation="−"
              note={notaCobrancaEsperada(realization.vacanciaFinanceira, realization.vacancia)}
            />
            <FinancialRow
              label="Inadimplência do mês"
              value={realization.inadimplenciaMes}
              operation="−"
              note={notaCobrancaEsperada(realization.inadimplenciaFinanceira, realization.inadimplenciaMes)}
            />
            <FinancialRow label="Descontos documentados" value={realization.descontos} operation="−" />
            <FinancialRow label="Ajustes documentados" value={resolveMetricValue(realization.ajustesClassificados)} operation="±" />
            <FinancialRow
              label="Ocupado sem recebimento"
              value={realization.ocupadoSemRecebimento}
              operation="−"
              note="Inquilino nomeado que não pagou o mês. Não é vacância nem inadimplência declarada."
            />
            <FinancialRow
              label="Ocupado com recebimento parcial"
              value={realization.ocupadoRecebimentoParcial}
              operation="−"
              note="Pagou menos que o esperado, já descontado o desconto documentado."
            />
            <FinancialRow
              label="Recebido em imóvel vago"
              value={realization.recebidoEmVago}
              operation="+"
              note="Rescisão no meio do mês: a vacância desconta o mês cheio, mas entrou o proporcional."
            />
            <FinancialRow label="Recebido da competência" value={resolveMetricValue(realization.recebidoCompetencia, realization.recebido)} operation="=" strong result />
            <FinancialRow label="Atrasos recuperados" value={resolveMetricValue(realization.atrasosRecuperados)} operation="+" />
            <FinancialRow label="Recebido no mês" value={resolveMetricValue(realization.alugueisRecebidosMes, realization.recebido)} operation="=" strong result />
            <FinancialRow label="Sem explicação" value={restoNaoExplicado} operation="Δ" danger={hasUnexplained} />
          </div>
        </Panel>
      </div>

      {summary.acordosRescisoes && (
        <Panel>
          <PanelHeader
            title="Acordos e rescisões"
            help={{
              short: "Recebimentos fora do aluguel do mês, separados por natureza.",
              title: "Acordos e rescisões",
              definition:
                "Acordos quitam dívida antiga; rescisões encerram contrato (proporcional e multa); intermediações são comissão de nova locação; atrasos são aluguel de mês anterior pago agora. Contagem e valor total recebido de cada um.",
              limitation:
                "Somados num número só não significam nada — dinheiro entrando e inquilino saindo são fatos diferentes. Atraso ou acordo sem competência de origem não abate o saldo em aberto e aparece à parte.",
            }}
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-4 sm:px-6">
            <ContagemValor rotulo="Acordos recebidos" item={summary.acordosRescisoes.acordos} tone="#9A3412" />
            <ContagemValor rotulo="Rescisões" item={summary.acordosRescisoes.rescisoes} tone="#9F1239" />
            <ContagemValor
              rotulo="Intermediações"
              item={summary.acordosRescisoes.intermediacoes}
              nota={`comissão ${formatCurrency(summary.acordosRescisoes.intermediacoes.comissao)}`}
              tone="#0F766E"
            />
            <ContagemValor rotulo="Atrasos pagos" item={summary.acordosRescisoes.atrasos} tone="#1D4ED8" />
          </div>
          {summary.acordosRescisoes.semOrigem.quantidade > 0 && (
            <p className="border-t border-acr-line px-5 py-3 text-xs text-[#72500f] sm:px-6">
              ⚠ {formatCount(summary.acordosRescisoes.semOrigem.quantidade)} sem competência de origem ·{" "}
              {formatCurrency(summary.acordosRescisoes.semOrigem.valor)} não abatem o saldo em aberto
            </p>
          )}
        </Panel>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <Panel>
          <PanelHeader
            title="Imóveis que pedem atenção"
            help={{
              short: "Ordenados pelo maior valor não recebido.",
              title: "Imóveis que pedem atenção",
              definition: "Imóveis com valor não recebido na competência, do maior para o menor.",
            }}
          />
          {data.rankingAtencao.length > 0 ? (
            <ol className="divide-y divide-acr-line px-5 sm:px-6">
              {data.rankingAtencao.map((item) => (
                <li key={item.imovelId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="min-w-0 flex-1">
                    {/* Empreendimento primeiro: a unidade costuma ser um número
                        cru, que sozinho e em negrito lê como quantidade. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-acr-ink">
                        {item.empreendimentoNome} · {item.unidade}
                      </p>
                      <StatusChip status={item.statusOcupacao} />
                    </div>
                    {item.inquilinoNome && (
                      <p className="mt-0.5 truncate text-xs text-acr-muted-2">{item.inquilinoNome}</p>
                    )}
                  </div>
                  <dl className="grid grid-cols-3 gap-4 text-right text-xs sm:min-w-[300px]">
                    <RankingValue
                      label="Esperado"
                      value={item.esperado}
                      formattedValue={formatContractedRent(item.esperado, item.modeloReceita)}
                    />
                    <RankingValue label="Recebido" value={item.recebido} />
                    <RankingValue label="Não recebido" value={item.gapValor} danger />
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhum imóvel em atenção" description="Não há valor não recebido para os filtros atuais." />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Despesa detalhada"
            help={{
              short: "Recorte de água, IPTU e seguro.",
              title: "Despesa detalhada",
              definition: "Recorte de água, IPTU e seguro dentro das despesas.",
              limitation: "Não é o total de despesas: outras despesas retidas ficam fora deste recorte.",
            }}
          />
          <dl className="divide-y divide-acr-line px-5 sm:px-6">
            <DetailValue label="Água" value={summary.despesaOperacionalDetalhada.agua} />
            <DetailValue label="IPTU" value={summary.despesaOperacionalDetalhada.iptu} />
            <DetailValue label="Seguro" value={summary.despesaOperacionalDetalhada.seguro} />
            <DetailValue label="Total do recorte" value={summary.despesaOperacionalDetalhada.total} strong />
          </dl>
        </Panel>
      </div>
    </div>
  )
}

function BridgeState({ reconciled, alert }: { reconciled: boolean | null; alert: boolean }) {
  if (alert) return <StateChip label="Diferença acima da tolerância" tone="danger" />
  if (reconciled === true) return <StateChip label="Fecha" tone="positive" />
  return <StateChip label="Sem dados para fechar" tone="neutral" />
}

function UndocumentedState({ value, flagged }: { value: number | null; flagged: boolean }) {
  // Magnitude, não sinal: o selo sinaliza que existe valor sem documento; a
  // linha "Valores sem documento" abaixo mostra o sinal, que é onde ele importa.
  if (flagged) return <StateChip label={`${formatCurrency(Math.abs(value ?? 0))} fora do previsto`} tone="warning" />
  if (value === null) return <StateChip label="Sem dados para fechar" tone="neutral" />
  return <StateChip label="Entrou como previsto" tone="positive" />
}

function FinancialRow({
  label,
  value,
  formattedValue,
  operation,
  strong = false,
  result = false,
  danger = false,
  note = null,
}: {
  label: string
  value: number | null
  formattedValue?: string
  operation: string
  strong?: boolean
  result?: boolean
  danger?: boolean
  note?: string | null
}) {
  const display = formattedValue ?? formatCurrency(value)

  return (
    <div className={`grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 py-2.5 ${result ? "border-t-2 border-acr-line-2" : "border-b border-acr-line last:border-0"}`}>
      <span aria-hidden="true" className="text-center text-sm font-bold text-acr-muted">{operation}</span>
      <span className={`text-sm ${strong ? "font-bold text-acr-ink" : "text-acr-muted-2"}`}>
        {label}
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-acr-muted-2 tabular-nums">{note}</span>}
      </span>
      <span
        className={`text-sm font-bold tabular-nums ${
          display === "—" ? "text-acr-muted/60" : danger ? "text-acr-red" : "text-acr-ink"
        }`}
      >
        {display}
      </span>
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
      <dt className="text-[11px] text-acr-muted-2">{label}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${danger ? "text-acr-red" : "text-acr-ink"}`}>
        {formattedValue ?? formatCurrency(value)}
      </dd>
    </div>
  )
}

function DetailValue({ label, value, strong = false }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className={`text-sm ${strong ? "font-bold text-acr-ink" : "text-acr-muted-2"}`}>{label}</dt>
      <dd className="text-sm font-bold text-acr-ink tabular-nums">{formatCurrency(value)}</dd>
    </div>
  )
}


function ContagemValor({
  rotulo,
  item,
  nota,
  tone,
}: {
  rotulo: string
  item: { quantidade: number; valor: number }
  nota?: string
  tone: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-acr-muted-2">{rotulo}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-acr-ink">
        <span style={{ color: tone }}>{formatCount(item.quantidade)}</span>
        <span className="text-acr-muted-2"> · </span>
        {formatCurrency(item.valor)}
      </p>
      {nota && <p className="mt-0.5 text-xs text-acr-muted-2 tabular-nums">{nota}</p>}
    </div>
  )
}
