// Recalcula os RECHECKS de um fechamento a partir da analise ja gravada, sem
// reler documento nenhum.
//
// Os rechecks ficam congelados dentro de `analise_completa`, com a data em que
// o fechamento foi processado. Quando a regra de um recheck e corrigida depois,
// o fechamento antigo continua exibindo o veredito antigo — e o botao
// "Atualizar" da Revisao so refaz o fetch da mesma linha congelada, entao nada
// muda na tela.
//
// Galpao Jose Walter, ago/2026: processado em 15/09, com `total_despesas`
// falhando porque a NFS-e da propria administradora (R$ 267,88) era contada
// como despesa alem da taxa ja deduzida na linha do aluguel. A correcao entrou
// em 17/09 (265a85e); o fechamento seguiu bloqueado com um veredito de dois
// dias antes.
//
// Usa `refreshPackageValidation`, nao `validatePackage`: o refresh PRESERVA os
// totais gravados. Revalidar nao pode mexer em dinheiro — se os numeros
// mudaram, o caso e de reprocessamento (`reprocessar-planilha.ts`), nao deste
// script. O STATUS tambem e preservado, para nao regredir o estado do eGestor.
//
// Dry-run por padrao. Uso:
//   node --import tsx scripts/revalidar-fechamento.ts --fechamento <uuid> [--commit]
import { pathToFileURL } from "node:url"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { refreshPackageValidation } from "@/lib/server/package-rechecks"
import {
  buildPackageMovimentacoes,
  buildValidacoesRows,
  preserveManualMovementOverrides,
} from "@/lib/server/persist-package"
import { getCommercialRuleForValidation } from "@/lib/server/regras-comerciais"
import { loadHistoricalAgreementKeys } from "@/lib/server/historical-agreements"

const dinheiro = (valor: unknown) =>
  valor === null || valor === undefined ? "—" : Number(valor).toFixed(2)

function listarRechecks(analysis: PackageAnalysis) {
  const abertos = analysis.rechecks.filter((check) => check.status !== "passed")
  if (abertos.length === 0) return "todos passaram"
  return abertos.map((check) => `${check.id}:${check.status}`).join(", ")
}

function totaisComparaveis(analysis: PackageAnalysis) {
  const { totals } = analysis
  return [
    `receitas=${dinheiro(totals.total_receitas)}`,
    `comissoes=${dinheiro(totals.total_comissoes)}`,
    `despesas=${dinheiro(totals.total_despesas)}`,
    `repasse=${dinheiro(totals.total_a_repassar)}`,
  ].join(" ")
}

