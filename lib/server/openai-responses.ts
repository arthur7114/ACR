import type OpenAI from "openai"

const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 900

type ResponsesCreateParams = Parameters<OpenAI["responses"]["create"]>[0]
type ResponsesCreateResult = Awaited<ReturnType<OpenAI["responses"]["create"]>>

export async function createResponseWithRetry(
  client: OpenAI,
  params: ResponsesCreateParams,
): Promise<ResponsesCreateResult> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await client.responses.create(params)
    } catch (error) {
      lastError = error
      if (!isRetryableOpenAIError(error) || attempt === MAX_ATTEMPTS) break
      await wait(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  throw normalizeOpenAIError(lastError)
}

export function normalizeOpenAIError(error: unknown) {
  if (!isOpenAIErrorShape(error)) return error

  const message = error.message ?? ""
  const status = error.status

  if (status === 522 || message.includes("522 status code")) {
    return new Error("A OpenAI interrompeu a analise sem retornar corpo de resposta. Tente reprocessar o pacote.")
  }

  if (status && status >= 500) {
    return new Error("A OpenAI retornou instabilidade temporaria durante a analise. Tente reprocessar o pacote.")
  }

  if (status === 429) {
    return new Error("A OpenAI limitou temporariamente as chamadas. Aguarde alguns segundos e tente novamente.")
  }

  return error
}

function isRetryableOpenAIError(error: unknown) {
  if (!isOpenAIErrorShape(error)) return false

  const message = error.message ?? ""
  const status = error.status

  return status === 408 || status === 409 || status === 429 || status === 522 || Boolean(status && status >= 500) || message.includes("522 status code")
}

function isOpenAIErrorShape(error: unknown): error is { status?: number; message?: string } {
  return typeof error === "object" && error !== null
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
