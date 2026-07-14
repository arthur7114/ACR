import type {
  ClassifiedDocument,
  DespesasAnalysis,
  PackageAnalysis,
  PrestacaoAnalysis,
  ProcessingEvent,
  ReajusteAnalysis,
  RepasseAnalysis,
} from "@/lib/prestacao-types"
import type { FechamentoContext } from "@/lib/fechamento-context"
import {
  classifyDocument,
  extractDespesasFromPdf,
  extractReajusteFromPdf,
  extractRepasseFromPdf,
} from "./analyze-package-documents"
import { extractPrestacaoAliveFromPdf } from "./analyze-prestacao"
import { validatePackage } from "./package-rechecks"
import { loadHistoricalAgreementKeys } from "./historical-agreements"
import { persistPackage, type PackageFileForPersistence } from "./persist-package"
import { getCommercialRuleForValidation } from "./regras-comerciais"
import { createSupabaseAdmin } from "./supabase"

const MAX_FILE_SIZE = 20 * 1024 * 1024

interface PackageInputDocument {
  fileName: string
  fileType: string
  fileSize: number
  fileBase64: string
  fileBuffer: Buffer
}

export async function* runPackageWorkflowWithEvents(
  files: File[],
  fechamentoContext: FechamentoContext | null = null,
): AsyncGenerator<ProcessingEvent> {
  try {
    yield event("workflow_started", "Processamento real iniciado.", 2)

    const documents = await readAndValidateFiles(files)
    const classifications: ClassifiedDocument[] = []

    for (const [index, document] of documents.entries()) {
      const classification = await classifyDocument(document)
      classifications.push(classification)
      yield event(
        "document_classified",
        `Documento classificado como ${classification.documentType}.`,
        progress(index, documents.length, 8, 25),
        document.fileName,
        classification.documentType,
      )
    }

    const competencia = fechamentoContext?.competencia ?? "2026-03"
    const extraction = await extractDocuments(documents, classifications, competencia, fechamentoContext, (processingEvent) => processingEvent)

    for (const processingEvent of extraction.events) {
      yield processingEvent
    }

    yield event("validation_started", "Validacoes deterministicas iniciadas.", 72)
    const commercialRule = await getCommercialRuleForValidation(
      fechamentoContext?.imobiliariaId,
      fechamentoContext?.empreendimentoId,
    )
    const historicalAgreementKeys = await loadHistoricalAgreementKeys(createSupabaseAdmin(), {
      id: fechamentoContext?.id,
      imobiliariaId: fechamentoContext?.imobiliariaId,
      empreendimentoId: fechamentoContext?.empreendimentoId,
    })
    const validation = validatePackage({
      documents: classifications,
      prestacao: extraction.prestacao,
      repasse: extraction.repasse,
      despesas: extraction.despesas,
      reajuste: extraction.reajuste,
      commercialRule,
      historicalAgreementKeys,
    })

    yield event("validation_completed", "Validacoes deterministicas concluidas.", 82)

    const packageAnalysis: Omit<PackageAnalysis, "fechamentoId" | "storagePath"> = {
      documents: classifications,
      prestacao: validation.prestacao,
      repasse: validation.repasse,
      despesas: validation.despesas,
      reajuste: validation.reajuste,
      totals: validation.totals,
      parecer: validation.parecer,
      rechecks: validation.rechecks,
      guardrails: validation.guardrails,
    }

    const persistence = await persistPackage({
      files: documents.map((document) => ({
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        fileBuffer: document.fileBuffer,
        classification: classifications.find((classification) => classification.fileName === document.fileName) ?? {
          fileName: document.fileName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          documentType: "desconhecido",
          confidence: 0,
          reason: "Classificacao indisponivel.",
        },
      })) satisfies PackageFileForPersistence[],
      analysis: packageAnalysis,
      fechamentoContext,
    })

    for (const document of persistence.documents) {
      yield event(
        "file_saved",
        "Arquivo original salvo e vinculado ao fechamento.",
        88,
        document.fileName,
        document.documentType,
      )
    }

    yield event("persistence_completed", "Resultado persistido no fechamento.", 94)

    const result: PackageAnalysis = {
      ...packageAnalysis,
      documents: persistence.documents,
      fechamentoId: persistence.fechamentoId,
      storagePath: persistence.storagePath,
    }

    yield {
      type: "workflow_completed",
      message: "Pacote processado com dados reais.",
      progress: 100,
      result,
    }
  } catch (error) {
    console.error("[PACKAGE WORKFLOW] Falha no processamento:", error)
    const message = describeError(error)
    yield {
      type: "workflow_failed",
      message,
      progress: 100,
      error: message,
    }
  }
}

