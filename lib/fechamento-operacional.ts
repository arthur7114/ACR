import type { Despesa, PrestacaoAnalysis, PrestacaoResumoDespesa } from "./prestacao-types"

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
}

export interface GrupoDespesaFechamento {
  categoria: CategoriaDespesaFechamento
  label: string
  total: number
  itens: ItemDespesaFechamento[]
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
      .reduce((total, item) => total + (item.comissao ?? 0), 0),
  )
  const total = roundMoney(prestacao?.resumo_financeiro.comissao_administracao ?? regular + acordos)
  return { regular, acordos: Math.max(roundMoney(total - regular), 0), total }
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
  const itens = resumoItens.length > 0 ? resumoItens.map(resumoToItem) : despesas.map(despesaToItem)
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
    const categoria = classificarDespesaFechamento(item.descricao)
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
