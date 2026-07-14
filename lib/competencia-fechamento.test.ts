import assert from "node:assert/strict"
import test from "node:test"
import {
  formatCompetenciaMes,
  normalizeCompetenciaMes,
  resolveReceitaCompetencias,
} from "./competencia-fechamento.ts"

test("Joao Cordeiro: preserva marco como competencia original de aluguel recebido em maio", () => {
  const result = resolveReceitaCompetencias(
    {
      vencimento: "03/2026",
      observacao: null,
    },
    "2026-05",
  )

  assert.deepEqual(result, {
    competencia_original: "2026-03",
    competencia_recebimento: "2026-05",
    dia_vencimento: null,
  })
})

test("Terreno Castelao: separa o dia 10 da competencia de marco informada na observacao", () => {
  const result = resolveReceitaCompetencias(
    {
      vencimento: "10",
      observacao: "VIGÊNCIA MARÇO/2026. IPTU 3/11.",
    },
    "05/2026",
  )

  assert.deepEqual(result, {
    competencia_original: "2026-03",
    competencia_recebimento: "2026-05",
    dia_vencimento: 10,
  })
})

test("nao usa a referencia de IPTU como competencia original do aluguel", () => {
  const result = resolveReceitaCompetencias(
    { vencimento: "10", observacao: "IPTU ref. 05/2026, parcela 3/11." },
    "2026-05",
  )

  assert.equal(result.competencia_original, null)
  assert.equal(result.dia_vencimento, 10)
})

test("nao usa IPTU referente a mes/ano como competencia do aluguel", () => {
  const result = resolveReceitaCompetencias(
    { vencimento: "10", observacao: "IPTU referente a 05/2026; parcela 3/11." },
    "2026-05",
  )

  assert.equal(result.competencia_original, null)
})

test("nao usa referencia de IPTU distante como competencia do aluguel", () => {
  const result = resolveReceitaCompetencias({
    vencimento: "10",
    observacao: "IPTU cobrado do inquilino e repassado à prefeitura referente a 05/2026",
  }, "2026-05")
  assert.equal(result.competencia_original, null)
})

test("aceita referencia generica quando o segmento nao descreve outro encargo", () => {
  assert.equal(resolveReceitaCompetencias({ observacao: "Pagamento referente a 03/2026" }, "2026-05").competencia_original, "2026-03")
})

test("GM II: numero 10 isolado e apenas dia de vencimento e nao vira competencia", () => {
  const result = resolveReceitaCompetencias(
    {
      vencimento: "10",
      observacao: null,
    },
    "2026-05",
  )

  assert.equal(result.competencia_original, null)
  assert.equal(result.competencia_recebimento, "2026-05")
  assert.equal(result.dia_vencimento, 10)
})

test("prioriza a competencia original explicita e aceita formatos internos legados", () => {
  const result = resolveReceitaCompetencias(
    {
      competencia_original: "2026-04-01",
      competencia_recebimento: "05/2026",
      dia_vencimento: 8,
      vencimento: "10",
      observacao: "Referencia 03/2026",
    },
    "2026-06",
  )

  assert.deepEqual(result, {
    competencia_original: "2026-04",
    competencia_recebimento: "2026-05",
    dia_vencimento: 8,
  })
})

test("rejeita referencias incompletas ou meses invalidos", () => {
  assert.equal(normalizeCompetenciaMes("10"), null)
  assert.equal(normalizeCompetenciaMes("13/2026"), null)
  assert.equal(normalizeCompetenciaMes("2026-00"), null)
  assert.equal(normalizeCompetenciaMes("2026"), null)
})

test("formata a competencia canonica para exibicao brasileira", () => {
  assert.equal(formatCompetenciaMes("2026-03"), "03/2026")
  assert.equal(formatCompetenciaMes(null), "Não informada")
})

test("separa competencia e dia quando o legado contem uma data completa", () => {
  assert.deepEqual(resolveReceitaCompetencias({ vencimento: "10/05/2026" }, "05/2026"), {
    competencia_original: "2026-05",
    competencia_recebimento: "2026-05",
    dia_vencimento: 10,
  })
})
