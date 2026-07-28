import { createHash } from "node:crypto"
import type {
  ClassifiedDocument,
  DespesasAnalysis,
  PackageAnalysis,
  PrestacaoAnalysis,
  PrestacaoGuardrail,
  PrestacaoRecheck,
  ReajusteAnalysis,
  RepasseAnalysis,
  TechnicalOpinion,
} from "@/lib/prestacao-types"
import { competenciaMesToDatabase } from "@/lib/competencia-fechamento"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { scopeCesarRegoAnalysisToDevelopment } from "@/lib/indicadores-repair"
import { normalizeCadastroKey } from "./cadastros"
import { materializeIndicadoresSnapshots } from "./indicadores-snapshots"
import { attachExistingImovelLinks } from "./fechamento-imoveis"
import { createSupabaseAdmin } from "./supabase"

const BUCKET = "fechamento-documentos"
const DOCUMENT_SOURCE_PREFIX = "fontes/sha256"

export interface ResolvedValidation {
  tipo_validacao: string
  status: string
  justificativa: string | null
  resolvido_por: string | null
  resolvido_em: string | null
}

export interface PackageFileForPersistence {
  fileName: string
  fileType: string
  fileSize: number
  fileBuffer: Buffer
  classification: ClassifiedDocument
}

interface PersistPackageInput {
  files: PackageFileForPersistence[]
  analysis: Omit<PackageAnalysis, "fechamentoId" | "storagePath">
  fechamentoContext?: FechamentoContext | null
}

