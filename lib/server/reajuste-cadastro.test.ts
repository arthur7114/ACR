import assert from "node:assert/strict"
import test from "node:test"

import type { ReajusteAnalysis } from "@/lib/prestacao-types"
import {
  decidirCadastro,
  encontrarImovel,
  mesAnterior,
  mesDaVigencia,
  planejarVigencia,
  reajustesAplicaveis,
  type ReajusteAplicavel,
} from "./reajuste-cadastro"

// Canário GM II ago/2026 (pedido do cliente em 2026-09-17): o relatório de
// reajuste declara apto 17 de R$ 628,06 para R$ 655,96 (IPCA 4,44%) e uma
// rescisão do apto 11 no mesmo documento. Só o primeiro é reajuste.
const RELATORIO_GM2_AGOSTO = {
  itens: [
    {
      apto: "17",
      inquilino: "ANDRÉ CASSIANO ALCANTARA",
      descricao: "Reajuste de aluguel",
      valor_anterior: 628.06,
      valor_novo: 655.96,
      percentual: 4.44302,
      vigencia: "2026-08",
      observacao: "Reajuste por IPCA (IBGE), período 08/2025 a 07/2026.",
      confianca: 0.98,
    },
    {
      apto: "11",
      inquilino: "ALFREDO BEZERRA DE HOLANDA NETO",
      descricao: "Rescisao",
      valor_anterior: null,
      valor_novo: 1175,
      percentual: null,
      vigencia: "2025-06-09 a 2027-12-08",
      observacao: "Data da rescisão: 2026-08-02.",
      confianca: 0.97,
    },
  ],
  campos_ausentes: [],
  observacoes: [],
  confianca_geral: 0.97,
}

const APTO_17: ReajusteAplicavel = {
  apto: "17",
  inquilino: "ANDRÉ CASSIANO ALCANTARA",
  valorAnterior: 628.06,
  valorNovo: 655.96,
  percentual: 4.44302,
  vigencia: "2026-08-01",
  observacao: null,
}

test("GM II ago/2026: só o reajuste do apto 17 é aplicável; a rescisão fica de fora", () => {
  const itens = reajustesAplicaveis(RELATORIO_GM2_AGOSTO, "2026-08-01")
  assert.equal(itens.length, 1)
  assert.equal(itens[0].apto, "17")
  assert.equal(itens[0].valorAnterior, 628.06)
  assert.equal(itens[0].valorNovo, 655.96)
  assert.equal(itens[0].vigencia, "2026-08-01")
})

test("sem 'de' e 'para' positivos e diferentes não há reajuste", () => {
  const base = RELATORIO_GM2_AGOSTO.itens[0]
  const relatorio = (item: Partial<ReajusteAnalysis["itens"][number]>) => ({
    ...RELATORIO_GM2_AGOSTO,
    itens: [{ ...base, ...item }],
  })
  assert.equal(reajustesAplicaveis(relatorio({ valor_anterior: null }), "2026-08-01").length, 0)
  assert.equal(reajustesAplicaveis(relatorio({ valor_novo: 0 }), "2026-08-01").length, 0)
  assert.equal(reajustesAplicaveis(relatorio({ valor_novo: 628.06 }), "2026-08-01").length, 0)
  assert.equal(reajustesAplicaveis(relatorio({ apto: null }), "2026-08-01").length, 0)
  assert.equal(reajustesAplicaveis(null, "2026-08-01").length, 0)
})

test("vigência do item vem do documento; sem mês legível, cai na competência", () => {
  assert.equal(mesDaVigencia("2026-08"), "2026-08-01")
  assert.equal(mesDaVigencia("2026-08-15"), "2026-08-01")
  assert.equal(mesDaVigencia("08/2026"), "2026-08-01")
  assert.equal(mesDaVigencia("2025-06-09 a 2027-12-08"), null)
  const base = RELATORIO_GM2_AGOSTO.itens[0]
  const [item] = reajustesAplicaveis(
    { ...RELATORIO_GM2_AGOSTO, itens: [{ ...base, vigencia: "agosto" }] },
    "2026-08-01",
  )
  assert.equal(item.vigencia, "2026-08-01")
})

