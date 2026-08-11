import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type { EgestorCategoria, EgestorTipoLancamento } from "@/lib/egestor-types"
import { EgestorApiError, EgestorClient } from "./egestor-client"
import { valorTedItemizada } from "@/lib/despesas-locador"

const BUCKET = "fechamento-documentos"
// Conta "Global" criada pela migration a partir do singleton legado.
const GLOBAL_CONTA_ID = "00000000-0000-0000-0000-000000000001"
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

type DbConta = {
  id: string
  nome: string
  personal_token: string | null
  cod_disponivel_padrao: number | null
  ativo: boolean
  // Etiqueta/prefixo da conta nos lancamentos (ex.: "ACR" para a Global, "MMC"
  // para a MMC Participacoes). Fallback "ACR" quando ausente.
  tag_padrao?: string | null
  // Quando true, a conta lanca SOMENTE o recebimento no eGestor (comissoes e
  // despesas sao conciliadas fora do eGestor). Ex.: MMC.
  somente_recebimento?: boolean | null
  // Termo para resolver o "disponivel" (conta de origem) via API do eGestor
  // quando cod_disponivel_padrao ainda nao foi definido (ex.: "06394").
  disponivel_busca?: string | null
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
  imobiliaria_id: string | null
  empreendimento_id: string | null
  analise_completa: PackageAnalysis | null
  imobiliarias: { id: string; nome: string; egestor_contato_id: number | null; egestor_tag_id: string | null } | null
  empreendimentos: { nome: string; egestor_tag_id: string | null; egestor_conta_id: string | null } | null
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

  const conta = await resolveContaForFechamento(supabase, fechamento)
  // Conta de origem (disponivel): usa o cod_disponivel_padrao; se ausente e a
  // conta tiver disponivel_busca, resolve pelo nome via API do eGestor e cacheia.
  // Tambem captura o NOME do disponivel para exibir na previa (ex.: "Sicredi MMC").
  const { cod: codDisponivel, nome: disponivelNome } = await resolveDisponivel(supabase, conta)
  conta.cod_disponivel_padrao = codDisponivel
  const maps = await getMapeamentos(supabase, conta.id)
  const codContato = await resolveContato(supabase, fechamento, conta)
  const diaVencimentoPadrao = await getDiaVencimentoPadrao(supabase, fechamento)
  const drafts = buildDrafts(fechamento, conta)
  const rows = drafts.map((draft) =>
    buildLancamentoRow(
      fechamento,
      conta,
      maps,
      codContato,
      draft,
      buildAutomaticOriginKey(draft.tipo, draft.categoria),
      disponivelNome,
      diaVencimentoPadrao,
    ),
  )
  const { data: sentRows, error: sentError } = await supabase
    .from("egestor_lancamentos")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)
    .limit(1)
  if (sentError) throw sentError
  if (sentRows && sentRows.length > 0) throw new Error("Fechamento ja possui lancamentos enviados ao eGestor.")

  // Regenerar a previa apaga apenas as linhas automaticas nao enviadas; linhas
  // manuais (origem_manual) sobrevivem para nao se perder o que o operador
  // adicionou (ex.: IPTU de outro imovel).
  await supabase
    .from("egestor_lancamentos")
    .delete()
    .eq("fechamento_id", fechamentoId)
    .is("egestor_codigo", null)
    .eq("origem_manual", false)

  if (rows.length > 0) {
    const { error } = await supabase.from("egestor_lancamentos").upsert(rows, {
      onConflict: "fechamento_id,origem_chave",
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

  const fechamento = await getFechamento(supabase, fechamentoId)
  const conta = await resolveContaForFechamento(supabase, fechamento)
  const token = conta.personal_token
  if (!token) throw new Error(`Configure o personal_token da conta eGestor "${conta.nome}" antes do envio.`)

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

export async function testEgestorConnection(supabase: SupabaseClient, contaId: string = GLOBAL_CONTA_ID) {
  const conta = await getContaById(supabase, contaId)
  if (!conta) throw new Error("Conta eGestor nao encontrada.")
  if (!conta.personal_token) throw new Error("personal_token nao configurado.")

  try {
    await new EgestorClient({ personalToken: conta.personal_token }).testConnection()
    await updateConnectionStatus(supabase, contaId, "ok", "Conexao validada com sucesso.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar eGestor."
    await updateConnectionStatus(supabase, contaId, "erro", message)
    throw error
  }
}

export async function retryEgestorAnexos(supabase: SupabaseClient, fechamentoId: string) {
  const fechamento = await getFechamento(supabase, fechamentoId)
  const conta = await resolveContaForFechamento(supabase, fechamento)
  if (!conta.personal_token) throw new Error(`Configure o personal_token da conta eGestor "${conta.nome}" antes do retry.`)

  const { data: lancamentos, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .eq("anexo_status", "pendente")
    .not("egestor_cod_modulo", "is", null)

  if (error) throw error
  if (!lancamentos || lancamentos.length === 0) throw new Error("Nao ha anexos pendentes para retry.")

  const client = new EgestorClient({ personalToken: conta.personal_token })
  for (const lancamento of lancamentos as PersistedLancamento[]) {
    await uploadAnexos(supabase, client, lancamento, Number(lancamento.egestor_cod_modulo))
    const { data: current } = await supabase
      .from("egestor_lancamentos")
      .select("anexo_status")
      .eq("id", lancamento.id)
      .single()
    if (current?.anexo_status === "pendente") {
      await logEnvio(supabase, lancamento, "retry_anexo", "pendente", null, "Anexo ainda pendente.")
    } else {
      await logEnvio(supabase, lancamento, "retry_anexo", "ok", null)
    }
  }

  return getLancamentos(supabase, fechamentoId)
}

export async function revalidateEgestorLancamentos(supabase: SupabaseClient, fechamentoId: string) {
  const fechamento = await getFechamento(supabase, fechamentoId)
  const conta = await resolveContaForFechamento(supabase, fechamento)
  if (!conta.personal_token) throw new Error(`Configure o personal_token da conta eGestor "${conta.nome}" antes de revalidar.`)

  const { data: lancamentos, error } = await supabase
    .from("egestor_lancamentos")
    .select("*")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)

  if (error) throw error
  if (!lancamentos || lancamentos.length === 0) throw new Error("Nenhum lancamento enviado para revalidar.")

  const client = new EgestorClient({ personalToken: conta.personal_token })
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

  // Um documento com storage quebrado (ou anexo rejeitado pelo eGestor) nao
  // impede tentar os demais: cada um e independente, e um em falta nao deve
  // bloquear para sempre os que sao anexaveis.
  const resultados: AttachmentAttempt[] = []
  for (const doc of docs ?? []) {
    const download = await supabase.storage.from(BUCKET).download(doc.arquivo_url)
    if (download.error || !download.data) {
      resultados.push({ nomeArquivo: doc.nome_arquivo, ok: false, motivo: "Documento nao encontrado no Storage." })
      continue
    }
    try {
      await client.uploadDiscoVirtual({
        file: download.data,
        fileName: doc.nome_arquivo,
        modulo: "financeiro",
        codModulo,
        descricao: lancamento.descricao,
        tags: lancamento.tags ?? [],
      })
      resultados.push({ nomeArquivo: doc.nome_arquivo, ok: true })
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Falha ao anexar documento."
      resultados.push({ nomeArquivo: doc.nome_arquivo, ok: false, motivo: friendlyAnexoError(raw) })
    }
  }

  const resumo = summarizeAttachmentAttempts(resultados)
  await supabase.from("egestor_lancamentos").update({
    ...(resumo.status === "enviado" ? { status: "enviado" } : {}),
    anexo_status: resumo.status,
    anexo_mensagem: resumo.mensagem,
  }).eq("id", lancamento.id)
}

interface AttachmentAttempt {
  nomeArquivo: string
  ok: boolean
  motivo?: string
}

// Decide o anexo_status final a partir das tentativas por documento. So marca
// "enviado" quando TODOS os documentos do fechamento foram anexados; sucesso
// parcial ou total fica "pendente" com o detalhe de quais faltam e por que,
// em vez de travar no primeiro documento quebrado (ver uploadAnexos).
export function summarizeAttachmentAttempts(
  resultados: AttachmentAttempt[],
): { status: "enviado" | "pendente"; mensagem: string | null } {
  if (resultados.length === 0) {
    return { status: "pendente", mensagem: "Nenhum documento encontrado para anexar." }
  }
  const falhas = resultados.filter((item) => !item.ok)
  if (falhas.length === 0) {
    return { status: "enviado", mensagem: null }
  }
  const sucesso = resultados.length - falhas.length
  const detalhe = falhas.map((item) => `${item.nomeArquivo}: ${item.motivo ?? "falha desconhecida"}`).join("; ")
  return {
    status: "pendente",
    mensagem: `${sucesso} de ${resultados.length} documento(s) anexado(s). Pendente(s): ${detalhe}`,
  }
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

function buildDrafts(fechamento: FechamentoRow, conta?: DbConta) {
  const analysis = fechamento.analise_completa
  if (!analysis) throw new Error("Fechamento sem analise completa.")
  return buildEgestorDrafts(analysis, { somenteRecebimento: conta?.somente_recebimento === true })
}

export function buildEgestorDrafts(analysis: PackageAnalysis, options: { somenteRecebimento?: boolean } = {}) {
  const drafts: DraftLancamento[] = []
  const recebidoBruto = analysis.totals.total_receitas
  if (recebidoBruto > 0) {
    drafts.push({ tipo: "recebimento", categoria: "repasse_mensal", descricao: "Recebimento mensal bruto", valor: recebidoBruto })
  }

  // Contas marcadas "somente recebimento" (ex.: MMC/Maracanau) nao lancam comissao
  // nem despesas no eGestor — essas sao conciliadas fora dele.
  if (options.somenteRecebimento) {
    return drafts
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

  // TED/tarifa bancária itemizada na prestação entra como UMA despesa agregada
  // (o eGestor é agregado; o rateio por imóvel fica nas movimentações). Reusa a
  // categoria "outras_despesas" para não exigir novo mapeamento de plano de contas.
  const ted = analysis.prestacao ? valorTedItemizada(analysis.prestacao) : 0
  if (ted > 0) {
    drafts.push({ tipo: "pagamento", categoria: "outras_despesas", descricao: "Tarifa bancaria (TED)", valor: ted })
  }

  return drafts
}

// Etiqueta/prefixo da conta nos lancamentos. Default "ACR" (conta Global).
function contaTagPrefix(conta: DbConta) {
  return conta.tag_padrao?.trim() || "ACR"
}

// Remove acentos preservando maiusculas/minusculas (ex.: "MARACANAÚ" -> "MARACANAU").
function removerAcentos(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

// Resolve a conta de origem (disponivel): retorna o codigo E o nome do disponivel
// para exibicao na previa. Prioriza o cod_disponivel_padrao ja configurado; se
// ausente e houver disponivel_busca + token, busca pelo nome na API do eGestor
// (ex.: "06394" -> "Sicredi MMC - 06394-0") e cacheia o codigo.
async function resolveDisponivel(
  supabase: SupabaseClient,
  conta: DbConta,
): Promise<{ cod: number | null; nome: string | null }> {
  if (!conta.personal_token) return { cod: conta.cod_disponivel_padrao ?? null, nome: null }

  let disponiveis: Array<{ codigo: number; nome: string }>
  try {
    disponiveis = await new EgestorClient({ personalToken: conta.personal_token }).getDisponiveis()
  } catch {
    return { cod: conta.cod_disponivel_padrao ?? null, nome: null }
  }

  let cod = conta.cod_disponivel_padrao
  const busca = conta.disponivel_busca?.trim()
  if (cod == null && busca) {
    const matched = matchDisponivelPorNome(disponiveis, busca)
    if (matched !== null) {
      cod = matched
      await supabase
        .from("egestor_contas")
        .update({ cod_disponivel_padrao: cod })
        .eq("id", conta.id)
        .then(() => undefined, () => undefined)
    }
  }
  const nome = cod != null ? disponiveis.find((d) => d.codigo === cod)?.nome ?? null : null
  return { cod, nome }
}

// Match conservador: o disponivel cujo nome normalizado contem o termo buscado.
// Unico match -> codigo; zero ou ambiguo -> null (lancamento fica pendente).
function matchDisponivelPorNome(disponiveis: Array<{ codigo: number; nome: string }>, busca: string): number | null {
  const alvo = normalizeNomeContato(busca)
  if (!alvo) return null
  const matches = disponiveis.filter((d) => normalizeNomeContato(d.nome ?? "").includes(alvo))
  return matches.length === 1 ? matches[0].codigo : null
}

function buildLancamentoRow(
  fechamento: FechamentoRow,
  conta: DbConta,
  maps: Map<string, DbMapeamento>,
  codContato: number | null,
  draft: DraftLancamento,
  origemChave: string,
  disponivelNome: string | null = null,
  diaVencimentoPadrao: number | null = null,
) {
  const map = maps.get(draft.categoria)
  const codDisponivel = conta.cod_disponivel_padrao
  const codPlanoContas = map?.cod_plano_contas ?? null
  const tags = buildTags(fechamento, conta)
  const validation = validateLancamento(codContato, codDisponivel, codPlanoContas)
  const payload = buildPayload(fechamento, conta, draft, codContato, codDisponivel, codPlanoContas, tags, disponivelNome, diaVencimentoPadrao)

  return {
    fechamento_id: fechamento.id,
    origem_chave: origemChave,
    tipo: draft.tipo,
    categoria: draft.categoria,
    descricao: payload.descricao,
    valor: draft.valor,
    cod_contato: codContato,
    cod_disponivel: codDisponivel,
    cod_plano_contas: codPlanoContas,
    // Nome amigavel do disponivel (ex.: "Sicredi MMC - 06394-0") para exibir na
    // previa; nao vai no payload enviado ao eGestor.
    disponivel_nome: disponivelNome,
    tags,
    payload,
    status: validation ? "pendente_config" : "validado",
    validacao_mensagem: validation,
  }
}

function buildPayload(
  fechamento: FechamentoRow,
  conta: DbConta,
  draft: DraftLancamento,
  codContato: number | null,
  codDisponivel: number | null,
  codPlanoContas: number | null,
  tags: string[],
  disponivelNome: string | null = null,
  diaVencimentoPadrao: number | null = null,
) {
  const analysis = fechamento.analise_completa
  const repasseDate = analysis?.repasse?.data ?? null
  const statementDueDate = analysis?.prestacao?.resumo_financeiro.data_vencimento ?? null
  const competencia = toDateOnly(fechamento.competencia)
  // Sem comprovante (pagamento feito pela imobiliaria), o vencimento cai no mes
  // seguinte a competencia, no dia configurado na regra comercial. Sem dia
  // configurado, mantem o comportamento historico (competencia).
  const dates = resolveEgestorDates({
    competencia: fechamento.competencia,
    diaVencimentoPadrao,
    repasseDate,
    statementDueDate,
  })
  // Descricao = etiqueta da conta (ex.: MMC) + empreendimento + item, sem
  // competencia (ela ja vai em numDoc/dtComp) e sem acentos (ex.: MARACANAU).
  const prefixo = contaTagPrefix(conta)
  const empreendimentoNome = fechamento.empreendimentos?.nome?.trim() ?? ""
  const descricao = removerAcentos(
    [prefixo, empreendimentoNome, "-", draft.descricao].filter((part) => part !== "").join(" "),
  )
  const payload: Record<string, unknown> = {
    codPlanoContas,
    codFormaPgto: 0,
    numDoc: `${prefixo}-${formatCompetencia(fechamento.competencia)}-${draft.categoria}`,
    descricao,
    valor: Number(draft.valor.toFixed(2)),
    dtVenc: dates.dtVenc,
    dtComp: competencia,
    codContato,
    codDisponivel,
    obs: `${fechamento.imobiliarias?.nome ?? ""} | ${fechamento.empreendimentos?.nome ?? ""}`.trim(),
    tags,
  }

  if (draft.tipo === "recebimento") {
    payload.dtCred = dates.dtCred
    payload.dtPgto = dates.dtPgto
    payload.recebido = dates.liquidado
  } else {
    payload.dtPgto = dates.dtPgto
    payload.pago = dates.liquidado
  }

  return payload
}

export function resolveEgestorDates(input: {
  competencia: string
  diaVencimentoPadrao: number | null
  repasseDate: string | null
  statementDueDate: string | null
}) {
  const competencia = toDateOnly(input.competencia)
  const settlementDate = input.repasseDate ?? input.statementDueDate
  return {
    dtVenc:
      input.statementDueDate ??
      input.repasseDate ??
      proximoVencimento(input.competencia, input.diaVencimentoPadrao) ??
      competencia,
    dtCred: settlementDate ?? competencia,
    dtPgto: settlementDate ?? "",
    liquidado: Boolean(settlementDate),
  }
}

export function buildAutomaticOriginKey(
  tipo: EgestorTipoLancamento,
  categoria: EgestorCategoria,
) {
  return `auto:${tipo}:${categoria}`
}

export function buildManualOriginKey() {
  return `manual:${randomUUID()}`
}

function buildTags(fechamento: FechamentoRow, conta: DbConta) {
  // Decisao de projeto: lancamentos sobem com exatamente 2 tags — a etiqueta da
  // conta (ex.: "ACR" na Global, "MMC" na MMC Participacoes) e a tag do
  // empreendimento (egestor_tag_id, com fallback para o nome). NAO usar tag de
  // imobiliaria, competencia nem categoria.
  const empreendimento =
    fechamento.empreendimentos?.egestor_tag_id?.trim() || fechamento.empreendimentos?.nome?.trim() || ""
  return [contaTagPrefix(conta), empreendimento].filter(Boolean)
}

function validateLancamento(codContato: number | null, codDisponivel: number | null, codPlanoContas: number | null) {
  const missing = []
  if (!codContato) missing.push("contato eGestor da imobiliaria")
  if (!codDisponivel) missing.push("conta disponivel padrao")
  if (!codPlanoContas) missing.push("plano de contas da categoria")
  return missing.length > 0 ? `Configure: ${missing.join(", ")}.` : null
}

async function getFechamento(supabase: SupabaseClient, fechamentoId: string) {
  const withConta =
    "id,competencia,status,imobiliaria_id,empreendimento_id,analise_completa,imobiliarias(id,nome,egestor_contato_id,egestor_tag_id),empreendimentos(nome,egestor_tag_id,egestor_conta_id)"
  const withoutConta =
    "id,competencia,status,imobiliaria_id,empreendimento_id,analise_completa,imobiliarias(id,nome,egestor_contato_id,egestor_tag_id),empreendimentos(nome,egestor_tag_id)"

  const primary = await supabase.from("fechamentos").select(withConta).eq("id", fechamentoId).single()
  let data: unknown = primary.data
  let error = primary.error

  // Resiliencia: antes da migration multi-conta, empreendimentos.egestor_conta_id nao existe.
  if (error && isMissingRelation(error, "egestor_conta_id")) {
    const fallback = await supabase.from("fechamentos").select(withoutConta).eq("id", fechamentoId).single()
    data = fallback.data
    error = fallback.error
  }

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
    .not("tipo_validacao", "in", '("parecer_tecnico","deterministic_validation","documents_received","package_schema")')
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

function isMissingRelation(error: unknown, name: string) {
  if (!error || typeof error !== "object") return false
  const candidate = error as { message?: unknown; code?: unknown }
  // 42P01 = undefined_table, 42703 = undefined_column.
  if (candidate.code === "42P01" || candidate.code === "42703") return true
  return typeof candidate.message === "string" && new RegExp(name, "i").test(candidate.message)
}

// Fallback resiliente (pre-migration): le o singleton egestor_configuracoes como conta Global.
async function getContaFromSingleton(supabase: SupabaseClient): Promise<DbConta> {
  const { data, error } = await supabase
    .from("egestor_configuracoes")
    .select("personal_token,cod_disponivel_padrao,ativo")
    .eq("id", true)
    .single()
  if (error) throw error
  const config = data as DbConfig
  return { id: GLOBAL_CONTA_ID, nome: "Global", ...config }
}

async function getContaById(supabase: SupabaseClient, contaId: string): Promise<DbConta | null> {
  const { data, error } = await supabase
    .from("egestor_contas")
    .select("*")
    .eq("id", contaId)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error, "egestor_contas")) {
      return contaId === GLOBAL_CONTA_ID ? getContaFromSingleton(supabase).catch(() => null) : null
    }
    throw error
  }
  return (data as DbConta) ?? null
}

async function resolveContaForFechamento(supabase: SupabaseClient, fechamento: FechamentoRow): Promise<DbConta> {
  const desiredId = fechamento.empreendimentos?.egestor_conta_id ?? GLOBAL_CONTA_ID
  const ids = desiredId === GLOBAL_CONTA_ID ? [GLOBAL_CONTA_ID] : [desiredId, GLOBAL_CONTA_ID]

  const { data, error } = await supabase
    .from("egestor_contas")
    .select("*")
    .in("id", ids)

  if (error) {
    if (isMissingRelation(error, "egestor_contas")) return getContaFromSingleton(supabase)
    throw error
  }

  const rows = (data ?? []) as DbConta[]
  // Conta do empreendimento; se ela nao existir, cai na Global.
  const conta = rows.find((row) => row.id === desiredId) ?? rows.find((row) => row.id === GLOBAL_CONTA_ID)
  if (conta) return conta
  return getContaFromSingleton(supabase)
}

// Contato eGestor por (imobiliaria, conta). Ordem de resolucao:
// 1) mapeamento explicito (egestor_imobiliaria_contatos);
// 2) coluna legada (apenas na conta Global);
// 3) busca automatica na API do eGestor pelo nome/tag da imobiliaria, cacheando
//    o resultado. Assim qualquer imobiliaria que tenha contato cadastrado no
//    eGestor fica lancavel sem mapeamento manual, e imobiliarias duplicadas
//    passam a resolver sozinhas (cada registro recebe seu proprio contato).
async function resolveContato(supabase: SupabaseClient, fechamento: FechamentoRow, conta: DbConta): Promise<number | null> {
  const imobiliariaId = fechamento.imobiliarias?.id ?? null
  const legacyContato = conta.id === GLOBAL_CONTA_ID ? fechamento.imobiliarias?.egestor_contato_id ?? null : null

  if (imobiliariaId) {
    const { data, error } = await supabase
      .from("egestor_imobiliaria_contatos")
      .select("egestor_contato_id")
      .eq("imobiliaria_id", imobiliariaId)
      .eq("conta_id", conta.id)
      .maybeSingle()
    if (error && !isMissingRelation(error, "egestor_imobiliaria_contatos")) throw error
    const mapped = (data?.egestor_contato_id as number | null | undefined) ?? null
    if (mapped !== null) return mapped
  }

  if (legacyContato !== null) return legacyContato

  return resolveContatoViaApi(supabase, fechamento, conta, imobiliariaId)
}

// Busca o contato no eGestor pelo nome/tag da imobiliaria quando nao ha mapeamento.
// Sucesso -> grava em egestor_imobiliaria_contatos para reuso. Ambiguo/sem token
// -> retorna null (nao chuta um contato errado; o lancamento fica pendente_config).
async function resolveContatoViaApi(
  supabase: SupabaseClient,
  fechamento: FechamentoRow,
  conta: DbConta,
  imobiliariaId: string | null,
): Promise<number | null> {
  if (!conta.personal_token) return null
  const nome = (fechamento.imobiliarias?.egestor_tag_id || fechamento.imobiliarias?.nome || "").trim()
  if (!nome) return null

  let codigo: number | null = null
  try {
    const client = new EgestorClient({ personalToken: conta.personal_token })
    // Busca todos os contatos (o filtro do servidor e ignorado e o filtro local
    // seria sensivel a acento) e casa de forma normalizada/por tokens.
    const contatos = await client.getContatos()
    codigo = matchContatoPorNome(contatos, nome)
  } catch {
    return null
  }
  if (codigo === null) return null

  if (imobiliariaId) {
    await supabase
      .from("egestor_imobiliaria_contatos")
      .upsert(
        { imobiliaria_id: imobiliariaId, conta_id: conta.id, egestor_contato_id: codigo },
        { onConflict: "imobiliaria_id,conta_id" },
      )
      .then(() => undefined, () => undefined)
  }
  return codigo
}

function normalizeNomeContato(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const CONTATO_STOPWORDS = new Set([
  "imobiliaria", "imoveis", "imovel", "ltda", "me", "epp", "eireli", "sa", "s", "a",
  "e", "de", "da", "do", "dos", "das",
])

function tokensSignificativos(norm: string): string[] {
  return norm.split(" ").filter((t) => t.length > 1 && !CONTATO_STOPWORDS.has(t))
}

// Match conservador, em camadas: (1) nome exato normalizado; (2) o nome do
// contato contem o nome buscado por inteiro; (3) todos os tokens significativos
// do nome buscado (ignorando "imobiliaria/imoveis/ltda"...) presentes em um unico
// contato. Qualquer ambiguidade -> null (nao chuta contato errado).
function matchContatoPorNome(contatos: Array<{ codigo: number; nome: string }>, nome: string): number | null {
  if (!contatos.length) return null
  const alvo = normalizeNomeContato(nome)
  if (!alvo) return null

  const exatos = contatos.filter((c) => normalizeNomeContato(c.nome) === alvo)
  if (exatos.length >= 1) return exatos.length === 1 ? exatos[0].codigo : null

  const contemAlvo = contatos.filter((c) => normalizeNomeContato(c.nome).includes(alvo))
  if (contemAlvo.length === 1) return contemAlvo[0].codigo

  const tokensAlvo = tokensSignificativos(alvo)
  if (tokensAlvo.length > 0) {
    const candidatos = contatos.filter((c) => {
      const tc = tokensSignificativos(normalizeNomeContato(c.nome))
      return tc.length > 0 && tokensAlvo.every((t) => tc.includes(t))
    })
    if (candidatos.length === 1) return candidatos[0].codigo
  }
  return null
}

async function getMapeamentos(supabase: SupabaseClient, contaId: string) {
  const baseSelect = "categoria,tipo_lancamento,cod_plano_contas,tags,descricao,ativo"
  const primary = await supabase
    .from("egestor_mapeamentos_categoria")
    .select(baseSelect)
    .eq("ativo", true)
    .eq("conta_id", contaId)

  // Resiliencia: antes da migration, mapeamentos sao globais (sem coluna conta_id).
  if (primary.error && isMissingRelation(primary.error, "conta_id")) {
    const fallback = await supabase
      .from("egestor_mapeamentos_categoria")
      .select(baseSelect)
      .eq("ativo", true)
    if (fallback.error) throw fallback.error
    return new Map((fallback.data as DbMapeamento[]).map((row) => [row.categoria, row]))
  }

  if (primary.error) throw primary.error
  return new Map((primary.data as DbMapeamento[]).map((row) => [row.categoria, row]))
}

// Adiciona um lancamento MANUAL a previa (linha que nao vem da analise do
// documento, ex.: IPTU de outro imovel). Reaproveita a mesma resolucao de
// conta/contato/plano/tags dos lancamentos automaticos, marcando origem_manual.
export async function addManualEgestorLancamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  input: { tipo: EgestorTipoLancamento; categoria: EgestorCategoria; descricao: string; valor: number },
) {
  const fechamento = await getFechamento(supabase, fechamentoId)
  if (!["aprovado", "preparado_egestor", "erro_egestor"].includes(fechamento.status)) {
    throw new Error("Gere a previa eGestor antes de adicionar um lancamento manual.")
  }

  const { data: sentRows, error: sentError } = await supabase
    .from("egestor_lancamentos")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .not("egestor_codigo", "is", null)
    .limit(1)
  if (sentError) throw sentError
  if (sentRows && sentRows.length > 0) throw new Error("Fechamento ja possui lancamentos enviados ao eGestor.")

  const conta = await resolveContaForFechamento(supabase, fechamento)
  const { cod: codDisponivel, nome: disponivelNome } = await resolveDisponivel(supabase, conta)
  conta.cod_disponivel_padrao = codDisponivel
  const maps = await getMapeamentos(supabase, conta.id)
  const codContato = await resolveContato(supabase, fechamento, conta)
  const diaVencimentoPadrao = await getDiaVencimentoPadrao(supabase, fechamento)

  const draft: DraftLancamento = {
    tipo: input.tipo,
    categoria: input.categoria,
    descricao: input.descricao,
    valor: input.valor,
  }
  const row = buildLancamentoRow(
    fechamento,
    conta,
    maps,
    codContato,
    draft,
    buildManualOriginKey(),
    disponivelNome,
    diaVencimentoPadrao,
  )

  const { error } = await supabase.from("egestor_lancamentos").insert({ ...row, origem_manual: true })
  if (error) {
    throw error
  }
  return getLancamentos(supabase, fechamentoId)
}

// Remove um lancamento MANUAL ainda nao enviado. Linhas automaticas ou ja
// enviadas ao eGestor nao podem ser removidas por aqui.
export async function deleteManualEgestorLancamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  lancamentoId: string,
) {
  const { data: row, error } = await supabase
    .from("egestor_lancamentos")
    .select("id,origem_manual,egestor_codigo")
    .eq("id", lancamentoId)
    .eq("fechamento_id", fechamentoId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new Error("Lancamento nao encontrado.")
  if ((row as { egestor_codigo: number | null }).egestor_codigo != null) {
    throw new Error("Lancamento ja enviado ao eGestor nao pode ser removido.")
  }
  if (!(row as { origem_manual?: boolean }).origem_manual) {
    throw new Error("Apenas lancamentos manuais podem ser removidos.")
  }
  const { error: delError } = await supabase.from("egestor_lancamentos").delete().eq("id", lancamentoId)
  if (delError) throw delError
  return getLancamentos(supabase, fechamentoId)
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

export function buildLancamentoUpdate(
  atual: { descricao: string; valor: number; tags: string[]; payload: Record<string, unknown> },
  mudancas: { descricao?: string; valor?: number; tags?: string[] },
) {
  let { descricao, valor, tags } = atual
  const payload = { ...atual.payload }

  if (mudancas.descricao !== undefined) {
    const nova = mudancas.descricao.trim()
    if (!nova) throw new Error("A descricao nao pode ficar vazia.")
    if (nova.length > 200) throw new Error("A descricao deve ter no maximo 200 caracteres.")
    descricao = nova
    payload.descricao = nova
  }

  if (mudancas.valor !== undefined) {
    if (!Number.isFinite(mudancas.valor) || mudancas.valor <= 0) {
      throw new Error("O valor deve ser um numero maior que zero.")
    }
    valor = Number(mudancas.valor.toFixed(2))
    payload.valor = valor
  }

  if (mudancas.tags !== undefined) {
    const novasTags = mudancas.tags.map((t) => t.trim()).filter(Boolean)
    if (novasTags.length === 0) throw new Error("Informe pelo menos uma etiqueta.")
    tags = novasTags
    payload.tags = novasTags
  }

  return { descricao, valor, tags, payload }
}

// Edita descricao/valor/etiquetas de um lancamento na previa, antes do envio.
// Atualiza tanto as colunas de exibicao quanto o payload (o que vai ao eGestor).
// Bloqueado apos o envio (egestor_codigo definido).
export async function updateEgestorLancamentoCampo(
  supabase: SupabaseClient,
  fechamentoId: string,
  lancamentoId: string,
  mudancas: { descricao?: string; valor?: number; tags?: string[] },
) {
  const { data: lancamento, error } = await supabase
    .from("egestor_lancamentos")
    .select("id, descricao, valor, tags, payload, egestor_codigo")
    .eq("id", lancamentoId)
    .eq("fechamento_id", fechamentoId)
    .maybeSingle()
  if (error) throw error
  if (!lancamento) throw new Error("Lancamento nao encontrado.")
  if (lancamento.egestor_codigo !== null) {
    throw new Error("Lancamento ja enviado ao eGestor; nao pode mais ser editado.")
  }

  const atualizado = buildLancamentoUpdate(
    {
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      tags: lancamento.tags ?? [],
      payload: (lancamento.payload as Record<string, unknown>) ?? {},
    },
    mudancas,
  )

  const { error: updateError } = await supabase
    .from("egestor_lancamentos")
    .update(atualizado)
    .eq("id", lancamentoId)
    .eq("fechamento_id", fechamentoId)
  if (updateError) throw updateError

  return getLancamentos(supabase, fechamentoId)
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

// Traduz erros comuns do upload de anexo (Disco Virtual) em orientacao acionavel.
// O lancamento financeiro ja foi enviado; isto afeta apenas o anexo do documento.
function friendlyAnexoError(raw: string): string {
  if (/acesso|permiss/i.test(raw)) {
    return 'Anexo nao enviado: habilite "Disco Virtual" no eGestor e use "Reenviar anexos".'
  }
  return raw
}

async function updateConnectionStatus(supabase: SupabaseClient, contaId: string, status: string, message: string) {
  const patch = {
    ultimo_teste_status: status,
    ultimo_teste_mensagem: message,
    ultimo_teste_em: new Date().toISOString(),
  }
  const { error } = await supabase.from("egestor_contas").update(patch).eq("id", contaId)
  if (error && isMissingRelation(error, "egestor_contas")) {
    await supabase.from("egestor_configuracoes").update(patch).eq("id", true)
  }
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

// Vencimento no mes SEGUINTE a competencia, no dia informado. competencia chega
// como "YYYY-MM-01". Retorna null quando nao ha dia configurado. O dia e limitado
// ao ultimo dia do mes de destino (ex.: dia 31 em mes de 30 vira 30).
export function proximoVencimento(competencia: string, dia: number | null): string | null {
  if (!dia || !Number.isInteger(dia) || dia < 1 || dia > 31) return null
  const [anoStr, mesStr] = toDateOnly(competencia).split("-")
  const ano = Number(anoStr)
  const mes = Number(mesStr)
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null
  const proximoMes = mes === 12 ? 1 : mes + 1
  const proximoAno = mes === 12 ? ano + 1 : ano
  const ultimoDia = new Date(proximoAno, proximoMes, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`
}

// Dia de vencimento padrao da regra comercial (imobiliaria x empreendimento).
// Resiliente: qualquer erro (inclusive coluna ausente antes da migration) resolve
// para null, sem bloquear a geracao da previa.
async function getDiaVencimentoPadrao(supabase: SupabaseClient, fechamento: FechamentoRow): Promise<number | null> {
  if (!fechamento.imobiliaria_id || !fechamento.empreendimento_id) return null
  try {
    const { data, error } = await supabase
      .from("regras_comerciais")
      .select("dia_vencimento_padrao")
      .eq("imobiliaria_id", fechamento.imobiliaria_id)
      .eq("empreendimento_id", fechamento.empreendimento_id)
      .eq("ativo", true)
      .maybeSingle()
    if (error) return null
    const dia = (data as { dia_vencimento_padrao?: number | null } | null)?.dia_vencimento_padrao ?? null
    return typeof dia === "number" ? dia : null
  } catch {
    return null
  }
}
