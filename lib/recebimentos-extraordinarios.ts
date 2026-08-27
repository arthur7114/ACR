import type { AcordoRescisaoRecebido } from "./prestacao-types"

// Módulo canônico de recebimentos extraordinários (CA27). Único lugar do
// sistema autorizado a resolver base comissionável, total recebido, comissão e
// repasse de acordos, rescisões, atrasos e intermediações. Consumidores
// (revisão, resumo, snapshots, indicadores, payload eGestor) recebem
// `ResolucaoFinanceira` e nunca recalculam por conta própria.

export interface EvidenciaExtracao {
  documentoId: string | null
  secao: string | null
  linhaOuTrecho: string | null
  confianca: number
}

interface BaseRecebimento {
  imovelId: string | null
  apto: string | null
  inquilino: string | null
  competenciaOrigem: string | null
  competenciaRecebimento: string | null
  // Valores autoritativos do documento — preservados, nunca recalculados.
  totalRecebidoInformado: number | null
  comissaoInformada: number | null
  repasseInformado: number | null
  evidencia: EvidenciaExtracao
}

export interface ComponentesIntermediacao {
  aluguel: number | null
  garagem: number | null
  iptu: number | null
  seguro: number | null
  outrosEncargos: number | null
}

export interface ComponentesRecebimento {
  garagem: number | null
  encargos: number | null
}

export type RecebimentoExtraordinario = BaseRecebimento &
  (
    | { tipo: "intermediacao"; componentes: ComponentesIntermediacao; percentualInformado: number | null }
    | { tipo: "rescisao"; principal: number | null; ajuste: number | null; componentes: ComponentesRecebimento }
    | { tipo: "acordo" | "atraso"; principal: number | null; ajuste: number | null; componentes: ComponentesRecebimento }
    | { tipo: "outro"; valorInformado: number | null }
  )

export interface DivergenciaFinanceira {
  campo: "total_recebido" | "comissao" | "repasse"
  informado: number
  calculado: number
}

export type MotivoPendencia = "evidencia_insuficiente" | "equacao_inconsistente" | "vinculo_ausente"

export interface PendenciaRevisao {
  motivo: MotivoPendencia
  descricao: string
}

export type ResolucaoFinanceira =
  | {
      status: "resolvido"
      baseComissionavel: number | null
      totalRecebido: number
      comissao: number
      repasse: number
      percentualRealizado: number | null
      reconciliado: boolean
      divergencias: DivergenciaFinanceira[]
    }
  | { status: "pendente"; motivo: MotivoPendencia; pendencia: PendenciaRevisao }

// Confiança mínima para um item extraído produzir efeito financeiro. Abaixo
// disso o item vira pendência de revisão (CA27.2), nunca soma confirmada.
export const CONFIANCA_MINIMA_FINANCEIRA = 0.7

// Tolerância da equação recebido − comissão = repasse (CA14.2 revisado).
const TOLERANCIA_EQUACAO = 0.01

export function resolverRecebimento(item: RecebimentoExtraordinario): ResolucaoFinanceira {
  if (item.imovelId === null && item.apto === null && item.inquilino === null) {
    return pendente("vinculo_ausente", "Recebimento sem vínculo por imóvel, unidade ou inquilino.")
  }
  if (item.evidencia.confianca < CONFIANCA_MINIMA_FINANCEIRA) {
    return pendente(
      "evidencia_insuficiente",
      `Confiança ${item.evidencia.confianca.toFixed(2)} abaixo do mínimo ${CONFIANCA_MINIMA_FINANCEIRA}.`,
    )
  }

  const baseComissionavel = resolverBase(item)
  const totalDerivado = derivarTotal(item, baseComissionavel)
  const totalRecebido = item.totalRecebidoInformado ?? totalDerivado
  if (totalRecebido === null || totalRecebido === 0) {
    return pendente(
      "evidencia_insuficiente",
      "Recebimento sem valor monetário próprio; nada é somado até revisão.",
    )
  }

  const comissao = resolverComissao(item, totalRecebido, baseComissionavel)
  const repasse = item.repasseInformado ?? roundMoney(totalRecebido - comissao)

  const divergencias = validarEquacao(totalRecebido, comissao, repasse)
  if (divergencias.length > 0) {
    const [d] = divergencias
    return pendente(
      "equacao_inconsistente",
      `Equação recebido − comissão = repasse não fecha: informado ${d.informado.toFixed(2)}, calculado ${d.calculado.toFixed(2)}.`,
    )
  }

  return {
    status: "resolvido",
    baseComissionavel,
    totalRecebido: roundMoney(totalRecebido),
    comissao: roundMoney(comissao),
    repasse: roundMoney(repasse),
    percentualRealizado: resolverPercentual(item, baseComissionavel, comissao),
    reconciliado: true,
    divergencias: [],
  }
}

