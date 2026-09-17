/**
 * Rastro da aprovacao na tela de Logs.
 *
 * A aprovacao passou a mexer no cadastro (reajuste -> aluguel esperado e
 * vigencia; ocupacao -> status e inquilino). Cada troca ja vai para
 * `auditoria_correcoes`, mas uma FALHA nao ia para lugar nenhum: a API devolvia
 * o erro e a tela de Revisao nao o mostrava, entao o cadastro ficava velho em
 * silencio (apontado em 2026-09-17). Agora toda aprovacao deixa uma
 * notificacao — com os numeros quando deu certo, com o erro quando nao deu, e
 * com a pendencia quando o reajuste precisou de decisao humana. A tela de Logs
 * ja lista `notificacoes`; nada novo para ler.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { MudancaCadastro } from "./cadastro-ocupacao"
import type { DecisaoReajuste } from "./reajuste-cadastro"

export interface ContextoAprovacao {
  empreendimento: string
  competencia: string
}

export interface ResultadoAprovacao {
  reajustes: DecisaoReajuste[]
  cadastro: MudancaCadastro[]
  cadastroErro: string | null
}

export interface LogAprovacao {
  tipo: "aprovacao_cadastro" | "aprovacao_cadastro_pendente" | "aprovacao_cadastro_falhou"
  titulo: string
  corpo: string
}

const REAJUSTE_PENDENTE = new Set<DecisaoReajuste["resultado"]>(["cadastro_divergente", "vigencia_divergente", "sem_imovel"])

export function montarLogAprovacao(contexto: ContextoAprovacao, resultado: ResultadoAprovacao): LogAprovacao {
  const rotulo = `Aprovação ${contexto.empreendimento} ${competenciaLabel(contexto.competencia)}`
  const aplicados = resultado.reajustes.filter((r) => r.resultado === "aplicado")
  const pendentes = resultado.reajustes.filter((r) => REAJUSTE_PENDENTE.has(r.resultado))

  const linhasCadastro = resultado.cadastro.map(
    (m) => `${m.unidade}: ${estado(m.statusAnterior, m.inquilinoAnterior)} → ${estado(m.statusNovo, m.inquilinoNovo)}`,
  )
  const linhasReajuste = aplicados.map((r) => `apto ${r.apto}: ${r.detalhe}`)
  const linhasPendentes = pendentes.map((r) => `apto ${r.apto}: ${r.detalhe}`)

  if (resultado.cadastroErro !== null) {
    return {
      tipo: "aprovacao_cadastro_falhou",
      titulo: `${rotulo}: cadastro NÃO atualizado`,
      corpo: [
        `A aprovação foi registrada, mas a ocupação do cadastro (status e inquilino dos imóveis) não foi atualizada: ${resultado.cadastroErro}`,
        "Confira a tela de Imóveis ou rode scripts/atualizar-cadastro-ocupacao.ts para este fechamento.",
        ...secao("Reajustes aplicados", linhasReajuste),
        ...secao("Reajustes pendentes de decisão", linhasPendentes),
      ].join("\n"),
    }
  }

  const partes: string[] = []
  partes.push(
    resultado.cadastro.length === 0
      ? "cadastro já refletia o documento"
      : `cadastro atualizado em ${resultado.cadastro.length} ${resultado.cadastro.length === 1 ? "unidade" : "unidades"}`,
  )
  if (aplicados.length > 0) partes.push(`${aplicados.length} ${aplicados.length === 1 ? "reajuste aplicado" : "reajustes aplicados"}`)
  if (pendentes.length > 0) partes.push(`${pendentes.length} ${pendentes.length === 1 ? "reajuste pendente" : "reajustes pendentes"}`)

  return {
    tipo: pendentes.length > 0 ? "aprovacao_cadastro_pendente" : "aprovacao_cadastro",
    titulo: `${rotulo}: ${partes.join(", ")}`,
    corpo:
      [
        ...secao("Ocupação do cadastro", linhasCadastro),
        ...secao("Reajustes aplicados", linhasReajuste),
        ...secao("Reajustes pendentes de decisão (cadastro não foi alterado)", linhasPendentes),
      ].join("\n") || "Nenhuma alteração no cadastro: status, inquilinos e aluguéis já batiam com o fechamento.",
  }
}

export async function registrarLogAprovacao(
  supabase: SupabaseClient,
  fechamentoId: string,
  resultado: ResultadoAprovacao,
): Promise<void> {
  const { data } = await supabase
    .from("fechamentos")
    .select("competencia,empreendimentos(nome)")
    .eq("id", fechamentoId)
    .single()
  const row = data as { competencia: string; empreendimentos: { nome: string } | { nome: string }[] | null } | null
  const relacao = row?.empreendimentos
  const empreendimento = (Array.isArray(relacao) ? relacao[0]?.nome : relacao?.nome) ?? "empreendimento"
  const log = montarLogAprovacao({ empreendimento, competencia: String(row?.competencia ?? "") }, resultado)
  const { error } = await supabase.from("notificacoes").insert({
    fechamento_id: fechamentoId,
    tipo: log.tipo,
    titulo: log.titulo,
    corpo: log.corpo,
  })
  if (error) throw error
}

function secao(titulo: string, linhas: string[]) {
  return linhas.length === 0 ? [] : [`${titulo}:`, ...linhas.map((l) => `  · ${l}`)]
}

function estado(status: string, inquilino: string | null) {
  return inquilino ? `${status} (${inquilino})` : status
}

function competenciaLabel(competencia: string) {
  const [ano, mes] = competencia.slice(0, 7).split("-")
  return ano && mes ? `${mes}/${ano}` : competencia
}
