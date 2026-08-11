import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { isImovelAirbnb, roundMoney } from "../lib/indicadores-domain"

// Verificador de competência contra gabarito local (Task 1.4).
//
// Consulta `contratos_locacao`, `contrato_valores` e `lancamentos_competencia`
// (Task 1.1/1.3) para o escopo de empreendimentos e a competência do
// gabarito, agrega os 7 indicadores descritos no caderno de decisões e
// compara com os valores esperados, com tolerância de R$ 0,02 para campos
// monetários e igualdade exata para as contagens de unidades.
//
// Uso: node --import tsx scripts/verify-competencia.ts tmp/gabaritos/2026-06.json
//
// O gabarito é um arquivo local (dados reais, nunca commitado — ver
// `tmp/` no `.gitignore`); este script é genérico e não contém valores
// reais.

const PAGE_SIZE = 1_000
const MONEY_TOLERANCE = 0.02

const INDICATOR_ORDER = [
  "caixaDoMes",
  "aluguelContratado",
  "aluguelRecebidoCompetencia",
  "inadimplenciaMes",
  "unidadesInadimplentes",
  "unidadesVagas",
  "recuperacaoAtrasados",
  "repasse",
] as const

type IndicatorKey = (typeof INDICATOR_ORDER)[number]

const UNIT_INDICATORS = new Set<IndicatorKey>(["unidadesInadimplentes", "unidadesVagas"])

export interface Gabarito {
  competencia: string
  escopoEmpreendimentos: string[]
  /** Só os indicadores que a planilha realmente traz; os demais ficam de fora. */
  esperado: Partial<Record<IndicatorKey, number>>
  /**
   * Folga por indicador, quando o default de R$ 0,02 não cabe. Uso legítimo:
   * agregado somado sobre muitas linhas comparado contra subtotais também
   * arredondados na fonte — o resíduo de arredondamento cresce com a contagem de
   * linhas e não indica erro de dado. Cada folga aqui deve vir com nota
   * justificando o valor; não é lugar para afrouxar divergência real.
   */
  tolerancias?: Partial<Record<IndicatorKey, number>>
}

export interface ComparisonRow {
  indicador: IndicatorKey
  esperado: number
  obtido: number
  diff: number
  ok: boolean
  /** A planilha não traz este número; não há divergência a declarar. */
  naoVerificavel?: boolean
}

export interface SnapshotQualidadeRow {
  imovel_id: string
  qualidade: "completo" | "parcial" | "sem_linha"
}

// Guarda de completude: indicador calculado sobre competência cuja prestação não
// foi lida por inteiro parece completo e não é. `qualidade = 'sem_linha'` marca o
// imóvel esperado que ficou sem nenhuma linha, e esse sinal já existia sem ser
// consultado na verificação.
//
// Airbnb sai da conta porque `sem_linha` ali é o comportamento correto: é
// operado por fora e não vem na prestação (D2). Imóvel inativo também sai. Medido
// nas planilhas de 2026, o resto se concentra em janeiro a março; abril a junho
// já vêm completos.
export function listarUnidadesSemLinha(
  imoveis: ImovelRow[],
  snapshots: SnapshotQualidadeRow[],
): string[] {
  const elegiveis = new Set(
    imoveis
      .filter((imovel) => imovel.ativo && !isImovelAirbnb(imovel.tipo, imovel.inquilino_nome))
      .map((imovel) => imovel.id),
  )
  return snapshots
    .filter((snapshot) => snapshot.qualidade === "sem_linha" && elegiveis.has(snapshot.imovel_id))
    .map((snapshot) => snapshot.imovel_id)
}

