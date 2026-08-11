import type {
  ClassifiedDocument,
  DespesasAnalysis,
  PackageAnalysis,
  PrestacaoAnalysis,
  ProcessingEvent,
  ReajusteAnalysis,
  RepasseAnalysis,
} from "@/lib/prestacao-types"
import { packageAnalysisSchema } from "@/lib/prestacao-types"
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
import { calculateDocumentSha256, persistPackage, type PackageFileForPersistence } from "./persist-package"
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

    let documents = await readAndValidateFiles(files)
    const existingAnalysis = await loadExistingAnalysis(fechamentoContext)
    documents = await excludeAlreadyProcessedDocuments(documents, fechamentoContext)
    if (documents.length === 0) {
      throw new Error("Todos os arquivos desta remessa já foram processados neste fechamento.")
    }
    const classifications: ClassifiedDocument[] = []

    for (const [index, document] of documents.entries()) {
      let classification: ClassifiedDocument
      try {
        classification = await classifyDocument(document)
      } catch (error) {
        throw describeDocumentProcessingError(error, document.fileName)
      }
      classification = enforceClassificationConfidence(classification)
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
    const combined = mergeWithExistingAnalysis(existingAnalysis, extraction, classifications)
    const validation = validatePackage({
      documents: combined.documents,
      prestacao: combined.prestacao,
      repasse: combined.repasse,
      despesas: combined.despesas,
      reajuste: combined.reajuste,
      commercialRule,
      historicalAgreementKeys,
    })

    yield event("validation_completed", "Validacoes deterministicas concluidas.", 82)

    const packageAnalysis: Omit<PackageAnalysis, "fechamentoId" | "storagePath"> = {
      documents: combined.documents,
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
      files: documents.map((document, index) => ({
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        fileBuffer: document.fileBuffer,
        classification: classifications[index] ?? {
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

async function loadExistingAnalysis(context: FechamentoContext | null): Promise<PackageAnalysis | null> {
  if (!context) return null
  const { data, error } = await createSupabaseAdmin()
    .from("fechamentos")
    .select("analise_completa")
    .eq("id", context.id)
    .maybeSingle()
  if (error) throw error
  if (!data?.analise_completa) return null
  const parsed = packageAnalysisSchema.safeParse({
    ...(data.analise_completa as Record<string, unknown>),
    fechamentoId: context.id,
    storagePath: null,
  })
  if (!parsed.success) {
    throw new Error("A análise existente não pôde ser lida com segurança; repare o fechamento antes de adicionar outra remessa.")
  }
  const { data: persistedDocuments, error: documentsError } = await createSupabaseAdmin()
    .from("documentos_fechamento")
    .select("id,nome_arquivo,tipo_documento,mime_type,tamanho_bytes,arquivo_url,criado_em")
    .eq("fechamento_id", context.id)
    .order("criado_em", { ascending: true })
  if (documentsError) throw documentsError

  const available = [...(persistedDocuments ?? [])]
  const documents = parsed.data.documents.map((document) => {
    if (document.documentoId) return document
    const matchIndex = available.findIndex((row) =>
      row.nome_arquivo === document.fileName
      && row.tipo_documento === document.documentType
      && Number(row.tamanho_bytes) === document.fileSize,
    )
    if (matchIndex < 0) {
      throw new Error(`Documento histórico sem vínculo persistido: ${document.fileName}.`)
    }
    const [match] = available.splice(matchIndex, 1)
    return { ...document, documentoId: match.id, storagePath: match.arquivo_url }
  })
  return { ...parsed.data, documents }
}

async function excludeAlreadyProcessedDocuments(
  documents: PackageInputDocument[],
  context: FechamentoContext | null,
) {
  const uniqueDocuments = dedupeDocumentsByHash(documents)
  if (!context || uniqueDocuments.length === 0) return uniqueDocuments
  const hashes = uniqueDocuments.map((document) => calculateDocumentSha256(document.fileBuffer))
  const { data, error } = await createSupabaseAdmin()
    .from("documentos_fechamento")
    .select("sha256,status_processamento")
    .eq("fechamento_id", context.id)
    .in("sha256", hashes)
  if (error) throw error
  const existing = new Set(
    (data ?? [])
      .filter((row) => row.status_processamento === "processado")
      .map((row) => row.sha256)
      .filter(Boolean),
  )
  return uniqueDocuments.filter((_, index) => !existing.has(hashes[index]))
}

export function dedupeDocumentsByHash<T extends { fileBuffer: Buffer }>(documents: T[]): T[] {
  const seen = new Set<string>()
  return documents.filter((document) => {
    const hash = calculateDocumentSha256(document.fileBuffer)
    if (seen.has(hash)) return false
    seen.add(hash)
    return true
  })
}

function mergeWithExistingAnalysis(
  existing: PackageAnalysis | null,
  extracted: Pick<PackageAnalysis, "prestacao" | "repasse" | "despesas" | "reajuste">,
  newDocuments: ClassifiedDocument[],
) {
  return {
    documents: [...(existing?.documents ?? []), ...newDocuments],
    prestacao: extracted.prestacao ?? existing?.prestacao ?? null,
    repasse: extracted.repasse ? mergeRepasses(existing?.repasse ?? null, extracted.repasse) : existing?.repasse ?? null,
    despesas: extracted.despesas ? mergeDespesas(existing?.despesas ?? null, extracted.despesas) : existing?.despesas ?? null,
    reajuste: extracted.reajuste ? mergeReajustes(existing?.reajuste ?? null, extracted.reajuste) : existing?.reajuste ?? null,
  }
}

export function describeDocumentProcessingError(error: unknown, fileName: string) {
  const message = describeError(error)
  if (/badly formatted|corrupt|invalid file|could not process/i.test(message)) {
    return new Error(`Não foi possível ler "${fileName}". O arquivo está inválido ou corrompido; exporte-o novamente em PDF ou Excel e tente de novo.`)
  }
  return new Error(`Falha ao analisar "${fileName}": ${message}`)
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

export async function readAndValidateFiles(files: File[]) {
  if (files.length === 0) {
    throw new Error("Envie ao menos um arquivo para processamento.")
  }

  const documents: PackageInputDocument[] = []

  for (const file of files) {
    const lowerName = file.name.toLowerCase()
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf")
    const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                    file.type === "application/vnd.ms-excel" || 
                    lowerName.endsWith(".xlsx") ||
                    lowerName.endsWith(".xls")

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

    const fileType = normalizeDocumentFileType(file, fileBuffer, { isPdf, isExcel })

    documents.push({
      fileName: file.name,
      fileType,
      fileSize: file.size,
      fileBase64: fileBuffer.toString("base64"),
      fileBuffer,
    })
  }

  return documents
}

function normalizeDocumentFileType(
  file: File,
  buffer: Buffer,
  kind: { isPdf: boolean; isExcel: boolean },
) {
  if (kind.isPdf) {
    const header = buffer.subarray(0, Math.min(buffer.length, 1024))
    if (header.indexOf("%PDF-") < 0) {
      throw new Error(`Arquivo ${file.name} não contém um PDF válido. Exporte o documento novamente e tente o upload.`)
    }
    return "application/pdf"
  }

  const isXlsx = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
  const oleHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  const isXls = buffer.length >= oleHeader.length && oleHeader.every((byte, index) => buffer[index] === byte)
  if (kind.isExcel && !isXlsx && !isXls) {
    throw new Error(`Arquivo ${file.name} não contém uma planilha Excel válida. Exporte o documento novamente e tente o upload.`)
  }
  return isXls ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
  const extractable = classifications
    .map((classification, index) => ({ classification, document: documents[index] }))
    .filter((pair) => pair.classification.documentType !== "desconhecido")

  for (const [index, pair] of extractable.entries()) {
    const { classification, document } = pair
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

    if (classification.documentType === "prestacao_contas") {
      if (prestacao) throw new Error("Envie somente uma prestação de contas por remessa.")
      prestacao = applyFechamentoContextToPrestacao(
        await extractPrestacaoAliveFromPdf(document, competencia),
        competencia,
        fechamentoContext,
      )
    }

    if (classification.documentType === "comprovante_repasse") {
      repasse = mergeRepasses(repasse, await extractRepasseFromPdf(document))
    }

    if (classification.documentType === "despesas_comprovantes") {
      despesas = mergeDespesas(despesas, await extractDespesasFromPdf(document))
    }

    if (classification.documentType === "relatorio_reajuste") {
      reajuste = mergeReajustes(reajuste, await extractReajusteFromPdf(document))
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

export const MIN_CLASSIFICATION_CONFIDENCE = 0.8

export function enforceClassificationConfidence(classification: ClassifiedDocument): ClassifiedDocument {
  if (classification.documentType === "desconhecido" || classification.confidence >= MIN_CLASSIFICATION_CONFIDENCE) {
    return classification
  }
  return {
    ...classification,
    documentType: "desconhecido",
    reason: `Classificacao abaixo do limiar (${classification.confidence.toFixed(2)} < ${MIN_CLASSIFICATION_CONFIDENCE.toFixed(2)}). ${classification.reason}`,
  }
}

export function mergeRepasses(current: RepasseAnalysis | null, next: RepasseAnalysis): RepasseAnalysis {
  if (!current) return next
  return {
    ...next,
    valor: current.valor === null || next.valor === null ? null : roundMoney(current.valor + next.valor),
    data: current.data === next.data ? next.data : null,
    origem_nome: sameOrNull(current.origem_nome, next.origem_nome),
    destino_nome: sameOrNull(current.destino_nome, next.destino_nome),
    destino_banco: sameOrNull(current.destino_banco, next.destino_banco),
    destino_agencia: sameOrNull(current.destino_agencia, next.destino_agencia),
    destino_conta: sameOrNull(current.destino_conta, next.destino_conta),
    protocolo: null,
    campos_ausentes: unique([...current.campos_ausentes, ...next.campos_ausentes]),
    observacoes: unique([...current.observacoes, ...next.observacoes, "Comprovantes parciais consolidados na remessa."]),
    confianca_geral: Math.min(current.confianca_geral, next.confianca_geral),
  }
}

export function mergeDespesas(current: DespesasAnalysis | null, next: DespesasAnalysis): DespesasAnalysis {
  if (!current) return next
  const despesas = dedupeObjects([...current.despesas, ...next.despesas])
  return {
    despesas,
    total_despesas: roundMoney(despesas.reduce((sum, item) => sum + item.valor, 0)),
    campos_ausentes: unique([...current.campos_ausentes, ...next.campos_ausentes]),
    observacoes: unique([...current.observacoes, ...next.observacoes]),
    confianca_geral: Math.min(current.confianca_geral, next.confianca_geral),
  }
}

export function mergeReajustes(current: ReajusteAnalysis | null, next: ReajusteAnalysis): ReajusteAnalysis {
  if (!current) return next
  return {
    itens: dedupeObjects([...current.itens, ...next.itens]),
    campos_ausentes: unique([...current.campos_ausentes, ...next.campos_ausentes]),
    observacoes: unique([...current.observacoes, ...next.observacoes]),
    confianca_geral: Math.min(current.confianca_geral, next.confianca_geral),
  }
}

function sameOrNull(left: string | null, right: string | null) {
  return left === right ? right : null
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function dedupeObjects<T>(values: T[]) {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()]
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
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
