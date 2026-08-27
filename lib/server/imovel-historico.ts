import { createSupabaseAdmin } from "./supabase"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import { resolverRecebimentoLegado } from "@/lib/recebimentos-extraordinarios"
import type { PackageAnalysis, ReceitaPorImovel, AcordoRescisaoRecebido } from "@/lib/prestacao-types"
import type {
  EventoImovel,
  EventoTipo,
  ImovelHistorico,
  InquilinoPeriodo,
} from "@/lib/imovel-historico-types"

export interface ImovelHistoricoQuery {
  empreendimentoId: string
  unidade: string
}

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : 0
}

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : null
}

const relNome = (rel: unknown): string => {
  if (!rel) return ""
  const obj = Array.isArray(rel) ? rel[0] : rel
  return (obj as { nome?: string } | undefined)?.nome ?? ""
}

// Normaliza o codigo da unidade para comparacao: tira acentos, espacos e
// zeros a esquerda quando for numerica (apto "08" == "8").
function aptoKey(value: string | null | undefined): string {
  if (!value) return ""
  const base = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
  return /^\d+$/.test(base) ? String(Number(base)) : base
}

function isAirbnb(row: ReceitaPorImovel): boolean {
  const texto = `${row.observacao ?? ""} ${row.inquilino ?? ""}`.toLowerCase()
  return /air\s?bnb/.test(texto)
}

// Classifica a linha mensal da tabela de receitas em pago / inadimplente / vago.
function classificarReceita(row: ReceitaPorImovel): EventoTipo {
  if (isAirbnb(row)) return "pago"
  const obs = (row.observacao ?? "").toLowerCase()
  // Atencao: "VAGA DE GARAGEM" e vaga de estacionamento, NAO imovel vago.
  if (/desocupad|vazio|sem inquilino|\bvago\b/.test(obs)) return "vago"
  if (/inadimpl/.test(obs)) return "inadimplente"
  const total = num(row.total)
  const aluguel = num(row.aluguel)
  if (total <= 0 && aluguel <= 0) return "vago"
  return "pago"
}

export async function getImovelHistorico(query: ImovelHistoricoQuery): Promise<ImovelHistorico> {
  const supabase = createSupabaseAdmin()
  const alvo = aptoKey(query.unidade)

  const { data: fechRaw, error } = await supabase
    .from("fechamentos")
    .select("id, competencia, empreendimento_id, empreendimentos ( nome ), analise_completa")
    .eq("empreendimento_id", query.empreendimentoId)
    .eq("arquivado", false)
    .order("competencia", { ascending: true })

  if (error) throw error

  const fechamentos = (fechRaw ?? []) as Array<{
    competencia: string
    empreendimento_id: string
    empreendimentos: unknown
    analise_completa: PackageAnalysis | null
  }>

  const empreendimentoNome = fechamentos.length > 0 ? relNome(fechamentos[0].empreendimentos) : ""
  const eventos: EventoImovel[] = []

  for (const f of fechamentos) {
    const competenciaLabel = formatCompetenciaLong(f.competencia)
    const prestacao = f.analise_completa?.prestacao
    if (!prestacao) continue

    for (const row of prestacao.receitas_por_imovel ?? []) {
      if (aptoKey(row.apto) !== alvo) continue
      eventos.push({
        competencia: f.competencia,
        competenciaLabel,
        tipo: classificarReceita(row),
        inquilino: row.inquilino || null,
        aluguel: numOrNull(row.aluguel),
        total: numOrNull(row.total),
        comissao: numOrNull(row.comissao),
        repasse: numOrNull(row.repasse),
        vencimento: row.vencimento ?? null,
        observacao: row.observacao ?? null,
      })
    }

    for (const item of prestacao.acordos_rescisoes_recebidos ?? []) {
      if (aptoKey(item.apto) !== alvo) continue
      eventos.push(acordoParaEvento(item, f.competencia, competenciaLabel))
    }
  }

  // Ordena por competencia desc (mais recente primeiro); dentro do mes, receita antes de acordo.
  const ordemTipo: Record<EventoTipo, number> = {
    pago: 0,
    inadimplente: 0,
    vago: 0,
    atraso: 1,
    acordo: 2,
    rescisao: 2,
    intermediacao: 3,
  }
  eventos.sort(
    (a, b) => b.competencia.localeCompare(a.competencia) || ordemTipo[a.tipo] - ordemTipo[b.tipo],
  )

  const inquilinos = derivarInquilinos(eventos)
  const mensais = eventos.filter((e) => e.tipo === "pago" || e.tipo === "inadimplente" || e.tipo === "vago")
  const mesesObservados = new Set(mensais.map((e) => e.competencia)).size
  const eventoMaisRecente = mensais[0] ?? null

  const resumo = {
    mesesObservados,
    mesesPago: mensais.filter((e) => e.tipo === "pago").length,
    mesesInadimplente: mensais.filter((e) => e.tipo === "inadimplente").length,
    mesesVago: mensais.filter((e) => e.tipo === "vago").length,
    acordos: eventos.filter((e) => e.tipo === "acordo").length,
    rescisoes: eventos.filter((e) => e.tipo === "rescisao").length,
    atrasosQuitados: eventos.filter((e) => e.tipo === "atraso").length,
    intermediacoes: eventos.filter((e) => e.tipo === "intermediacao").length,
    totalRecebido:
      eventos
        .filter((e) => e.tipo === "pago" || e.tipo === "acordo" || e.tipo === "rescisao" || e.tipo === "atraso")
        .reduce((acc, e) => acc + num(e.total), 0),
    situacaoAtual: eventoMaisRecente ? eventoMaisRecente.tipo : null,
    inquilinoAtual: eventoMaisRecente ? eventoMaisRecente.inquilino : null,
  }

  return {
    empreendimentoId: query.empreendimentoId,
    empreendimentoNome,
    unidade: query.unidade,
    resumo,
    inquilinos,
    eventos,
  }
}

