import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { validatePackage } from "@/lib/server/package-rechecks"
import { getCommercialRuleForValidation } from "@/lib/server/regras-comerciais"
import { persistValidacoes } from "@/lib/server/persist-package"
import { materializeIndicadoresSnapshots } from "@/lib/server/indicadores-snapshots"
import { roundMoney } from "@/lib/indicadores-domain"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const camposPermitidos = new Set(["aluguel"])
// Correcao so e permitida enquanto o fechamento ainda esta em revisao.
const statusEditavel = new Set(["pendente_revisao", "processado_com_sucesso"])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { apto, inquilino = "", campo = "aluguel", valor_novo, justificativa } = await request.json()

    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "Fechamento inválido." }, { status: 400 })
    }
    if (!camposPermitidos.has(String(campo))) {
      return NextResponse.json({ error: "Campo não suportado para correção." }, { status: 400 })
    }
    if (!justificativa || typeof justificativa !== "string" || justificativa.trim() === "") {
      return NextResponse.json({ error: "Justificativa obrigatória." }, { status: 400 })
    }
    const valorNovo = typeof valor_novo === "number" ? valor_novo : Number(valor_novo)
    if (!Number.isFinite(valorNovo) || valorNovo < 0) {
      return NextResponse.json({ error: "Valor correto inválido." }, { status: 400 })
    }
    if (typeof apto !== "string" || apto.trim() === "") {
      return NextResponse.json({ error: "Apartamento não informado." }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const { data: fechamento, error: fetchError } = await supabase
      .from("fechamentos")
      .select("id, imobiliaria_id, empreendimento_id, competencia, status, analise_completa")
      .eq("id", id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!fechamento) {
      return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 })
    }
    if (!statusEditavel.has(fechamento.status)) {
      return NextResponse.json(
        { error: "Fechamento já aprovado ou enviado. Reabra a revisão antes de corrigir." },
        { status: 409 },
      )
    }

    const analise = fechamento.analise_completa as PackageAnalysis | null
    if (!analise?.prestacao) {
      return NextResponse.json({ error: "Análise não encontrada para este fechamento." }, { status: 404 })
    }

    const linhas = analise.prestacao.receitas_por_imovel
    const indice = linhas.findIndex((row) => row.apto === apto && (row.inquilino ?? "") === (inquilino ?? ""))
    if (indice < 0) {
      return NextResponse.json({ error: "Linha não encontrada na prestação." }, { status: 404 })
    }

    const anterior = linhas[indice]
    const valorAnterior = anterior.aluguel
    // Mantem as demais colunas; ajusta o total da linha pela diferenca do aluguel.
    const delta = valorNovo - (anterior.aluguel ?? 0)
    const aluguelComDesconto =
      typeof anterior.desconto === "number" && anterior.desconto > 0
        ? Math.max(valorNovo - anterior.desconto, 0)
        : valorNovo
    const linhaCorrigida: ReceitaPorImovel = {
      ...anterior,
      aluguel: roundMoney(valorNovo),
      aluguel_com_desconto: roundMoney(aluguelComDesconto),
      total: roundMoney(Math.max((anterior.total ?? 0) + delta, 0)),
    }
    const novasReceitas = [...linhas]
    novasReceitas[indice] = linhaCorrigida
    const novaPrestacao = { ...analise.prestacao, receitas_por_imovel: novasReceitas }

    // Recalculo deterministico (sem IA), mesmo caminho do processamento original.
    const commercialRule = await getCommercialRuleForValidation(
      fechamento.imobiliaria_id,
      fechamento.empreendimento_id,
    )
    const validation = validatePackage({
      documents: analise.documents ?? [],
      prestacao: novaPrestacao,
      repasse: analise.repasse ?? null,
      despesas: analise.despesas ?? null,
      reajuste: analise.reajuste ?? null,
      commercialRule,
      historicalAgreementKeys: [],
    })

    const novaAnalise: PackageAnalysis = {
      ...analise,
      prestacao: validation.prestacao,
      repasse: validation.repasse,
      despesas: validation.despesas,
      reajuste: validation.reajuste,
      totals: validation.totals,
      parecer: validation.parecer,
      rechecks: validation.rechecks,
      guardrails: validation.guardrails,
    }

    // Preserva validacoes ja resolvidas pelo operador.
    const { data: resolvidas } = await supabase
      .from("validacoes")
      .select("tipo_validacao, status, justificativa, resolvido_por, resolvido_em")
      .eq("fechamento_id", id)
      .in("status", ["resolvida", "ignorada_com_justificativa"])
    const resolvedValidations = resolvidas ?? []

    const hasUnresolvedBlocking =
      (validation.parecer.status === "bloqueado" &&
        !resolvedValidations.some((r) => r.tipo_validacao === "parecer_tecnico")) ||
      validation.rechecks.some(
        (c) => c.status === "failed" && !resolvedValidations.some((r) => r.tipo_validacao === c.id),
      ) ||
      validation.guardrails.some(
        (g) => g.status === "blocked" && !resolvedValidations.some((r) => r.tipo_validacao === g.id),
      )

    const { error: updateError } = await supabase
      .from("fechamentos")
      .update({
        analise_completa: novaAnalise,
        total_receitas: validation.totals.total_receitas,
        total_despesas: validation.totals.total_despesas,
        total_comissoes: validation.totals.total_comissoes,
        total_repassar: validation.totals.total_a_repassar,
        valor_repassado_comprovante: validation.totals.valor_comprovado,
        diferenca_total: validation.totals.diferenca_repasse,
        status: hasUnresolvedBlocking ? "pendente_revisao" : "processado_com_sucesso",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) throw updateError

    await materializeIndicadoresSnapshots({
      supabase,
      fechamentoId: id,
      imobiliariaId: fechamento.imobiliaria_id,
      empreendimentoId: fechamento.empreendimento_id,
      competencia: fechamento.competencia,
      analysis: novaAnalise,
    })

    // Ressincroniza validacoes (recheck/guardrail/parecer) preservando as resolvidas.
    const { error: deleteError } = await supabase.from("validacoes").delete().eq("fechamento_id", id)
    if (deleteError) throw deleteError
    await persistValidacoes({
      fechamentoId: id,
      documents: novaAnalise.documents ?? [],
      parecer: validation.parecer,
      rechecks: validation.rechecks,
      guardrails: validation.guardrails,
      resolvedValidations,
    })

    const { error: logError } = await supabase.from("auditoria_correcoes").insert({
      fechamento_id: id,
      validacao_id: null,
      movimentacao_id: null,
      usuario: "Operador",
      campo_alterado: `receita_aluguel:${apto}`,
      valor_anterior: valorAnterior !== null && valorAnterior !== undefined ? String(valorAnterior) : null,
      valor_novo: String(roundMoney(valorNovo)),
      justificativa: justificativa.trim(),
    })
    if (logError) throw logError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[CORRIGIR ERROR]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno no servidor." },
      { status: 500 },
    )
  }
}
