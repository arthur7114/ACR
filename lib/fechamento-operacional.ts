import type { Despesa, PrestacaoAnalysis, PrestacaoResumoDespesa } from "./prestacao-types"
import { resolverRecebimentoLegado } from "./recebimentos-extraordinarios"

export type CategoriaDespesaFechamento =
  | "energia"
  | "agua_esgoto"
  | "iptu"
  | "seguro"
  | "tarifas"
  | "ajustes"
  | "outros"

export interface ItemDespesaFechamento {
  descricao: string
  referencia: string | null
  valor: number
  // Categoria vinda do proprio documento, quando ele a informa. Tem precedencia
  // sobre a inferencia por texto: a observacao de uma despesa e um texto de nota
  // fiscal ou boleto, que frequentemente nao cita a categoria (GM II julho: a
  // segunda ENEL e os 8 seguros caiam em "Outros" porque a observacao dizia
  // apenas "Comprovante de pagamento" e "Boleto com Nosso Numero").
  categoria?: CategoriaDespesaFechamento
}

// Tipos do documento de despesas -> categorias do desdobramento.
const CATEGORIA_POR_TIPO: Record<string, CategoriaDespesaFechamento> = {
  energia: "energia",
  agua: "agua_esgoto",
  iptu: "iptu",
  seguro: "seguro",
}

export interface GrupoDespesaFechamento {
  categoria: CategoriaDespesaFechamento
  label: string
  total: number
  itens: ItemDespesaFechamento[]
}

export interface ResumoReceitasAdicionais {
  acordos: number
  rescisoes: number
  inadimplenciasPagas: number
  outros: number
  total: number
}

const ORDEM_CATEGORIAS: CategoriaDespesaFechamento[] = [
  "energia",
  "agua_esgoto",
  "iptu",
  "seguro",
  "tarifas",
  "ajustes",
  "outros",
]

const LABELS: Record<CategoriaDespesaFechamento, string> = {
  energia: "Energia",
  agua_esgoto: "Água e esgoto",
  iptu: "IPTU",
  seguro: "Seguros",
  tarifas: "Tarifas",
  ajustes: "Ajustes",
  outros: "Outros",
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function parseMoney(value: string): number {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value
  return Number(normalized)
}

function extractIptuPassagemFromObservation(observacao: string | null, allowBareValue: boolean): number {
  if (!observacao || !/iptu/i.test(observacao)) return 0
  const markers = [...observacao.matchAll(/IPTU de passagem \(R\$\s*([\d.,]+)\)/gi)]
  if (markers.length > 0) return markers.reduce((total, match) => total + parseMoney(match[1]), 0)
  const direct = observacao.match(/\bIPTU\b(?:\s+(?:creditado|cobrado|recebido))?\s*(?::|-)?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})/i)
  if (!direct || (!allowBareValue && !/(?:credit|debit|repass|passagem|prefeitura)/i.test(observacao))) return 0
  return parseMoney(direct[1])
}

export function calcularIptuRecebidoExibicao(prestacao: PrestacaoAnalysis | null, totalIptu: number): number {
  const isPompilio = normalizeText(prestacao?.empreendimento ?? "").includes("pompilio gomes")
  const iptuDePassagem = (prestacao?.receitas_por_imovel ?? []).reduce(
    (total, row) => total + extractIptuPassagemFromObservation(row.observacao, isPompilio),
    0,
  )

  return roundMoney(totalIptu + iptuDePassagem)
}

export function calcularResumoComissaoFechamento(prestacao: PrestacaoAnalysis | null) {
  const rows = prestacao?.receitas_por_imovel ?? []
  const regular = roundMoney(rows.reduce((total, row) => total + (row.comissao ?? 0), 0))
  const acordos = roundMoney(
    (prestacao?.acordos_rescisoes_recebidos ?? [])
      .filter((item) => item.tipo !== "intermediacao")
      .map(resolverRecebimentoLegado)
      .reduce((total, r) => total + (r.status === "resolvido" ? r.comissao : 0), 0),
  )
  const total = roundMoney(prestacao?.resumo_financeiro.comissao_administracao ?? regular + acordos)
  return { regular, acordos: Math.max(roundMoney(total - regular), 0), total }
}

