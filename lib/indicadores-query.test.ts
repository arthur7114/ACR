import assert from "node:assert/strict"
import test from "node:test"
import {
  IndicadoresQueryValidationError,
  parseIndicadoresQuery,
} from "./indicadores-query.ts"

const EMPRESA_ID = "ACR"
const EMPREENDIMENTO_ID = "22222222-2222-4222-8222-222222222222"
const IMOVEL_ID = "33333333-3333-4333-8333-333333333333"

test("aceita somente os quatro parâmetros normalizados da API", () => {
  const params = new URLSearchParams({
    competencia: "2026-05-01",
    empresaId: EMPRESA_ID,
    empreendimentoId: EMPREENDIMENTO_ID,
    imovelId: IMOVEL_ID,
  })

  assert.deepEqual(parseIndicadoresQuery(params), {
    competencia: "2026-05-01",
    empresaId: EMPRESA_ID,
    empreendimentoId: EMPREENDIMENTO_ID,
    imovelId: IMOVEL_ID,
  })
})

test("aceita consulta sem filtros para usar a última competência disponível", () => {
  assert.deepEqual(parseIndicadoresQuery(new URLSearchParams()), {})
})

test("aceita tag segura da empresa eGestor sem exigir UUID", () => {
  assert.deepEqual(parseIndicadoresQuery(new URLSearchParams({ empresaId: "MMC" })), {
    empresaId: "MMC",
  })
})

test("rejeita parâmetro desconhecido", () => {
  const params = new URLSearchParams({ competencia: "2026-05-01", tab: "overview" })

  assert.throws(
    () => parseIndicadoresQuery(params),
    (error) => error instanceof IndicadoresQueryValidationError && error.statusCode === 400,
  )
})

test("rejeita qualquer parâmetro duplicado, mesmo com o mesmo valor", () => {
  const values = {
    competencia: "2026-05-01",
    empresaId: EMPRESA_ID,
    empreendimentoId: EMPREENDIMENTO_ID,
    imovelId: IMOVEL_ID,
  }

  for (const [key, value] of Object.entries(values)) {
    const params = new URLSearchParams()
    params.append(key, value)
    params.append(key, value)

    assert.throws(
      () => parseIndicadoresQuery(params),
      (error) => error instanceof IndicadoresQueryValidationError && error.statusCode === 400,
      `deveria rejeitar duplicidade de ${key}`,
    )
  }
})

test("exige competência no primeiro dia de um mês real", () => {
  for (const invalid of ["2026-05", "2026-05-02", "2026-13-01", "05/2026", ""]) {
    const params = new URLSearchParams({ competencia: invalid })

    assert.throws(
      () => parseIndicadoresQuery(params),
      (error) => error instanceof IndicadoresQueryValidationError && error.statusCode === 400,
      `deveria rejeitar competencia=${JSON.stringify(invalid)}`,
    )
  }
})

test("aceita somente tags de empresa não vazias e sem caracteres de controle ou injeção", () => {
  for (const invalid of ["", "../MMC", "MMC<script>", "MMC&empreendimentoId=outro"]) {
    const params = new URLSearchParams({ empresaId: invalid })

    assert.throws(
      () => parseIndicadoresQuery(params),
      (error) => error instanceof IndicadoresQueryValidationError && error.statusCode === 400,
      `deveria rejeitar empresaId=${JSON.stringify(invalid)}`,
    )
  }
})

test("exige UUID válido em empreendimento e imóvel", () => {
  for (const key of ["empreendimentoId", "imovelId"] as const) {
    const params = new URLSearchParams({ [key]: "nao-e-uuid" })

    assert.throws(
      () => parseIndicadoresQuery(params),
      (error) => error instanceof IndicadoresQueryValidationError && error.statusCode === 400,
      `deveria rejeitar ${key}`,
    )
  }
})
