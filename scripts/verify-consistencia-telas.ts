// Verificador de consistencia entre telas: roda os caminhos de codigo da
// Revisao e dos Indicadores sobre os MESMOS fechamentos e compara metrica por
// metrica. Nasceu de dois casos relatados pela cliente em que a mesma grandeza
// aparecia com valores diferentes nas duas telas.
//
// Somente leitura. Uso:
//   node --import tsx scripts/verify-consistencia-telas.ts 2026-07-01
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { getIndicadores } from "@/lib/server/indicadores"
import { loadInadimplenciaMes } from "@/lib/server/inadimplencia-mes"
import { calcularResumoComissaoFechamento } from "@/lib/fechamento-operacional"
import { resolverRecebimentosLegados } from "@/lib/recebimentos-extraordinarios"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { pathToFileURL } from "node:url"

export interface ParMetrica {
  rotulo: string
  revisao: number | null
  indicadores: number | null
}

export interface DivergenciaMetrica extends ParMetrica {
  fechamento: string
  diferenca: number | null
}

// Comparacao pura: divergente quando um lado tem valor e o outro nao, ou quando
// a diferenca passa da tolerancia. Ambos ausentes contam como coerentes.
export function compararMetricas(
  fechamento: string,
  pares: ParMetrica[],
  tolerancia = 0.01,
): DivergenciaMetrica[] {
  return pares.flatMap((par): DivergenciaMetrica[] => {
    const { revisao, indicadores } = par
    if (revisao === null && indicadores === null) return []
    if (revisao === null || indicadores === null) {
      return [{ ...par, fechamento, diferenca: null }]
    }
    const diferenca = Math.round((revisao - indicadores) * 100) / 100
    return Math.abs(diferenca) <= tolerancia ? [] : [{ ...par, fechamento, diferenca }]
  })
}

async function main() {
  const competencia = process.argv[2] ?? new Date().toISOString().slice(0, 8) + "01"
  const supabase = createSupabaseAdmin()
  const { data: fechamentos, error } = await supabase
    .from("fechamentos")
    .select("id,empreendimento_id,analise_completa,empreendimentos(nome)")
    .eq("competencia", competencia)
  if (error) throw error

  const divergencias: DivergenciaMetrica[] = []
  for (const fechamento of fechamentos ?? []) {
    const analise = fechamento.analise_completa as PackageAnalysis | null
    const prestacao = analise?.prestacao
    if (!prestacao) continue
    const nome =
      (fechamento.empreendimentos as { nome?: string } | null)?.nome ?? fechamento.empreendimento_id
    const resumo = prestacao.resumo_financeiro
    const intermediacao = resolverRecebimentosLegados(
      prestacao.acordos_rescisoes_recebidos.filter((item) => item.tipo === "intermediacao"),
    ).reduce((total, item) => total + item.financeiro.comissao, 0)
    const inadimplenciaMes = await loadInadimplenciaMes(supabase, {
      competencia,
      analiseCompleta: analise,
    })
    const indicadores = await getIndicadores({
      competencia,
      empreendimentoId: fechamento.empreendimento_id,
    })

    const pares: ParMetrica[] = [
      { rotulo: "recebidos em nome do locador", revisao: resumo.recebidos_em_nome_locador ?? null, indicadores: indicadores.resumo.receitasEconomicas },
      { rotulo: "comissao administracao", revisao: calcularResumoComissaoFechamento(prestacao).total, indicadores: indicadores.resumo.comissaoAdministracao },
      { rotulo: "comissao intermediacao", revisao: intermediacao, indicadores: indicadores.resumo.comissaoIntermediacao },
      { rotulo: "despesas retidas", revisao: analise?.totals?.total_despesas ?? null, indicadores: indicadores.resumo.despesasRetidas },
      { rotulo: "repasse declarado", revisao: resumo.total_a_repassar ?? null, indicadores: indicadores.ponteFinanceira.repasseDeclarado },
      { rotulo: "inadimplencia do mes", revisao: inadimplenciaMes.valor, indicadores: indicadores.realizacaoAluguel.inadimplenciaMes },
    ]
    if (prestacao.inadimplencias_acumuladas.length > 0) {
      pares.push({
        rotulo: "inadimplencia acumulada",
        revisao: prestacao.inadimplencias_acumuladas.reduce((total, item) => total + item.valor, 0),
        indicadores: indicadores.resumo.inadimplenciaAcumulada,
      })
    }

    const encontradas = compararMetricas(nome, pares)
    divergencias.push(...encontradas)
    console.log(`${encontradas.length === 0 ? "ok  " : "DIF "} ${nome} (${pares.length} metricas)`)
  }

  console.log(`\n${divergencias.length} divergencia(s) em ${competencia}`)
  for (const d of divergencias) {
    console.log(`  - ${d.fechamento} · ${d.rotulo}: revisao=${d.revisao ?? "—"} indicadores=${d.indicadores ?? "—"}`)
  }
  process.exitCode = divergencias.length === 0 ? 0 : 1
}

// Mesmo idioma dos outros verificadores: so executa quando chamado direto, para
// que os testes possam importar as funcoes puras sem disparar acesso ao banco.
const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
