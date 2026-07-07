import type { ImovelStatus } from "@/lib/cadastros-types"
import type { IptuAnomaliaTipo, IptuResponsavel, IptuStatus } from "@/lib/iptu-types"

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

// ---------------------------------------------------------------------------
// Contas a pagar manual
// ---------------------------------------------------------------------------

/** Data local do sistema em AAAA-MM-DD (sem UTC, evita bug de fuso). */
export function hojeLocalISO(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Status calculado da parcela. Comparacao lexicografica de strings AAAA-MM-DD
 * (timezone-safe): paga se ha data_baixa; vencida se venceu antes de hoje;
 * caso contrario aberta (vencimento hoje ou futuro conta como aberta).
 */
export function calcularStatusParcela(
  parcela: { dataBaixa: string | null; dataVencimento: string | null },
  hojeISO: string = hojeLocalISO(),
): IptuStatus {
  if (parcela.dataBaixa) return "pago"
  if (parcela.dataVencimento && parcela.dataVencimento < hojeISO) return "vencido"
  return "aberto"
}

export interface ParcelaGerada {
  numero: number
  data_vencimento: string
  valor_previsto: number
  observacoes: string | null
  responsavel: IptuResponsavel | null
}

/** Monta as parcelas de um carne a partir dos vencimentos e valor padrao. */
export function gerarParcelasImovel(input: {
  numeroParcelas: number
  vencimentos: string[]
  valorPadrao?: number | null
  observacoes?: string | null
  responsavel?: IptuResponsavel | null
}): ParcelaGerada[] {
  if (input.vencimentos.length !== input.numeroParcelas) {
    throw new Error("A quantidade de vencimentos deve ser igual ao numero de parcelas.")
  }
  return input.vencimentos.map((vencimento, index) => ({
    numero: index + 1,
    data_vencimento: vencimento,
    valor_previsto: input.valorPadrao ?? 0,
    observacoes: input.observacoes ?? null,
    responsavel: input.responsavel ?? null,
  }))
}

export interface CarneExistente {
  imovel_id: string
  ano_referencia: number
}

/** Retorna os imovelIds que ja possuem carne no ano informado. */
export function detectarConflitos(
  carnesExistentes: CarneExistente[],
  imovelIds: string[],
  ano: number,
): string[] {
  const comCarne = new Set(
    carnesExistentes.filter((c) => c.ano_referencia === ano).map((c) => c.imovel_id),
  )
  return imovelIds.filter((id) => comCarne.has(id))
}

/** Valida os campos obrigatorios de uma baixa. Lanca em caso de erro. */
export function validarBaixa(input: {
  dataBaixa: string | null | undefined
  valorPago: number | null | undefined
}): void {
  if (!input.dataBaixa) {
    throw new Error("data_baixa e obrigatoria para dar baixa.")
  }
  if (
    input.valorPago === null ||
    input.valorPago === undefined ||
    !Number.isFinite(input.valorPago) ||
    input.valorPago < 0
  ) {
    throw new Error("valor_pago deve ser um numero maior ou igual a zero.")
  }
}

/** Valida edicao de parcela (data obrigatoria, valor >= 0). Lanca em caso de erro. */
export function validarEdicaoParcela(input: {
  dataVencimento?: string | null
  valorPrevisto?: number | null
}): void {
  if (input.dataVencimento !== undefined && !input.dataVencimento) {
    throw new Error("data_vencimento e obrigatoria.")
  }
  if (
    input.valorPrevisto !== undefined &&
    input.valorPrevisto !== null &&
    (!Number.isFinite(input.valorPrevisto) || input.valorPrevisto < 0)
  ) {
    throw new Error("valor_previsto deve ser maior ou igual a zero.")
  }
}

export interface ParcelaExistente {
  id: string
  numero: number
  pago: boolean
  dataBaixa: string | null
}

export interface AjusteParcelasPlano {
  criar: number[]
  remover: string[]
}

/**
 * Planeja o ajuste do numero de parcelas de um carne:
 * - aumentar cria apenas as parcelas adicionais;
 * - reduzir remove somente parcelas futuras nao pagas;
 * - bloqueia (lanca) se houver parcela paga/baixada acima do novo numero.
 */
export function planejarAjusteParcelas(
  parcelasAtuais: ParcelaExistente[],
  novoNumero: number,
): AjusteParcelasPlano {
  if (!Number.isInteger(novoNumero) || novoNumero < 1) {
    throw new Error("numero_parcelas deve ser um inteiro positivo.")
  }

  const estaPaga = (p: ParcelaExistente) => p.pago || p.dataBaixa != null
  const pagasAcima = parcelasAtuais.filter((p) => estaPaga(p) && p.numero > novoNumero)
  if (pagasAcima.length > 0) {
    throw new Error(
      `Nao e possivel reduzir para ${novoNumero} parcelas: existem parcelas pagas acima desse numero.`,
    )
  }

  const maxNumero = parcelasAtuais.reduce((max, p) => Math.max(max, p.numero), 0)
  const criar: number[] = []
  for (let numero = maxNumero + 1; numero <= novoNumero; numero++) {
    criar.push(numero)
  }

  const remover = parcelasAtuais
    .filter((p) => p.numero > novoNumero && !estaPaga(p))
    .map((p) => p.id)

  return { criar, remover }
}
