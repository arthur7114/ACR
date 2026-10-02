import assert from "node:assert/strict"
import test from "node:test"

import { montarLogAprovacao } from "./aprovacao-log"

const CONTEXTO = { empreendimento: "Grand Messejana II", competencia: "2026-08-01" }

test("aprovação com cadastro e reajuste aplicados vira uma notificação com os números", () => {
  const log = montarLogAprovacao(CONTEXTO, {
    reajustes: [{ apto: "17", valorAnterior: 628.06, valorNovo: 655.96, resultado: "aplicado", detalhe: "628.06 -> 655.96 a partir de 08/2026" }],
    cadastro: [
      { imovelId: "a", unidade: "25", statusAnterior: "ocupado", statusNovo: "inadimplente", inquilinoAnterior: "GEISA", inquilinoNovo: "GEISA" },
      { imovelId: "b", unidade: "6", statusAnterior: "ocupado", statusNovo: "vago", inquilinoAnterior: "MARIANA", inquilinoNovo: null },
    ],
    cadastroErro: null,
  })
  assert.equal(log.tipo, "aprovacao_cadastro")
  assert.equal(log.titulo, "Aprovação Grand Messejana II 08/2026: cadastro atualizado em 2 unidades, 1 aluguel atualizado")
  assert.match(log.corpo, /25: ocupado \(GEISA\) → inadimplente \(GEISA\)/)
  assert.match(log.corpo, /6: ocupado \(MARIANA\) → vago/)
  assert.match(log.corpo, /apto 17: 628\.06 -> 655\.96/)
})

test("falha na atualização do cadastro vira notificação de erro, não silêncio", () => {
  const log = montarLogAprovacao(CONTEXTO, { reajustes: [], cadastro: [], cadastroErro: "relation imovel_competencias does not exist" })
  assert.equal(log.tipo, "aprovacao_cadastro_falhou")
  assert.equal(log.titulo, "Aprovação Grand Messejana II 08/2026: cadastro NÃO atualizado")
  assert.match(log.corpo, /relation imovel_competencias does not exist/)
  assert.match(log.corpo, /Imóveis|cadastro/)
})

test("reajuste divergente aparece no log como pendência de decisão", () => {
  const log = montarLogAprovacao(CONTEXTO, {
    reajustes: [{ apto: "17", valorAnterior: 628.06, valorNovo: 655.96, resultado: "cadastro_divergente", detalhe: "Cadastro está em 700.00, não em 628.06 como o relatório declara." }],
    cadastro: [],
    cadastroErro: null,
  })
  assert.equal(log.tipo, "aprovacao_cadastro_pendente")
  assert.match(log.titulo, /1 aluguel pendente de decisão/)
  assert.match(log.corpo, /apto 17: Cadastro está em 700\.00/)
})

test("aprovação sem nada a mudar ainda deixa rastro", () => {
  const log = montarLogAprovacao(CONTEXTO, { reajustes: [], cadastro: [], cadastroErro: null })
  assert.equal(log.tipo, "aprovacao_cadastro")
  assert.equal(log.titulo, "Aprovação Grand Messejana II 08/2026: cadastro já refletia o documento")
})

test("prazo do contrato novo lido do relatorio aparece no log da aprovacao", () => {
  const log = montarLogAprovacao(CONTEXTO, {
    reajustes: [],
    cadastro: [],
    cadastroErro: null,
    prazos: [
      {
        apto: "26",
        inquilino: "LOCATARIO NOVO",
        inicio: "2026-08-11",
        termino: "2029-02-10",
        resultado: "aplicado",
        detalhe: "15/09/25 a 14/03/28 (LOCATARIO ANTERIOR) -> 11/08/26 a 10/02/29 (LOCATARIO NOVO).",
      },
      { apto: "99", inquilino: "FULANO", inicio: "2026-08-01", termino: null, resultado: "sem_imovel", detalhe: "Nenhum imóvel ativo com essa unidade no empreendimento." },
    ],
  })
  assert.equal(log.tipo, "aprovacao_cadastro_pendente")
  assert.match(log.titulo, /1 prazo de contrato atualizado, prazo de contrato pendente/)
  assert.match(log.corpo, /Prazos de contrato atualizados[\s\S]*apto 26: .*-> 11\/08\/26 a 10\/02\/29/)
  assert.match(log.corpo, /Prazos de contrato não aplicados[\s\S]*apto 99/)
})