export async function persistPackage(input: PersistPackageInput) {
  const supabase = createSupabaseAdmin()
  let analysis = input.analysis
  const imobiliariaNome = input.fechamentoContext?.imobiliariaNome ?? analysis.prestacao?.imobiliaria ?? "Imobiliaria nao identificada"
  const empreendimentoNome = input.fechamentoContext?.empreendimentoNome ?? analysis.prestacao?.empreendimento ?? "Empreendimento nao identificado"
  const competencia = normalizeCompetencia(input.fechamentoContext?.competencia ?? analysis.prestacao?.competencia ?? "")

  // O fechamento ja foi criado no upload referenciando imobiliaria/empreendimento
  // existentes. Usar esses IDs evita re-resolver por nome (que colide com a
  // constraint unique(nome) quando ha cadastros com a mesma chave normalizada e
  // tambem garante que o upsert do fechamento atinja a linha correta).
  const imobiliaria = input.fechamentoContext?.imobiliariaId
    ? { id: input.fechamentoContext.imobiliariaId }
    : await findOrCreateImobiliaria(supabase, imobiliariaNome)
  const empreendimento = input.fechamentoContext?.empreendimentoId
    ? { id: input.fechamentoContext.empreendimentoId }
    : await findOrCreateEmpreendimento(supabase, empreendimentoNome)
  analysis = await attachExistingImovelLinks(
    supabase,
    { imobiliariaId: imobiliaria.id as string, empreendimentoId: empreendimento.id as string },
    analysis,
  )
  // O extrato César Rêgo pode conter unidades de mais de um empreendimento.
  // O documento físico é compartilhável, mas os valores persistidos no
  // fechamento precisam permanecer no escopo do empreendimento selecionado.
  analysis = scopeCesarRegoAnalysisToDevelopment(
    analysis as PackageAnalysis,
    empreendimentoNome,
  )

  // Fetch existing resolved validations to decide status and preserve them
  const { data: existingFechamento } = await supabase
    .from("fechamentos")
    .select("id")
    .eq("imobiliaria_id", imobiliaria.id)
    .eq("empreendimento_id", empreendimento.id)
    .eq("competencia", competencia)
    .maybeSingle()

  let resolvedValidations: ResolvedValidation[] = []
  if (existingFechamento) {
    const { data } = await supabase
      .from("validacoes")
      .select("tipo_validacao, status, justificativa, resolvido_por, resolvido_em")
      .eq("fechamento_id", existingFechamento.id)
      .in("status", ["resolvida", "ignorada_com_justificativa"])
    resolvedValidations = data || []
  }

  const hasUnresolvedBlocking =
    (analysis.parecer.status === "bloqueado" && !resolvedValidations.some((r) => r.tipo_validacao === "parecer_tecnico")) ||
    analysis.rechecks.some((c) => c.status === "failed" && !resolvedValidations.some((r) => r.tipo_validacao === c.id)) ||
    analysis.guardrails.some((g) => g.status === "blocked" && !resolvedValidations.some((r) => r.tipo_validacao === g.id))

  const { data: fechamento, error: fechamentoError } = await supabase
    .from("fechamentos")
    .upsert(
      {
        imobiliaria_id: imobiliaria.id,
        empreendimento_id: empreendimento.id,
        competencia,
        status: hasUnresolvedBlocking ? "pendente_revisao" : "processado_com_sucesso",
        total_receitas: analysis.totals.total_receitas,
        total_despesas: analysis.totals.total_despesas,
        total_comissoes: analysis.totals.total_comissoes,
        total_repassar: analysis.totals.total_a_repassar,
        valor_repassado_comprovante: analysis.totals.valor_comprovado,
        diferenca_total: analysis.totals.diferenca_repasse,
        parecer_tecnico: {
          parecer: analysis.parecer,
          rechecks: analysis.rechecks,
          guardrails: analysis.guardrails,
          documents: analysis.documents,
          totals: analysis.totals,
        },
        analise_completa: analysis,
      },
      { onConflict: "imobiliaria_id,empreendimento_id,competencia" },
    )
    .select("id")
    .single()

  if (fechamentoError) throw fechamentoError

  const persistedDocuments = await persistDocuments({
    supabase,
    files: input.files,
    fechamentoId: fechamento.id as string,
  })

  const firstStoragePath = persistedDocuments[0]?.storagePath ?? null
  const documents = analysis.documents.map((document) => {
    const persisted = persistedDocuments.find((item) => item.fileName === document.fileName)
    return {
      ...document,
      storagePath: persisted?.storagePath ?? null,
      documentoId: persisted?.documentoId ?? null,
    }
  })

  // Clear previous movimentacoes and validacoes for this fechamento to avoid duplication on reprocessing
  const { error: deleteMovError } = await supabase
    .from("movimentacoes")
    .delete()
    .eq("fechamento_id", fechamento.id)

  if (deleteMovError) throw deleteMovError

  const { error: deleteValError } = await supabase
    .from("validacoes")
    .delete()
    .eq("fechamento_id", fechamento.id)

  if (deleteValError) throw deleteValError

  await persistMovimentacoes({
    fechamentoId: fechamento.id as string,
    competencia,
    documents,
    prestacao: analysis.prestacao,
    repasse: analysis.repasse,
    despesas: analysis.despesas,
    reajuste: analysis.reajuste,
  })

  await persistValidacoes({
    fechamentoId: fechamento.id as string,
    documents,
    parecer: analysis.parecer,
    rechecks: analysis.rechecks,
    guardrails: analysis.guardrails,
    resolvedValidations,
  })

  await materializeIndicadoresSnapshots({
    supabase,
    fechamentoId: fechamento.id as string,
    imobiliariaId: imobiliaria.id as string,
    empreendimentoId: empreendimento.id as string,
    competencia,
    analysis,
  })

  return {
    fechamentoId: fechamento.id as string,
    storagePath: firstStoragePath,
    documents,
  }
}

export async function persistDocuments({
  supabase = createSupabaseAdmin(),
  files,
  fechamentoId,
}: {
  supabase?: ReturnType<typeof createSupabaseAdmin>
  files: PackageFileForPersistence[]
  fechamentoId: string
}) {
  const persisted: Array<{
    fileName: string
    storagePath: string
    documentoId: string
  }> = []

  for (const file of files) {
    persisted.push(await persistDocument({ supabase, file, fechamentoId }))
  }

  return persisted
}

interface PersistDocumentInput {
  supabase: ReturnType<typeof createSupabaseAdmin>
  file: PackageFileForPersistence
  fechamentoId: string
}

