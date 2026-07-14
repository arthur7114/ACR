import { readFileSync, existsSync } from "fs"
import { join } from "path"
import OpenAI from "openai"
import { prestacaoAnalysisSchema, type PrestacaoAnalysis } from "@/lib/prestacao-types"
import { prestacaoAliveAgent } from "./ai-agents/prestacao-alive-agent"
import { getOptionalEnv, requireEnv } from "./env"
import { createResponseWithRetry } from "./openai-responses"
import { extractPdfTextLines, isCesarRegoConsolidado, parseCesarRegoPrestacao } from "./cesar-rego-parser"
import { parseExcelPrestacao } from "./excel-parser"

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tipo_documento",
    "imobiliaria",
    "empreendimento",
    "competencia",
    "plano_extracao",
    "receitas_por_imovel",
    "acordos_rescisoes_recebidos",
    "inadimplencias_acumuladas",
    "resumo_financeiro",
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
    plano_extracao: {
      type: "object",
      additionalProperties: false,
      required: ["documento_lido_integralmente", "secoes_identificadas", "estrategia", "alertas"],
      properties: {
        documento_lido_integralmente: { type: "boolean" },
        secoes_identificadas: { type: "array", items: { type: "string" } },
        estrategia: { type: "array", items: { type: "string" } },
        alertas: { type: "array", items: { type: "string" } },
      },
    },
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
          "vagas_garagem",
          "agua",
          "iptu",
          "seguro_incendio",
          "total",
          "comissao",
          "repasse",
          "competencia_original",
          "competencia_recebimento",
          "dia_vencimento",
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
          vagas_garagem: { type: ["integer", "null"] },
          agua: { type: ["number", "null"] },
          iptu: { type: ["number", "null"] },
          seguro_incendio: { type: ["number", "null"] },
          total: { type: "number" },
          comissao: { type: ["number", "null"] },
          repasse: { type: ["number", "null"] },
          competencia_original: { type: ["string", "null"] },
          competencia_recebimento: { type: ["string", "null"] },
          dia_vencimento: { type: ["integer", "null"] },
          vencimento: { type: ["string", "null"] },
          observacao: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
      },
    },
    acordos_rescisoes_recebidos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo",
          "apto",
          "inquilino",
          "valor",
          "iptu",
          "total_recebido",
          "repasse",
          "comissao",
          "percentual",
          "competencia_original",
          "competencia_recebimento",
          "observacao",
          "confianca",
        ],
        properties: {
          tipo: { type: "string", enum: ["acordo", "rescisao", "intermediacao", "atraso", "outro"] },
          apto: { type: ["string", "null"] },
          inquilino: { type: ["string", "null"] },
          valor: { type: "number" },
          iptu: { type: ["number", "null"] },
          total_recebido: { type: ["number", "null"] },
          repasse: { type: ["number", "null"] },
          comissao: { type: ["number", "null"] },
          percentual: { type: ["number", "null"] },
          competencia_original: { type: ["string", "null"] },
          competencia_recebimento: { type: ["string", "null"] },
          observacao: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
      },
    },
    inadimplencias_acumuladas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["apto", "inquilino", "valor", "condicao", "observacao", "confianca"],
        properties: {
          apto: { type: ["string", "null"] },
          inquilino: { type: ["string", "null"] },
          valor: { type: "number" },
          condicao: { type: ["string", "null"] },
          observacao: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
      },
    },
    resumo_financeiro: {
      type: "object",
      additionalProperties: false,
      required: [
        "total_linhas_receitas",
        "total_linhas_comissoes",
        "total_linhas_repasse",
        "comissao_administracao",
        "outras_comissoes_despesas",
        "total_outras_comissoes_despesas",
        "total_comissao_despesas",
        "recebidos_em_nome_locador",
        "total_a_repassar",
        "confianca",
      ],
      properties: {
        total_linhas_receitas: { type: ["number", "null"] },
        total_linhas_comissoes: { type: ["number", "null"] },
        total_linhas_repasse: { type: ["number", "null"] },
        comissao_administracao: { type: ["number", "null"] },
        outras_comissoes_despesas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["descricao", "valor", "confianca"],
            properties: {
              descricao: { type: "string" },
              valor: { type: "number" },
              confianca: { type: "number" },
            },
          },
        },
        total_outras_comissoes_despesas: { type: ["number", "null"] },
        total_comissao_despesas: { type: ["number", "null"] },
        recebidos_em_nome_locador: { type: ["number", "null"] },
        total_a_repassar: { type: ["number", "null"] },
        confianca: { type: "number" },
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

export async function extractPrestacaoAliveFromPdf(
  input: {
    fileName: string
    fileType: string
    fileBase64: string
  },
  competencia: string = "2026-03",
): Promise<PrestacaoAnalysis> {
  const isExcel = input.fileName.endsWith(".xlsx") || input.fileName.endsWith(".xls") || input.fileType.includes("sheet") || input.fileType.includes("excel")
  if (isExcel) {
    console.log("[EXCEL PARSER] Local parsing Excel file:", input.fileName)
    const fileBuffer = Buffer.from(input.fileBase64, "base64")
    return parseExcelPrestacao(fileBuffer, competencia)
  }

  const isPdf = input.fileName.toLowerCase().endsWith(".pdf") || input.fileType.includes("pdf")
  if (isPdf) {
    try {
      const fileBuffer = Buffer.from(input.fileBase64, "base64")
      const lines = await extractPdfTextLines(fileBuffer)
      if (isCesarRegoConsolidado(lines)) {
        console.log("[CESAR REGO PARSER] Local parsing layout C PDF:", input.fileName)
        return prestacaoAnalysisSchema.parse(parseCesarRegoPrestacao(lines, competencia))
      }
    } catch (error) {
      console.warn("[CESAR REGO PARSER] Deteccao/parse local falhou; usando agente de IA.", error)
    }
  }
  if (process.env.NEXT_PUBLIC_MOCK_IA === "true" || process.env.MOCK_IA === "true") {
    console.log("[MOCK IA] Intercepting extractPrestacaoAliveFromPdf...")
    const fixturePath = join(process.cwd(), "lib/server/mock-gmii-analysis.json")
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, "utf-8")
      const fullAnalysis = JSON.parse(raw)
      if (fullAnalysis.prestacao) {
        return prestacaoAnalysisSchema.parse(fullAnalysis.prestacao)
      }
    }
    throw new Error("Mock Mode enabled but lib/server/mock-gmii-analysis.json is missing or invalid.")
  }

  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })
  const fileData = `data:${input.fileType};base64,${input.fileBase64}`

  const response = await createResponseWithRetry(client, {
    model: getOptionalEnv("OPENAI_MODEL", prestacaoAliveAgent.defaultModel),
    input: [
      {
        role: "system",
        content: prestacaoAliveAgent.systemPrompt,
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
            text: prestacaoAliveAgent.userPrompt,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: prestacaoAliveAgent.name,
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
