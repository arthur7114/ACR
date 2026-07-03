import type { ImovelStatus } from "@/lib/cadastros-types"
import type { IptuAnomaliaTipo, IptuResponsavel } from "@/lib/iptu-types"

export const IPTU_PARCELAS_PADRAO = 10

const RESPONSAVEL_POR_STATUS: Record<ImovelStatus, IptuResponsavel | null> = {
  ocupado: "inquilino",
  inadimplente: "inquilino",
  em_negociacao: "inquilino",
  vago: "proprietario",
  em_rescisao: "proprietario",
  inativo: null,
}

export function calcularResponsavel(status: ImovelStatus): IptuResponsavel | null {
  return RESPONSAVEL_POR_STATUS[status]
}

export interface NovasParcelasResultado {
  numerosNovos: number[]
  anomalia: IptuAnomaliaTipo | null
}

export function calcularNovasParcelas(
  parcelasPagasAtual: number,
  parcelasPagasInformado: number,
  numeroParcelasCarne: number,
): NovasParcelasResultado {
  const delta = parcelasPagasInformado - parcelasPagasAtual

  if (delta <= 0) {
    return { numerosNovos: [], anomalia: delta < 0 ? "regressao" : null }
  }

  const limite = Math.min(parcelasPagasInformado, numeroParcelasCarne)
  const numerosNovos: number[] = []
  for (let numero = parcelasPagasAtual + 1; numero <= limite; numero++) {
    numerosNovos.push(numero)
  }

  return {
    numerosNovos,
    anomalia: parcelasPagasInformado > numeroParcelasCarne ? "excede_carne" : null,
  }
}

export interface ImovelParaResolucao {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  unidade: string
}

export function resolverImovelId(
  imoveis: ImovelParaResolucao[],
  imobiliariaId: string,
  empreendimentoId: string,
  unidade: string,
): string | null {
  const unidadeNormalizada = unidade.trim()
  const encontrado = imoveis.find(
    (imovel) =>
      imovel.imobiliaria_id === imobiliariaId &&
      imovel.empreendimento_id === empreendimentoId &&
      imovel.unidade.trim() === unidadeNormalizada,
  )
  return encontrado?.id ?? null
}