async function persistDocument(input: PersistDocumentInput) {
  const sha256 = calculateDocumentSha256(input.file.fileBuffer)
  const existing = await findCanonicalDocument(input, sha256)

  if (!existing.schemaAvailable) {
    return persistLegacyDocument(input, sha256)
  }

  if (existing.document) {
    return buildPersistedDocument(input.file.fileName, existing.document)
  }

  const source = await findOrCreateDocumentSource(input, sha256)
  if (!source.schemaAvailable) return persistLegacyDocument(input, sha256)

  const documentRow = buildDocumentRow(
    input.file,
    input.fechamentoId,
    source.storagePath,
    sha256,
    source.sourceId,
  )
  const { data, error } = await input.supabase
    .from("documentos_fechamento")
    .insert(documentRow)
    .select("id,arquivo_url")
    .single()

  if (!error && data) return buildPersistedDocument(input.file.fileName, data)
  if (!isUniqueViolation(error)) throw error

  const raced = await findCanonicalDocument(input, sha256)
  if (!raced.document) throw error
  return buildPersistedDocument(input.file.fileName, raced.document)
}

async function persistLegacyDocument(
  input: PersistDocumentInput,
  sha256: string,
) {
  const storagePath = buildDocumentStoragePath(sha256)
  const { data: existing, error: lookupError } = await input.supabase
    .from("documentos_fechamento")
    .select("id,arquivo_url")
    .eq("fechamento_id", input.fechamentoId)
    .eq("arquivo_url", storagePath)
    .limit(1)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (existing) return buildPersistedDocument(input.file.fileName, existing)

  await ensureDocumentUploaded(input, storagePath)
  const { data, error } = await input.supabase
    .from("documentos_fechamento")
    .insert(
      buildDocumentRow(
        input.file,
        input.fechamentoId,
        storagePath,
      ),
    )
    .select("id,arquivo_url")
    .single()

  if (error) throw error
  return buildPersistedDocument(input.file.fileName, data)
}

async function findCanonicalDocument(
  input: PersistDocumentInput,
  sha256: string,
) {
  const { data, error } = await input.supabase
    .from("documentos_fechamento")
    .select("id,arquivo_url")
    .eq("fechamento_id", input.fechamentoId)
    .eq("sha256", sha256)
    .is("duplicado_de_id", null)
    .limit(1)
    .maybeSingle()

  if (isDedupSchemaUnavailable(error)) {
    return { schemaAvailable: false as const, document: null }
  }
  if (error) throw error

  return {
    schemaAvailable: true as const,
    document: data
      ? { id: data.id as string, arquivo_url: data.arquivo_url as string }
      : null,
  }
}

async function findOrCreateDocumentSource(
  input: PersistDocumentInput,
  sha256: string,
) {
  const existing = await findDocumentSource(input, sha256)
  if (!existing.schemaAvailable || existing.source) {
    return {
      schemaAvailable: existing.schemaAvailable,
      sourceId: existing.source?.id ?? "",
      storagePath: existing.source?.arquivo_url ?? "",
    }
  }

  const storagePath = buildDocumentStoragePath(sha256)
  await ensureDocumentUploaded(input, storagePath)
  const { data, error } = await input.supabase
    .from("documento_fontes")
    .insert({
      sha256,
      arquivo_url: storagePath,
      mime_type: input.file.fileType,
      tamanho_bytes: input.file.fileSize,
    })
    .select("id,arquivo_url")
    .single()

  if (!error && data) {
    return {
      schemaAvailable: true as const,
      sourceId: data.id as string,
      storagePath: data.arquivo_url as string,
    }
  }
  if (!isUniqueViolation(error)) throw error

  const raced = await findDocumentSource(input, sha256)
  if (!raced.source) throw error
  return {
    schemaAvailable: true as const,
    sourceId: raced.source.id,
    storagePath: raced.source.arquivo_url,
  }
}

async function findDocumentSource(
  input: PersistDocumentInput,
  sha256: string,
) {
  const { data, error } = await input.supabase
    .from("documento_fontes")
    .select("id,arquivo_url")
    .eq("sha256", sha256)
    .maybeSingle()

  if (isDedupSchemaUnavailable(error)) {
    return { schemaAvailable: false as const, source: null }
  }
  if (error) throw error

  return {
    schemaAvailable: true as const,
    source: data
      ? {
          id: data.id as string,
          arquivo_url: data.arquivo_url as string,
        }
      : null,
  }
}