export function calcularResumoReceitasAdicionais(
  prestacao: PrestacaoAnalysis | null,
): ResumoReceitasAdicionais {
  const resumo = {
    acordos: 0,
    rescisoes: 0,
    inadimplenciasPagas: 0,
    outros: 0,
  }

  for (const item of prestacao?.acordos_rescisoes_recebidos ?? []) {
    if (item.tipo === "intermediacao") continue
    const resolucao = resolverRecebimentoLegado(item)
    // Item pendente não produz efeito financeiro (CA27.2); ele aparece no
    // painel de pendências, nunca em total confirmado.
    if (resolucao.status !== "resolvido") continue
    const recebido = resolucao.totalRecebido
    if (item.tipo === "acordo") resumo.acordos += recebido
    else if (item.tipo === "rescisao") resumo.rescisoes += recebido
    else if (item.tipo === "atraso") resumo.inadimplenciasPagas += recebido
    else resumo.outros += recebido
  }

  const normalized = {
    acordos: roundMoney(resumo.acordos),
    rescisoes: roundMoney(resumo.rescisoes),
    inadimplenciasPagas: roundMoney(resumo.inadimplenciasPagas),
    outros: roundMoney(resumo.outros),
  }

  return {
    ...normalized,
    total: roundMoney(
      normalized.acordos
      + normalized.rescisoes
      + normalized.inadimplenciasPagas
      + normalized.outros,
    ),
  }
}

// Aluguel recebido medio da competencia. O denominador sao as unidades com
// cobranca ativa no mes (alugadas + inadimplentes), nao apenas as que pagaram:
// dividir so pelas que pagaram exibia a media das bem-sucedidas e escondia a
// parcela da carteira sem recebimento (Joao Cordeiro julho: 1.237,05 com uma
// das duas unidades sem pagar nada).
export function calcularAluguelRecebidoMedio(
  linhasComCobrancaAtiva: Array<{ aluguel: number | null }>,
): { valor: number | null; unidades: number } {
  const unidades = linhasComCobrancaAtiva.length
  if (unidades === 0) return { valor: null, unidades: 0 }
  const recebido = linhasComCobrancaAtiva.reduce((total, linha) => total + (linha.aluguel ?? 0), 0)
  return { valor: roundMoney(recebido / unidades), unidades }
}

export function classificarDespesaFechamento(descricao: string): CategoriaDespesaFechamento {
  const text = normalizeText(descricao)
  if (/estorno|revers|duplic|devolu|ajuste|correcao|credito/.test(text)) return "ajustes"
  if (/enel|energia|eletric|\bluz\b/.test(text)) return "energia"
  if (/cagece|agua|esgoto|saneamento/.test(text)) return "agua_esgoto"
  if (/\biptu\b/.test(text)) return "iptu"
  if (/seguro|apolice/.test(text)) return "seguro"
  if (/\bpix\b|\bted\b|tarifa|taxa banc|transferencia/.test(text)) return "tarifas"
  return "outros"
}

function extrairReferencia(descricao: string): string | null {
  const match = descricao.match(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/)
  if (!match) return null
  return `${match[1].padStart(2, "0")}/${match[2]}`
}

function resumoToItem(item: PrestacaoResumoDespesa): ItemDespesaFechamento {
  return {
    descricao: item.descricao,
    referencia: extrairReferencia(item.descricao),
    valor: roundMoney(item.valor),
  }
}

function despesaToItem(item: Despesa): ItemDespesaFechamento {
  return {
    descricao: item.observacao || item.fornecedor || "Despesa extraída",
    referencia: item.referencia || extrairReferencia(item.observacao || item.fornecedor || ""),
    valor: roundMoney(item.valor),
    categoria: CATEGORIA_POR_TIPO[item.tipo],
  }
}

export function desdobrarDespesasFechamento({
  totalDespesas,
  resumoItens = [],
  despesas = [],
}: {
  totalDespesas: number
  resumoItens?: PrestacaoResumoDespesa[]
  despesas?: Despesa[]
}): GrupoDespesaFechamento[] {
  const despesasItens = despesas.map(despesaToItem)
  const totalDespesasDocumento = roundMoney(
    despesasItens.reduce((total, item) => total + item.valor, 0),
  )
  const itens = totalDespesasDocumento > 0.01
    ? despesasItens
    : resumoItens.map(resumoToItem)
  const somaItens = roundMoney(itens.reduce((total, item) => total + item.valor, 0))
  const residual = roundMoney(totalDespesas - somaItens)

  if (residual > 0.01) {
    itens.push({
      descricao: "Valor ainda não discriminado no documento",
      referencia: null,
      valor: residual,
    })
  }

  const grupos = new Map<CategoriaDespesaFechamento, ItemDespesaFechamento[]>()
  for (const item of itens) {
    // Tipo do documento primeiro; texto so quando o documento nao classifica.
    const categoria = item.categoria ?? classificarDespesaFechamento(item.descricao)
    grupos.set(categoria, [...(grupos.get(categoria) ?? []), item])
  }

  return ORDEM_CATEGORIAS.flatMap((categoria) => {
    const categoriaItens = grupos.get(categoria) ?? []
    if (categoriaItens.length === 0) return []
    return [
      {
        categoria,
        label: LABELS[categoria],
        total: roundMoney(categoriaItens.reduce((total, item) => total + item.valor, 0)),
        itens: categoriaItens,
      },
    ]
  })
}
