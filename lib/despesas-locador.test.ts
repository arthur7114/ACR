import assert from "node:assert/strict"
import test from "node:test"
import { classificarLancamento, reconciliarResumoDespesas } from "./despesas-locador.ts"
import type { PrestacaoAnalysis } from "@/lib/prestacao-types"

test("classifica comissao e intermediacao nos seus proprios baldes", () => {
  assert.equal(classificarLancamento("COMISSAO DA ADMINISTRADORA"), "comissao")
  assert.equal(classificarLancamento("Comissão 7%"), "comissao")
  assert.equal(classificarLancamento("INTERMEDIACAO 60%"), "intermediacao")
  assert.equal(classificarLancamento("Comissão de intermediação"), "intermediacao")
})

test("classifica taxas, descontos, reembolsos e utilidades como despesa do locador", () => {
  assert.equal(classificarLancamento("TED"), "despesa")
  assert.equal(classificarLancamento("Taxa de transferencia PIX"), "despesa")
  assert.equal(classificarLancamento("REEMBOLSO AO INQUILINO"), "despesa")
  assert.equal(classificarLancamento("DESC. LOCATARIO"), "despesa")
  assert.equal(classificarLancamento("CAGECE agua"), "despesa")
})

// Shape confirmado da extração real do Pompilio maio/2026 (só os campos que a
// reconciliação lê; os demais são preenchidos com valores neutros válidos).
function pompilio(): PrestacaoAnalysis {
  const linha = (apto: string, aluguel: number, desconto: number | null, obs: string | null) => ({
    apto, inquilino: "", aluguel, desconto,
    aluguel_com_desconto: desconto === null ? null : aluguel - desconto,
    garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null,
    total: aluguel, comissao: null, repasse: null, vencimento: "05/2026", observacao: obs, confianca: 1,
  })
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Cesar Rego Imoveis",
    empreendimento: "Galpao Pompilio Gomes",
    competencia: "2026-05",
    plano_extracao: { documento_lido_integralmente: true, secoes_identificadas: [], estrategia: [], alertas: [] },
    receitas_por_imovel: [
      linha("AP0361/1", 8000, 113.27, "Endereco. REEMBOLSO AO INQUILINO DESC. LOCATARIO 113,27"),
      linha("AP0362/2", 6015.38, 0.26, "Endereco. DESCONTO FORNECIDO 0,26"),
    ],
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 14015.38, total_linhas_comissoes: 594.12, total_linhas_repasse: 13409.90,
      comissao_administracao: 594.12,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 605.48,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13409.90,
      repasse_embutido: true,
      confianca: 1,
    },
    totais: { total_receitas: 14015.38, total_comissoes: 594.12, total_repassar: 13409.90 },
    campos_ausentes: [], observacoes: [], confianca_geral: 1,
  }
}

test("Pompilio: receita bruta = 14128.65 e 3 despesas somando 124.63", () => {
  const r = reconciliarResumoDespesas(pompilio())
  assert.equal(r.recebidosEmNomeLocador, 14128.65)
  assert.equal(r.totalComissaoDespesas, 718.75)
  assert.equal(r.totalOutrasComissoesDespesas, 124.63)
  assert.equal(r.outrasComissoesDespesas.length, 3)
  const porDescricao = Object.fromEntries(r.outrasComissoesDespesas.map((d) => [d.descricao, d.valor]))
  assert.equal(porDescricao["Reembolso — AP0361/1"], 113.27)
  assert.equal(porDescricao["Desconto — AP0362/2"], 0.26)
  assert.equal(porDescricao["Taxas e outros retidos"], 11.1)
  assert.equal(r.pendencia, null)
})

test("Pompilio: a equacao de repasse fecha em 13409.90", () => {
  const r = reconciliarResumoDespesas(pompilio())
  const repasse = r.recebidosEmNomeLocador! - 594.12 - r.totalOutrasComissoesDespesas
  assert.ok(Math.abs(repasse - 13409.90) <= 0.01, `esperava 13409.90, veio ${repasse}`)
})

test("resumo sem reembolso e sem descontos por linha nao inventa despesas", () => {
  const base = pompilio()
  const semDescontos: PrestacaoAnalysis = {
    ...base,
    receitas_por_imovel: base.receitas_por_imovel.map((row) => ({ ...row, desconto: null, aluguel_com_desconto: null, observacao: "Endereco." })),
    resumo_financeiro: {
      ...base.resumo_financeiro,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13421.26, // 14015.38 - 594.12 - 0 (so comissao retida)
      total_comissao_despesas: 594.12,
    },
  }
  const r = reconciliarResumoDespesas(semDescontos)
  assert.equal(r.recebidosEmNomeLocador, 14015.38) // sem reembolso, bruto = impresso
  assert.equal(r.outrasComissoesDespesas.length, 0)
  assert.equal(r.pendencia, null)
})

test("residuo negativo suprime a lista e reporta pendencia", () => {
  const base = pompilio()
  // Consolidado retido MENOR que comissao + itens por linha => residuo negativo.
  const inconsistente: PrestacaoAnalysis = {
    ...base,
    resumo_financeiro: { ...base.resumo_financeiro, total_a_repassar: 13900, total_comissao_despesas: 228.65, recebidos_em_nome_locador: 14015.38 },
  }
  const r = reconciliarResumoDespesas(inconsistente)
  assert.equal(r.outrasComissoesDespesas.length, 0)
  assert.ok(r.pendencia && r.pendencia.length > 0)
})
