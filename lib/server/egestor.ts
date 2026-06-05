import type { SupabaseClient } from "@supabase/supabase-js"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type { EgestorCategoria, EgestorTipoLancamento } from "@/lib/egestor-types"
import { EgestorApiError, EgestorClient } from "./egestor-client"

const BUCKET = "fechamento-documentos"
const CATEGORIAS_DESPESA: Record<string, EgestorCategoria> = {
  energia: "energia",
  agua: "agua",
  iptu: "iptu",
  seguro: "seguro",
  outro: "outras_despesas",
}

type DbConfig = {
  personal_token: string | null
  cod_disponivel_padrao: number | null
  ativo: boolean
}

type DbMapeamento = {
  categoria: EgestorCategoria
  tipo_lancamento: EgestorTipoLancamento
  cod_plano_contas: number | null
  tags: string[] | null
  descricao: string | null
  ativo: boolean
}

type FechamentoRow = {
  id: string
  competencia: string
  status: string
  analise_completa: PackageAnalysis | null
  imobiliarias: { nome: string; egestor_contato_id: number | null; egestor_tag_id: string | null } | null
  empreendimentos: { nome: string; egestor_tag_id: string | null } | null
}

type DraftLancamento = {
  tipo: EgestorTipoLancamento
  categoria: EgestorCategoria
  descricao: string
  valor: number
}

type PersistedLancamento = {
  id: string
  fechamento_id: string
  tipo: EgestorTipoLancamento
  categoria: EgestorCategoria
  descricao: string
  valor: number
  tags: string[]
  payload: Record<string, unknown>
  egestor_codigo?: number | null
  egestor_cod_modulo?: number | null
}

export async function approveFechamentoForEgestor(supabase: SupabaseClient, fechamentoId: string) {
  const openBlocking = await getOpenBlockingCount(supabase, fechamentoId)
  if (openBlocking > 0) throw new Error("Resolva as pendencias bloqueantes antes de aprovar.")
  const previousStatus = await getFechamentoStatus(supabase, fechamentoId)

  const { data, error } = await supabase
    .from("fechamentos")
    .update({ status: "aprovado", aprovado_por: "Operador", aprovado_em: new Date().toISOString() })
    .eq("id", fechamentoId)
    .select("id,status")
    .single()

  if (error) throw error
  await logStatusEvento(supabase, fechamentoId, previousStatus, "aprovado", "Operador", "Aprovacao manual do fechamento.")
  return data
}

export async function generateEgestorPreview(supabase: SupabaseClient, fechamentoId: string) {
  const fechamento = await getFechamento(supabase, fechamentoId)
  if (!["aprovado", "preparado_egestor", "erro_egestor"].includes(fechamento.status)) {
    throw new Error("Aprove o fechamento antes de preparar o eGestor.")
  }

  const openBlocking = await getOpenBlockingCount(supabase, fechamentoId)
  if (openBlocking > 0) throw new Error("Fechamento possui pendencias bloqueantes abertas.")

  const config = await getConfig(supabase)
  const maps = await getMapeamentos(supabase)
  const drafts = buildDrafts(fechamento)
  const rows = drafts.map((draft) => buildLancamentoRow(fechamento, config, maps, draft))
  const { data: sentRows, error: sentError } = await supabase
    .from("egestor_lancamentos")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)
    .limit(1)
  if (sentError) throw sentError
  if (sentRows && sentRows.length > 0) throw new Error("Fechamento ja possui lancamentos enviados ao eGestor.")

  await supabase.from("egestor_lancamentos").delete().eq("fechamento_id", fechamentoId).is("egestor_codigo", null)

  if (rows.length > 0) {
    const { error } = await supabase.from("egestor_lancamentos").upsert(rows, {
      onConflict: "fechamento_id,tipo,categoria",
    })
    if (error) throw error
  }

  const nextStatus = rows.every((row) => row.status === "validado") ? "preparado_egestor" : "erro_egestor"
  await supabase.from("fechamentos").update({ status: nextStatus }).eq("id", fechamentoId)
  await logStatusEvento(supabase, fechamentoId, fechamento.status, nextStatus, "Sistema", "Previa eGestor gerada.")
  return getLancamentos(supabase, fechamentoId)
}

