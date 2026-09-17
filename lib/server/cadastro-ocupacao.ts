/**
 * Cadastro de ocupação a partir do fechamento aprovado.
 *
 * O card "Hoje" dos Indicadores e a coluna "hoje" do mapa de calor leem
 * `imoveis.status` e `imoveis.inquilino_nome`. Ate 2026-09-17 esses campos so
 * mudavam por sincronizacao manual, e o cliente via o proprio PDF de agosto
 * contradizer a tela: LOCMAIS Galpao 02 "vago" com a J Mais dentro desde 13/08,
 * GM I 15 e 21 "inadimplentes" com o documento dizendo DESOCUPADO — 22 unidades
 * divergentes em 119.
 *
 * A aprovacao passa a copiar para o cadastro o status que o snapshot da
 * competencia (`imovel_competencias`) ja calculou para o mapa — a mesma
 * evidencia, uma verdade so. Guardas:
 *  - snapshot `desconhecido` nao afirma nada e nao mexe;
 *  - fechamento mais antigo que o ultimo aprovado do par nao regride o cadastro
 *    (aprovar julho depois de agosto nao volta o Galpao 02 para vago);
 *  - `inativo` e decisao de gente: o fechamento nao reativa nem desativa;
 *  - unidade vaga fica sem inquilino, mesmo que a linha da rescisao ainda nomeie
 *    quem saiu.
 * Cada troca vai para `auditoria_correcoes`, como o reajuste.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface SnapshotParaCadastro {
  imovel_id: string
  status_ocupacao: string
  inquilino_nome: string | null
  modelo_receita: string | null
}

export interface ImovelParaCadastro {
  id: string
  unidade: string
  status: string
  inquilino_nome: string | null
}

export interface MudancaCadastro {
  imovelId: string
  unidade: string
  statusAnterior: string
  statusNovo: string
  inquilinoAnterior: string | null
  inquilinoNovo: string | null
}

const STATUS_DO_FECHAMENTO = new Set(["ocupado", "inadimplente", "vago", "em_rescisao"])

export function planejarCadastroOcupacao(input: {
  competencia: string
  ultimaCompetenciaAprovada: string | null
  snapshots: SnapshotParaCadastro[]
  imoveis: ImovelParaCadastro[]
}): MudancaCadastro[] {
  if (input.ultimaCompetenciaAprovada !== null && input.competencia.slice(0, 7) < input.ultimaCompetenciaAprovada.slice(0, 7)) {
    return []
  }
  const imovelPorId = new Map(input.imoveis.map((imovel) => [imovel.id, imovel]))
  const mudancas: MudancaCadastro[] = []
  for (const snapshot of input.snapshots) {
    if (!STATUS_DO_FECHAMENTO.has(snapshot.status_ocupacao)) continue
    const imovel = imovelPorId.get(snapshot.imovel_id)
    if (!imovel || imovel.status === "inativo") continue
    const statusNovo = snapshot.status_ocupacao
    const inquilinoAnterior = imovel.inquilino_nome?.trim() || null
    // Vago fica sem inquilino. Ocupado sem nome (extrato que nao nomeia, como o
    // do Galpao Jose Walter) mantem o nome que o cadastro ja tem: trocar
    // informacao por vazio e regressao, nao atualizacao.
    const inquilinoNovo =
      statusNovo === "vago" ? null : snapshot.inquilino_nome?.trim() || inquilinoAnterior
    if (imovel.status === statusNovo && inquilinoAnterior === inquilinoNovo) continue
    mudancas.push({
      imovelId: imovel.id,
      unidade: imovel.unidade,
      statusAnterior: imovel.status,
      statusNovo,
      inquilinoAnterior,
      inquilinoNovo,
    })
  }
  return mudancas
}

// Mesma lista de status que o script de backfill de reajuste considera "aprovado".
export const STATUS_APROVADOS = ["aprovado", "preparado_egestor", "lancado_egestor", "erro_egestor"]

export interface AtualizarCadastroOptions {
  dryRun?: boolean
  usuario?: string
}

export async function atualizarCadastroOcupacaoDoFechamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  options: AtualizarCadastroOptions = {},
): Promise<MudancaCadastro[]> {
  const { data: fechamentoRaw, error: erroFechamento } = await supabase
    .from("fechamentos")
    .select("id,competencia,imobiliaria_id,empreendimento_id")
    .eq("id", fechamentoId)
    .single()
  if (erroFechamento) throw erroFechamento
  const fechamento = fechamentoRaw as { id: string; competencia: string; imobiliaria_id: string; empreendimento_id: string }
  const competencia = String(fechamento.competencia).slice(0, 10)

  const { data: aprovadosRaw, error: erroAprovados } = await supabase
    .from("fechamentos")
    .select("competencia")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("arquivado", false)
    .neq("id", fechamentoId)
    .in("status", STATUS_APROVADOS)
    .order("competencia", { ascending: false })
    .limit(1)
  if (erroAprovados) throw erroAprovados
  const ultimaCompetenciaAprovada = (aprovadosRaw?.[0] as { competencia: string } | undefined)?.competencia ?? null

  const { data: snapshotsRaw, error: erroSnapshots } = await supabase
    .from("imovel_competencias")
    .select("imovel_id,status_ocupacao,inquilino_nome,modelo_receita")
    .eq("fechamento_id", fechamentoId)
  if (erroSnapshots) throw erroSnapshots

  const { data: imoveisRaw, error: erroImoveis } = await supabase
    .from("imoveis")
    .select("id,unidade,status,inquilino_nome")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
  if (erroImoveis) throw erroImoveis

  const mudancas = planejarCadastroOcupacao({
    competencia,
    ultimaCompetenciaAprovada: ultimaCompetenciaAprovada ? String(ultimaCompetenciaAprovada).slice(0, 10) : null,
    snapshots: (snapshotsRaw ?? []) as SnapshotParaCadastro[],
    imoveis: (imoveisRaw ?? []) as ImovelParaCadastro[],
  })
  if (options.dryRun || mudancas.length === 0) return mudancas

  const usuario = options.usuario ?? "Sistema"
  const rotulo = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
  for (const mudanca of mudancas) {
    const { error } = await supabase
      .from("imoveis")
      .update({ status: mudanca.statusNovo, inquilino_nome: mudanca.inquilinoNovo })
      .eq("id", mudanca.imovelId)
    if (error) throw error
    const { error: erroAuditoria } = await supabase.from("auditoria_correcoes").insert({
      fechamento_id: fechamentoId,
      usuario,
      campo_alterado: `imoveis.status[${mudanca.unidade}]`,
      valor_anterior: descreverEstado(mudanca.statusAnterior, mudanca.inquilinoAnterior),
      valor_novo: descreverEstado(mudanca.statusNovo, mudanca.inquilinoNovo),
      justificativa: `Ocupação da competência ${rotulo} conforme o fechamento aprovado; o cadastro passa a refletir o documento mais recente.`,
    })
    if (erroAuditoria) throw erroAuditoria
  }
  return mudancas
}

function descreverEstado(status: string, inquilino: string | null) {
  return inquilino ? `${status} (${inquilino})` : status
}
