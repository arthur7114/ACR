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
  // Unidade a que a despesa pertence ("apto 12"), quando o documento a diz.
  // Desconhecida (null) quando nao ha como saber — nunca inventada.
  unidade?: string | null
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
  /** Total RECEBIDO na secao de intermediacao — nao a taxa retida. */
  intermediacao: number
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
    intermediacao: 0,
    outros: 0,
  }

  // A intermediacao ficava de fora: o total exibido a incluia (ela esta dentro
  // de `recebidos_em_nome_locador`) e a decomposicao nao, entao as partes nao
  // somavam o todo. Grand Castelao I ago/2026: R$ 14.003,51 listados contra
  // R$ 15.447,13 exibidos, R$ 1.443,63 de diferenca. Ela tem linha propria
  // porque o regime de comissao e outro — somar no aluguel esconderia isso.
  for (const item of prestacao?.acordos_rescisoes_recebidos ?? []) {
    const resolucao = resolverRecebimentoLegado(item)
    // Item pendente não produz efeito financeiro (CA27.2); ele aparece no
    // painel de pendências, nunca em total confirmado.
    if (resolucao.status !== "resolvido") continue
    const recebido = resolucao.totalRecebido
    if (item.tipo === "acordo") resumo.acordos += recebido
    else if (item.tipo === "rescisao") resumo.rescisoes += recebido
    else if (item.tipo === "atraso") resumo.inadimplenciasPagas += recebido
    else if (item.tipo === "intermediacao") resumo.intermediacao += recebido
    else resumo.outros += recebido
  }

  const normalized = {
    acordos: roundMoney(resumo.acordos),
    rescisoes: roundMoney(resumo.rescisoes),
    inadimplenciasPagas: roundMoney(resumo.inadimplenciasPagas),
    intermediacao: roundMoney(resumo.intermediacao),
    outros: roundMoney(resumo.outros),
  }

  return {
    ...normalized,
    total: roundMoney(
      normalized.acordos
      + normalized.rescisoes
      + normalized.inadimplenciasPagas
      + normalized.intermediacao
      + normalized.outros,
    ),
  }
}

// Aluguel recebido medio da competencia. O denominador sao as unidades ALUGADAS
// no mes (com locatario: pagantes, inadimplentes, intermediacao, rescisao
// proporcional), nao apenas as que pagaram: dividir so pelas que pagaram exibia
// a media das bem-sucedidas e escondia a parcela da carteira sem recebimento
// (Joao Cordeiro julho: 1.237,05 com uma das duas unidades sem pagar nada).
// Devolve tambem o numerador para a tela imprimir a formula: o cliente dividiu a
// receita de aluguel pela contagem exibida e nao reproduziu o valor (GM II jul/26,
// tile dizia 23 unidades enquanto Alugadas mostrava 22).
export function calcularAluguelRecebidoMedio(
  linhasAlugadas: Array<{ aluguel: number | null }>,
): { valor: number | null; unidades: number; recebido: number } {
  const unidades = linhasAlugadas.length
  if (unidades === 0) return { valor: null, unidades: 0, recebido: 0 }
  const recebido = roundMoney(linhasAlugadas.reduce((total, linha) => total + (linha.aluguel ?? 0), 0))
  return { valor: roundMoney(recebido / unidades), unidades, recebido }
}

export interface DespesaPagaItem {
  tipo?: string | null
  fornecedor?: string | null
  observacao?: string | null
  valor: number
}

export interface RecorteDespesaOperacional {
  agua: number | null
  iptu: number | null
  seguro: number | null
  total: number | null
}

