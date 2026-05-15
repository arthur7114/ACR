import { createStep, createWorkflow } from "@mastra/core/workflows"
import { z } from "zod"
import {
  guardrailSchema,
  prestacaoAnalysisSchema,
  recheckSchema,
  technicalOpinionSchema,
  type AnalyzePrestacaoResponse,
} from "@/lib/prestacao-types"
import { extractPrestacaoAliveFromPdf } from "./analyze-prestacao"
import { persistPrestacao } from "./persist-prestacao"
import { applyDeterministicRechecks } from "./prestacao-rechecks"

const MAX_FILE_SIZE = 20 * 1024 * 1024

const workflowInputSchema = z
  .object({
    fileName: z.string(),
    fileType: z.string(),
    fileSize: z.number(),
    fileBase64: z.string(),
  })
  .strict()

const validatedInputSchema = workflowInputSchema.extend({
  workflowRunId: z.string(),
  guardrails: z.array(guardrailSchema),
})

const extractedInputSchema = validatedInputSchema.extend({
  analysis: prestacaoAnalysisSchema,
})

const recheckedInputSchema = extractedInputSchema.extend({
  analysis: prestacaoAnalysisSchema,
  calculatedTotals: z
    .object({
      total_receitas: z.number(),
      total_comissoes: z.number(),
      total_repassar: z.number(),
    })
    .strict(),
  rechecks: z.array(recheckSchema),
  guardrails: z.array(guardrailSchema),
  parecer: technicalOpinionSchema,
})

const workflowOutputSchema = z
  .object({
    analysis: prestacaoAnalysisSchema,
    workflowRunId: z.string(),
    parecer: technicalOpinionSchema,
    rechecks: z.array(recheckSchema),
    guardrails: z.array(guardrailSchema),
    fechamentoId: z.string().nullable(),
    documentoId: z.string().nullable(),
    storagePath: z.string().nullable(),
  })
  .strict()

const validateFileStep = createStep({
  id: "validate-file",
  inputSchema: workflowInputSchema,
  outputSchema: validatedInputSchema,
  execute: async ({ inputData, runId }) => {
    if (inputData.fileType !== "application/pdf") {
      throw new Error("Apenas PDF e aceito neste fluxo de prestacao.")
    }

    if (inputData.fileSize > MAX_FILE_SIZE) {
      throw new Error("Arquivo acima do limite de 20MB.")
    }

    if (!inputData.fileBase64) {
      throw new Error("Arquivo vazio ou invalido.")
    }

    return {
      ...inputData,
      workflowRunId: runId,
      guardrails: [
        {
          id: "file_type",
          label: "Formato PDF",
          status: "passed" as const,
          message: "Arquivo recebido como PDF.",
        },
        {
          id: "file_size",
          label: "Limite de tamanho",
          status: "passed" as const,
          message: "Arquivo dentro do limite de 20MB.",
        },
      ],
    }
  },
})

const extractStep = createStep({
  id: "extract-prestacao",
  inputSchema: validatedInputSchema,
  outputSchema: extractedInputSchema,
  execute: async ({ inputData }) => {
    const analysis = await extractPrestacaoAliveFromPdf(inputData)

    if (analysis.tipo_documento !== "prestacao_contas" || analysis.receitas_por_imovel.length === 0) {
      throw new Error("O PDF nao parece conter a prestacao Alive / GM II com a Secao 1.")
    }

    return {
      ...inputData,
      analysis,
    }
  },
})

const recheckStep = createStep({
  id: "recheck-deterministic",
  inputSchema: extractedInputSchema,
  outputSchema: recheckedInputSchema,
  execute: async ({ inputData }) => {
    const result = applyDeterministicRechecks(inputData.analysis)

    return {
      ...inputData,
      ...result,
      guardrails: [...inputData.guardrails, ...result.guardrails],
    }
  },
})

const persistStep = createStep({
  id: "persist-result",
  inputSchema: recheckedInputSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    const persistence = await persistPrestacao({
      fileName: inputData.fileName,
      fileType: inputData.fileType,
      fileSize: inputData.fileSize,
      fileBuffer: Buffer.from(inputData.fileBase64, "base64"),
      analysis: inputData.analysis,
      parecer: inputData.parecer,
      rechecks: inputData.rechecks,
      guardrails: inputData.guardrails,
    })

    return {
      analysis: inputData.analysis,
      workflowRunId: inputData.workflowRunId,
      parecer: inputData.parecer,
      rechecks: inputData.rechecks,
      guardrails: inputData.guardrails,
      ...persistence,
    }
  },
})

export const prestacaoAliveWorkflow = createWorkflow({
  id: "prestacao-alive-technical-opinion",
  description: "Extrai a prestacao Alive / GM II, roda rechecks deterministicos e persiste o parecer tecnico.",
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(validateFileStep)
  .then(extractStep)
  .then(recheckStep)
  .then(persistStep)
  .commit()

export async function runPrestacaoAliveWorkflow(file: File): Promise<AnalyzePrestacaoResponse> {
  const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64")
  const run = await prestacaoAliveWorkflow.createRun()
  const result = await run.start({
    inputData: {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileBase64,
    },
  })

  if (result.status !== "success") {
    const failedStep = Object.values(result.steps).find((step) => step.status === "failed")
    const error = result.status === "failed" ? result.error : undefined

    throw failedStep?.status === "failed"
      ? failedStep.error
      : error instanceof Error
        ? error
        : new Error(`Workflow finalizado com status ${result.status}.`)
  }

  return result.result
}
