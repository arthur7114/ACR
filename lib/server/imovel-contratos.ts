/**
 * Contratos de locação por imóvel (`imovel_contratos`).
 *
 * `imoveis.contrato_*` segue sendo o vigente, que a lista de imóveis lê. Toda
 * escrita de prazo passa por aqui para a tabela e as colunas não divergirem:
 * planilha, aprovação do relatório de vigência, formulário do imóvel e cadastro
 * manual. Um contrato por (imóvel, início): repetir o início corrige as datas.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { destinoDaEdicao, viraVigente } from "@/lib/contrato-prazo"
import type { ContratosDoImovel, ImovelContrato, ImovelDoContrato } from "@/lib/imovel-contratos-types"
import { aptoKey } from "./apto-key"

const COLUNAS_CONTRATO = "id,imovel_id,locatario,inicio,termino,fonte"
const COLUNAS_IMOVEL = "id,unidade,ativo,inquilino_nome,contrato_inicio,contrato_termino,contrato_locatario,contrato_fonte"

export interface NovoContrato {
  imovelId: string
  locatario: string | null
  inicio: string
  termino: string | null
  fonte: string
  fechamentoId?: string | null
}

const dia = (valor: string | null | undefined) => (valor ? String(valor).slice(0, 10) : null)

export async function listarContratos(supabase: SupabaseClient, imovelId: string): Promise<ImovelContrato[]> {
  const { data, error } = await supabase
    .from("imovel_contratos")
    .select(COLUNAS_CONTRATO)
    .eq("imovel_id", imovelId)
    .order("inicio", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({ ...row, inicio: dia(row.inicio)!, termino: dia(row.termino) })) as ImovelContrato[]
}

/** Imóvel da unidade no empreendimento (o ativo, quando há mais de um). */
export async function encontrarImovelDaUnidade(
  supabase: SupabaseClient,
  empreendimentoId: string,
  unidade: string,
): Promise<ImovelDoContrato | null> {
  const { data, error } = await supabase.from("imoveis").select(COLUNAS_IMOVEL).eq("empreendimento_id", empreendimentoId)
  if (error) throw error
  const alvo = aptoKey(unidade)
  const candidatos = (data ?? []).filter((row) => aptoKey(row.unidade) === alvo)
  const escolhido = candidatos.find((row) => row.ativo) ?? candidatos[0]
  if (!escolhido) return null
  const { unidade: _unidade, ativo: _ativo, ...imovel } = escolhido
  return imovel as ImovelDoContrato
}

export async function contratosDaUnidade(
  supabase: SupabaseClient,
  empreendimentoId: string,
  unidade: string,
): Promise<ContratosDoImovel> {
  const imovel = await encontrarImovelDaUnidade(supabase, empreendimentoId, unidade)
  return { imovel, contratos: imovel ? await listarContratosSemFalhar(supabase, imovel.id) : [] }
}

/**
 * Leitura para tela: a lista de contratos é um complemento do detalhe do imóvel.
 * Se ela falhar (ex.: migration ainda não aplicada), o detalhe segue de pé com o
 * prazo vigente e o histórico financeiro, e o motivo vai para o log.
 */
export async function listarContratosSemFalhar(supabase: SupabaseClient, imovelId: string): Promise<ImovelContrato[]> {
  try {
    return await listarContratos(supabase, imovelId)
  } catch (error) {
    console.warn("[CONTRATOS] Falha ao listar contratos do imóvel:", error instanceof Error ? error.message : error)
    return []
  }
}

/** Grava o contrato na lista; o mesmo início corrige as datas. Sem início não há o que registrar. */
export async function registrarContrato(supabase: SupabaseClient, contrato: NovoContrato) {
  const inicio = dia(contrato.inicio)
  if (!inicio) return
  const { error } = await supabase.from("imovel_contratos").upsert(
    {
      imovel_id: contrato.imovelId,
      locatario: contrato.locatario,
      inicio,
      termino: dia(contrato.termino),
      fonte: contrato.fonte,
      fechamento_id: contrato.fechamentoId ?? null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "imovel_id,inicio" },
  )
  if (error) throw error
}