async function ensureDocumentUploaded(
  input: PersistDocumentInput,
  storagePath: string,
) {
  const { error } = await input.supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file.fileBuffer, {
      contentType: input.file.fileType,
      upsert: false,
    })

  if (error && !isStorageAlreadyExists(error)) throw error
}

function buildDocumentRow(
  file: PackageFileForPersistence,
  fechamentoId: string,
  storagePath: string,
  sha256?: string,
  sourceId?: string,
) {
  return {
    fechamento_id: fechamentoId,
    tipo_documento: file.classification.documentType,
    nome_arquivo: file.fileName,
    arquivo_url: storagePath,
    mime_type: file.fileType,
    tamanho_bytes: file.fileSize,
    status_processamento:
      file.classification.documentType === "desconhecido"
        ? "erro"
        : "processado",
    confianca_classificacao: file.classification.confidence,
    parser_versao: "mastra-package-v2",
    erro_processamento:
      file.classification.documentType === "desconhecido"
        ? file.classification.reason
        : null,
    remessa_numero: 1,
    ...(sha256
      ? {
          sha256,
          fonte_id: sourceId,
          duplicado_de_id: null,
        }
      : {}),
  }
}

function buildPersistedDocument(
  fileName: string,
  document: { id: unknown; arquivo_url: unknown },
) {
  return {
    fileName,
    storagePath: document.arquivo_url as string,
    documentoId: document.id as string,
  }
}

export function calculateDocumentSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

export function buildDocumentStoragePath(sha256: string) {
  return `${DOCUMENT_SOURCE_PREFIX}/${sha256.slice(0, 2)}/${sha256}`
}

function isDedupSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false
  const value = error as { code?: string; message?: string }
  return (
    value.code === "42P01"
    || value.code === "42703"
    || value.code === "PGRST204"
    || /documento_fontes|sha256|duplicado_de_id/i.test(value.message ?? "")
  )
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && (error as { code?: string }).code === "23505",
  )
}

function isStorageAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false
  const value = error as {
    status?: number
    statusCode?: string | number
    message?: string
  }
  return (
    value.status === 409
    || String(value.statusCode) === "409"
    || /already exists|duplicate|resource exists/i.test(value.message ?? "")
  )
}

async function persistMovimentacoes({
  fechamentoId,
  competencia,
  documents,
  prestacao,
  repasse,
  despesas,
  reajuste,
}: {
  fechamentoId: string
  competencia: string
  documents: ClassifiedDocument[]
  prestacao: PrestacaoAnalysis | null
  repasse: RepasseAnalysis | null
  despesas: DespesasAnalysis | null
  reajuste: ReajusteAnalysis | null
}) {
  const supabase = createSupabaseAdmin()
  const rows = [
    ...buildPrestacaoMovimentacoes({
      fechamentoId,
      documentoId: getDocumentoId(documents, "prestacao_contas"),
      prestacao,
    }),
    ...(prestacao?.acordos_rescisoes_recebidos.map((item) => ({
      fechamento_id: fechamentoId,
      documento_id: getDocumentoId(documents, "prestacao_contas"),
      tipo_movimentacao: "acordo_rescisao_recebido",
      categoria: item.tipo,
      descricao: [item.apto, item.inquilino, item.observacao].filter(Boolean).join(" - ") || "Acordo/rescisao recebido",
      valor: item.valor,
      sinal: "positivo",
      data_competencia: competenciaMesToDatabase(item.competencia_original) ?? competencia,
      origem_documental: "prestacao_acordos_rescisoes",
      confianca_extracao: item.confianca,
      status_validacao: "pendente",
      dados_extraidos: item,
    })) ?? []),
    ...(despesas?.despesas.map((despesa) => ({
      fechamento_id: fechamentoId,
      documento_id: getDocumentoId(documents, "despesas_comprovantes"),
      tipo_movimentacao: "despesa",
      categoria: despesa.tipo,
      descricao: despesa.fornecedor || despesa.observacao || "Despesa extraida",
      valor: despesa.valor,
      sinal: "negativo",
      data_competencia: competencia,
      origem_documental: "despesas_comprovantes",
      confianca_extracao: despesa.confianca,
      status_validacao: "pendente",
      dados_extraidos: despesa,
    })) ?? []),
    ...(repasse && repasse.valor !== null
      ? [
          {
            fechamento_id: fechamentoId,
            documento_id: getDocumentoId(documents, "comprovante_repasse"),
            tipo_movimentacao: "repasse_comprovado",
            categoria: "comprovante_bancario",
            descricao: repasse.destino_nome || "Comprovante de repasse",
            valor: repasse.valor,
            sinal: "positivo",
            data_competencia: competencia,
            origem_documental: "comprovante_repasse",
            confianca_extracao: repasse.confianca_geral,
            status_validacao: "pendente",
            dados_extraidos: repasse,
          },
        ]
      : []),
    ...(reajuste?.itens.map((item) => ({
      fechamento_id: fechamentoId,
      documento_id: getDocumentoId(documents, "relatorio_reajuste"),
      tipo_movimentacao: "reajuste_info",
      categoria: "relatorio_reajuste",
      descricao: item.descricao,
      valor: item.valor_novo ?? item.valor_anterior ?? 0,
      sinal: "positivo",
      data_competencia: competencia,
      origem_documental: "relatorio_reajuste",
      confianca_extracao: item.confianca,
      status_validacao: "pendente",
      dados_extraidos: item,
    })) ?? []),
  ]

  if (rows.length === 0) return

  const { error } = await supabase.from("movimentacoes").insert(rows)
  if (error) throw error
}

