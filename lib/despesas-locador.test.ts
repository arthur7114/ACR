import assert from "node:assert/strict"
import test from "node:test"
import {
  classificarLancamento,
  ehTarifaBancaria,
  ratearIgualmente,
  ratearTedPorImovel,
  reconciliarResumoDespesas,
  valorTedItemizada,
} from "./despesas-locador.ts"
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

test("Pompilio com acordo de atraso (comissao propria, ja refletida no resumo do documento) nao regride", () => {
  // Shape real confirmado por extracao: LAYOUT C e um razao consolidado — o
  // recebimento atrasado e um lancamento do proprio mes ja embutido no bloco
  // RESUMO impresso (recebidos/comissao/repasse), ao contrario da intermediacao
  // do LOCMAIS (ver teste abaixo). Comissao do acordo NAO deve ser subtraida
  // de novo, senao o residuo fica negativo e apaga as 3 despesas do Pompilio.
  const comAtraso: PrestacaoAnalysis = {
    ...pompilio(),
    acordos_rescisoes_recebidos: [
      {
        tipo: "atraso",
        apto: "AP0363/3",
        inquilino: "Inquilino Atrasado",
        valor: 882.64,
        comissao: 44.13,
        percentual: null,
        competencia_original: "2026-03",
        competencia_recebimento: "2026-05",
        observacao: "Pagamento em atraso.",
        confianca: 0.93,
      },
    ],
  }
  const r = reconciliarResumoDespesas(comAtraso)
  assert.equal(r.recebidosEmNomeLocador, 14128.65)
  assert.equal(r.totalOutrasComissoesDespesas, 124.63)
  assert.equal(r.outrasComissoesDespesas.length, 3)
  assert.equal(r.pendencia, null)
})

// Shape confirmado da extração real do LOCMAIS maio/2026 (campos crus do resumo
// financeiro e da intermediação, obtidos via extractPrestacaoAliveFromPdf).
function locmais(): PrestacaoAnalysis {
  const linha = (apto: string, total: number) => ({
    apto, inquilino: "", aluguel: total, desconto: null, aluguel_com_desconto: null,
    garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null,
    total, comissao: null, repasse: null, vencimento: "05/2026", observacao: null, confianca: 0.9,
  })
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "LOC MAIS Imoveis",
    empreendimento: "LOC MAIS",
    competencia: "2026-05",
    plano_extracao: { documento_lido_integralmente: true, secoes_identificadas: [], estrategia: [], alertas: [] },
    receitas_por_imovel: [linha("SALA 01", 14204.58)],
    acordos_rescisoes_recebidos: [
      {
        tipo: "intermediacao",
        apto: "SALA 05",
        inquilino: "ISI VIAGENS LTDA",
        valor: 900,
        comissao: 540,
        percentual: null,
        competencia_original: "04/2026",
        competencia_recebimento: "05/2026",
        observacao: "Intermediacao de abril de 2026. Total R$ 938,08; repasse R$ 398,08.",
        confianca: 0.9,
      },
    ],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 14204.58,
      total_linhas_comissoes: 994.32,
      total_linhas_repasse: 13210.26,
      comissao_administracao: 994.32,
      outras_comissoes_despesas: [
        { descricao: "CAGECE", valor: 47.6, confianca: 0.82 },
        { descricao: "ENEL", valor: 144.29, confianca: 0.82 },
        { descricao: "ENEL", valor: 307.13, confianca: 0.82 },
        { descricao: "IPTU 2026 GALPÃO 02 (5/7)", valor: 91.39, confianca: 0.82 },
        { descricao: "IPTU 2026 SALA 05 (5/5)", valor: 87.98, confianca: 0.82 },
        { descricao: "IPTU 2026 GALPÃO 05 (5/8)", valor: 87.5, confianca: 0.82 },
        { descricao: "SEGURO SALA 03", valor: 314.01, confianca: 0.82 },
      ],
      total_outras_comissoes_despesas: 1079.9,
      total_comissao_despesas: 2614.22,
      // Bruto ja inclui o valor da intermediacao (938.08) somado ao total da
      // tabela regular (14204.58) — mas a comissao retida sobre ela (540) fica
      // FORA de comissao_administracao. E essa a assimetria que causa o bug.
      recebidos_em_nome_locador: 15142.66,
      total_a_repassar: 12528.44,
      confianca: 0.86,
    },
    totais: { total_receitas: 15142.66, total_comissoes: 994.32, total_repassar: 12528.44 },
    campos_ausentes: [], observacoes: [], confianca_geral: 0.86,
  }
}

