// Verificador de consistencia entre telas: roda os caminhos de codigo da
// Revisao e dos Indicadores sobre os MESMOS fechamentos e compara metrica por
// metrica. Nasceu de dois casos relatados pela cliente em que a mesma grandeza
// aparecia com valores diferentes nas duas telas.
//
// Somente leitura. Uso:
//   node --import tsx scripts/verify-consistencia-telas.ts               # todas as competencias com fechamento
//   node --import tsx scripts/verify-consistencia-telas.ts 2026-07-01    # uma ou mais competencias
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { getIndicadores } from "@/lib/server/indicadores"
import { loadInadimplenciaMes } from "@/lib/server/inadimplencia-mes"
import { attachExistingImovelLinks } from "@/lib/server/fechamento-imoveis"
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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export interface DivergenciaCompetencia extends DivergenciaMetrica {
  competencia: string
}

async function listarCompetencias(supabase: SupabaseAdmin) {
  const { data, error } = await supabase.from("fechamentos").select("competencia")
  if (error) throw error
  return [...new Set((data ?? []).map((row) => String(row.competencia)))].sort()
}

async function varrerCompetencia(
  supabase: SupabaseAdmin,
  competencia: string,
): Promise<DivergenciaCompetencia[]> {
  const { data: fechamentos, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,analise_completa,empreendimentos(nome)")
    .eq("competencia", competencia)
  if (error) throw error

  const divergencias: DivergenciaCompetencia[] = []
  for (const fechamento of fechamentos ?? []) {
    // Mesmo caminho de leitura da rota da Revisao: o vinculo com o cadastro e
    // resolvido antes de comparar, senao o verificador mediria uma tela que o
    // usuario nunca ve.
    const gravada = fechamento.analise_completa as PackageAnalysis | null
    const analise = gravada
      ? await attachExistingImovelLinks(
          supabase,
          {
            imobiliariaId: fechamento.imobiliaria_id as string,
            empreendimentoId: fechamento.empreendimento_id as string,
          },
          gravada,
        )
      : null
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

    const encontradas = compararMetricas(nome, pares).map((item) => ({ ...item, competencia }))
    divergencias.push(...encontradas)
    const pendentes = inadimplenciaMes.pendentes.length
    const nota = pendentes > 0 ? ` · ${pendentes} inadimplente(s) sem base apurada` : ""
    console.log(
      `${encontradas.length === 0 ? "ok  " : "DIF "} ${nome} (${pares.length} metricas)${nota}`,
    )
  }
  return divergencias
}

async function main() {
  // Sem carregar o .env.local o verificador so roda com o env exportado no
  // shell — os outros verificadores carregam, este nao, e por isso ele ficava
  // fora da rotina.
  loadEnvLocal()
  const supabase = createSupabaseAdmin()
  // Sem argumento, varre TODAS as competencias com fechamento. O default antigo
  // era o mes corrente: rodado em 01/09/2026, um mes ainda sem fechamento, ele
  // imprimia "0 divergencia(s)" sem comparar nada. Foi assim que mai/2026 e
  // jun/2026 nunca entraram na varredura e duas divergencias reais passaram.
  const argumentos = process.argv.slice(2)
  const competencias = argumentos.length > 0 ? argumentos : await listarCompetencias(supabase)
  if (competencias.length === 0) {
    console.error("Nenhuma competencia com fechamento: nada foi comparado.")
    process.exitCode = 1
    return
  }

  const divergencias: DivergenciaCompetencia[] = []
  for (const competencia of competencias) {
    console.log(`\n=== ${competencia} ===`)
    divergencias.push(...(await varrerCompetencia(supabase, competencia)))
  }

  console.log(
    `\n${divergencias.length} divergencia(s) em ${competencias.length} competencia(s): ${competencias.join(", ")}`,
  )
  for (const d of divergencias) {
    console.log(
      `  - ${d.competencia} · ${d.fechamento} · ${d.rotulo}: revisao=${d.revisao ?? "—"} indicadores=${d.indicadores ?? "—"}`,
    )
  }
  process.exitCode = divergencias.length === 0 ? 0 : 1
}

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