/**
 * Cadastro manual de um contrato. Se começa no mesmo dia ou depois do vigente,
 * ele passa a ser o vigente (colunas do imóvel); se é anterior, só entra na
 * lista. Devolve se virou o vigente.
 */
export async function cadastrarContratoManual(
  supabase: SupabaseClient,
  contrato: Omit<NovoContrato, "fonte" | "fechamentoId">,
): Promise<{ vigente: boolean }> {
  const { data: imovel, error } = await supabase.from("imoveis").select("contrato_inicio").eq("id", contrato.imovelId).single()
  if (error) throw error
  const fonte = "Cadastro manual"
  await registrarContrato(supabase, { ...contrato, fonte })
  const vigente = viraVigente(imovel.contrato_inicio, contrato.inicio)
  if (vigente) {
    const { error: erroImovel } = await supabase
      .from("imoveis")
      .update({
        contrato_inicio: contrato.inicio,
        contrato_termino: contrato.termino,
        contrato_locatario: contrato.locatario,
        contrato_fonte: fonte,
      })
      .eq("id", contrato.imovelId)
    if (erroImovel) throw erroImovel
  }
  return { vigente }
}

/**
 * Prazo do vigente editado no formulário do imóvel. Do mesmo locatário, o
 * contrato que estava lá é corrigido (a linha antiga sai); de outro, ele é um
 * contrato novo e o antigo continua na lista.
 */
export async function sincronizarEdicaoDoVigente(
  supabase: SupabaseClient,
  imovelId: string,
  anterior: { inicio: string | null; locatario: string | null },
  atual: { inicio: string | null; termino: string | null; locatario: string | null; fonte: string | null },
) {
  const inicio = dia(atual.inicio)
  if (!inicio) return
  const inicioAnterior = dia(anterior.inicio)
  if (inicioAnterior && inicioAnterior !== inicio && destinoDaEdicao(anterior, atual.locatario) === "substituir") {
    const { error } = await supabase.from("imovel_contratos").delete().eq("imovel_id", imovelId).eq("inicio", inicioAnterior)
    if (error) throw error
  }
  await registrarContrato(supabase, {
    imovelId,
    locatario: atual.locatario,
    inicio,
    termino: atual.termino,
    fonte: atual.fonte ?? "Edição manual",
  })
}

/** Remove um contrato; se era o vigente, o vigente passa a ser o mais recente que sobrou. */
export async function removerContrato(supabase: SupabaseClient, imovelId: string, contratoId: string) {
  const { data: contrato, error: erroBusca } = await supabase
    .from("imovel_contratos")
    .select("inicio")
    .eq("id", contratoId)
    .eq("imovel_id", imovelId)
    .maybeSingle()
  if (erroBusca) throw erroBusca
  if (!contrato) return { removido: false }

  const { error } = await supabase.from("imovel_contratos").delete().eq("id", contratoId)
  if (error) throw error

  const { data: imovel, error: erroImovel } = await supabase.from("imoveis").select("contrato_inicio").eq("id", imovelId).single()
  if (erroImovel) throw erroImovel
  if (dia(imovel.contrato_inicio) === dia(contrato.inicio)) {
    const [restante] = await listarContratos(supabase, imovelId)
    const { error: erroAtualiza } = await supabase
      .from("imoveis")
      .update({
        contrato_inicio: restante?.inicio ?? null,
        contrato_termino: restante?.termino ?? null,
        contrato_locatario: restante?.locatario ?? null,
        contrato_fonte: restante?.fonte ?? null,
      })
      .eq("id", imovelId)
    if (erroAtualiza) throw erroAtualiza
  }
  return { removido: true }
}