test("LOCMAIS: comissao de intermediacao nao vaza pra despesa do locador", () => {
  const r = reconciliarResumoDespesas(locmais())
  // Sem residuo fantasma: a comissao de intermediacao (540) NAO deve aparecer
  // como "Taxas e outros retidos" nem em nenhum outro item de despesa.
  assert.equal(r.outrasComissoesDespesas.length, 7)
  const descricoes = r.outrasComissoesDespesas.map((d) => d.descricao)
  assert.ok(!descricoes.some((d) => /intermedia|540/i.test(d)), `item suspeito encontrado: ${JSON.stringify(descricoes)}`)
  assert.equal(r.totalOutrasComissoesDespesas, 1079.9)
  assert.equal(r.pendencia, null)
  // totalComissaoDespesas alimenta calculateTotals downstream
  // (total_despesas = total_comissao_despesas - comissao_administracao). Se a
  // comissao de intermediacao (540) nao for descontada tambem daqui, o total de
  // despesas exibido na tela volta a incluir a intermediacao, mesmo com a LISTA
  // ja correta — inconsistencia entre lista e total (bug encontrado ao vivo).
  assert.equal(r.totalComissaoDespesas, 2074.22)
})

test("ehTarifaBancaria distingue tarifa do resto das despesas", () => {
  assert.equal(ehTarifaBancaria("TED"), true)
  assert.equal(ehTarifaBancaria("Tarifa bancaria"), true)
  assert.equal(ehTarifaBancaria("TAXA BANCARIA"), true)
  assert.equal(ehTarifaBancaria("Transferencia PIX"), true)
  assert.equal(ehTarifaBancaria("DOC"), true)
  // Nao casa reembolso/desconto/utilidades nem o residuo nao itemizado.
  assert.equal(ehTarifaBancaria("Reembolso — AP01"), false)
  assert.equal(ehTarifaBancaria("Desconto — AP02"), false)
  assert.equal(ehTarifaBancaria("CAGECE agua"), false)
  assert.equal(ehTarifaBancaria("Taxas e outros retidos"), false)
})

test("ratearIgualmente soma exata e distribui a sobra de centavo", () => {
  const r = ratearIgualmente(11.1, 4)
  assert.deepEqual(r, [2.78, 2.78, 2.77, 2.77])
  assert.equal(r.reduce((a, b) => a + b, 0).toFixed(2), "11.10")
  assert.deepEqual(ratearIgualmente(10, 4), [2.5, 2.5, 2.5, 2.5])
  assert.deepEqual(ratearIgualmente(0.03, 2), [0.02, 0.01])
  assert.deepEqual(ratearIgualmente(5.55, 1), [5.55])
  assert.deepEqual(ratearIgualmente(5, 0), [])
})

// Fixture: pompilio (2 imoveis, ambos com total > 0) + uma TED itemizada.
function comTedItemizada(valorTed: number): PrestacaoAnalysis {
  const base = pompilio()
  return {
    ...base,
    resumo_financeiro: {
      ...base.resumo_financeiro,
      outras_comissoes_despesas: [
        { descricao: "Reembolso — AP0361/1", valor: 113.27, confianca: 1 },
        { descricao: "TED", valor: valorTed, confianca: 1 },
        { descricao: "Taxas e outros retidos", valor: 5, confianca: 1 },
      ],
    },
  }
}

test("valorTedItemizada soma so as tarifas bancarias itemizadas", () => {
  assert.equal(valorTedItemizada(comTedItemizada(11.1)), 11.1)
  // Sem TED itemizada => zero (residuo nao conta).
  assert.equal(valorTedItemizada(pompilio()), 0)
})

test("ratearTedPorImovel divide igual entre imoveis com receita e soma a TED", () => {
  const fatias = ratearTedPorImovel(comTedItemizada(11.1))
  assert.equal(fatias.length, 2) // pompilio tem 2 imoveis com total > 0
  assert.deepEqual(fatias.map((f) => f.valor), [5.55, 5.55])
  assert.equal(fatias.reduce((a, f) => a + f.valor, 0).toFixed(2), "11.10")
  assert.deepEqual(fatias.map((f) => f.apto), ["AP0361/1", "AP0362/2"])
})

test("ratearTedPorImovel vazio quando nao ha TED itemizada", () => {
  assert.deepEqual(ratearTedPorImovel(pompilio()), [])
})

test("ratearTedPorImovel ignora imoveis sem receita (total = 0)", () => {
  const base = comTedItemizada(10)
  const comVago: PrestacaoAnalysis = {
    ...base,
    receitas_por_imovel: [
      ...base.receitas_por_imovel,
      { ...base.receitas_por_imovel[0], apto: "AP0363/3", total: 0 },
    ],
  }
  const fatias = ratearTedPorImovel(comVago)
  assert.equal(fatias.length, 2) // o vago (total 0) fica de fora
  assert.equal(fatias.reduce((a, f) => a + f.valor, 0).toFixed(2), "10.00")
})