// Compara esperado (gabarito) com obtido (banco), com tolerância de R$ 0,02 em
// campo monetário e igualdade exata em contagem de unidades.
//
// A planilha do cliente é a fonte da verdade. Quando ela não contém um número,
// o gabarito não deve inventar um: o indicador é reportado como não verificável
// em vez de acusar divergência contra uma expectativa fabricada. Foi assim que
// `aluguelContratado` passou meses "falhando" contra um valor que ninguém mediu
// — ele havia sido derivado de outro indicador do próprio gabarito.
export function compararIndicadores(
  esperado: Partial<Record<IndicatorKey, number>>,
  obtido: Record<IndicatorKey, number>,
  tolerancias: Partial<Record<IndicatorKey, number>> = {},
): ComparisonRow[] {
  return INDICATOR_ORDER.map((indicador) => {
    const valorEsperado = esperado[indicador]
    const valorObtido = obtido[indicador]
    if (valorEsperado === undefined || valorEsperado === null) {
      return { indicador, esperado: valorObtido, obtido: valorObtido, diff: 0, ok: true, naoVerificavel: true }
    }
    const diff = roundMoney(valorObtido - valorEsperado)
    // Contagem de unidades é exata; folga só faz sentido para valor monetário.
    const tolerancia = UNIT_INDICATORS.has(indicador)
      ? 0
      : tolerancias[indicador] ?? MONEY_TOLERANCE
    const ok = UNIT_INDICATORS.has(indicador)
      ? valorObtido === valorEsperado
      : Math.abs(diff) <= tolerancia
    return { indicador, esperado: valorEsperado, obtido: valorObtido, diff, ok }
  })
}

function formatarValor(indicador: IndicatorKey, valor: number): string {
  return UNIT_INDICATORS.has(indicador) ? String(valor) : valor.toFixed(2)
}

function imprimirTabela(linhas: ComparisonRow[]) {
  const colunas = ["indicador", "esperado", "obtido", "diff", "status"]
  const celulas = linhas.map((linha) => [
    linha.indicador,
    formatarValor(linha.indicador, linha.esperado),
    formatarValor(linha.indicador, linha.obtido),
    formatarValor(linha.indicador, linha.diff),
    linha.naoVerificavel ? "SEM FONTE" : linha.ok ? "OK" : "FALHA",
  ])
  const larguras = colunas.map((titulo, indice) =>
    Math.max(titulo.length, ...celulas.map((linha) => linha[indice].length)),
  )
  const formatarLinha = (valores: string[]) =>
    valores.map((valor, indice) => valor.padEnd(larguras[indice])).join(" | ")

  console.log(formatarLinha(colunas))
  console.log(larguras.map((largura) => "-".repeat(largura)).join("-|-"))
  for (const linha of celulas) console.log(formatarLinha(linha))
}

// --- Leitura e validação do gabarito ---------------------------------------

interface GabaritoBruto {
  competencia?: unknown
  escopoEmpreendimentos?: unknown
  esperado?: unknown
  tolerancias?: unknown
}

// Indicador ausente é legítimo: significa que a planilha não traz aquele número.
// Presente mas não numérico continua sendo erro de gabarito. Pelo menos um
// indicador tem de existir, senão não há o que verificar.
function validarEsperado(valor: unknown): Partial<Record<IndicatorKey, number>> {
  if (!valor || typeof valor !== "object") {
    throw new Error("Gabarito sem campo \"esperado\".")
  }
  const bruto = valor as Record<string, unknown>
  const resultado: Partial<Record<IndicatorKey, number>> = {}
  for (const chave of INDICATOR_ORDER) {
    if (!(chave in bruto) || bruto[chave] === null) continue
    const numero = bruto[chave]
    if (typeof numero !== "number" || !Number.isFinite(numero)) {
      throw new Error(`Gabarito define "${chave}" com valor não numérico: ${JSON.stringify(numero)}.`)
    }
    resultado[chave] = numero
  }
  if (Object.keys(resultado).length === 0) {
    throw new Error("Gabarito não define nenhum indicador em \"esperado\".")
  }
  return resultado
}