// Erros do Supabase (PostgrestError, StorageError) sao objetos planos e nao
// instancias de Error, entao `error instanceof Error` falha e a causa real se
// perde. Esta funcao extrai a melhor mensagem disponivel em cada formato.
function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message

  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown; error?: unknown }
    const parts = [candidate.message, candidate.details, candidate.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
    if (typeof candidate.error === "string" && candidate.error.length > 0) parts.push(candidate.error)
    if (parts.length > 0) {
      const code = typeof candidate.code === "string" || typeof candidate.code === "number" ? ` (${candidate.code})` : ""
      return `${parts.join(" — ")}${code}`
    }
  }

  if (typeof error === "string" && error.length > 0) return error

  return "Falha desconhecida no processamento."
}

async function readAndValidateFiles(files: File[]) {
  if (files.length === 0) {
    throw new Error("Envie ao menos um arquivo para processamento.")
  }

  const documents: PackageInputDocument[] = []

  for (const file of files) {
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf")
    const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                    file.type === "application/vnd.ms-excel" || 
                    file.name.endsWith(".xlsx") || 
                    file.name.endsWith(".xls")

    if (!isPdf && !isExcel) {
      throw new Error(`Arquivo ${file.name} nao e PDF ou Planilha. Neste fluxo, envie apenas PDFs ou planilhas Excel.`)
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Arquivo ${file.name} esta acima do limite de 20MB.`)
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    if (fileBuffer.length === 0) {
      throw new Error(`Arquivo ${file.name} esta vazio ou invalido.`)
    }

    documents.push({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileBase64: fileBuffer.toString("base64"),
      fileBuffer,
    })
  }

  return documents
}

async function extractDocuments(
  documents: PackageInputDocument[],
  classifications: ClassifiedDocument[],
  competencia: string,
  fechamentoContext: FechamentoContext | null,
  passthrough: (event: ProcessingEvent) => ProcessingEvent,
) {
  const events: ProcessingEvent[] = []
  let prestacao: PrestacaoAnalysis | null = null
  let repasse: RepasseAnalysis | null = null
  let despesas: DespesasAnalysis | null = null
  let reajuste: ReajusteAnalysis | null = null
  const extractable = classifications.filter((classification) => classification.documentType !== "desconhecido")

  for (const [index, classification] of extractable.entries()) {
    const document = documents.find((item) => item.fileName === classification.fileName)
    if (!document) continue

    events.push(
      passthrough(
        event(
          "extraction_started",
          `Extracao iniciada para ${classification.documentType}.`,
          progress(index, extractable.length, 28, 66),
          document.fileName,
          classification.documentType,
        ),
      ),
    )

    if (classification.documentType === "prestacao_contas" && !prestacao) {
      prestacao = applyFechamentoContextToPrestacao(
        await extractPrestacaoAliveFromPdf(document, competencia),
        competencia,
        fechamentoContext,
      )
    }

    if (classification.documentType === "comprovante_repasse" && !repasse) {
      repasse = await extractRepasseFromPdf(document)
    }

    if (classification.documentType === "despesas_comprovantes" && !despesas) {
      despesas = await extractDespesasFromPdf(document)
    }

    if (classification.documentType === "relatorio_reajuste" && !reajuste) {
      reajuste = await extractReajusteFromPdf(document)
    }

    events.push(
      passthrough(
        event(
          "extraction_completed",
          `Extracao concluida para ${classification.documentType}.`,
          progress(index + 1, extractable.length, 28, 70),
          document.fileName,
          classification.documentType,
        ),
      ),
    )
  }

  return { prestacao, repasse, despesas, reajuste, events }
}

function applyFechamentoContextToPrestacao(
  prestacao: PrestacaoAnalysis,
  competencia: string,
  fechamentoContext: FechamentoContext | null,
): PrestacaoAnalysis {
  return {
    ...prestacao,
    imobiliaria: fechamentoContext?.imobiliariaNome ?? prestacao.imobiliaria,
    empreendimento: fechamentoContext?.empreendimentoNome ?? prestacao.empreendimento,
    competencia,
  }
}

function event(
  type: ProcessingEvent["type"],
  message: string,
  progressValue: number,
  fileName?: string,
  documentType?: ProcessingEvent["documentType"],
): ProcessingEvent {
  return {
    type,
    message,
    progress: progressValue,
    ...(fileName ? { fileName } : {}),
    ...(documentType ? { documentType } : {}),
  }
}

function progress(index: number, total: number, start: number, end: number) {
  if (total <= 0) return end
  return Math.round(start + ((end - start) * index) / total)
}