export function buildPrestacaoMovimentacoes({
  fechamentoId,
  documentoId,
  prestacao,
}: {
  fechamentoId: string
  documentoId: string | null
  prestacao: PrestacaoAnalysis | null
}) {
  return (
    prestacao?.receitas_por_imovel.map((row) => ({
      fechamento_id: fechamentoId,
      documento_id: documentoId,
      tipo_movimentacao: "receita_aluguel",
      categoria: "prestacao_contas_secao_1",
      descricao: `${row.apto} - ${row.inquilino}`,
      valor: row.total,
      sinal: "positivo",
      data_competencia: competenciaMesToDatabase(row.competencia_original),
      origem_documental: "prestacao_alive_secao_1",
      confianca_extracao: row.confianca,
      status_validacao: "pendente",
      imovel_id: row.imovel_id ?? null,
      dados_extraidos: row,
    })) ?? []
  )
}

interface BuildValidacoesInput {
  fechamentoId: string
  documents: ClassifiedDocument[]
  parecer: TechnicalOpinion
  rechecks: PrestacaoRecheck[]
  guardrails: PrestacaoGuardrail[]
  resolvedValidations: ResolvedValidation[]
}

export function buildValidacoesRows({
  fechamentoId,
  documents,
  parecer,
  rechecks,
  guardrails,
  resolvedValidations,
}: BuildValidacoesInput) {
  return [
    ...rechecks
      .filter((check) => check.status !== "passed")
      .map((check) => {
        const resolved = resolvedValidations.find((r) => r.tipo_validacao === check.id)
        return {
          fechamento_id: fechamentoId,
          documento_id: null,
          tipo_validacao: check.id,
          severidade: check.status === "failed" ? "bloqueante" : "alerta",
          status: resolved ? resolved.status : "aberta",
          mensagem: check.message,
          valor_esperado: check.expected ?? null,
          valor_encontrado: check.actual ?? null,
          diferenca: check.difference ?? null,
          justificativa: resolved ? resolved.justificativa : null,
          resolvido_por: resolved ? resolved.resolvido_por : null,
          resolvido_em: resolved ? resolved.resolvido_em : null,
        }
      }),
    ...guardrails
      .filter((guardrail) => guardrail.status !== "passed")
      .map((guardrail) => {
        const resolved = resolvedValidations.find((r) => r.tipo_validacao === guardrail.id)
        return {
          fechamento_id: fechamentoId,
          documento_id: null,
          tipo_validacao: guardrail.id,
          severidade: guardrail.status === "blocked" ? "bloqueante" : "alerta",
          status: resolved ? resolved.status : "aberta",
          mensagem: guardrail.message,
          valor_esperado: null,
          valor_encontrado: null,
          diferenca: null,
          justificativa: resolved ? resolved.justificativa : null,
          resolvido_por: resolved ? resolved.resolvido_por : null,
          resolvido_em: resolved ? resolved.resolvido_em : null,
        }
      }),
    (() => {
      const resolved = resolvedValidations.find((r) => r.tipo_validacao === "parecer_tecnico")
      return {
        fechamento_id: fechamentoId,
        documento_id: getDocumentoId(documents, "prestacao_contas"),
        tipo_validacao: "parecer_tecnico",
        severidade: parecer.status === "bloqueado" ? "bloqueante" : parecer.status === "aprovado_com_ressalvas" ? "alerta" : "info",
        status: resolved ? resolved.status : parecer.requer_revisao_humana ? "aberta" : "resolvida",
        mensagem: parecer.resumo,
        valor_esperado: null,
        valor_encontrado: parecer.confianca,
        diferenca: null,
        justificativa: resolved ? resolved.justificativa : null,
        resolvido_por: resolved ? resolved.resolvido_por : null,
        resolvido_em: resolved ? resolved.resolvido_em : null,
      }
    })(),
  ]
}

