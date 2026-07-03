import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { EgestorClient } from "./egestor-client.ts"
import { buildEgestorDrafts, buildLancamentoUpdate } from "./egestor.ts"

function createAnalysis(overrides: Partial<PackageAnalysis> = {}): PackageAnalysis {
  return {
    documents: [],
    prestacao: null,
    repasse: { valor: 900, data: "2026-03-10", origem_nome: null, destino_nome: null, destino_banco: null, destino_agencia: null, destino_conta: null, protocolo: null, campos_ausentes: [], observacoes: [], confianca_geral: 0.9 },
    despesas: {
      despesas: [
        { tipo: "energia", fornecedor: "ENEL", referencia: null, vencimento: null, valor: 120, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
        { tipo: "energia", fornecedor: "ENEL", referencia: null, vencimento: null, valor: 80, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
        { tipo: "agua", fornecedor: "CAGECE", referencia: null, vencimento: null, valor: 50, endereco: null, unidade_consumidora: null, pago_em: null, pago_por: null, observacao: null, confianca: 0.9 },
      ],
      total_despesas: 250,
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.9,
    },
    reajuste: null,
    totals: {
      total_receitas: 1000,
      total_aluguel: 1000,
      total_garagem: 0,
      total_agua: 0,
      total_iptu: 0,
      total_seguro_incendio: 0,
      total_comissoes: 100,
      total_repasse_bruto: 900,
      total_despesas: 250,
      total_comissao_despesas: 350,
      total_a_repassar: 650,
      valor_comprovado: 640,
      diferenca_repasse: -10,
      taxa_administracao_percent: 10,
      taxa_intermediacao_percent: 0,
      comissao_administracao_calculada: 100,
      base_comissao_administracao: 1000,
      comissao_realizada_percent: 10,
    },
    parecer: { status: "aprovado_tecnico", resumo: "ok", motivos: [], confianca: 1, requer_revisao_humana: false },
    rechecks: [],
    guardrails: [],
    fechamentoId: "fechamento",
    storagePath: null,
    ...overrides,
  }
}

test("gera previa consolidada com recebimento bruto, comissao e despesas agrupadas", () => {
  const drafts = buildEgestorDrafts(createAnalysis())

  assert.deepEqual(
    drafts.map((draft) => [draft.tipo, draft.categoria, draft.valor]),
    [
      ["recebimento", "repasse_mensal", 1000],
      ["pagamento", "comissao_administrativa", 100],
      ["pagamento", "energia", 200],
      ["pagamento", "agua", 50],
    ],
  )
})

test("conta somente_recebimento lanca apenas o recebimento (sem comissao nem despesas)", () => {
  const drafts = buildEgestorDrafts(createAnalysis(), { somenteRecebimento: true })

  assert.deepEqual(
    drafts.map((draft) => [draft.tipo, draft.categoria, draft.valor]),
    [["recebimento", "repasse_mensal", 1000]],
  )
})

test("usa total recebido bruto mesmo quando nao existe comprovante", () => {
  const drafts = buildEgestorDrafts(createAnalysis({
    totals: { ...createAnalysis().totals, valor_comprovado: null, total_a_repassar: 650 },
  }))

  assert.equal(drafts[0].valor, 1000)
})

function jsonResponse(payload: Record<string, unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  })
}

test("cliente eGestor autentica e consulta recebimento", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith("/oauth/access_token")) return jsonResponse({ access_token: "access-token" })
    return jsonResponse({ codigo: 123, situacao: 1 })
  }

  const response = await new EgestorClient({ personalToken: "personal-token", fetchImpl: fetchMock }).getRecebimento(123)

  assert.equal(response.codigo, 123)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, "https://api.egestor.com.br/api/oauth/access_token")
  assert.equal(calls[1].url, "https://api.egestor.com.br/api/v1/recebimentos/123")
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer access-token")
})

test("cliente eGestor tenta novamente em rate limit e erro 5xx", async () => {
  process.env.EGESTOR_MAX_RETRIES = "2"
  const statuses = [429, 500, 200]
  const calls: string[] = []
  const fetchMock: typeof fetch = async (url) => {
    const path = String(url)
    if (path.endsWith("/oauth/access_token")) return jsonResponse({ access_token: "access-token" })
    calls.push(path)
    const status = statuses.shift() ?? 200
    if (status !== 200) return jsonResponse({ errMsg: `HTTP ${status}` }, { status })
    return jsonResponse({ codigo: 456 })
  }

  const response = await new EgestorClient({ personalToken: "personal-token", fetchImpl: fetchMock }).getPagamento(456)

  assert.equal(response.codigo, 456)
  assert.equal(calls.length, 3)
  delete process.env.EGESTOR_MAX_RETRIES
})

test("cliente eGestor cria recebimento com payload autenticado", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith("/oauth/access_token")) return jsonResponse({ access_token: "access-token" })
    return jsonResponse({ codigo: 789, codModulo: 789 })
  }

  const client = new EgestorClient({ personalToken: "personal-token", fetchImpl: fetchMock })
  const response = await client.createRecebimento({ descricao: "ACR teste", valor: 10 })

  assert.equal(response.codigo, 789)
  assert.equal(calls[1].url, "https://api.egestor.com.br/api/v1/recebimentos")
  assert.equal(calls[1].init?.method, "POST")
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { descricao: "ACR teste", valor: 10 })
})

test("buildLancamentoUpdate atualiza descricao e sincroniza no payload", () => {
  const atual = { descricao: "Antiga", valor: 100, tags: ["ACR"], payload: { descricao: "Antiga", valor: 100 } }
  const result = buildLancamentoUpdate(atual, { descricao: "Nova descricao" })
  assert.equal(result.descricao, "Nova descricao")
  assert.equal(result.payload.descricao, "Nova descricao")
  assert.equal(result.valor, 100)
})

test("buildLancamentoUpdate atualiza valor e sincroniza no payload", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: { valor: 100 } }
  const result = buildLancamentoUpdate(atual, { valor: 250.5 })
  assert.equal(result.valor, 250.5)
  assert.equal(result.payload.valor, 250.5)
})

test("buildLancamentoUpdate rejeita valor nao positivo", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: {} }
  assert.throws(() => buildLancamentoUpdate(atual, { valor: 0 }), /valor/i)
  assert.throws(() => buildLancamentoUpdate(atual, { valor: -5 }), /valor/i)
})

test("buildLancamentoUpdate atualiza etiquetas e rejeita lista vazia", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: { tags: ["ACR"] } }
  const result = buildLancamentoUpdate(atual, { tags: ["ACR", "MARACANAU"] })
  assert.deepEqual(result.tags, ["ACR", "MARACANAU"])
  assert.deepEqual(result.payload.tags, ["ACR", "MARACANAU"])
  assert.throws(() => buildLancamentoUpdate(atual, { tags: [] }), /etiqueta/i)
})
