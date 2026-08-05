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
  esperado: Record<IndicatorKey, number>
}

export interface ComparisonRow {
  indicador: IndicatorKey
  esperado: number
  obtido: number
  diff: number
  ok: boolean
}

/**
 * Compara os valores esperados (gabarito) com os obtidos (consulta ao
 * banco), aplicando tolerância de R$ 0,02 para campos monetários e
 * igualdade exata para as contagens de unidades.
 */
export function compararIndicadores(
  esperado: Record<IndicatorKey, number>,
  obtido: Record<IndicatorKey, number>,
): ComparisonRow[] {
  return INDICATOR_ORDER.map((indicador) => {
    const valorEsperado = esperado[indicador]
    const valorObtido = obtido[indicador]
    const diff = roundMoney(valorObtido - valorEsperado)
    const ok = UNIT_INDICATORS.has(indicador)
      ? valorObtido === valorEsperado
      : Math.abs(diff) <= MONEY_TOLERANCE
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
    linha.ok ? "OK" : "FALHA",
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
}

function validarEsperado(valor: unknown): Record<IndicatorKey, number> {
  if (!valor || typeof valor !== "object") {
    throw new Error("Gabarito sem campo \"esperado\".")
  }
  const bruto = valor as Record<string, unknown>
  const resultado = {} as Record<IndicatorKey, number>
  for (const chave of INDICATOR_ORDER) {
    const numero = bruto[chave]
    if (typeof numero !== "number" || !Number.isFinite(numero)) {
      throw new Error(`Gabarito não define um número válido para "${chave}".`)
    }
    resultado[chave] = numero
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
  competencia_origem: string
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
): Promise<string[]> {
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
  return nomes.map((nome) => idPorNome.get(nome) as string)
}

async function loadImoveisDoEscopo(
  supabase: SupabaseAdmin,
  empreendimentoIds: string[],
): Promise<ImovelRow[]> {
  const rows: ImovelRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("imoveis")
      .select("id,tipo,inquilino_nome,ativo,empreendimento_id")
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

// `recuperacaoAtrasados`: recebido na competência com
// `competencia_origem < competencia`.
export function filtrarRecuperacaoAtrasados(
  lancamentos: LancamentoRow[],
  competencia: string,
): LancamentoRow[] {
  return lancamentos.filter(
    (lancamento) =>
      lancamento.rubrica === "aluguel" &&
      lancamento.situacao === "recebido" &&
      lancamento.competencia_recebimento === competencia &&
      lancamento.competencia_origem < competencia,
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
): Promise<Record<IndicatorKey, number>> {
  const competencia = gabarito.competencia
  const empreendimentoIds = await resolveEmpreendimentoIds(supabase, gabarito.escopoEmpreendimentos)
  const imoveis = await loadImoveisDoEscopo(supabase, empreendimentoIds)
  const imovelIds = imoveis.map((imovel) => imovel.id)

  const contratos = imovelIds.length > 0 ? await loadContratosDoEscopo(supabase, imovelIds) : []
  const contratoIds = contratos.map((contrato) => contrato.id)
  const valores = contratoIds.length > 0 ? await loadValoresDoEscopo(supabase, contratoIds) : []
  const lancamentos = imovelIds.length > 0 ? await loadLancamentosDoEscopo(supabase, imovelIds) : []
  const fechamentos = await loadFechamentosDoEscopo(supabase, empreendimentoIds, competencia)

  const inadimplencia = filtrarInadimplencia(lancamentos, competencia)

  return {
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

  const obtido = await calcularObtido(supabase, gabarito)
  const linhas = compararIndicadores(gabarito.esperado, obtido)

  console.log(`Competência: ${gabarito.competencia}`)
  console.log(`Escopo: ${gabarito.escopoEmpreendimentos.join(", ")}`)
  console.log("")
  imprimirTabela(linhas)

  const falhas = linhas.filter((linha) => !linha.ok)
  if (falhas.length > 0) {
    console.log(`\n${falhas.length} de ${linhas.length} indicador(es) fora da tolerância.`)
    process.exitCode = 1
  } else {
    console.log(`\nTodos os ${linhas.length} indicadores dentro da tolerância.`)
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