export async function persistValidacoes(input: BuildValidacoesInput) {
  const rows = buildValidacoesRows(input)
  if (rows.length === 0) return
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.from("validacoes").insert(rows)
  if (error) throw error
}

function getDocumentoId(documents: ClassifiedDocument[], documentType: string) {
  return documents.find((document) => document.documentType === documentType)?.documentoId ?? null
}

function normalizeCompetencia(value: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error("Competencia do fechamento nao identificada.")

  const iso = normalized.match(/(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-01`

  const numeric = normalized.match(/(\d{2})\/(\d{4})/)
  if (numeric) return `${numeric[2]}-${numeric[1]}-01`

  if (/mar/i.test(normalized) && /2026/.test(normalized)) return "2026-03-01"

  throw new Error(`Competencia do fechamento invalida: ${value}.`)
}

async function findOrCreateImobiliaria(supabase: ReturnType<typeof createSupabaseAdmin>, nome: string) {
  const { data: rows, error: lookupError } = await supabase
    .from("imobiliarias")
    .select("id,nome,ativo,criado_em")
    .order("ativo", { ascending: false })
    .order("criado_em", { ascending: true })

  if (lookupError) throw lookupError

  const normalized = normalizeCadastroKey(nome)
  const existing = (rows ?? []).find((row) => normalizeCadastroKey(row.nome) === normalized)
  // Em correspondencia, nao sobrescrever `nome` (renomear para o valor de
  // entrada colide com unique(nome) quando ha duplicatas de mesma chave).
  const query = existing
    ? supabase.from("imobiliarias").update({ ativo: true }).eq("id", existing.id)
    : supabase.from("imobiliarias").insert({ nome, layout: "alive", ativo: true })

  const { data, error } = await query.select("id").single()
  if (error) throw error
  return data
}

async function findOrCreateEmpreendimento(supabase: ReturnType<typeof createSupabaseAdmin>, nome: string) {
  const { data: rows, error: lookupError } = await supabase
    .from("empreendimentos")
    .select("id,nome,ativo,criado_em")
    .order("ativo", { ascending: false })
    .order("criado_em", { ascending: true })

  if (lookupError) throw lookupError

  const normalized = normalizeCadastroKey(nome)
  const existing = (rows ?? []).find((row) => normalizeCadastroKey(row.nome) === normalized)
  // Em correspondencia, nao sobrescrever `nome` (renomear para o valor de
  // entrada colide com unique(nome) quando ha duplicatas de mesma chave).
  const query = existing
    ? supabase.from("empreendimentos").update({ ativo: true }).eq("id", existing.id)
    : supabase.from("empreendimentos").insert({ nome, ativo: true })

  const { data, error } = await query.select("id").single()
  if (error) throw error
  return data
}
