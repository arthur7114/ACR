import { readFileSync, existsSync } from "fs"
import { join } from "path"
import OpenAI from "openai"
import {
  classifiedDocumentSchema,
  despesasAnalysisSchema,
  reajusteAnalysisSchema,
  repasseAnalysisSchema,
  type ClassifiedDocument,
  type DespesasAnalysis,
  type DocumentType,
  type ReajusteAnalysis,
  type RepasseAnalysis,
} from "@/lib/prestacao-types"
import { despesasAgent } from "./ai-agents/despesas-agent"
import { documentClassifierAgent } from "./ai-agents/document-classifier-agent"
import { reajusteAgent } from "./ai-agents/reajuste-agent"
import { repasseAgent } from "./ai-agents/repasse-agent"
import { getOptionalEnv, requireEnv } from "./env"
import { createResponseWithRetry } from "./openai-responses"

interface DocumentInput {
  fileName: string
  fileType: string
  fileSize: number
  fileBase64: string
}

const documentTypeValues: DocumentType[] = [
  "prestacao_contas",
  "comprovante_repasse",
  "relatorio_reajuste",
  "despesas_comprovantes",
  "desconhecido",
]

const classificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fileName", "fileType", "fileSize", "documentType", "confidence", "reason"],
  properties: {
    fileName: { type: "string" },
    fileType: { type: "string" },
    fileSize: { type: "number" },
    documentType: { type: "string", enum: documentTypeValues },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
}

const repasseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "valor",
    "data",
    "origem_nome",
    "destino_nome",
    "destino_banco",
    "destino_agencia",
    "destino_conta",
    "protocolo",
    "campos_ausentes",
    "observacoes",
    "confianca_geral",
  ],
  properties: {
    valor: { type: ["number", "null"] },
    data: { type: ["string", "null"] },
    origem_nome: { type: ["string", "null"] },
    destino_nome: { type: ["string", "null"] },
    destino_banco: { type: ["string", "null"] },
    destino_agencia: { type: ["string", "null"] },
    destino_conta: { type: ["string", "null"] },
    protocolo: { type: ["string", "null"] },
    campos_ausentes: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } },
    confianca_geral: { type: "number" },
  },
}

const despesaItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tipo",
    "fornecedor",
    "referencia",
    "vencimento",
    "valor",
    "endereco",
    "unidade_consumidora",
    "pago_em",
    "pago_por",
    "observacao",
    "confianca",
  ],
  properties: {
    tipo: { type: "string", enum: ["energia", "agua", "iptu", "seguro", "outro"] },
    fornecedor: { type: ["string", "null"] },
    referencia: { type: ["string", "null"] },
    vencimento: { type: ["string", "null"] },
    valor: { type: "number" },
    endereco: { type: ["string", "null"] },
    unidade_consumidora: { type: ["string", "null"] },
    pago_em: { type: ["string", "null"] },
    pago_por: { type: ["string", "null"] },
    observacao: { type: ["string", "null"] },
    confianca: { type: "number" },
  },
}

const despesasJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["despesas", "total_despesas", "campos_ausentes", "observacoes", "confianca_geral"],
  properties: {
    despesas: { type: "array", items: despesaItemJsonSchema },
    total_despesas: { type: ["number", "null"] },
    campos_ausentes: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } },
    confianca_geral: { type: "number" },
  },
}

const reajusteItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "apto",
    "inquilino",
    "descricao",
    "valor_anterior",
    "valor_novo",
    "percentual",
    "vigencia",
    "observacao",
    "confianca",
  ],
  properties: {
    apto: { type: ["string", "null"] },
    inquilino: { type: ["string", "null"] },
    descricao: { type: "string" },
    valor_anterior: { type: ["number", "null"] },
    valor_novo: { type: ["number", "null"] },
    percentual: { type: ["number", "null"] },
    vigencia: { type: ["string", "null"] },
    observacao: { type: ["string", "null"] },
    confianca: { type: "number" },
  },
}

const reajusteJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["itens", "campos_ausentes", "observacoes", "confianca_geral"],
  properties: {
    itens: { type: "array", items: reajusteItemJsonSchema },
    campos_ausentes: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } },
    confianca_geral: { type: "number" },
  },
}

