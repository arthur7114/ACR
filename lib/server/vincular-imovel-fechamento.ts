import { randomUUID } from "node:crypto"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"
import { imovelInputSchema, imovelStatusSchema } from "./cadastros"
import { applyFechamentoCorrection, resolveReceitaMovement } from "./fechamento-corrections"
import {
  construirVinculosImoveis,
  type ImovelVinculoCadastro,
} from "./fechamento-imoveis"
import { FechamentoCorrectionError } from "./corrigir-competencia-receita"
import { createSupabaseAdmin } from "./supabase"

const EDITABLE_STATUSES = new Set(["pendente_revisao", "processado_com_sucesso"])

interface VincularInput {
  fechamentoId: string
  indice: number
  modo: "existente" | "criar"
  imovelId?: string
  statusSugerido?: unknown
  atualizacoes?: { inquilino?: boolean; status?: boolean; aluguel?: boolean }
  cadastro?: Record<string, unknown>
}

export async function vincularImovelFechamento(input: VincularInput) {
  const supabase = createSupabaseAdmin()
  const fechamento = await loadFechamento(supabase, input.fechamentoId)
  const imoveis = await loadImoveis(supabase, fechamento)
  const context = getReceitaContext(fechamento.analise_completa, input.indice)
  const resolution = input.modo === "existente"
    ? prepareExistingResolution(imoveis, context.row, input)
    : prepareCreateResolution(fechamento, input)
  const linkedRow = { ...context.row, imovel_id: resolution.imovel.id }
  const newAnalysis = replaceReceita(fechamento.analise_completa, input.indice, linkedRow)
  const movements = await loadReceitaMovements(supabase, input.fechamentoId)
  const movement = resolveReceitaMovement(movements, context.rows, input.indice)
  if (!movement) throw new FechamentoCorrectionError("Movimentação da receita não encontrada. Reprocesse o fechamento antes de vincular.", 409)

  await applyFechamentoCorrection({
    fechamentoId: input.fechamentoId,
    fechamentoPatch: { analise_completa: newAnalysis },
    movimentacoes: [{ id: movement.id, imovel_id: resolution.imovel.id, dados_extraidos: linkedRow }],
    auditorias: [buildLinkAudit(context.row, resolution, movement.id)],
    imovelOperacao: resolution.operation,
    esperadoAtualizadoEm: fechamento.atualizado_em,
  })

  const vinculos = construirVinculosImoveis(newAnalysis.prestacao ?? null, mergeResolvedImovel(imoveis, resolution.imovel))
  return { imovel: resolution.imovel, vinculos }
}

async function loadFechamento(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,status,analise_completa,atualizado_em")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new FechamentoCorrectionError("Fechamento não encontrado.", 404)
  if (!EDITABLE_STATUSES.has(data.status)) throw new FechamentoCorrectionError("Reabra a revisão antes de resolver vínculos.", 409)
  return { ...data, analise_completa: data.analise_completa as PackageAnalysis | null }
}

function getReceitaContext(analysis: PackageAnalysis | null, index: number) {
  const rows = analysis?.prestacao?.receitas_por_imovel
  const row = rows?.[index]
  if (!analysis?.prestacao || !rows || !row) throw new FechamentoCorrectionError("Linha não encontrada na prestação.", 404)
  return { row, rows }
}

function prepareExistingResolution(
  imoveis: ImovelVinculoCadastro[],
  row: ReceitaPorImovel,
  input: VincularInput,
) {
  if (!input.imovelId) throw new FechamentoCorrectionError("Selecione um imóvel cadastrado.", 400)
  const existing = imoveis.find((item) => item.id === input.imovelId)
  if (!existing) throw new FechamentoCorrectionError("Imóvel não encontrado neste fechamento.", 404)
  const changes = buildExistingChanges(row, input)
  return {
    imovel: { ...existing, ...changes },
    before: existing,
    mode: "existente" as const,
    operation: { modo: "atualizar", id: existing.id, dados: changes },
  }
}

async function loadImoveis(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  fechamento: { imobiliaria_id: string; empreendimento_id: string },
) {
  const { data, error } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,inquilino_nome,status,valor_aluguel_esperado")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
    .order("unidade")
  if (error) throw error
  return (data ?? []) as ImovelVinculoCadastro[]
}

function mergeResolvedImovel(imoveis: ImovelVinculoCadastro[], resolved: ImovelVinculoCadastro) {
  return [...imoveis.filter((item) => item.id !== resolved.id), resolved].sort((a, b) => a.unidade.localeCompare(b.unidade))
}

function buildExistingChanges(row: ReceitaPorImovel, input: VincularInput) {
  const changes: Record<string, unknown> = {}
  if (input.atualizacoes?.inquilino) changes.inquilino_nome = row.inquilino?.trim() || null
  if (input.atualizacoes?.aluguel) changes.valor_aluguel_esperado = row.aluguel
  if (input.atualizacoes?.status) {
    const status = imovelStatusSchema.safeParse(input.statusSugerido)
    if (!status.success) throw new FechamentoCorrectionError("Status sugerido inválido.", 400)
    changes.status = status.data
  }
  return changes
}

function prepareCreateResolution(
  fechamento: { imobiliaria_id: string; empreendimento_id: string },
  input: VincularInput,
) {
  const cadastro = input.cadastro ?? {}
  const parsed = imovelInputSchema.safeParse({
    ...cadastro,
    empreendimento_id: fechamento.empreendimento_id,
    imobiliaria_id: fechamento.imobiliaria_id,
    ativo: true,
  })
  if (!parsed.success) throw new FechamentoCorrectionError(parsed.error.issues.map((item) => item.message).join("; "), 400)
  const imovel: ImovelVinculoCadastro = {
    id: randomUUID(),
    codigo_imobiliaria: parsed.data.codigo_imobiliaria,
    unidade: parsed.data.unidade,
    inquilino_nome: parsed.data.inquilino_nome ?? null,
    status: parsed.data.status,
    valor_aluguel_esperado: parsed.data.valor_aluguel_esperado ?? null,
  }
  return { imovel, before: null, mode: "criar" as const, operation: { modo: "criar", id: imovel.id, dados: imovel } }
}

function replaceReceita(analysis: PackageAnalysis | null, index: number, row: ReceitaPorImovel): PackageAnalysis {
  const current = analysis!
  const prestacao = current.prestacao!
  const receitas = [...prestacao.receitas_por_imovel]
  receitas[index] = row
  return { ...current, prestacao: { ...prestacao, receitas_por_imovel: receitas } }
}

async function loadReceitaMovements(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("id,dados_extraidos")
    .eq("fechamento_id", id)
    .eq("tipo_movimentacao", "receita_aluguel")
    .order("criado_em", { ascending: true }).order("id", { ascending: true })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; dados_extraidos: { apto?: string; inquilino?: string } | null }>
}

function buildLinkAudit(
  row: ReceitaPorImovel,
  resolution: { imovel: { id: string }; before: unknown; mode: "criar" | "existente" },
  movementId: string | null,
) {
  return {
    movimentacao_id: movementId,
    usuario: "Operador",
    campo_alterado: `imovel_vinculado:${row.apto}`,
    valor_anterior: resolution.before ? JSON.stringify(resolution.before) : null,
    valor_novo: JSON.stringify(resolution.imovel),
    justificativa: resolution.mode === "criar"
      ? "Imóvel criado e vinculado durante a revisão do fechamento."
      : "Imóvel existente vinculado durante a revisão do fechamento.",
  }
}