// Tolerancia por indicador e opcional. Quando presente, cada valor tem de ser
// numero finito positivo (folga negativa nao faz sentido). Chave fora de
// INDICATOR_ORDER e erro de gabarito, nao ignorada em silencio.
function validarTolerancias(valor: unknown): Partial<Record<IndicatorKey, number>> {
  if (valor === undefined || valor === null) return {}
  if (typeof valor !== "object") {
    throw new Error("Gabarito com \"tolerancias\" que nao e objeto.")
  }
  const bruto = valor as Record<string, unknown>
  const resultado: Partial<Record<IndicatorKey, number>> = {}
  for (const chave of Object.keys(bruto)) {
    if (!(INDICATOR_ORDER as readonly string[]).includes(chave)) {
      throw new Error(`Gabarito com tolerancia para indicador desconhecido: "${chave}".`)
    }
    const numero = bruto[chave]
    if (typeof numero !== "number" || !Number.isFinite(numero) || numero < 0) {
      throw new Error(`Gabarito com tolerancia invalida para "${chave}": ${JSON.stringify(numero)}.`)
    }
    resultado[chave as IndicatorKey] = numero
  }
  return resultado
}

export function lerGabarito(caminho: string): Gabarito {
  const conteudo = readFileSync(caminho, "utf8")
  const bruto = JSON.parse(conteudo) as GabaritoBruto
  if (typeof bruto.competencia !== "string" || !/^\d{4}-\d{2}-01$/.test(bruto.competencia)) {
    throw new Error(`Gabarito com "competencia" inválida: ${JSON.stringify(bruto.competencia)}.`)
  }
  if (
    !Array.isArray(bruto.escopoEmpreendimentos) ||
    bruto.escopoEmpreendimentos.length === 0 ||
    !bruto.escopoEmpreendimentos.every((nome) => typeof nome === "string")
  ) {
    throw new Error("Gabarito sem \"escopoEmpreendimentos\" (lista de nomes não vazia).")
  }
  return {
    competencia: bruto.competencia,
    escopoEmpreendimentos: bruto.escopoEmpreendimentos as string[],
    esperado: validarEsperado(bruto.esperado),
    tolerancias: validarTolerancias(bruto.tolerancias),
  }
}

// --- Acesso ao banco (Supabase) --------------------------------------------

type SupabaseAdmin = ReturnType<typeof import("../lib/server/supabase")["createSupabaseAdmin"]>

interface EmpreendimentoRow {
  id: string
  nome: string
}

export interface ImovelRow {
  id: string
  unidade?: string | null
  tipo: string | null
  inquilino_nome: string | null
  ativo: boolean
  empreendimento_id: string
}

export interface ContratoRow {
  id: string
  imovel_id: string
  inicio: string
  fim: string | null
  ativo: boolean
}

export interface ValorRow {
  contrato_id: string
  vigencia_inicio: string
  valor: number | string
}

export interface LancamentoRow {
  imovel_id: string
  rubrica: string
  valor: number | string
  situacao: "recebido" | "em_aberto"
  /** Nulo = competência anterior, mês não informado. */
  competencia_origem: string | null
  competencia_recebimento: string | null
}

interface FechamentoRow {
  empreendimento_id: string
  competencia: string
  arquivado: boolean
  status: string
  analise_completa: unknown
}

// Mesmo critério de elegibilidade de lib/indicadores-aggregation.ts (não exportado
// de lá) — só fechamentos nesses status têm analise_completa confiável o bastante
// para compor o indicador de repasse.
const ELIGIBLE_STATUSES = new Set([
  "pendente_revisao",
  "processado_com_sucesso",
  "processado_com_alertas",
  "aprovado",
  "preparado_egestor",
  "lancado_egestor",
  "erro_egestor",
])

