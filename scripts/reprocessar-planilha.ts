// Reprocessa um fechamento a partir da planilha (leitura determinística), sem
// passar pelo upload — necessário porque fechamentos em `lancado_egestor` não
// aceitam novos documentos. Substitui APENAS a prestação da análise; o restante
// do pacote (documentos, comprovante, despesas, reajuste) é preservado, e o
// STATUS do fechamento é mantido para não regredir o estado do eGestor.
//
// Dry-run por padrão. Uso:
//   node --import tsx scripts/reprocessar-planilha.ts --fechamento <uuid> --planilha <arquivo.xlsx> [--commit]
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { parseExcelPrestacao } from "@/lib/server/excel-parser"
import { validatePackage } from "@/lib/server/package-rechecks"
import {
  buildPackageMovimentacoes,
  buildValidacoesRows,
  preserveManualMovementOverrides,
} from "@/lib/server/persist-package"
import {
  buildIndicadoresSnapshotRows,
  loadActiveIndicadoresProperties,
} from "@/lib/server/indicadores-snapshots"
import { resolverRecebimentosLegados } from "@/lib/recebimentos-extraordinarios"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"

// O parser de planilha nao vincula imovel_id — no fluxo de upload o vinculo e
// resolvido depois, contra o cadastro. Reprocessando direto, as linhas voltariam
// SEM vinculo, o que zera a inadimplencia do mes na Revisao e bloqueia a
// aprovacao. Aqui o vinculo e resolvido pelo cadastro ativo do empreendimento,
// pela mesma normalizacao de codigo usada nos snapshots.
function resolverVinculosPeloCadastro(
  linhas: ReceitaPorImovel[],
  cadastro: Array<{ id: string; unit: string }>,
): { linhas: ReceitaPorImovel[]; vinculadas: number; semCadastro: string[] } {
  const porUnidade = new Map(cadastro.map((imovel) => [normalizeCodigoImovel(imovel.unit), imovel.id]))
  const semCadastro: string[] = []
  let vinculadas = 0
  const resultado = linhas.map((linha) => {
    const imovelId = porUnidade.get(normalizeCodigoImovel(linha.apto)) ?? null
    if (imovelId) vinculadas += 1
    else semCadastro.push(linha.apto)
    return imovelId ? { ...linha, imovel_id: imovelId } : linha
  })
  return { linhas: resultado, vinculadas, semCadastro }
}

const dinheiro = (v: unknown) => (v === null || v === undefined ? "—" : Number(v).toFixed(2))

function resumo(analysis: PackageAnalysis) {
  const p = analysis.prestacao
  if (!p) return "sem prestação"
  const interm = resolverRecebimentosLegados(
    p.acordos_rescisoes_recebidos.filter((item) => item.tipo === "intermediacao"),
  ).map((x) => `${dinheiro(x.financeiro.comissao)} a ${dinheiro(x.financeiro.percentualRealizado)}% (base ${dinheiro(x.financeiro.baseComissionavel)})`)
  const seguro = p.receitas_por_imovel.reduce((soma, linha) => soma + (linha.seguro_incendio ?? 0), 0)
  const alertas = analysis.rechecks.filter((check) => check.status !== "passed").map((check) => `${check.id}:${check.status}`)
  return [
    `recebidos=${dinheiro(p.resumo_financeiro.recebidos_em_nome_locador)}`,
    `comissao=${dinheiro(p.resumo_financeiro.comissao_administracao)}`,
    `repasse=${dinheiro(p.resumo_financeiro.total_a_repassar)}`,
    `linhas=${p.receitas_por_imovel.length}`,
    `seguro=${dinheiro(seguro)}`,
    `rechecks!=passed=[${alertas.join(", ") || "—"}]`,
    `acordos=${p.acordos_rescisoes_recebidos.length}`,
    `acumuladas=${p.inadimplencias_acumuladas.length}`,
    `intermediacao=[${interm.join("; ") || "—"}]`,
  ].join(" ")
}