export async function sendEgestorLancamentos(supabase: SupabaseClient, fechamentoId: string, confirmation: string) {
  if (confirmation !== "ENVIAR_EGESTOR") throw new Error("Confirmacao obrigatoria para envio real.")

  const config = await getConfig(supabase)
  const token = config.personal_token
  if (!token) throw new Error("Configure o personal_token do eGestor antes do envio.")

  const { data: existingSent } = await supabase
    .from("egestor_lancamentos")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)
    .limit(1)
  if (existingSent && existingSent.length > 0) throw new Error("Este fechamento ja possui lancamentos enviados ao eGestor.")

  const { data: lancamentos, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .order("tipo")
    .order("categoria")
  if (error) throw error
  if (!lancamentos || lancamentos.length === 0) throw new Error("Gere a previa eGestor antes do envio.")
  if (lancamentos.some((l) => l.status !== "validado")) throw new Error("Corrija os mapeamentos pendentes antes do envio.")

  const client = new EgestorClient({ personalToken: token })
  for (const lancamento of lancamentos) {
    await sendLancamento(supabase, client, lancamento)
  }

  const { data: pending } = await supabase
    .from("egestor_lancamentos")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .in("status", ["validado", "erro"])
    .limit(1)
  const status = pending && pending.length > 0 ? "erro_egestor" : "lancado_egestor"
  const previousStatus = await getFechamentoStatus(supabase, fechamentoId)
  await supabase.from("fechamentos").update({ status }).eq("id", fechamentoId)
  await logStatusEvento(supabase, fechamentoId, previousStatus, status, "Sistema", "Envio eGestor finalizado.")
  return getLancamentos(supabase, fechamentoId)
}