// Recorte de agua, IPTU e seguro dentro das despesas PAGAS (documento 4).
//
// Antes este recorte vinha de `totals.total_agua/_iptu/_seguro_incendio`, que
// sao as COLUNAS DE RECEITA da prestacao — o que os inquilinos reembolsaram, nao
// o que saiu do caixa. Em GM II ago/2026 o painel exibia agua R$ 1.203,31
// (reembolso) enquanto a conta da Cagece paga foi R$ 1.827,90: os R$ 624,59 que
// o locador bancou nao apareciam em lugar nenhum. O seguro coincidia por acaso.
//
// Sem documento de despesas o recorte e DESCONHECIDO (null), nunca zero: zero
// afirmaria que nada foi pago.
export function recortarDespesaOperacional(
  despesas: DespesaPagaItem[] | null | undefined,
): RecorteDespesaOperacional {
  if (!despesas || despesas.length === 0) {
    return { agua: null, iptu: null, seguro: null, total: null }
  }
  const acumulado = { agua: 0, iptu: 0, seguro: 0 }
  for (const item of despesas) {
    const categoria =
      CATEGORIA_POR_TIPO[(item.tipo ?? "").toLowerCase()]
      ?? classificarDespesaFechamento(item.observacao || item.fornecedor || "")
    if (categoria === "agua_esgoto") acumulado.agua += item.valor
    else if (categoria === "iptu") acumulado.iptu += item.valor
    else if (categoria === "seguro") acumulado.seguro += item.valor
  }
  const agua = roundMoney(acumulado.agua)
  const iptu = roundMoney(acumulado.iptu)
  const seguro = roundMoney(acumulado.seguro)
  return { agua, iptu, seguro, total: roundMoney(agua + iptu + seguro) }
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

// Unidade citada dentro da descricao ("SEGURO APTO 12" -> "apto 12"). E a
// unica forma de a prestacao dizer de quem e a despesa: o documento de despesas
// pagas traz apenas o fornecedor e a apolice.
const UNIDADE_NA_DESCRICAO =
  /\b(apto|apartamento|sala|loja|galpao|casa|box|quiosque)\.?\s*(?:n[o°.]?\s*)?(\d{1,4}[a-z]?)\b/

export function unidadeDaDescricao(descricao: string | null | undefined): string | null {
  const match = normalizeText(descricao ?? "").match(UNIDADE_NA_DESCRICAO)
  if (!match) return null
  const tipo = match[1] === "apartamento" ? "apto" : match[1]
  return `${tipo} ${match[2]}`
}

// Une o documento de despesas pagas (que tem o valor e o fornecedor, mas nao o
// apto) ao resumo "OUTRAS COMISSOES E DESPESAS" da prestacao (que tem o apto,
// mas nao o fornecedor). A chave e o valor exato em centavos — o mesmo numero
// aparece nos dois lugares porque e a mesma despesa.
//
// Valor repetido em unidades diferentes fica DESCONHECIDO: dois seguros de
// R$ 139,00 nao permitem dizer qual e de qual apto, e chutar seria pior que
// omitir. Na carteira ate ago/2026 nenhum par colide.
function unidadePorValorDoResumo(resumoItens: PrestacaoResumoDespesa[]): Map<number, string | null> {
  const mapa = new Map<number, string | null>()
  for (const item of resumoItens) {
    const unidade = unidadeDaDescricao(item.descricao)
    if (!unidade) continue
    const chave = Math.round(roundMoney(item.valor) * 100)
    if (mapa.has(chave) && mapa.get(chave) !== unidade) mapa.set(chave, null)
    else mapa.set(chave, unidade)
  }
  return mapa
}

function resumoToItem(item: PrestacaoResumoDespesa): ItemDespesaFechamento {
  return {
    descricao: item.descricao,
    referencia: extrairReferencia(item.descricao),
    valor: roundMoney(item.valor),
    unidade: unidadeDaDescricao(item.descricao),
  }
}

function despesaToItem(item: Despesa): ItemDespesaFechamento {
  const descricao = item.observacao || item.fornecedor || "Despesa extraída"
  return {
    descricao,
    referencia: item.referencia || extrairReferencia(item.observacao || item.fornecedor || ""),
    valor: roundMoney(item.valor),
    categoria: CATEGORIA_POR_TIPO[item.tipo],
    // O documento de despesas nao tem campo de apto; quando a unidade aparece,
    // e dentro da observacao ou do endereco do imovel.
    unidade: unidadeDaDescricao(descricao) ?? unidadeDaDescricao(item.endereco),
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
  // O documento de despesas pagas ganha por ser a fonte do que saiu do caixa,
  // mas ele nao diz de qual unidade e cada despesa. Quem diz e o resumo da
  // prestacao ("SEGURO APTO 12 - R$ 141,04"), que ate aqui era descartado
  // inteiro — GM II ago/2026 exibia tres seguros identicos, todos "PORTO
  // SEGURO COMPANHIA DE SEGUROS GERAIS", sem como saber a quem pertenciam.
  const unidades = unidadePorValorDoResumo(resumoItens)
  const itens = totalDespesasDocumento > 0.01
    ? despesasItens.map((item) =>
        item.unidade
          ? item
          : { ...item, unidade: unidades.get(Math.round(item.valor * 100)) ?? null },
      )
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

  // Residual NEGATIVO: o documento discrimina mais do que a conciliacao alocou
  // a despesas. Isso acontece quando parte do que a nota descreve ja foi retido
  // por outro caminho — tipicamente a NFS-e da propria taxa de administracao,
  // que o extrato ja deduziu na linha do aluguel (Galpao Jose Walter ago/2026,
  // R$ 267,88 nos dois lugares). Sem nomear o abatimento, o card listava a
  // comissao como despesa do locador e exibia partes que nao somavam o total.
  if (residual < -0.01) {
    itens.push({
      descricao: "Já retido como comissão de administração",
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