async function resolveEmpreendimentoIds(
  supabase: SupabaseAdmin,
  nomes: string[],
): Promise<{ ids: string[]; nomePorId: Map<string, string> }> {
  const { data, error } = await supabase.from("empreendimentos").select("id,nome").in("nome", nomes)
  if (error) throw error
  const rows = (data ?? []) as unknown as EmpreendimentoRow[]
  const idPorNome = new Map(rows.map((row) => [row.nome, row.id]))
  const faltantes = nomes.filter((nome) => !idPorNome.has(nome))
  if (faltantes.length > 0) {
    throw new Error(
      `Empreendimento(s) de "escopoEmpreendimentos" não encontrado(s) em \`empreendimentos.nome\`: ${faltantes.join(", ")}.`,
    )
  }
  return {
    ids: nomes.map((nome) => idPorNome.get(nome) as string),
    nomePorId: new Map(rows.map((row) => [row.id, row.nome])),
  }
}

async function loadImoveisDoEscopo(
  supabase: SupabaseAdmin,
  empreendimentoIds: string[],
): Promise<ImovelRow[]> {
  const rows: ImovelRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("imoveis")
      .select("id,tipo,inquilino_nome,ativo,empreendimento_id,unidade")
      .in("empreendimento_id", empreendimentoIds)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as ImovelRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadContratosDoEscopo(
  supabase: SupabaseAdmin,
  imovelIds: string[],
): Promise<ContratoRow[]> {
  const rows: ContratoRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("contratos_locacao")
      .select("id,imovel_id,inicio,fim,ativo")
      .in("imovel_id", imovelIds)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as ContratoRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadValoresDoEscopo(
  supabase: SupabaseAdmin,
  contratoIds: string[],
): Promise<ValorRow[]> {
  const rows: ValorRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("contrato_valores")
      .select("contrato_id,vigencia_inicio,valor")
      .in("contrato_id", contratoIds)
      .order("contrato_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as ValorRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadLancamentosDoEscopo(
  supabase: SupabaseAdmin,
  imovelIds: string[],
): Promise<LancamentoRow[]> {
  const rows: LancamentoRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("lancamentos_competencia")
      .select("imovel_id,rubrica,valor,situacao,competencia_origem,competencia_recebimento")
      .in("imovel_id", imovelIds)
      .order("imovel_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as LancamentoRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadSnapshotsQualidade(
  supabase: SupabaseAdmin,
  imovelIds: string[],
  competencia: string,
): Promise<SnapshotQualidadeRow[]> {
  const rows: SnapshotQualidadeRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("imovel_competencias")
      .select("imovel_id,qualidade")
      .in("imovel_id", imovelIds)
      .eq("competencia", competencia)
      .order("imovel_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as SnapshotQualidadeRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadFechamentosDoEscopo(
  supabase: SupabaseAdmin,
  empreendimentoIds: string[],
  competencia: string,
): Promise<FechamentoRow[]> {
  const rows: FechamentoRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("fechamentos")
      .select("empreendimento_id,competencia,arquivado,status,analise_completa")
      .in("empreendimento_id", empreendimentoIds)
      .eq("competencia", competencia)
      .eq("arquivado", false)
      .in("status", [...ELIGIBLE_STATUSES])
      .order("empreendimento_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as FechamentoRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

// --- Derivação dos indicadores ---------------------------------------------

function toNumber(valor: number | string): number {
  const parsed = typeof valor === "number" ? valor : Number(valor)
  if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido: ${valor}.`)
  return parsed
}

function somaValor(lancamentos: LancamentoRow[]): number {
  return lancamentos.reduce((total, lancamento) => total + toNumber(lancamento.valor), 0)
}

// Um contrato está ativo na competência quando a linha não foi desativada
// (`ativo`), `inicio <= competencia` e, se houver fim, `fim >= competencia`
// (fim é inclusivo, ver `202608050001_contratos_locacao.sql` / idioma de
// `scripts/backfill-contratos.ts`).
export function contratoAtivoNaCompetencia(contrato: ContratoRow, competencia: string): boolean {
  return (
    contrato.ativo &&
    contrato.inicio <= competencia &&
    (contrato.fim === null || contrato.fim >= competencia)
  )
}

// Valor vigente do contrato na competência: a última vigência com
// `vigencia_inicio <= competencia`.
export function valorVigenteDoContrato(
  valores: ValorRow[],
  contratoId: string,
  competencia: string,
): number | null {
  const conhecidos = valores.filter(
    (valor) => valor.contrato_id === contratoId && valor.vigencia_inicio <= competencia,
  )
  if (conhecidos.length === 0) return null
  const maisRecente = conhecidos.reduce((atual, valor) =>
    valor.vigencia_inicio > atual.vigencia_inicio ? valor : atual,
  )
  return toNumber(maisRecente.valor)
}

// `aluguelContratado`: soma do valor vigente na competência por contrato
// ativo na competência.
export function calcularAluguelContratado(
  imoveis: ImovelRow[],
  contratos: ContratoRow[],
  valores: ValorRow[],
  competencia: string,
): number {
  const imovelPorId = new Map(imoveis.map((imovel) => [imovel.id, imovel]))
  const ativos = contratos.filter((contrato) => {
    if (!contratoAtivoNaCompetencia(contrato, competencia)) return false
    const imovel = imovelPorId.get(contrato.imovel_id)
    return Boolean(imovel?.ativo) && !isImovelAirbnb(imovel?.tipo ?? null, imovel?.inquilino_nome ?? null)
  })
  const total = ativos.reduce((soma, contrato) => {
    const valor = valorVigenteDoContrato(valores, contrato.id, competencia)
    if (valor === null) {
      console.warn(
        `Aviso: contrato ${contrato.id} (imóvel ${contrato.imovel_id}) está ativo em ${competencia} mas não tem valor conhecido em contrato_valores — contribuindo R$ 0,00.`,
      )
    }
    return soma + (valor ?? 0)
  }, 0)
  return roundMoney(total)
}

// `unidadesVagas`: imóveis ativos, não-Airbnb, do escopo, sem contrato
// ativo na competência.
export function calcularUnidadesVagas(
  imoveis: ImovelRow[],
  contratos: ContratoRow[],
  competencia: string,
): number {
  const imoveisComContratoAtivo = new Set(
    contratos
      .filter((contrato) => contratoAtivoNaCompetencia(contrato, competencia))
      .map((contrato) => contrato.imovel_id),
  )
  return imoveis.filter(
    (imovel) =>
      imovel.ativo &&
      !isImovelAirbnb(imovel.tipo, imovel.inquilino_nome) &&
      !imoveisComContratoAtivo.has(imovel.id),
  ).length
}

// `inadimplenciaMes` / `unidadesInadimplentes`: lançamentos `rubrica='aluguel'`,
// `situacao='em_aberto'`, `competencia_origem = competencia`.
export function filtrarInadimplencia(lancamentos: LancamentoRow[], competencia: string): LancamentoRow[] {
  return lancamentos.filter(
    (lancamento) =>
      lancamento.rubrica === "aluguel" &&
      lancamento.situacao === "em_aberto" &&
      lancamento.competencia_origem === competencia,
  )
}

// `aluguelRecebidoCompetencia`: `rubrica='aluguel'`, `situacao='recebido'`,
// `competencia_origem = competencia_recebimento = competencia`.
export function filtrarAluguelRecebidoCompetencia(
  lancamentos: LancamentoRow[],
  competencia: string,
): LancamentoRow[] {
  return lancamentos.filter(
    (lancamento) =>
      lancamento.rubrica === "aluguel" &&
      lancamento.situacao === "recebido" &&
      lancamento.competencia_origem === competencia &&
      lancamento.competencia_recebimento === competencia,
  )
}

// `recuperacaoAtrasados`: aluguel recebido na competência que NÃO pertence a
// ela — origem anterior conhecida, ou origem nula (atraso vindo de acordo, que
// não informa o mês). Junto com `filtrarAluguelRecebidoCompetencia`, que exige
// origem igual, a partição do aluguel recebido no mês fica exaustiva.
export function filtrarRecuperacaoAtrasados(
  lancamentos: LancamentoRow[],
  competencia: string,
): LancamentoRow[] {
  return lancamentos.filter(
    (lancamento) =>
      lancamento.rubrica === "aluguel" &&
      lancamento.situacao === "recebido" &&
      lancamento.competencia_recebimento === competencia &&
      (lancamento.competencia_origem === null || lancamento.competencia_origem < competencia),
  )
}

// `caixaDoMes`: todo lançamento recebido com
// `competencia_recebimento = competencia` (qualquer rubrica).
export function filtrarCaixaDoMes(lancamentos: LancamentoRow[], competencia: string): LancamentoRow[] {
  return lancamentos.filter(
    (lancamento) =>
      lancamento.situacao === "recebido" && lancamento.competencia_recebimento === competencia,
  )
}

// `repasse`: ainda vem de `fechamentos.analise_completa` (a migração do
// repasse para lançamentos é Fase 2). Mesmo acesso de
// `lib/indicadores-aggregation.ts` (`summarizeTransferEvidence`): soma
// `totals.valor_comprovado` dos fechamentos com comprovante bancário
// externo (`repasse_embutido` falso e `valor_comprovado` não nulo).
function repasseComprovadoDoFechamento(analiseCompleta: unknown): number | null {
  if (!analiseCompleta || typeof analiseCompleta !== "object") return null
  const totalsBruto = (analiseCompleta as { totals?: unknown }).totals
  if (!totalsBruto || typeof totalsBruto !== "object") return null
  const totals = totalsBruto as { valor_comprovado?: unknown; repasse_embutido?: unknown }
  if (totals.repasse_embutido) return null
  if (totals.valor_comprovado === null || totals.valor_comprovado === undefined) return null
  if (typeof totals.valor_comprovado !== "number" && typeof totals.valor_comprovado !== "string") {
    return null
  }
  return toNumber(totals.valor_comprovado)
}

function calcularRepasse(fechamentos: FechamentoRow[]): number {
  const total = fechamentos.reduce(
    (soma, fechamento) => soma + (repasseComprovadoDoFechamento(fechamento.analise_completa) ?? 0),
    0,
  )
  return roundMoney(total)
}

async function calcularObtido(
  supabase: SupabaseAdmin,
  gabarito: Gabarito,
): Promise<{ indicadores: Record<IndicatorKey, number>; semLinha: Array<{ empreendimento: string; unidade: string }> }> {
  const competencia = gabarito.competencia
  const { ids: empreendimentoIds, nomePorId: nomePorEmpreendimento } =
    await resolveEmpreendimentoIds(supabase, gabarito.escopoEmpreendimentos)
  const imoveis = await loadImoveisDoEscopo(supabase, empreendimentoIds)
  const imovelIds = imoveis.map((imovel) => imovel.id)

  const contratos = imovelIds.length > 0 ? await loadContratosDoEscopo(supabase, imovelIds) : []
  const contratoIds = contratos.map((contrato) => contrato.id)
  const valores = contratoIds.length > 0 ? await loadValoresDoEscopo(supabase, contratoIds) : []
  const lancamentos = imovelIds.length > 0 ? await loadLancamentosDoEscopo(supabase, imovelIds) : []
  const fechamentos = await loadFechamentosDoEscopo(supabase, empreendimentoIds, competencia)
  const snapshots = imovelIds.length > 0
    ? await loadSnapshotsQualidade(supabase, imovelIds, competencia)
    : []

  const idsSemLinha = new Set(listarUnidadesSemLinha(imoveis, snapshots))
  const semLinha = imoveis
    .filter((imovel) => idsSemLinha.has(imovel.id))
    .map((imovel) => ({
      empreendimento: nomePorEmpreendimento.get(imovel.empreendimento_id) ?? imovel.empreendimento_id,
      unidade: imovel.unidade ?? imovel.id,
    }))
    .sort((a, b) =>
      a.empreendimento.localeCompare(b.empreendimento, "pt-BR")
      || a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }),
    )

  const inadimplencia = filtrarInadimplencia(lancamentos, competencia)

  const indicadores = {
    caixaDoMes: roundMoney(somaValor(filtrarCaixaDoMes(lancamentos, competencia))),
    aluguelContratado: calcularAluguelContratado(imoveis, contratos, valores, competencia),
    aluguelRecebidoCompetencia: roundMoney(
      somaValor(filtrarAluguelRecebidoCompetencia(lancamentos, competencia)),
    ),
    inadimplenciaMes: roundMoney(somaValor(inadimplencia)),
    unidadesInadimplentes: new Set(inadimplencia.map((lancamento) => lancamento.imovel_id)).size,
    unidadesVagas: calcularUnidadesVagas(imoveis, contratos, competencia),
    recuperacaoAtrasados: roundMoney(
      somaValor(filtrarRecuperacaoAtrasados(lancamentos, competencia)),
    ),
    repasse: calcularRepasse(fechamentos),
  }

  return { indicadores, semLinha }
}

// --- Execução ----------------------------------------------------------------

function loadEnvLocal() {
  const filePath = join(process.cwd(), ".env.local")
  if (!existsSync(filePath)) return
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  const gabaritoPath = process.argv[2]
  if (!gabaritoPath) {
    throw new Error(
      "Uso: node --import tsx scripts/verify-competencia.ts <caminho-do-gabarito.json>",
    )
  }
  loadEnvLocal()
  const gabarito = lerGabarito(gabaritoPath)
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()

  const { indicadores: obtido, semLinha } = await calcularObtido(supabase, gabarito)
  const linhas = compararIndicadores(gabarito.esperado, obtido, gabarito.tolerancias)

  console.log(`Competência: ${gabarito.competencia}`)
  console.log(`Escopo: ${gabarito.escopoEmpreendimentos.join(", ")}`)
  console.log("")

  // Guarda de completude antes da tabela: número calculado sobre prestação lida
  // só em parte parece completo e não é. Avisa e segue verificando — o objetivo é
  // dizer o quanto confiar em cada linha, não esconder a tabela.
  if (semLinha.length > 0) {
    const porEmpreendimento = new Map<string, string[]>()
    for (const item of semLinha) {
      porEmpreendimento.set(item.empreendimento, [
        ...(porEmpreendimento.get(item.empreendimento) ?? []),
        item.unidade,
      ])
    }
    console.log(
      `ATENÇÃO: ${semLinha.length} imóvel(is) do escopo sem nenhuma linha na prestação desta competência.`,
    )
    console.log("Os indicadores por imóvel abaixo estão calculados sobre leitura incompleta:")
    for (const [empreendimento, unidades] of [...porEmpreendimento].sort()) {
      console.log(`  ${empreendimento}: ${unidades.join(", ")}`)
    }
    console.log("(Airbnb não entra nesta conta: não vem na prestação, por decisão de negócio.)")
    console.log("")
  }

  imprimirTabela(linhas)

  const semFonte = linhas.filter((linha) => linha.naoVerificavel)
  const verificados = linhas.filter((linha) => !linha.naoVerificavel)
  const falhas = verificados.filter((linha) => !linha.ok)

  if (semFonte.length > 0) {
    console.log(
      `\n${semFonte.length} indicador(es) sem número na planilha, não verificados: ` +
        semFonte.map((linha) => linha.indicador).join(", "),
    )
  }
  if (falhas.length > 0) {
    console.log(`${falhas.length} de ${verificados.length} indicador(es) verificados fora da tolerância.`)
    process.exitCode = 1
  } else {
    console.log(`Todos os ${verificados.length} indicadores verificáveis estão dentro da tolerância.`)
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
