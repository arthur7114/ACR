import type { PackageAnalysis, PrestacaoAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import { createSupabaseAdmin } from "./supabase"

export type ImovelStatus = "ocupado" | "vago" | "inadimplente" | "em_rescisao" | "em_negociacao" | "inativo"

export interface ImovelVinculoCadastro {
  id: string
  codigo_imobiliaria: string
  unidade: string
  inquilino_nome: string | null
  status: ImovelStatus
  valor_aluguel_esperado: number | null
}

export interface ReceitaSemImovel {
  indice: number
  apto: string
  inquilino: string
  aluguel: number | null
  status_sugerido: ImovelStatus
}

export interface FechamentoVinculosImoveis {
  total_receitas: number
  total_vinculadas: number
  pendentes: ReceitaSemImovel[]
  imoveis: ImovelVinculoCadastro[]
}

export function sugerirStatusImovel(row: ReceitaPorImovel): ImovelStatus {
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  if (/inadimpl/.test(text)) return "inadimplente"
  if (/desocupad|sem inquilino|\bvago\b|vacancia/.test(text)) return "vago"
  if ((row.aluguel ?? 0) <= 0 && row.total <= 0 && !row.inquilino?.trim()) return "vago"
  return "ocupado"
}

export function construirVinculosImoveis(
  prestacao: PrestacaoAnalysis | null,
  imoveis: ImovelVinculoCadastro[],
): FechamentoVinculosImoveis {
  const porId = new Map(imoveis.map((imovel) => [imovel.id, imovel]))

  const rows = prestacao?.receitas_por_imovel ?? []
  const pendentes = rows.flatMap((row, indice) => {
    const apto = row.apto?.trim() ?? ""
    if (row.imovel_id && porId.has(row.imovel_id)) return []
    return [
      {
        indice,
        apto,
        inquilino: row.inquilino?.trim() ?? "",
        aluguel: typeof row.aluguel === "number" ? row.aluguel : null,
        status_sugerido: sugerirStatusImovel(row),
      },
    ]
  })

  return {
    total_receitas: rows.length,
    total_vinculadas: rows.length - pendentes.length,
    pendentes,
    imoveis,
  }
}

export function vincularReceitasExistentes(
  prestacao: PrestacaoAnalysis | null,
  imoveis: ImovelVinculoCadastro[],
): PrestacaoAnalysis | null {
  if (!prestacao) return null
  const validIds = new Set(imoveis.map((item) => item.id))
  return {
    ...prestacao,
    receitas_por_imovel: prestacao.receitas_por_imovel.map((row) => {
      if (row.imovel_id && validIds.has(row.imovel_id)) return row
      const candidates = findExactCandidates(row.apto, imoveis)
      return candidates.length === 1 ? { ...row, imovel_id: candidates[0].id } : row
    }),
  }
}

function findExactCandidates(apto: string, imoveis: ImovelVinculoCadastro[]) {
  const key = normalizeCodigoImovel(apto)
  if (!key) return []
  const candidates = imoveis.filter(
    (item) => normalizeCodigoImovel(item.codigo_imobiliaria) === key || normalizeCodigoImovel(item.unidade) === key,
  )
  return [...new Map(candidates.map((item) => [item.id, item])).values()]
}

export async function loadFechamentoVinculosImoveis(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  fechamento: {
    imobiliaria_id: string
    empreendimento_id: string
    analise_completa: PackageAnalysis | null
  },
): Promise<FechamentoVinculosImoveis> {
  const { data, error } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,inquilino_nome,status,valor_aluguel_esperado")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
    .order("unidade")

  if (error) throw error
  const imoveis = (data ?? []).map((item) => ({
    ...item,
    status: item.status as ImovelStatus,
    valor_aluguel_esperado:
      item.valor_aluguel_esperado === null ? null : Number(item.valor_aluguel_esperado),
  })) as ImovelVinculoCadastro[]

  return construirVinculosImoveis(fechamento.analise_completa?.prestacao ?? null, imoveis)
}

export async function attachExistingImovelLinks<T extends { prestacao?: PrestacaoAnalysis | null }>(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  ids: { imobiliariaId: string; empreendimentoId: string },
  analysis: T,
): Promise<T> {
  const { data, error } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,inquilino_nome,status,valor_aluguel_esperado")
    .eq("imobiliaria_id", ids.imobiliariaId)
    .eq("empreendimento_id", ids.empreendimentoId)
    .eq("ativo", true)
  if (error) throw error
  const imoveis = (data ?? []) as ImovelVinculoCadastro[]
  return { ...analysis, prestacao: vincularReceitasExistentes(analysis.prestacao ?? null, imoveis) }
}
