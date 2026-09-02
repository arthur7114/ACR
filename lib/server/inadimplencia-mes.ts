import type { PackageAnalysis } from "@/lib/prestacao-types"
import { ehInadimplenteDoMes, receitaEsperadaInadimplente, type SnapshotReceita } from "@/lib/inadimplencia-mes"
import type { createSupabaseAdmin } from "./supabase"

export interface InadimplenciaMesUnidade {
  apto: string
  inquilino: string
  imovel_id: string
  valor: number
}

// `sem_imovel_vinculado`: a linha declara inadimplencia mas nao aponta para o
// cadastro, entao nao ha historico nem vigencia de onde tirar a base.
// `sem_base_de_calculo`: o imovel existe, mas nem cobranca esperada, nem mes
// pago anterior, nem aluguel esperado estao disponiveis.
export type InadimplenciaMesMotivo = "sem_imovel_vinculado" | "sem_base_de_calculo"

export interface InadimplenciaMesPendencia {
  apto: string
  inquilino: string
  motivo: InadimplenciaMesMotivo
}

export interface InadimplenciaMes {
  // `null` = ha inadimplencia declarada mas nenhuma unidade apuravel. Nunca 0:
  // zero e "zero confirmado" na semantica da tela.
  valor: number | null
  unidades: InadimplenciaMesUnidade[]
  pendentes: InadimplenciaMesPendencia[]
}

// Soma o valor esperado (do historico) das unidades inadimplentes do mes
// corrente. Distinta da inadimplencia acumulada (dividas de meses anteriores,
// que ja vem em inadimplencias_acumuladas).
//
// Falha fechada: unidade marcada como inadimplente que nao puder ser apurada
// entra em `pendentes` em vez de contribuir com zero em silencio. A analise
// deve chegar aqui com os vinculos ja resolvidos contra o cadastro
// (`attachExistingImovelLinks`), como faz a rota da Revisao.
export async function loadInadimplenciaMes(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: { competencia: string; analiseCompleta: PackageAnalysis | null },
): Promise<InadimplenciaMes> {
  const rows = params.analiseCompleta?.prestacao?.receitas_por_imovel ?? []
  const inadimplentes = rows.filter((row) => ehInadimplenteDoMes({ observacao: row.observacao }))
  if (inadimplentes.length === 0) return { valor: 0, unidades: [], pendentes: [] }

  const unidades: InadimplenciaMesUnidade[] = []
  const pendentes: InadimplenciaMesPendencia[] = []
  for (const row of inadimplentes) {
    const apto = row.apto ?? ""
    const inquilino = row.inquilino ?? ""
    const imovelId = row.imovel_id ?? null
    if (!imovelId) {
      pendentes.push({ apto, inquilino, motivo: "sem_imovel_vinculado" })
      continue
    }

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

    // O aluguel declarado pelo PROPRIO documento (Relacao de Imoveis do Cesar
    // Rego) vence qualquer base derivada: e o que o locador le no extrato.
    const declaradoNoDocumento =
      row.aluguel_esperado != null && row.aluguel_esperado > 0 ? Number(row.aluguel_esperado) : null
    const valor =
      declaradoNoDocumento ?? receitaEsperadaInadimplente(snapshots, aluguelEsperado, cobrancaEsperada)
    if (valor === null) {
      pendentes.push({ apto, inquilino, motivo: "sem_base_de_calculo" })
      continue
    }

    unidades.push({ apto, inquilino, imovel_id: imovelId, valor })
  }

  const valor =
    unidades.length === 0
      ? null
      : Number(unidades.reduce((soma, u) => soma + u.valor, 0).toFixed(2))
  return { valor, unidades, pendentes }
}