test("mês anterior atravessa o ano", () => {
  assert.equal(mesAnterior("2026-08-01"), "2026-07-01")
  assert.equal(mesAnterior("2026-01-01"), "2025-12-01")
})

test("imóvel casa pela unidade ou pelo código, com normalização", () => {
  const imoveis = [
    { id: "a", codigo_imobiliaria: "GM2-17", unidade: "17", valor_aluguel_esperado: 628.06 },
    { id: "b", codigo_imobiliaria: "GA0002", unidade: "Galpão 02", valor_aluguel_esperado: null },
  ]
  assert.equal(encontrarImovel("17", imoveis)?.id, "a")
  assert.equal(encontrarImovel("APTO 99", imoveis), null)
})

test("cadastro: só troca quando ainda está no valor anterior ou vazio", () => {
  const imovel = (valor: number | null) => ({ id: "a", codigo_imobiliaria: "17", unidade: "17", valor_aluguel_esperado: valor })
  assert.equal(decidirCadastro(APTO_17, imovel(628.06)), "aplicado")
  assert.equal(decidirCadastro(APTO_17, imovel(null)), "aplicado")
  assert.equal(decidirCadastro(APTO_17, imovel(655.96)), "ja_aplicado")
  // Cadastro em outro valor: o "de -> para" do documento não bate, decisão de gente.
  assert.equal(decidirCadastro(APTO_17, imovel(700)), "cadastro_divergente")
  assert.equal(decidirCadastro(APTO_17, null), "sem_imovel")
})

test("vigência aberta antes do reajuste é encerrada no mês anterior e outra abre no mês", () => {
  const plano = planejarVigencia(APTO_17, [
    { id: "v1", vigencia_inicio: "2025-08-01", vigencia_fim: null, modelo_receita: "fixo", aluguel_contratado: 628.06 },
  ])
  assert.deepEqual(plano, { acao: "encerrar_e_abrir", encerrarId: "v1", fimAnterior: "2026-07-01", fimNovo: null })
})

test("vigência que já começa no mês do reajuste só troca o valor", () => {
  const plano = planejarVigencia(APTO_17, [
    { id: "v0", vigencia_inicio: "2025-08-01", vigencia_fim: "2026-07-01", modelo_receita: "fixo", aluguel_contratado: 628.06 },
    { id: "v1", vigencia_inicio: "2026-08-01", vigencia_fim: null, modelo_receita: "fixo", aluguel_contratado: 628.06 },
  ])
  assert.deepEqual(plano, { acao: "atualizar", id: "v1" })
})

test("vigência já no valor novo não mexe; em outro valor ou receita variável, diverge", () => {
  const nada = planejarVigencia(APTO_17, [
    { id: "v1", vigencia_inicio: "2026-08-01", vigencia_fim: null, modelo_receita: "fixo", aluguel_contratado: 655.96 },
  ])
  assert.deepEqual(nada, { acao: "nada" })

  const outro = planejarVigencia(APTO_17, [
    { id: "v1", vigencia_inicio: "2026-01-01", vigencia_fim: null, modelo_receita: "fixo", aluguel_contratado: 700 },
  ])
  assert.equal(outro.acao, "divergente")

  const airbnb = planejarVigencia(APTO_17, [
    { id: "v1", vigencia_inicio: "2026-01-01", vigencia_fim: null, modelo_receita: "variavel", aluguel_contratado: null },
  ])
  assert.equal(airbnb.acao, "divergente")
})

test("sem vigência cobrindo o mês, abre uma até a próxima existente", () => {
  const ateProxima = planejarVigencia(APTO_17, [
    { id: "v2", vigencia_inicio: "2026-11-01", vigencia_fim: null, modelo_receita: "fixo", aluguel_contratado: 700 },
  ])
  assert.deepEqual(ateProxima, { acao: "abrir", fim: "2026-10-01" })
  assert.deepEqual(planejarVigencia(APTO_17, []), { acao: "abrir", fim: null })
})