function parseArgs(argv: string[]) {
  let fechamentoId: string | null = null
  let commit = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--commit") { commit = true; continue }
    if (argv[i] === "--fechamento") { fechamentoId = argv[i + 1] ?? null; i += 1; continue }
    throw new Error(`Argumento desconhecido: ${argv[i]}`)
  }
  if (!fechamentoId) throw new Error("Falta --fechamento <uuid>.")
  return { fechamentoId, commit }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const supabase = createSupabaseAdmin()
  const { data: fechamento, error } = await supabase
    .from("fechamentos")
    .select("id,status,atualizado_em,competencia,imobiliaria_id,empreendimento_id,analise_completa,empreendimentos(nome)")
    .eq("id", options.fechamentoId)
    .single()
  if (error) throw error

  const anterior = fechamento.analise_completa as PackageAnalysis | null
  if (!anterior?.prestacao) throw new Error("Fechamento sem análise para revalidar.")

  const [commercialRule, historicalAgreementKeys] = await Promise.all([
    getCommercialRuleForValidation(
      fechamento.imobiliaria_id as string,
      fechamento.empreendimento_id as string,
    ),
    loadHistoricalAgreementKeys(supabase, {
      id: fechamento.id as string,
      imobiliariaId: fechamento.imobiliaria_id as string,
      empreendimentoId: fechamento.empreendimento_id as string,
    }),
  ])
  const analysis = refreshPackageValidation(anterior, { commercialRule, historicalAgreementKeys })

  const nome = (fechamento.empreendimentos as { nome?: string } | null)?.nome ?? fechamento.id
  console.log(`\n### ${nome} (${String(fechamento.competencia).slice(0, 7)}) status=${fechamento.status}`)
  console.log(`  antes: parecer=${anterior.parecer.status} rechecks=[${listarRechecks(anterior)}]`)
  console.log(`  apos : parecer=${analysis.parecer.status} rechecks=[${listarRechecks(analysis)}]`)
  console.log(`  totais antes: ${totaisComparaveis(anterior)}`)
  console.log(`  totais apos : ${totaisComparaveis(analysis)}`)

  // O refresh preserva os totais por construcao. Se ainda assim mudarem, a
  // premissa do script caiu: parar e melhor que gravar dinheiro sem querer.
  if (totaisComparaveis(anterior) !== totaisComparaveis(analysis)) {
    throw new Error("Abortado: a revalidação mexeu nos totais. Isso é caso de reprocessamento, não de revalidação.")
  }

  if (!options.commit) {
    console.log("  MODO DRY-RUN: nenhuma escrita realizada.")
    return
  }

  // O RPC APAGA as movimentacoes nao-manuais antes de reinserir o que recebe:
  // passar `null` aqui zeraria a movimentacao do fechamento. Elas sao
  // reconstruidas da mesma analise, entao saem identicas — o que muda e so o
  // veredito. Snapshots nao: la o RPC faz upsert, e `null` os deixa intactos.
  const { data: manuais, error: erroManuais } = await supabase
    .from("movimentacoes")
    .select("tipo_movimentacao,categoria,descricao,imovel_id,origem_documental")
    .eq("fechamento_id", fechamento.id)
    .eq("corrigido_manualmente", true)
  if (erroManuais) throw erroManuais

  const movimentacoes = preserveManualMovementOverrides(
    buildPackageMovimentacoes({
      fechamentoId: fechamento.id as string,
      competencia: String(fechamento.competencia),
      documents: analysis.documents,
      prestacao: analysis.prestacao,
      repasse: analysis.repasse,
      despesas: analysis.despesas,
      reajuste: analysis.reajuste,
    }),
    manuais ?? [],
  )

  const { data: resolvidas, error: erroResolvidas } = await supabase
    .from("validacoes")
    .select("tipo_validacao, status, justificativa, resolvido_por, resolvido_em")
    .eq("fechamento_id", fechamento.id)
    .in("status", ["resolvida", "ignorada_com_justificativa"])
  if (erroResolvidas) throw erroResolvidas

  const validacoes = buildValidacoesRows({
    fechamentoId: fechamento.id as string,
    documents: analysis.documents,
    parecer: analysis.parecer,
    rechecks: analysis.rechecks,
    guardrails: analysis.guardrails,
    resolvedValidations: resolvidas ?? [],
  })

  const { error: erroPersistencia } = await supabase.rpc("persistir_pacote_fechamento_v1", {
    p_fechamento_id: fechamento.id,
    p_esperado_atualizado_em: fechamento.atualizado_em,
    p_fechamento_patch: {
      status: fechamento.status,
      // O RPC aplica o patch como UPDATE de coluna: chave ausente vira NULL.
      // Omitir os totais aqui zerou as colunas financeiras do Jose Walter
      // ago/2026 na primeira execucao deste script. Sao os mesmos numeros de
      // antes — a checagem acima ja garantiu que nao mudaram.
      total_receitas: analysis.totals.total_receitas,
      total_despesas: analysis.totals.total_despesas,
      total_comissoes: analysis.totals.total_comissoes,
      total_repassar: analysis.totals.total_a_repassar,
      valor_repassado_comprovante: analysis.totals.valor_comprovado,
      diferenca_total: analysis.totals.diferenca_repasse,
      parecer_tecnico: {
        parecer: analysis.parecer,
        rechecks: analysis.rechecks,
        guardrails: analysis.guardrails,
        documents: analysis.documents,
        totals: analysis.totals,
      },
      analise_completa: analysis,
    },
    p_movimentacoes: movimentacoes,
    p_snapshots: null,
    p_validacoes: validacoes,
    p_documentos_ids: [],
  })
  if (erroPersistencia) throw erroPersistencia
  console.log(`  GRAVADO: ${validacoes.length} validacao(oes), ${movimentacoes.length} movimentacao(oes) reescrita(s). Snapshots intocados.`)
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
