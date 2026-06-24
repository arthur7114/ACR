import { createSupabaseAdmin } from "./supabase"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"

export interface SyncImoveisQuery {
  empreendimentoId?: string | null
}

export interface SyncImoveisResult {
  criados: number
  atualizados: number
  totalUnidades: number
}

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : 0
}

function isAirbnb(row: ReceitaPorImovel): boolean {
  const texto = `${row.observacao ?? ""} ${row.inquilino ?? ""}`.toLowerCase()
  return /air\s?bnb/.test(texto)
}

// Deriva o status do imovel a partir da linha mais recente da prestacao.
function statusDaLinha(row: ReceitaPorImovel): string {
  if (isAirbnb(row)) return "ocupado"
  const obs = (row.observacao ?? "").toLowerCase()
  // Atencao: "VAGA DE GARAGEM" e vaga de estacionamento, NAO imovel vago.
  if (/desocupad|vazio|sem inquilino|\bvago\b/.test(obs)) return "vago"
  if (/inadimpl/.test(obs)) return "inadimplente"
  if (num(row.total) <= 0 && num(row.aluguel) <= 0) return "vago"
  return "ocupado"
}

interface AcumuladoUnidade {
  imobiliariaId: string
  empreendimentoId: string
  unidade: string
  competencia: string
  inquilino: string | null
  aluguel: number | null
  status: string
  emRescisao: boolean
}

// Popula/atualiza o cadastro de imoveis a partir das prestacoes ja processadas.
// Para cada (imobiliaria, empreendimento, unidade) usa a competencia MAIS RECENTE
// como verdade do estado atual (inquilino, status, aluguel esperado).
export async function syncImoveisFromFechamentos(query: SyncImoveisQuery = {}): Promise<SyncImoveisResult> {
  const supabase = createSupabaseAdmin()

  let fechQuery = supabase
    .from("fechamentos")
    .select("competencia, imobiliaria_id, empreendimento_id, analise_completa")
    .eq("arquivado", false)
    .order("competencia", { ascending: true })
  if (query.empreendimentoId) fechQuery = fechQuery.eq("empreendimento_id", query.empreendimentoId)

  const { data: fechRaw, error } = await fechQuery
  if (error) throw error

  const fechamentos = (fechRaw ?? []) as Array<{
    competencia: string
    imobiliaria_id: string
    empreendimento_id: string
    analise_completa: PackageAnalysis | null
  }>

  // Acumula por chave; competencia crescente => a ultima escrita vence (estado atual).
  const porUnidade = new Map<string, AcumuladoUnidade>()
  for (const f of fechamentos) {
    const prestacao = f.analise_completa?.prestacao
    if (!prestacao) continue
    const rescindidasNoMes = new Set(
      (prestacao.acordos_rescisoes_recebidos ?? [])
        .filter((a) => a.tipo === "rescisao")
        .map((a) => (a.apto ?? "").trim())
        .filter(Boolean),
    )
    for (const row of prestacao.receitas_por_imovel ?? []) {
      const unidade = (row.apto ?? "").trim()
      if (!unidade) continue
      const key = `${f.imobiliaria_id}|${f.empreendimento_id}|${unidade}`
      porUnidade.set(key, {
        imobiliariaId: f.imobiliaria_id,
        empreendimentoId: f.empreendimento_id,
        unidade,
        competencia: f.competencia,
        inquilino: row.inquilino?.trim() || null,
        aluguel: typeof row.aluguel === "number" ? row.aluguel : null,
        status: statusDaLinha(row),
        emRescisao: rescindidasNoMes.has(unidade),
      })
    }
  }

  if (porUnidade.size === 0) return { criados: 0, atualizados: 0, totalUnidades: 0 }

  // Cadastro existente para decidir criar x atualizar (sem sobrescrever edicoes manuais
  // de taxa/observacoes: so mexemos em inquilino, status e aluguel esperado).
  const empIds = Array.from(new Set(Array.from(porUnidade.values()).map((u) => u.empreendimentoId)))
  const { data: existentesRaw } = await supabase
    .from("imoveis")
    .select("id, imobiliaria_id, empreendimento_id, unidade")
    .in("empreendimento_id", empIds)
  const existentes = new Map(
    ((existentesRaw ?? []) as Array<{ id: string; imobiliaria_id: string; empreendimento_id: string; unidade: string }>).map(
      (e) => [`${e.imobiliaria_id}|${e.empreendimento_id}|${e.unidade}`, e.id],
    ),
  )

  let criados = 0
  let atualizados = 0
  for (const u of porUnidade.values()) {
    const key = `${u.imobiliariaId}|${u.empreendimentoId}|${u.unidade}`
    const status = u.emRescisao ? "em_rescisao" : u.status
    const existenteId = existentes.get(key)
    if (existenteId) {
      const { error: upErr } = await supabase
        .from("imoveis")
        .update({
          inquilino_nome: u.inquilino,
          status,
          valor_aluguel_esperado: u.aluguel,
        })
        .eq("id", existenteId)
      if (upErr) throw upErr
      atualizados += 1
    } else {
      const { error: insErr } = await supabase.from("imoveis").insert({
        imobiliaria_id: u.imobiliariaId,
        empreendimento_id: u.empreendimentoId,
        codigo_imobiliaria: u.unidade,
        unidade: u.unidade,
        inquilino_nome: u.inquilino,
        status,
        valor_aluguel_esperado: u.aluguel,
        ativo: true,
      })
      if (insErr) throw insErr
      criados += 1
    }
  }

  return { criados, atualizados, totalUnidades: porUnidade.size }
}