export async function classifyDocument(input: DocumentInput): Promise<ClassifiedDocument> {
  if (process.env.NEXT_PUBLIC_MOCK_IA === "true" || process.env.MOCK_IA === "true") {
    console.log("[MOCK IA] Intercepting classifyDocument for:", input.fileName)
    const name = input.fileName.toLowerCase()
    let documentType: DocumentType = "desconhecido"
    const confidence = 0.98
    const reason = "Classificação mockada via nome do arquivo."

    if (name.includes("prestacao") || name.includes("prestação")) {
      documentType = "prestacao_contas"
    } else if (name.includes("repasse")) {
      documentType = "comprovante_repasse"
    } else if (name.includes("despesa")) {
      documentType = "despesas_comprovantes"
    } else if (name.includes("reajuste") || name.includes("locacao") || name.includes("locação") || name.includes("relatorio") || name.includes("relatório")) {
      documentType = "relatorio_reajuste"
    }

    return classifiedDocumentSchema.parse({
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      documentType,
      confidence,
      reason,
    })
  }

  const result = await analyzeWithSchema({
    input,
    model: getOptionalEnv("OPENAI_MODEL", documentClassifierAgent.defaultModel),
    schemaName: documentClassifierAgent.name,
    schema: classificationJsonSchema,
    systemPrompt: documentClassifierAgent.systemPrompt,
    userPrompt: `${documentClassifierAgent.userPrompt}\n\nNome do arquivo: ${input.fileName}`,
  })

  return classifiedDocumentSchema.parse({
    ...(result as Record<string, unknown>),
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
  })
}

export async function extractRepasseFromPdf(input: DocumentInput): Promise<RepasseAnalysis> {
  if (process.env.NEXT_PUBLIC_MOCK_IA === "true" || process.env.MOCK_IA === "true") {
    console.log("[MOCK IA] Intercepting extractRepasseFromPdf...")
    const fixturePath = join(process.cwd(), "lib/server/mock-gmii-analysis.json")
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, "utf-8")
      const fullAnalysis = JSON.parse(raw)
      if (fullAnalysis.repasse) {
        return repasseAnalysisSchema.parse(fullAnalysis.repasse)
      }
    }
  }

  const result = await analyzeWithSchema({
    input,
    model: getOptionalEnv("OPENAI_MODEL", repasseAgent.defaultModel),
    schemaName: repasseAgent.name,
    schema: repasseJsonSchema,
    systemPrompt: repasseAgent.systemPrompt,
    userPrompt: repasseAgent.userPrompt,
  })

  return repasseAnalysisSchema.parse(result)
}

export async function extractDespesasFromPdf(input: DocumentInput): Promise<DespesasAnalysis> {
  if (process.env.NEXT_PUBLIC_MOCK_IA === "true" || process.env.MOCK_IA === "true") {
    console.log("[MOCK IA] Intercepting extractDespesasFromPdf...")
    const fixturePath = join(process.cwd(), "lib/server/mock-gmii-analysis.json")
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, "utf-8")
      const fullAnalysis = JSON.parse(raw)
      if (fullAnalysis.despesas) {
        return despesasAnalysisSchema.parse(fullAnalysis.despesas)
      }
    }
    return {
      despesas: [],
      total_despesas: 0,
      campos_ausentes: [],
      observacoes: ["Despesas mockadas."],
      confianca_geral: 0.95,
    }
  }

  const result = await analyzeWithSchema({
    input,
    model: getOptionalEnv("OPENAI_MODEL", despesasAgent.defaultModel),
    schemaName: despesasAgent.name,
    schema: despesasJsonSchema,
    systemPrompt: despesasAgent.systemPrompt,
    userPrompt: despesasAgent.userPrompt,
  })

  return despesasAnalysisSchema.parse(result)
}

export async function extractReajusteFromPdf(input: DocumentInput): Promise<ReajusteAnalysis> {
  if (process.env.NEXT_PUBLIC_MOCK_IA === "true" || process.env.MOCK_IA === "true") {
    console.log("[MOCK IA] Intercepting extractReajusteFromPdf...")
    const fixturePath = join(process.cwd(), "lib/server/mock-gmii-analysis.json")
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, "utf-8")
      const fullAnalysis = JSON.parse(raw)
      if (fullAnalysis.reajuste) {
        return reajusteAnalysisSchema.parse(fullAnalysis.reajuste)
      }
    }
    return {
      itens: [],
      campos_ausentes: [],
      observacoes: ["Reajustes mockados."],
      confianca_geral: 0.95,
    }
  }

  const result = await analyzeWithSchema({
    input,
    model: getOptionalEnv("OPENAI_MODEL", reajusteAgent.defaultModel),
    schemaName: reajusteAgent.name,
    schema: reajusteJsonSchema,
    systemPrompt: reajusteAgent.systemPrompt,
    userPrompt: reajusteAgent.userPrompt,
  })

  return reajusteAnalysisSchema.parse(result)
}

async function analyzeWithSchema({
  input,
  model,
  schemaName,
  schema,
  systemPrompt,
  userPrompt,
}: {
  input: DocumentInput
  model: string
  schemaName: string
  schema: object
  systemPrompt: string
  userPrompt: string
}) {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })
  const response = await createResponseWithRetry(client, {
    model,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: input.fileName,
            file_data: `data:${input.fileType};base64,${input.fileBase64}`,
          },
          {
            type: "input_text",
            text: userPrompt,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  } as unknown as Parameters<typeof client.responses.create>[0])

  if (!("output_text" in response)) {
    throw new Error("A resposta da IA nao retornou texto estruturado.")
  }

  return JSON.parse(response.output_text) as unknown
}