export function normalizarItemLegado(item: AcordoRescisaoRecebido): RecebimentoExtraordinario {
  const base: BaseRecebimento = {
    imovelId: null,
    apto: item.apto,
    inquilino: item.inquilino,
    competenciaOrigem: item.competencia_original,
    competenciaRecebimento: item.competencia_recebimento,
    totalRecebidoInformado: item.total_recebido ?? null,
    comissaoInformada: item.comissao ?? null,
    repasseInformado: item.repasse ?? null,
    evidencia: {
      documentoId: null,
      secao: null,
      linhaOuTrecho: item.observacao,
      confianca: item.confianca,
    },
  }

  if (item.tipo === "intermediacao") {
    return {
      ...base,
      tipo: "intermediacao",
      componentes: {
        aluguel: item.aluguel ?? (item.valor !== 0 ? item.valor : null),
        garagem: item.garagem ?? null,
        iptu: item.iptu ?? null,
        seguro: null,
        outrosEncargos: null,
      },
      percentualInformado: item.percentual ?? null,
    }
  }
  if (item.tipo === "outro") {
    return { ...base, tipo: "outro", valorInformado: item.valor !== 0 ? item.valor : null }
  }
  return {
    ...base,
    tipo: item.tipo,
    principal: item.valor !== 0 ? item.valor : null,
    ajuste: item.ajuste ?? null,
    componentes: { garagem: item.garagem ?? null, encargos: item.iptu ?? null },
  }
}

export function resolverRecebimentoLegado(item: AcordoRescisaoRecebido): ResolucaoFinanceira {
  return resolverRecebimento(normalizarItemLegado(item))
}

function resolverBase(item: RecebimentoExtraordinario): number | null {
  if (item.tipo !== "intermediacao") return null
  const { aluguel, garagem } = item.componentes
  if (aluguel === null && garagem === null) return null
  return roundMoney((aluguel ?? 0) + (garagem ?? 0))
}

function derivarTotal(item: RecebimentoExtraordinario, baseComissionavel: number | null): number | null {
  if (item.tipo === "intermediacao") {
    if (baseComissionavel === null) return null
    const { iptu, seguro, outrosEncargos } = item.componentes
    return roundMoney(baseComissionavel + (iptu ?? 0) + (seguro ?? 0) + (outrosEncargos ?? 0))
  }
  if (item.tipo === "outro") return item.valorInformado
  if (item.principal === null) return null
  return roundMoney(item.principal + (item.ajuste ?? 0) + (item.componentes.garagem ?? 0) + (item.componentes.encargos ?? 0))
}

function resolverComissao(
  item: RecebimentoExtraordinario,
  totalRecebido: number,
  baseComissionavel: number | null,
): number {
  if (item.comissaoInformada !== null) return item.comissaoInformada
  if (item.repasseInformado !== null) return roundMoney(totalRecebido - item.repasseInformado)
  if (item.tipo === "intermediacao" && item.percentualInformado !== null && baseComissionavel !== null) {
    return roundMoney((baseComissionavel * item.percentualInformado) / 100)
  }
  // Linha documentada sem coluna de comissão preenchida: zero documental.
  return 0
}

function resolverPercentual(
  item: RecebimentoExtraordinario,
  baseComissionavel: number | null,
  comissao: number,
): number | null {
  if (item.tipo === "intermediacao" && item.percentualInformado !== null) return item.percentualInformado
  if (baseComissionavel === null || baseComissionavel <= 0) return null
  return Math.round((comissao / baseComissionavel) * 10_000) / 100
}

function validarEquacao(totalRecebido: number, comissao: number, repasse: number): DivergenciaFinanceira[] {
  const repasseCalculado = roundMoney(totalRecebido - comissao)
  if (Math.abs(repasseCalculado - repasse) <= TOLERANCIA_EQUACAO) return []
  return [{ campo: "repasse", informado: repasse, calculado: repasseCalculado }]
}

function pendente(motivo: MotivoPendencia, descricao: string): ResolucaoFinanceira {
  return { status: "pendente", motivo, pendencia: { motivo, descricao } }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
