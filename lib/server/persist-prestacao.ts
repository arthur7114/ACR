import type {
  PrestacaoAnalysis,
  PrestacaoGuardrail,
  PrestacaoRecheck,
  TechnicalOpinion,
} from "@/lib/prestacao-types"
import { competenciaMesToDatabase } from "@/lib/competencia-fechamento"
import { normalizeCadastroKey } from "./cadastros"
import { createSupabaseAdmin } from "./supabase"
import { attachExistingImovelLinks } from "./fechamento-imoveis"

const BUCKET = "fechamento-documentos"

interface PersistPrestacaoInput {
  fileName: string
  fileType: string
  fileSize: number
  fileBuffer: Buffer
  analysis: PrestacaoAnalysis
  parecer: TechnicalOpinion
  rechecks: PrestacaoRecheck[]
  guardrails: PrestacaoGuardrail[]
}

export async function persistPrestacao(input: PersistPrestacaoInput) {
  const supabase = createSupabaseAdmin()
  let { analysis } = input
  const { parecer, rechecks, guardrails } = input
  const storagePath = `alive-gmii/${Date.now()}-${sanitizeFilename(input.fileName)}`

  const upload = await supabase.storage.from(BUCKET).upload(storagePath, input.fileBuffer, {
    contentType: input.fileType,
    upsert: false,
  })

  if (upload.error) {
    throw upload.error
  }

  const imobiliaria = await findOrCreateImobiliaria(supabase, analysis.imobiliaria || "Alive Imoveis")
  const empreendimento = await findOrCreateEmpreendimento(supabase, analysis.empreendimento || "Grand Messejana II")
  analysis = await attachExistingImovelLinks(
    supabase,
    { imobiliariaId: imobiliaria.id as string, empreendimentoId: empreendimento.id as string },
    { prestacao: analysis },
  ).then((result) => result.prestacao ?? analysis)

  const { data: fechamento, error: fechamentoError } = await supabase
    .from("fechamentos")
    .upsert(
      {
        imobiliaria_id: imobiliaria.id,
        empreendimento_id: empreendimento.id,
        competencia: normalizeCompetencia(analysis.competencia),
        status: "pendente_revisao",
        total_receitas: analysis.totais.total_receitas,
        total_comissoes: analysis.totais.total_comissoes,
        total_repassar: analysis.totais.total_repassar,
        parecer_tecnico: {
          parecer,
          rechecks,
          guardrails,
        },
      },
      { onConflict: "imobiliaria_id,empreendimento_id,competencia" },
    )
    .select("id")
    .single()

  if (fechamentoError) throw fechamentoError

  const { data: documento, error: documentoError } = await supabase
    .from("documentos_fechamento")
    .insert({
      fechamento_id: fechamento.id,
      tipo_documento: "prestacao_contas",
      nome_arquivo: input.fileName,
      arquivo_url: storagePath,
      mime_type: input.fileType,
      tamanho_bytes: input.fileSize,
      status_processamento: "processado",
      confianca_classificacao: analysis.confianca_geral,
      parser_versao: "mastra-prestacao-alive-v1",
      remessa_numero: 1,
    })
    .select("id")
    .single()

  if (documentoError) throw documentoError

  const movimentacoes = analysis.receitas_por_imovel.map((row) => ({
    fechamento_id: fechamento.id,
    documento_id: documento.id,
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
  }))

  if (movimentacoes.length > 0) {
    const { error } = await supabase.from("movimentacoes").insert(movimentacoes)
    if (error) throw error
  }

  const validationRows = buildValidationRows({
    fechamentoId: fechamento.id as string,
    documentoId: documento.id as string,
    parecer,
    rechecks,
  })

  if (validationRows.length > 0) {
    const { error } = await supabase.from("validacoes").insert(validationRows)
    if (error) throw error
  }

  return {
    fechamentoId: fechamento.id as string,
    documentoId: documento.id as string,
    storagePath,
  }
}

function buildValidationRows({
  fechamentoId,
  documentoId,
  parecer,
  rechecks,
}: {
  fechamentoId: string
  documentoId: string
  parecer: TechnicalOpinion
  rechecks: PrestacaoRecheck[]
}) {
  const recheckRows = rechecks
    .filter((check) => check.status !== "passed")
    .map((check) => ({
      fechamento_id: fechamentoId,
      documento_id: documentoId,
      tipo_validacao: check.id,
      severidade: check.status === "failed" ? "bloqueante" : "alerta",
      status: "aberta",
      mensagem: check.message,
      valor_esperado: check.expected ?? null,
      valor_encontrado: check.actual ?? null,
      diferenca: check.difference ?? null,
    }))

  return [
    ...recheckRows,
    {
      fechamento_id: fechamentoId,
      documento_id: documentoId,
      tipo_validacao: "parecer_tecnico",
      severidade: parecer.status === "bloqueado" ? "bloqueante" : parecer.status === "aprovado_com_ressalvas" ? "alerta" : "info",
      status: parecer.requer_revisao_humana ? "aberta" : "resolvida",
      mensagem: parecer.resumo,
      valor_esperado: null,
      valor_encontrado: parecer.confianca,
      diferenca: null,
    },
  ]
}

function sanitizeFilename(filename: string) {
  return filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function normalizeCompetencia(value: string) {
  const normalized = value.trim()
  const match = normalized.match(/(\d{4})-(\d{2})/)

  if (match) return `${match[1]}-${match[2]}-01`

  if (/mar/i.test(normalized) && /2026/.test(normalized)) return "2026-03-01"

  return "2026-03-01"
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
  const query = existing
    ? supabase.from("empreendimentos").update({ ativo: true }).eq("id", existing.id)
    : supabase.from("empreendimentos").insert({ nome, ativo: true })

  const { data, error } = await query.select("id").single()
  if (error) throw error
  return data
}
