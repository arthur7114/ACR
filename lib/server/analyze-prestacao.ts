import OpenAI from "openai"
import { prestacaoAnalysisSchema, type PrestacaoAnalysis } from "@/lib/prestacao-types"
import { getOptionalEnv, requireEnv } from "./env"

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tipo_documento",
    "imobiliaria",
    "empreendimento",
    "competencia",
    "receitas_por_imovel",
    "totais",
    "campos_ausentes",
    "observacoes",
    "confianca_geral",
  ],
  properties: {
    tipo_documento: { type: "string", enum: ["prestacao_contas"] },
    imobiliaria: { type: "string" },
    empreendimento: { type: "string" },
    competencia: { type: "string" },
    receitas_por_imovel: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "apto",
          "inquilino",
          "aluguel",
          "desconto",
          "aluguel_com_desconto",
          "garagem",
          "agua",
          "iptu",
          "seguro_incendio",
          "total",
          "comissao",
          "repasse",
          "vencimento",
          "observacao",
          "confianca",
        ],
        properties: {
          apto: { type: "string" },
          inquilino: { type: "string" },
          aluguel: { type: ["number", "null"] },
          desconto: { type: ["number", "null"] },
          aluguel_com_desconto: { type: ["number", "null"] },
          garagem: { type: ["number", "null"] },
          agua: { type: ["number", "null"] },
          iptu: { type: ["number", "null"] },
          seguro_incendio: { type: ["number", "null"] },
          total: { type: "number" },
          comissao: { type: ["number", "null"] },
          repasse: { type: ["number", "null"] },
          vencimento: { type: ["string", "null"] },
          observacao: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
      },
    },
    totais: {
      type: "object",
      additionalProperties: false,
      required: ["total_receitas", "total_comissoes", "total_repassar"],
      properties: {
        total_receitas: { type: ["number", "null"] },
        total_comissoes: { type: ["number", "null"] },
        total_repassar: { type: ["number", "null"] },
      },
    },
    campos_ausentes: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } },
    confianca_geral: { type: "number" },
  },
}

export async function extractPrestacaoAliveFromPdf(input: {
  fileName: string
  fileType: string
  fileBase64: string
}): Promise<PrestacaoAnalysis> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })
  const fileData = `data:${input.fileType};base64,${input.fileBase64}`

  const response = await client.responses.create({
    model: getOptionalEnv("OPENAI_MODEL", "gpt-5"),
    input: [
      {
        role: "system",
        content:
          "Voce extrai dados financeiros de prestacoes de contas imobiliarias Alive/GM II. Responda apenas com JSON aderente ao schema.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: input.fileName,
            file_data: fileData,
          },
          {
            type: "input_text",
            text:
              "Analise este PDF de prestacao de contas Alive / Grand Messejana II. Extraia somente a Secao 1, Vigencia do mes, tabela principal por apartamento. Use numeros em reais como number, datas em ISO quando possivel, null quando ausente, e informe confianca de 0 a 1 por linha.",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "prestacao_alive_secao_1",
        strict: true,
        schema,
      },
    },
  } as unknown as Parameters<typeof client.responses.create>[0])

  if (!("output_text" in response)) {
    throw new Error("A resposta da IA nao retornou texto estruturado.")
  }

  return prestacaoAnalysisSchema.parse(JSON.parse(response.output_text))
}
