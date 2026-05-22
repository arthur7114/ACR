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
import { createSupabaseAdmin } from "./supabase"

const BUCKET = "fechamento-documentos"

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
}

export async function persistPackage(input: PersistPackageInput) {
  const supabase = createSupabaseAdmin()
  const { analysis } = input
  const imobiliariaNome = analysis.prestacao?.imobiliaria || "Alive Imoveis"
  const empreendimentoNome = analysis.prestacao?.empreendimento || "Grand Messejana II"
  const competencia = normalizeCompetencia(analysis.prestacao?.competencia ?? "2026-03")

  const { data: imobiliaria, error: imobiliariaError } = await supabase
    .from("imobiliarias")
    .upsert({ nome: imobiliariaNome, layout: "alive", ativo: true }, { onConflict: "nome" })
    .select("id")
    .single()

  if (imobiliariaError) throw imobiliariaError

  const { data: empreendimento, error: empreendimentoError } = await supabase
    .from("empreendimentos")
    .upsert({ nome: empreendimentoNome, ativo: true }, { onConflict: "nome" })
    .select("id")
    .single()

  if (empreendimentoError) throw empreendimentoError

  const { data: fechamento, error: fechamentoError } = await supabase
    .from("fechamentos")
    .upsert(
      {
        imobiliaria_id: imobiliaria.id,
        empreendimento_id: empreendimento.id,
        competencia,
        status: analysis.parecer.status === "bloqueado" ? "pendente_revisao" : "processado_com_sucesso",
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
      },
      { onConflict: "imobiliaria_id,empreendimento_id,competencia" },
    )
    .select("id")
    .single()

  if (fechamentoError) throw fechamentoError

  const persistedDocuments = await persistDocuments({
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
  })

  return {
    fechamentoId: fechamento.id as string,
    storagePath: firstStoragePath,
    documents,
  }
}

async function persistDocuments({
  files,
  fechamentoId,
}: {
  files: PackageFileForPersistence[]
  fechamentoId: string
}) {
  const supabase = createSupabaseAdmin()
  const persisted = []

  for (const file of files) {
    const storagePath = `alive-gmii/${Date.now()}-${sanitizeFilename(file.fileName)}`
    const upload = await supabase.storage.from(BUCKET).upload(storagePath, file.fileBuffer, {
      contentType: file.fileType,
      upsert: false,
    })

    if (upload.error) throw upload.error

    const { data: documento, error } = await supabase
      .from("documentos_fechamento")
      .insert({
        fechamento_id: fechamentoId,
        tipo_documento: file.classification.documentType,
        nome_arquivo: file.fileName,
        arquivo_url: storagePath,
        mime_type: file.fileType,
        tamanho_bytes: file.fileSize,
        status_processamento: file.classification.documentType === "desconhecido" ? "erro" : "processado",
        confianca_classificacao: file.classification.confidence,
        parser_versao: "mastra-package-v1",
        erro_processamento: file.classification.documentType === "desconhecido" ? file.classification.reason : null,
        remessa_numero: 1,
      })
      .select("id")
      .single()

    if (error) throw error

    persisted.push({
      fileName: file.fileName,
      storagePath,
      documentoId: documento.id as string,
    })
  }

  return persisted
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
    ...(prestacao?.receitas_por_imovel.map((row) => ({
      fechamento_id: fechamentoId,
      documento_id: getDocumentoId(documents, "prestacao_contas"),
      tipo_movimentacao: "receita_aluguel",
      categoria: "prestacao_contas_secao_1",
      descricao: `${row.apto} - ${row.inquilino}`,
      valor: row.total,
      sinal: "positivo",
      data_competencia: competencia,
      origem_documental: "prestacao_alive_secao_1",
      confianca_extracao: row.confianca,
      status_validacao: "pendente",
      dados_extraidos: row,
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

async function persistValidacoes({
  fechamentoId,
  documents,
  parecer,
  rechecks,
  guardrails,
}: {
  fechamentoId: string
  documents: ClassifiedDocument[]
  parecer: TechnicalOpinion
  rechecks: PrestacaoRecheck[]
  guardrails: PrestacaoGuardrail[]
}) {
  const supabase = createSupabaseAdmin()
  const rows = [
    ...rechecks
      .filter((check) => check.status !== "passed")
      .map((check) => ({
        fechamento_id: fechamentoId,
        documento_id: null,
        tipo_validacao: check.id,
        severidade: check.status === "failed" ? "bloqueante" : "alerta",
        status: "aberta",
        mensagem: check.message,
        valor_esperado: check.expected ?? null,
        valor_encontrado: check.actual ?? null,
        diferenca: check.difference ?? null,
      })),
    ...guardrails
      .filter((guardrail) => guardrail.status !== "passed")
      .map((guardrail) => ({
        fechamento_id: fechamentoId,
        documento_id: null,
        tipo_validacao: guardrail.id,
        severidade: guardrail.status === "blocked" ? "bloqueante" : "alerta",
        status: "aberta",
        mensagem: guardrail.message,
        valor_esperado: null,
        valor_encontrado: null,
        diferenca: null,
      })),
    {
      fechamento_id: fechamentoId,
      documento_id: getDocumentoId(documents, "prestacao_contas"),
      tipo_validacao: "parecer_tecnico",
      severidade: parecer.status === "bloqueado" ? "bloqueante" : parecer.status === "aprovado_com_ressalvas" ? "alerta" : "info",
      status: parecer.requer_revisao_humana ? "aberta" : "resolvida",
      mensagem: parecer.resumo,
      valor_esperado: null,
      valor_encontrado: parecer.confianca,
      diferenca: null,
    },
  ]

  if (rows.length === 0) return

  const { error } = await supabase.from("validacoes").insert(rows)
  if (error) throw error
}

function getDocumentoId(documents: ClassifiedDocument[], documentType: string) {
  return documents.find((document) => document.documentType === documentType)?.documentoId ?? null
}

function sanitizeFilename(filename: string) {
  return filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function normalizeCompetencia(value: string) {
  const normalized = value.trim()
  const iso = normalized.match(/(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-01`

  const numeric = normalized.match(/(\d{2})\/(\d{4})/)
  if (numeric) return `${numeric[2]}-${numeric[1]}-01`

  if (/mar/i.test(normalized) && /2026/.test(normalized)) return "2026-03-01"

  return "2026-03-01"
}
