import { getOptionalEnv } from "./env"

const BASE_URL = "https://api.egestor.com.br/api"
const RETRY_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504])

type EgestorClientOptions = {
  personalToken: string
  fetchImpl?: typeof fetch
}

export type EgestorCreateResponse = {
  codigo?: number
  codModulo?: number
  descricao?: string
  situacao?: number
  origem?: string
  [key: string]: unknown
}

export class EgestorApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export class EgestorClient {
  private accessToken: string | null = null
  private readonly fetchImpl: typeof fetch
  private readonly personalToken: string

  constructor(options: EgestorClientOptions) {
    this.personalToken = options.personalToken
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async testConnection() {
    await this.getAccessToken()
    return this.request("GET", "/v1/contatos?fields=nome")
  }

  async getContatos(busca?: string) {
    // A API do eGestor pagina (~50/pagina) e IGNORA o parametro de busca, entao
    // percorremos todas as paginas (via data.data + next_page_url) e filtramos
    // localmente. A resposta usa a chave "data" (nao "dados").
    const all: Array<{ codigo: number; nome: string }> = []
    const MAX_PAGES = 30
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ fields: "codigo,nome", orderBy: "nome", page: String(page) })
      const data = await this.request("GET", `/v1/contatos?${params}`)
      const obj = (data ?? {}) as Record<string, unknown>
      const rows = (Array.isArray(data) ? data : (obj.data ?? obj.dados ?? [])) as Array<{ codigo: number; nome: string }>
      all.push(...rows)
      const lastPage = Number(obj.last_page ?? 1)
      if (rows.length === 0 || !obj.next_page_url || page >= lastPage) break
    }
    if (busca) {
      const q = busca.trim().toLowerCase()
      return all.filter((c) => (c.nome ?? "").toLowerCase().includes(q))
    }
    return all
  }

  async getDisponiveis(busca?: string) {
    // "Disponiveis" = contas/caixas do eGestor (ex.: "Sicredi MMC - 06394 - 0").
    // Mesma paginacao/forma dos contatos: a API ignora o filtro do servidor,
    // entao percorremos as paginas e filtramos localmente.
    const all: Array<{ codigo: number; nome: string }> = []
    const MAX_PAGES = 30
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ fields: "codigo,nome", orderBy: "nome", page: String(page) })
      const data = await this.request("GET", `/v1/disponiveis?${params}`)
      const obj = (data ?? {}) as Record<string, unknown>
      const rows = (Array.isArray(data) ? data : (obj.data ?? obj.dados ?? [])) as Array<{ codigo: number; nome: string }>
      all.push(...rows)
      const lastPage = Number(obj.last_page ?? 1)
      if (rows.length === 0 || !obj.next_page_url || page >= lastPage) break
    }
    if (busca) {
      const q = busca.trim().toLowerCase()
      return all.filter((c) => (c.nome ?? "").toLowerCase().includes(q))
    }
    return all
  }

  async createRecebimento(payload: Record<string, unknown>) {
    return this.request("POST", "/v1/recebimentos", payload) as Promise<EgestorCreateResponse>
  }

  async createPagamento(payload: Record<string, unknown>) {
    return this.request("POST", "/v1/pagamentos", payload) as Promise<EgestorCreateResponse>
  }

  async getRecebimento(codigo: number) {
    return this.request("GET", `/v1/recebimentos/${codigo}`)
  }

  async getPagamento(codigo: number) {
    return this.request("GET", `/v1/pagamentos/${codigo}`)
  }

  async uploadDiscoVirtual(input: {
    file: Blob
    fileName: string
    modulo: string
    codModulo: number
    descricao: string
    tags: string[]
  }) {
    const accessToken = await this.getAccessToken()
    const form = new FormData()
    form.append("arquivo", input.file, input.fileName)
    form.append("modulo", input.modulo)
    form.append("codModulo", String(input.codModulo))
    form.append("descricao", input.descricao)
    input.tags.forEach((tag) => form.append("tags[]", tag))

    const response = await this.fetchImpl(`${BASE_URL}/v1/discoVirtual`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    return parseResponse(response)
  }

  private async getAccessToken() {
    if (this.accessToken) return this.accessToken

    const response = await this.fetchImpl(`${BASE_URL}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "personal",
        personal_token: this.personalToken,
      }),
    })

    const payload = await parseResponse(response)
    const token = typeof payload.access_token === "string" ? payload.access_token : null
    if (!token) throw new EgestorApiError("eGestor nao retornou access_token.", response.status, payload)
    this.accessToken = token
    return token
  }

  private async request(method: string, path: string, body?: Record<string, unknown>) {
    const accessToken = await this.getAccessToken()
    const attempts = Number(getOptionalEnv("EGESTOR_MAX_RETRIES", "2")) + 1
    let lastError: EgestorApiError | null = null

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await this.fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      try {
        return await parseResponse(response)
      } catch (error) {
        if (!(error instanceof EgestorApiError)) throw error
        lastError = error
        if (!RETRY_STATUSES.has(error.status) || attempt === attempts) throw error
        await sleep(250 * attempt)
      }
    }

    throw lastError ?? new Error("Falha desconhecida ao chamar eGestor.")
  }
}

async function parseResponse(response: Response) {
  const text = await response.text()
  const payload = text ? parseJson(text) : {}

  if (!response.ok) {
    const message = getErrorMessage(payload) ?? `Erro eGestor HTTP ${response.status}`
    throw new EgestorApiError(message, response.status, payload)
  }

  return payload as Record<string, unknown>
}

function parseJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return typeof record.errMsg === "string"
    ? record.errMsg
    : typeof record.error === "string"
      ? record.error
      : null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
