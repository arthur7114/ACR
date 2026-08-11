import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis, PrestacaoAnalysis } from "@/lib/prestacao-types"
import { EgestorClient } from "./egestor-client.ts"
import {
  buildAutomaticOriginKey,
  buildEgestorDrafts,
  buildLancamentoUpdate,
  buildManualOriginKey,
  summarizeAttachmentAttempts,
} from "./egestor.ts"

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

test("chaves de origem mantem automatico idempotente e manuais independentes", () => {
  assert.equal(
    buildAutomaticOriginKey("recebimento", "repasse_mensal"),
    "auto:recebimento:repasse_mensal",
  )
  const first = buildManualOriginKey()
  const second = buildManualOriginKey()
  assert.match(first, /^manual:[0-9a-f-]{36}$/)
  assert.notEqual(first, second)
})

// Prestacao minima: buildEgestorDrafts so le outras_comissoes_despesas da TED.
function prestacaoComTed(valorTed: number): PrestacaoAnalysis {
  return {
    resumo_financeiro: {
      outras_comissoes_despesas: [
        { descricao: "Reembolso — AP01", valor: 50, confianca: 1 },
        { descricao: "TED", valor: valorTed, confianca: 1 },
        { descricao: "Taxas e outros retidos", valor: 3, confianca: 1 },
      ],
    },
  } as unknown as PrestacaoAnalysis
}

test("TED itemizada vira uma despesa agregada no eGestor (valor cheio)", () => {
  const drafts = buildEgestorDrafts(createAnalysis({ prestacao: prestacaoComTed(11.1) }))
  const ted = drafts.filter((d) => d.descricao === "Tarifa bancaria (TED)")
  assert.equal(ted.length, 1)
  assert.deepEqual([ted[0].tipo, ted[0].categoria, ted[0].valor], ["pagamento", "outras_despesas", 11.1])
})

test("conta somente_recebimento nao lanca a TED", () => {
  const drafts = buildEgestorDrafts(createAnalysis({ prestacao: prestacaoComTed(11.1) }), { somenteRecebimento: true })
  assert.ok(!drafts.some((d) => d.descricao === "Tarifa bancaria (TED)"))
})

test("sem TED itemizada nao gera despesa de tarifa", () => {
  const drafts = buildEgestorDrafts(createAnalysis({ prestacao: prestacaoComTed(0) }))
  assert.ok(!drafts.some((d) => d.descricao === "Tarifa bancaria (TED)"))
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

test("um documento quebrado não bloqueia o anexo dos demais: sucesso parcial fica pendente com detalhe", () => {
  const resumo = summarizeAttachmentAttempts([
    { nomeArquivo: "1. Prestação.pdf", ok: false, motivo: "Documento nao encontrado no Storage." },
    { nomeArquivo: "2. Repasse.pdf", ok: true },
  ])
  assert.equal(resumo.status, "pendente")
  assert.match(resumo.mensagem ?? "", /1 de 2/)
  assert.match(resumo.mensagem ?? "", /1\. Prestação\.pdf/)
  assert.match(resumo.mensagem ?? "", /Documento nao encontrado no Storage\./)
})

test("todos os documentos anexados marca enviado sem mensagem", () => {
  const resumo = summarizeAttachmentAttempts([
    { nomeArquivo: "1. Prestação.pdf", ok: true },
    { nomeArquivo: "2. Repasse.pdf", ok: true },
  ])
  assert.equal(resumo.status, "enviado")
  assert.equal(resumo.mensagem, null)
})

test("todos os documentos falham mantém pendente com o motivo mais recente por arquivo", () => {
  const resumo = summarizeAttachmentAttempts([
    { nomeArquivo: "1. Prestação.pdf", ok: false, motivo: "Documento nao encontrado no Storage." },
    { nomeArquivo: "2. Repasse.pdf", ok: false, motivo: "Documento nao encontrado no Storage." },
  ])
  assert.equal(resumo.status, "pendente")
  assert.match(resumo.mensagem ?? "", /0 de 2/)
})

test("nenhum documento no fechamento não gera divisão por zero nem status enviado falso", () => {
  const resumo = summarizeAttachmentAttempts([])
  assert.equal(resumo.status, "pendente")
  assert.match(resumo.mensagem ?? "", /nenhum documento/i)
})