function parseArgs(argv: string[]) {
  let fechamentoId: string | null = null
  let planilha: string | null = null
  let commit = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--commit") { commit = true; continue }
    if (argv[i] === "--fechamento") { fechamentoId = argv[i + 1] ?? null; i += 1; continue }
    if (argv[i] === "--planilha") { planilha = argv[i + 1] ?? null; i += 1; continue }
    throw new Error(`Argumento desconhecido: ${argv[i]}`)
  }
  if (!fechamentoId || !planilha) throw new Error("Uso: --fechamento <uuid> --planilha <arquivo.xlsx> [--commit]")
  return { fechamentoId, planilha, commit }
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

  const anterior = fechamento.analise_completa as PackageAnalysis
  if (!anterior?.prestacao) throw new Error("Fechamento sem análise para reprocessar.")
  const competencia = String(fechamento.competencia).slice(0, 7)
  const prestacao = parseExcelPrestacao(readFileSync(options.planilha), competencia)

  // Preserva imobiliária/empreendimento já resolvidos: o nome lido da planilha
  // não é fonte de identidade cadastral.
  const properties = await loadActiveIndicadoresProperties({
    supabase,
    imobiliariaId: fechamento.imobiliaria_id as string,
    empreendimentoId: fechamento.empreendimento_id as string,
    competencia,
  })
  const vinculos = resolverVinculosPeloCadastro(prestacao.receitas_por_imovel, properties)
  if (vinculos.semCadastro.length > 0) {
    throw new Error(
      `Abortado: ${vinculos.semCadastro.length} linha(s) sem imovel cadastrado no empreendimento: ${vinculos.semCadastro.join(", ")}. Resolva o cadastro antes de reprocessar.`,
    )
  }
  // `validatePackage` e nao `refreshPackageValidation`: o refresh preserva os
  // totais gravados (`{...calculado, ...anterior.totals}`), pensado para
  // revalidar sem mexer em dinheiro. Num reprocessamento a prestacao mudou de
  // fato, entao os totais PRECISAM ser recalculados — senao total_despesas fica
  // do documento antigo e a ponte financeira nao fecha.
  const prestacaoNova = {
    ...prestacao,
    receitas_por_imovel: vinculos.linhas,
    imobiliaria: anterior.prestacao.imobiliaria,
    empreendimento: anterior.prestacao.empreendimento,
  }
  const validacao = validatePackage({
    documents: anterior.documents,
    prestacao: prestacaoNova,
    repasse: anterior.repasse,
    despesas: anterior.despesas,
    reajuste: anterior.reajuste,
  })
  const analysis: PackageAnalysis = {
    ...anterior,
    documents: anterior.documents,
    prestacao: validacao.prestacao!,
    repasse: validacao.repasse,
    despesas: validacao.despesas,
    reajuste: validacao.reajuste,
    totals: validacao.totals,
    parecer: validacao.parecer,
    rechecks: validacao.rechecks,
    guardrails: validacao.guardrails,
  }

  const nome = (fechamento.empreendimentos as { nome?: string } | null)?.nome ?? fechamento.id
  console.log(`\n### ${nome} (${competencia}) status=${fechamento.status}`)
  console.log(`  antes: ${resumo(anterior)}`)
  console.log(`  apos : ${resumo(analysis)}`)

  const snapshots = buildIndicadoresSnapshotRows({
    properties,
    fechamentoId: fechamento.id as string,
    competencia,
    analysis,
  })
  if (snapshots.unlinkedLineCount > 0) {
    throw new Error(`Abortado: ${snapshots.unlinkedLineCount} linha(s) sem vínculo inequívoco de imóvel.`)
  }
  console.log(`  snapshots=${snapshots.rows.length} cobertura=${snapshots.matchedPropertyCount}/${snapshots.expectedPropertyCount} semVinculo=${snapshots.unlinkedLineCount}`)
  console.log(`  vinculos resolvidos=${vinculos.vinculadas}/${vinculos.linhas.length}`)

  if (!options.commit) {
    console.log("  MODO DRY-RUN: nenhuma escrita realizada.")
    return
  }

  const { data: manuais, error: erroManuais } = await supabase
    .from("movimentacoes")
    .select("tipo_movimentacao,categoria,descricao,imovel_id,origem_documental")
    .eq("fechamento_id", fechamento.id)
    .eq("corrigido_manualmente", true)
  if (erroManuais) throw erroManuais

  const { data: resolvidas, error: erroResolvidas } = await supabase
    .from("validacoes")
    .select("tipo_validacao, status, justificativa, resolvido_por, resolvido_em")
    .eq("fechamento_id", fechamento.id)
    .in("status", ["resolvida", "ignorada_com_justificativa"])
  if (erroResolvidas) throw erroResolvidas

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
      // STATUS PRESERVADO: reprocessar a leitura não pode regredir o estado do
      // eGestor de um fechamento já lançado.
      status: fechamento.status,
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
    p_snapshots: snapshots.rows,
    p_validacoes: validacoes,
    p_documentos_ids: [],
  })
  if (erroPersistencia) throw erroPersistencia
  console.log(`  GRAVADO: ${movimentacoes.length} movimentacao(oes), ${snapshots.rows.length} snapshot(s), ${validacoes.length} validacao(oes).`)
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
