// Verificador da equação de reconciliação do repasse, sobre o que ficou
// PERSISTIDO em cada fechamento.
//
// O ADR-0001 promete que `recebidos em nome do locador − comissão/despesas
// retidas − comissão de intermediação = total a repassar` fecha centavo a
// centavo. Hoje essa promessa é conferida uma única vez, dentro da análise
// (`compareResumoFormula` em package-rechecks), e nunca mais depois. Qualquer
// coisa que edite `analise_completa` mais tarde — reprocessamento, script de
// reparo, correção manual, migration — pode desfazer a igualdade sem que nada
// acuse: os rechecks já rodaram e ficaram congelados no parecer.
//
// Este verificador lê o estado final e refaz a conta. É a diferença entre
// "estava certo quando foi analisado" e "está certo agora".
//
// A intermediação tem balde próprio de propósito (CONTEXT.md: não é despesa do
// locador nem comissão de administração), por isso ela entra como terceira
// parcela da equação em vez de estar embutida no consolidado retido.
//
// Somente leitura. Uso:
//   node --import tsx scripts/verify-reconciliacao-repasse.ts                # todas as competências
//   node --import tsx scripts/verify-reconciliacao-repasse.ts 2026-07-01     # uma ou mais competências
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import {
  resolverRecebimentosLegados,
  type RecebimentoLegado,
} from "@/lib/recebimentos-extraordinarios"

export interface ResumoFechamento {
  competencia: string
  empreendimento: string
  /** Receita bruta devida ao locador, antes das retenções. */
  recebidosEmNomeLocador: number | null
  /** Consolidado retido: comissão de administração + despesas do locador. */
  totalComissaoDespesas: number | null
  /** Comissão de intermediação retida — balde próprio, fora do consolidado. */
  comissaoIntermediacao: number
  totalARepassar: number | null
}

export interface DivergenciaRepasse extends ResumoFechamento {
  esperado: number
  diferenca: number
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100

/** Um fechamento só é comparável quando as três parcelas da equação existem. */
export function ehComparavel(resumo: ResumoFechamento): boolean {
  return (
    resumo.recebidosEmNomeLocador !== null &&
    resumo.totalComissaoDespesas !== null &&
    resumo.totalARepassar !== null
  )
}

export function verificarReconciliacaoRepasse(
  resumos: ResumoFechamento[],
  tolerancia = 0.01,
): DivergenciaRepasse[] {
  return resumos.flatMap((resumo): DivergenciaRepasse[] => {
    // Resumo incompleto não é divergência: é ausência de dado. A análise já
    // marca esse caso como pendência própria (recheck `resumo_financeiro` em
    // status warning); acusar de novo aqui viraria ruído duplicado.
    if (!ehComparavel(resumo)) return []

    const esperado = arredondar(
      resumo.recebidosEmNomeLocador! - resumo.totalComissaoDespesas! - resumo.comissaoIntermediacao,
    )
    const diferenca = arredondar(Math.abs(esperado - resumo.totalARepassar!))
    if (diferenca <= tolerancia) return []
    return [{ ...resumo, esperado, diferenca }]
  })
}

interface RegistroBanco {
  competencia: string
  analise_completa: {
    prestacao?: {
      resumo_financeiro?: {
        recebidos_em_nome_locador?: number | null
        total_comissao_despesas?: number | null
        total_a_repassar?: number | null
      } | null
      acordos_rescisoes_recebidos?: RecebimentoLegado[] | null
    } | null
  } | null
  empreendimentos: { nome: string | null } | null
}

const numero = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? null : Number(valor)

export function extrairResumo(registro: RegistroBanco): ResumoFechamento {
  const prestacao = registro.analise_completa?.prestacao
  const resumo = prestacao?.resumo_financeiro
  // Somar a coluna `comissao` na mão daria um número diferente do que o
  // fechamento usou: o resolvedor canônico deixa de fora o item sem vínculo ou
  // com confiança abaixo do mínimo (CA27.2), que vira pendência em vez de soma.
  // Um verificador que somasse tudo acusaria divergência justamente nos
  // fechamentos que trataram a pendência corretamente.
  const comissaoIntermediacao = arredondar(
    resolverRecebimentosLegados(prestacao?.acordos_rescisoes_recebidos ?? [])
      .filter((resolvido) => resolvido.item.tipo === "intermediacao")
      .reduce((soma, resolvido) => soma + resolvido.financeiro.comissao, 0),
  )
  return {
    competencia: registro.competencia,
    empreendimento: registro.empreendimentos?.nome ?? "—",
    recebidosEmNomeLocador: numero(resumo?.recebidos_em_nome_locador),
    totalComissaoDespesas: numero(resumo?.total_comissao_despesas),
    comissaoIntermediacao,
    totalARepassar: numero(resumo?.total_a_repassar),
  }
}

async function carregarResumos(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  competencias: string[],
): Promise<ResumoFechamento[]> {
  let consulta = supabase
    .from("fechamentos")
    .select("competencia,analise_completa,empreendimentos(nome)")
    .eq("arquivado", false)
  if (competencias.length > 0) consulta = consulta.in("competencia", competencias)
  const { data, error } = await consulta
  if (error) throw error
  return ((data ?? []) as unknown as RegistroBanco[]).map(extrairResumo)
}

const dinheiro = (valor: number | null) => (valor === null ? "—" : valor.toFixed(2))

async function main() {
  const competencias = process.argv.slice(2)
  const supabase = createSupabaseAdmin()
  const resumos = await carregarResumos(supabase, competencias)
  const divergencias = verificarReconciliacaoRepasse(resumos)

  const escopo = competencias.length > 0 ? competencias.join(", ") : "todas as competências"
  // Cobertura explícita, pelo mesmo motivo do verify-aluguel-contratado: se o
  // formato de `analise_completa` mudar e o resumo deixar de ser encontrado,
  // todo fechamento vira "incomparável" e o script devolveria o mesmo silêncio
  // de uma base saudável. Silêncio por quebra tem de ser distinguível de
  // silêncio por saúde.
  const comparados = resumos.filter(ehComparavel).length
  const incompletos = resumos.length - comparados

  console.log(`Reconciliação do repasse (recebidos − comissão/despesas − intermediação) — ${escopo}`)
  console.log(`${resumos.length} fechamento(s) no período; ${comparados} comparado(s), ${incompletos} com resumo incompleto.\n`)

  if (comparados === 0 && resumos.length > 0) {
    console.log("Nenhum fechamento pôde ser comparado — resumo financeiro não encontrado. Verificação inconclusiva.")
    process.exitCode = 1
    return
  }

  if (divergencias.length === 0) {
    console.log("Nenhuma divergência: todo fechamento comparado fecha a equação do repasse.")
    return
  }

  for (const divergencia of divergencias) {
    console.log(
      `  ${divergencia.competencia} ${divergencia.empreendimento}: ` +
        `recebidos ${dinheiro(divergencia.recebidosEmNomeLocador)} − retido ${dinheiro(divergencia.totalComissaoDespesas)} ` +
        `− intermediação ${dinheiro(divergencia.comissaoIntermediacao)} = ${dinheiro(divergencia.esperado)}, ` +
        `mas o resumo informa ${dinheiro(divergencia.totalARepassar)} (diferença ${dinheiro(divergencia.diferenca)})`,
    )
  }
  console.log(`\n${divergencias.length} divergência(s).`)
  process.exitCode = 1
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
