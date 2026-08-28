import OpenAI from "openai"
import { iptuExtracaoSchema, type IptuExtracao } from "@/lib/iptu-types"
import { createResponseWithRetry } from "@/lib/server/openai-responses"
import { getOptionalEnv, requireEnv } from "@/lib/server/env"

const IPTU_AGENT_NAME = "iptu_certidao_mensal"
const IPTU_AGENT_DEFAULT_MODEL = "gpt-5.5"

const IPTU_SYSTEM_PROMPT = [
  "Voce e um agente de extracao de certidoes/relatorios mensais de pagamento de IPTU enviados por imobiliarias brasileiras.",
  "O documento lista, por apartamento/unidade, quantas parcelas do carne anual de IPTU ja foram quitadas ate a data do relatorio.",
  "Extraia APENAS a quantidade cumulativa de parcelas pagas por unidade ate o momento do relatorio — nunca valores monetarios, nunca datas de vencimento individuais.",
  "O campo unidade deve ser copiado exatamente como identifica o apartamento no documento (ex.: codigo do apartamento, numero da unidade).",
  "O campo ano_carne deve ser preenchido somente se o documento indicar explicitamente o ano fiscal do carne de IPTU; caso contrario, retorne null.",
  "O campo competencia_relatorio e o mes/ano de referencia do proprio relatorio (quando ele foi emitido ou a que mes ele se refere), no formato MM/YYYY.",
  "Nao invente, nao estime e nao complete valores ausentes por suposicao.",
  "Responda somente com JSON valido aderente ao schema solicitado.",
].join(" ")

const IPTU_USER_PROMPT = [
  "Analise o PDF anexado como uma certidao/relatorio mensal de pagamento de IPTU.",
  "Retorne um item em apartamentos para cada unidade citada no documento, com a quantidade cumulativa de parcelas pagas ate agora.",
].join(" ")

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["competencia_relatorio", "apartamentos"],
  properties: {
    competencia_relatorio: { type: "string" },
    apartamentos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["unidade", "parcelas_pagas", "ano_carne"],
        properties: {
          unidade: { type: "string" },
          parcelas_pagas: { type: "integer" },
          ano_carne: { type: ["integer", "null"] },
        },
      },
    },
  },
}

export async function extractIptuFromPdf(input: {
  fileName: string
  fileType: string
  fileBase64: string
}): Promise<IptuExtracao> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })
  const fileData = `data:${input.fileType};base64,${input.fileBase64}`

  const response = await createResponseWithRetry(client, {
    model: getOptionalEnv("OPENAI_MODEL", IPTU_AGENT_DEFAULT_MODEL),
    input: [
      { role: "system", content: IPTU_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          // Ver nota em analyze-prestacao.ts: `auto` cai para `low` fora do gpt-5.6+.
          { type: "input_file", filename: input.fileName, file_data: fileData, detail: "high" },
          { type: "input_text", text: IPTU_USER_PROMPT },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: IPTU_AGENT_NAME,
        strict: true,
        schema,
      },
    },
  } as unknown as Parameters<typeof client.responses.create>[0])

  if (!("output_text" in response)) {
    throw new Error("A resposta da IA nao retornou texto estruturado.")
  }

  return iptuExtracaoSchema.parse(JSON.parse(response.output_text))
}
