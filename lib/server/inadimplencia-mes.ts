import type { PackageAnalysis } from "@/lib/prestacao-types"
import { ehInadimplenteDoMes, receitaEsperadaInadimplente, type SnapshotReceita } from "@/lib/inadimplencia-mes"
import type { createSupabaseAdmin } from "./supabase"

export interface InadimplenciaMesUnidade {
  apto: string
  inquilino: string
  imovel_id: string
  valor: number
}

export interface InadimplenciaMes {
  valor: number
  unidades: InadimplenciaMesUnidade[]
}

// Soma o valor esperado (do historico) das unidades inadimplentes do mes
// corrente. Distinta da inadimplencia acumulada (dividas de meses anteriores,
// que ja vem em inadimplencias_acumuladas).
export async function loadInadimplenciaMes(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: { competencia: string; analiseCompleta: PackageAnalysis | null },
): Promise<InadimplenciaMes> {
  const rows = params.analiseCompleta?.prestacao?.receitas_por_imovel ?? []
  const inadimplentes = rows.filter((row) => ehInadimplenteDoMes({ imovel_id: row.imovel_id, observacao: row.observacao }))
  if (inadimplentes.length === 0) return { valor: 0, unidades: [] }

  const unidades: InadimplenciaMesUnidade[] = []
  for (const row of inadimplentes) {
    const imovelId = row.imovel_id as string
    const { data: snaps } = await supabase
      .from("imovel_competencias")
      .select("competencia,receita_total,aluguel_recebido,status_ocupacao")
      .eq("imovel_id", imovelId)
      .lt("competencia", params.competencia)
      .order("competencia", { ascending: false })
      .limit(12)

    const { data: imovel } = await supabase
      .from("imoveis")
      .select("valor_aluguel_esperado")
      .eq("id", imovelId)
      .maybeSingle()

    const aluguelEsperado =
      imovel?.valor_aluguel_esperado != null ? Number(imovel.valor_aluguel_esperado) : null

    // A cobranca esperada da PROPRIA competencia (vigencia: aluguel + garagem)
    // e a mesma base usada pelos indicadores. Sem ela, a Revisao caia no proxy
    // da ultima receita paga e as duas telas exibiam valores diferentes para o
    // mesmo conceito (Joao Cordeiro julho: 1.752,54 na Revisao, 788,22 nos
    // indicadores).
    const { data: snapshotAtual } = await supabase
      .from("imovel_competencias")
      .select("cobranca_esperada,aluguel_esperado")
      .eq("imovel_id", imovelId)
      .eq("competencia", params.competencia)
      .maybeSingle()

    const cobrancaEsperada =
      snapshotAtual?.cobranca_esperada != null
        ? Number(snapshotAtual.cobranca_esperada)
        : snapshotAtual?.aluguel_esperado != null
          ? Number(snapshotAtual.aluguel_esperado)
          : null

    const snapshots: SnapshotReceita[] = (snaps ?? []).map((s) => ({
      competencia: String(s.competencia),
      receita_total: s.receita_total != null ? Number(s.receita_total) : null,
      aluguel_recebido: s.aluguel_recebido != null ? Number(s.aluguel_recebido) : null,
      status_ocupacao: s.status_ocupacao ?? null,
    }))

    unidades.push({
      apto: row.apto ?? "",
      inquilino: row.inquilino ?? "",
      imovel_id: imovelId,
      valor: receitaEsperadaInadimplente(snapshots, aluguelEsperado, cobrancaEsperada),
    })
  }

  const valor = Number(unidades.reduce((soma, u) => soma + u.valor, 0).toFixed(2))
  return { valor, unidades }
}