// CA27: o evento do histórico expõe os valores resolvidos pelo módulo
// canônico; item pendente mostra o bruto sem inventar comissão/repasse.
export function acordoParaEvento(
  item: AcordoRescisaoRecebido,
  competencia: string,
  competenciaLabel: string,
): EventoImovel {
  const resolucao = resolverRecebimentoLegado(item)
  const financeiro = resolucao.status === "resolvido" ? resolucao : null
  return {
    competencia,
    competenciaLabel,
    tipo: acordoTipoToEvento(item.tipo),
    inquilino: item.inquilino || null,
    aluguel: null,
    total: financeiro ? financeiro.totalRecebido : numOrNull(item.valor),
    comissao: financeiro ? financeiro.comissao : numOrNull(item.comissao),
    repasse: financeiro ? financeiro.repasse : null,
    vencimento: null,
    observacao: item.observacao ?? null,
  }
}

function acordoTipoToEvento(tipo: AcordoRescisaoRecebido["tipo"]): EventoTipo {
  switch (tipo) {
    case "rescisao":
      return "rescisao"
    case "intermediacao":
      return "intermediacao"
    case "atraso":
      return "atraso"
    default:
      return "acordo"
  }
}

// Agrupa periodos por inquilino a partir das competencias em que ele aparece.
function derivarInquilinos(eventos: EventoImovel[]): InquilinoPeriodo[] {
  const porInquilino = new Map<string, Set<string>>()
  for (const e of eventos) {
    const nome = (e.inquilino ?? "").trim()
    if (!nome) continue
    const set = porInquilino.get(nome) ?? new Set<string>()
    set.add(e.competencia)
    porInquilino.set(nome, set)
  }
  return Array.from(porInquilino.entries())
    .map(([inquilino, comps]) => {
      const ordenadas = Array.from(comps).sort()
      return {
        inquilino,
        primeiraCompetencia: ordenadas[0],
        ultimaCompetencia: ordenadas[ordenadas.length - 1],
        meses: ordenadas.length,
      }
    })
    .sort((a, b) => b.ultimaCompetencia.localeCompare(a.ultimaCompetencia))
}