export async function testEgestorConnection(supabase: SupabaseClient) {
  const config = await getConfig(supabase)
  if (!config.personal_token) throw new Error("personal_token nao configurado.")

  try {
    await new EgestorClient({ personalToken: config.personal_token }).testConnection()
    await updateConnectionStatus(supabase, "ok", "Conexao validada com sucesso.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar eGestor."
    await updateConnectionStatus(supabase, "erro", message)
    throw error
  }
}

export async function retryEgestorAnexos(supabase: SupabaseClient, fechamentoId: string) {
  const config = await getConfig(supabase)
  if (!config.personal_token) throw new Error("Configure o personal_token do eGestor antes do retry.")

  const { data: lancamentos, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .eq("status", "anexo_pendente")
    .not("egestor_cod_modulo", "is", null)

  if (error) throw error
  if (!lancamentos || lancamentos.length === 0) throw new Error("Nao ha anexos pendentes para retry.")

  const client = new EgestorClient({ personalToken: config.personal_token })
  for (const lancamento of lancamentos as PersistedLancamento[]) {
    await uploadAnexos(supabase, client, lancamento, Number(lancamento.egestor_cod_modulo))
    const { data: current } = await supabase
      .from("egestor_lancamentos")
      .select("status")
      .eq("id", lancamento.id)
      .single()
    if (current?.status === "anexo_pendente") {
      await logEnvio(supabase, lancamento, "retry_anexo", "pendente", null, "Anexo ainda pendente.")
    } else {
      await logEnvio(supabase, lancamento, "retry_anexo", "ok", null)
    }
  }

  return getLancamentos(supabase, fechamentoId)
}

export async function revalidateEgestorLancamentos(supabase: SupabaseClient, fechamentoId: string) {
  const config = await getConfig(supabase)
  if (!config.personal_token) throw new Error("Configure o personal_token do eGestor antes de revalidar.")

  const { data: lancamentos, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)

  if (error) throw error
  if (!lancamentos || lancamentos.length === 0) throw new Error("Nenhum lancamento enviado para revalidar.")

  const client = new EgestorClient({ personalToken: config.personal_token })
  for (const lancamento of lancamentos as PersistedLancamento[]) {
    await revalidateLancamento(supabase, client, lancamento)
  }

  return getLancamentos(supabase, fechamentoId)
}

export async function getEgestorEnvios(supabase: SupabaseClient, fechamentoId: string) {
  const { data, error } = await supabase
    .from("egestor_envios")
    .select("id,fechamento_id,lancamento_id,acao,status,erro,request_payload,response_payload,criado_em")
    .eq("fechamento_id", fechamentoId)
    .order("criado_em", { ascending: false })
    .limit(50)

  if (error) throw error
  return data ?? []
}

async function sendLancamento(supabase: SupabaseClient, client: EgestorClient, lancamento: PersistedLancamento) {
  try {
    const response = lancamento.tipo === "recebimento"
      ? await client.createRecebimento(lancamento.payload)
      : await client.createPagamento(lancamento.payload)
    const codigo = Number(response.codigo)
    const codModulo = Number(response.codModulo ?? response.codigo)

    await supabase.from("egestor_lancamentos").update({
      status: "enviado",
      egestor_codigo: Number.isFinite(codigo) ? codigo : null,
      egestor_cod_modulo: Number.isFinite(codModulo) ? codModulo : null,
      egestor_response: response,
      enviado_em: new Date().toISOString(),
    }).eq("id", lancamento.id)
    await logEnvio(supabase, lancamento, "send", "ok", response)
    await uploadAnexos(supabase, client, lancamento, Number.isFinite(codModulo) ? codModulo : null)
  } catch (error) {
    const payload = error instanceof EgestorApiError ? error.payload : null
    const message = error instanceof Error ? error.message : "Erro ao enviar lancamento."
    await supabase.from("egestor_lancamentos").update({ status: "erro", validacao_mensagem: message, egestor_response: payload }).eq("id", lancamento.id)
    await logEnvio(supabase, lancamento, "send", "erro", payload, message)
  }
}

async function uploadAnexos(supabase: SupabaseClient, client: EgestorClient, lancamento: PersistedLancamento, codModulo: number | null) {
  if (!codModulo) return

  const { data: docs } = await supabase
    .from("documentos_fechamento")
    .select("nome_arquivo,arquivo_url,mime_type")
    .eq("fechamento_id", lancamento.fechamento_id)
    .limit(3)

  for (const doc of docs ?? []) {
    const download = await supabase.storage.from(BUCKET).download(doc.arquivo_url)
    if (download.error || !download.data) {
      await markAnexoPendente(supabase, lancamento.id, "Documento nao encontrado no Storage.")
      return
    }
    try {
      await client.uploadDiscoVirtual({
        file: download.data,
        fileName: doc.nome_arquivo,
        modulo: "financeiro",
        codModulo,
        descricao: `ACR ${lancamento.descricao}`,
        tags: lancamento.tags ?? [],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao anexar documento."
      await markAnexoPendente(supabase, lancamento.id, message)
      return
    }
  }

  await supabase.from("egestor_lancamentos").update({
    status: "enviado",
    anexo_status: "enviado",
    anexo_mensagem: null,
  }).eq("id", lancamento.id)
}

async function revalidateLancamento(supabase: SupabaseClient, client: EgestorClient, lancamento: PersistedLancamento) {
  const codigo = Number(lancamento.egestor_codigo)
  if (!Number.isFinite(codigo)) return

  try {
    const response = lancamento.tipo === "recebimento"
      ? await client.getRecebimento(codigo)
      : await client.getPagamento(codigo)
    await supabase.from("egestor_lancamentos").update({
      revalidado_em: new Date().toISOString(),
      revalidacao_status: "ok",
      revalidacao_mensagem: "Lancamento encontrado no eGestor.",
      egestor_response: response,
    }).eq("id", lancamento.id)
    await logEnvio(supabase, lancamento, "revalidar_status", "ok", response)
  } catch (error) {
    const payload = error instanceof EgestorApiError ? error.payload : null
    const message = error instanceof Error ? error.message : "Falha ao revalidar lancamento."
    await supabase.from("egestor_lancamentos").update({
      revalidado_em: new Date().toISOString(),
      revalidacao_status: "erro",
      revalidacao_mensagem: message,
    }).eq("id", lancamento.id)
    await logEnvio(supabase, lancamento, "revalidar_status", "erro", payload, message)
  }
}

function buildDrafts(fechamento: FechamentoRow) {
  const analysis = fechamento.analise_completa
  if (!analysis) throw new Error("Fechamento sem analise completa.")
  return buildEgestorDrafts(analysis)
}

export function buildEgestorDrafts(analysis: PackageAnalysis) {
  const drafts: DraftLancamento[] = []
  const repasse = analysis.totals.valor_comprovado ?? analysis.totals.total_a_repassar
  if (repasse > 0) {
    drafts.push({ tipo: "recebimento", categoria: "repasse_mensal", descricao: "Repasse mensal consolidado", valor: repasse })
  }

  const comissao = analysis.totals.comissao_administracao_calculada ?? analysis.prestacao?.resumo_financeiro.comissao_administracao ?? 0
  if (comissao > 0) {
    drafts.push({ tipo: "pagamento", categoria: "comissao_administrativa", descricao: "Comissao administrativa", valor: comissao })
  }

  const despesas = new Map<EgestorCategoria, number>()
  for (const despesa of analysis.despesas?.despesas ?? []) {
    const categoria = CATEGORIAS_DESPESA[despesa.tipo] ?? "outras_despesas"
    despesas.set(categoria, (despesas.get(categoria) ?? 0) + despesa.valor)
  }
  for (const [categoria, valor] of despesas) {
    if (valor > 0) drafts.push({ tipo: "pagamento", categoria, descricao: labelCategoria(categoria), valor })
  }

  return drafts
}

function buildLancamentoRow(fechamento: FechamentoRow, config: DbConfig, maps: Map<string, DbMapeamento>, draft: DraftLancamento) {
  const map = maps.get(draft.categoria)
  const codContato = fechamento.imobiliarias?.egestor_contato_id ?? null
  const codDisponivel = config.cod_disponivel_padrao
  const codPlanoContas = map?.cod_plano_contas ?? null
  const tags = buildTags(fechamento, draft, map)
  const validation = validateLancamento(codContato, codDisponivel, codPlanoContas)
  const payload = buildPayload(fechamento, draft, codContato, codDisponivel, codPlanoContas, tags)

  return {
    fechamento_id: fechamento.id,
    tipo: draft.tipo,
    categoria: draft.categoria,
    descricao: payload.descricao,
    valor: draft.valor,
    cod_contato: codContato,
    cod_disponivel: codDisponivel,
    cod_plano_contas: codPlanoContas,
    tags,
    payload,
    status: validation ? "pendente_config" : "validado",
    validacao_mensagem: validation,
  }
}

function buildPayload(
  fechamento: FechamentoRow,
  draft: DraftLancamento,
  codContato: number | null,
  codDisponivel: number | null,
  codPlanoContas: number | null,
  tags: string[],
) {
  const analysis = fechamento.analise_completa
  const repasseDate = analysis?.repasse?.data ?? null
  const competencia = toDateOnly(fechamento.competencia)
  const descricao = `ACR ${formatCompetencia(fechamento.competencia)} - ${draft.descricao}`
  const payload: Record<string, unknown> = {
    codPlanoContas,
    codFormaPgto: 0,
    numDoc: `ACR-${formatCompetencia(fechamento.competencia)}-${draft.categoria}`,
    descricao,
    valor: Number(draft.valor.toFixed(2)),
    dtVenc: repasseDate ?? competencia,
    dtComp: competencia,
    codContato,
    codDisponivel,
    obs: `${fechamento.imobiliarias?.nome ?? ""} | ${fechamento.empreendimentos?.nome ?? ""}`.trim(),
    tags,
  }

  if (draft.tipo === "recebimento") {
    payload.dtCred = repasseDate ?? competencia
    payload.dtPgto = repasseDate ?? ""
    payload.recebido = Boolean(repasseDate)
  } else {
    payload.dtPgto = repasseDate ?? ""
    payload.pago = Boolean(repasseDate)
  }

  return payload
}

function buildTags(fechamento: FechamentoRow, draft: DraftLancamento, map?: DbMapeamento) {
  return [
    "ACR",
    formatCompetencia(fechamento.competencia),
    fechamento.imobiliarias?.nome ?? "",
    fechamento.empreendimentos?.nome ?? "",
    fechamento.imobiliarias?.egestor_tag_id ?? "",
    fechamento.empreendimentos?.egestor_tag_id ?? "",
    draft.categoria,
    ...(map?.tags ?? []),
  ].map((tag) => tag.trim()).filter(Boolean)
}

function validateLancamento(codContato: number | null, codDisponivel: number | null, codPlanoContas: number | null) {
  const missing = []
  if (!codContato) missing.push("contato eGestor da imobiliaria")
  if (!codDisponivel) missing.push("conta disponivel padrao")
  if (!codPlanoContas) missing.push("plano de contas da categoria")
  return missing.length > 0 ? `Configure: ${missing.join(", ")}.` : null
}

async function getFechamento(supabase: SupabaseClient, fechamentoId: string) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,competencia,status,analise_completa,imobiliarias(nome,egestor_contato_id,egestor_tag_id),empreendimentos(nome,egestor_tag_id)")
    .eq("id", fechamentoId)
    .single()
  if (error) throw error
  return data as unknown as FechamentoRow
}

async function getOpenBlockingCount(supabase: SupabaseClient, fechamentoId: string) {
  const { count, error } = await supabase
    .from("validacoes")
    .select("id", { count: "exact", head: true })
    .eq("fechamento_id", fechamentoId)
    .eq("status", "aberta")
    .eq("severidade", "bloqueante")
    .neq("tipo_validacao", "parecer_tecnico")
  if (error) throw error
  return count ?? 0
}

async function getFechamentoStatus(supabase: SupabaseClient, fechamentoId: string) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("status")
    .eq("id", fechamentoId)
    .single()
  if (error) throw error
  return data.status as string
}

async function getConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("egestor_configuracoes")
    .select("personal_token,cod_disponivel_padrao,ativo")
    .eq("id", true)
    .single()
  if (error) throw error
  return data as DbConfig
}

async function getMapeamentos(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("egestor_mapeamentos_categoria")
    .select("categoria,tipo_lancamento,cod_plano_contas,tags,descricao,ativo")
    .eq("ativo", true)
  if (error) throw error
  return new Map((data as DbMapeamento[]).map((row) => [row.categoria, row]))
}

async function getLancamentos(supabase: SupabaseClient, fechamentoId: string) {
  const { data, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .order("tipo")
    .order("categoria")
  if (error) throw error
  return data ?? []
}

async function logEnvio(supabase: SupabaseClient, lancamento: PersistedLancamento, acao: string, status: string, response: unknown, erro?: string) {
  await supabase.from("egestor_envios").insert({
    fechamento_id: lancamento.fechamento_id,
    lancamento_id: lancamento.id,
    acao,
    status,
    request_payload: lancamento.payload,
    response_payload: response,
    erro: erro ?? null,
  })
}

async function logStatusEvento(
  supabase: SupabaseClient,
  fechamentoId: string,
  statusAnterior: string | null,
  statusNovo: string,
  usuario: string,
  motivo: string,
) {
  if (statusAnterior === statusNovo) return
  await supabase.from("fechamento_status_eventos").insert({
    fechamento_id: fechamentoId,
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    usuario,
    motivo,
  })
}

async function markAnexoPendente(supabase: SupabaseClient, lancamentoId: string, message: string) {
  await supabase.from("egestor_lancamentos").update({
    status: "anexo_pendente",
    anexo_status: "pendente",
    anexo_mensagem: message,
  }).eq("id", lancamentoId)
}

async function updateConnectionStatus(supabase: SupabaseClient, status: string, message: string) {
  await supabase.from("egestor_configuracoes").update({
    ultimo_teste_status: status,
    ultimo_teste_mensagem: message,
    ultimo_teste_em: new Date().toISOString(),
  }).eq("id", true)
}

function labelCategoria(categoria: EgestorCategoria) {
  const labels: Record<EgestorCategoria, string> = {
    repasse_mensal: "Repasse mensal consolidado",
    comissao_administrativa: "Comissao administrativa",
    energia: "Energia eletrica",
    agua: "Agua/esgoto",
    iptu: "IPTU",
    seguro: "Seguro",
    outras_despesas: "Outras despesas",
  }
  return labels[categoria]
}

function formatCompetencia(date: string) {
  return date.slice(0, 7)
}

function toDateOnly(date: string) {
  return date.slice(0, 10)
}
