import assert from "node:assert/strict"
import test from "node:test"

import { mapAcordoRecebidoParaAgregacao } from "./indicadores.ts"
import { resolverRecebimentoLegado } from "@/lib/recebimentos-extraordinarios"

// Regressao: o mapeamento do loader precisa preservar TODOS os campos que o
// resolvedor canonico consulta. Quando ele descartava inquilino e confianca,
// todo acordo resolvia pendente no caminho dos indicadores e a comissao de
// intermediacao aparecia como 0,00, enquanto a Revisao exibia o valor correto.
test("mapeamento do loader preserva o que o resolvedor canonico precisa", () => {
  const item = {
    tipo: "intermediacao" as const,
    apto: "204",
    inquilino: "LOCATARIO",
    valor: 650,
    aluguel: 650,
    garagem: 25,
    ajuste: null,
    agua: 47.6,
    iptu: 3.84,
    total_recebido: 726.44,
    repasse: 321.44,
    comissao: 405,
    percentual: 60,
    competencia_original: "2026-06",
    competencia_recebimento: "2026-07",
    observacao: "IPTU (7/12)",
    confianca: 0.94,
  }

  const mapeado = mapAcordoRecebidoParaAgregacao(item)
  const resolucao = resolverRecebimentoLegado(mapeado)

  assert.equal(resolucao.status, "resolvido")
  if (resolucao.status !== "resolvido") return
  assert.equal(resolucao.comissao, 405)
  assert.equal(resolucao.baseComissionavel, 675)
  assert.equal(resolucao.percentualRealizado, 60)
})

test("mapeamento preserva a ausencia de vinculo para o guard fail-closed", () => {
  const fantasma = {
    tipo: "intermediacao" as const,
    apto: null,
    inquilino: null,
    valor: 255.9,
    comissao: 127.95,
    percentual: 50,
    competencia_original: "2026-06",
    competencia_recebimento: "2026-07",
    observacao: "Base inferida pelo OCR.",
    confianca: 0.55,
  }

  const resolucao = resolverRecebimentoLegado(mapAcordoRecebidoParaAgregacao(fantasma))
  assert.equal(resolucao.status, "pendente")
})
