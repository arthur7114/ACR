/**
 * Aluguel do contrato novo -> cadastro e vigência, na aprovação.
 *
 * O reajuste (`reajuste-cadastro.ts`) cobre "de -> para" declarado no relatório.
 * Contrato NOVO não tem relatório: o aluguel cheio aparece de três jeitos na
 * própria prestação, e o cadastro continuava com o valor do inquilino anterior
 * (validação de ago/2026: LOCMAIS Galpão 02 em 1.700 com a J Mais a 1.830;
 * GM II 26 em 660 com o Samuel a 700). O "contratado" dos Indicadores ficava
 * subestimado até alguém editar a mão.
 *
 *  1. **Proporcional declarado** ("PROPORCIONAL DE 21 DIAS (11/08 A 31/08)"):
 *     aluguel × dias do mês ÷ dias declarados. Rescisão também é proporcional,
 *     mas de quem SAIU — fica de fora (texto "RESCISÃO", tipo rescisao na seção
 *     de acordos, ou período que começa no dia 1).
 *  2. **Seção de intermediações**: o item traz o aluguel cheio do contrato novo.
 *  3. **Primeiro mês cheio** com inquilino diferente do mês anterior (ou unidade
 *     que estava vaga). Mesmo inquilino com valor novo é reajuste, não contrato.
 *
 * O inverso do proporcional tem ambiguidade de centavos (22,58 × 31 = 699,98 ou
 * 700,00). Contrato novo costuma ser valor redondo: se o inteiro mais próximo
 * reproduz o proporcional observado, é ele; senão, o valor com centavos. Se
 * errar por centavos, o primeiro mês cheio corrige, porque o cadastro ainda
 * estará no valor que este passo escreveu (mesma guarda do reajuste).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { diasDaCompetencia, diasProporcionaisDeclarados } from "@/lib/indicadores-deficit-causas"
import { normalizarItemLegado, type RecebimentoLegado } from "@/lib/recebimentos-extraordinarios"
import {
  aplicarValorDeAluguel,
  carregarContextoDeAluguel,
  type DecisaoReajuste,
  type ReajusteAplicavel,
} from "./reajuste-cadastro"

export type OrigemContratoNovo = "proporcional" | "intermediacao" | "primeiro_mes_cheio"

export interface ContratoNovo {
  apto: string
  inquilino: string | null
  valorNovo: number
  vigencia: string
  origem: OrigemContratoNovo
}

export interface SnapshotAnterior {
  apto: string
  inquilino: string | null
  statusOcupacao: string
}

// So o que o planejador le, para aceitar tanto a analise completa quanto
// fixtures enxutas nos testes.
export interface PrestacaoMinima {
  receitas_por_imovel?: Array<{ apto?: string | null; inquilino?: string | null; aluguel?: number | null; observacao?: string | null }> | null
  // Secao de acordos/rescisoes/intermediacoes. Daqui saem so `tipo` e `apto`
  // (quem rescindiu) e o aluguel da intermediacao via `normalizarItemLegado` —
  // nenhuma formula financeira e refeita aqui (CA27).
  acordos_rescisoes_recebidos?: RecebimentoLegado[] | null
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizarTexto(valor: string | null | undefined) {
  return (valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase()
}

export function aluguelCheioDoProporcional(aluguel: number, dias: number, diasNoMes: number): number | null {
  if (!(aluguel > 0) || !(dias > 0) || !(diasNoMes > 0) || dias >= diasNoMes) return null
  const reproduz = (cheio: number) => roundMoney((cheio * dias) / diasNoMes) === roundMoney(aluguel)
  const bruto = (aluguel * diasNoMes) / dias
  const inteiro = Math.round(bruto)
  if (reproduz(inteiro)) return inteiro
  const centavos = roundMoney(bruto)
  if (reproduz(centavos)) return centavos
  for (const vizinho of [centavos - 0.01, centavos + 0.01]) {
    if (reproduz(roundMoney(vizinho))) return roundMoney(vizinho)
  }
  return null
}

const PERIODO = /\((\d{1,2})\/\d{1,2}\s+A\s+(\d{1,2})\/\d{1,2}\)/

// Período proporcional de quem ENTRA termina no último dia do mês; o de quem sai
// (rescisão) começa no dia 1. Sem período declarado, vale só o texto.
function proporcionalDeEntrada(observacao: string, diasNoMes: number) {
  if (/\bRESCIS/.test(observacao)) return false
  const periodo = PERIODO.exec(observacao)
  if (!periodo) return true
  return Number(periodo[1]) !== 1 || Number(periodo[2]) === diasNoMes
}

export function contratosNovosDoFechamento(
  prestacao: PrestacaoMinima | null | undefined,
  competencia: string,
  mesAnterior: SnapshotAnterior[],
): ContratoNovo[] {
  if (!prestacao) return []
  const vigencia = `${competencia.slice(0, 7)}-01`
  const diasNoMes = diasDaCompetencia(competencia) ?? 30
  const rescindidos = new Set(
    (prestacao.acordos_rescisoes_recebidos ?? [])
      .filter((item) => item.tipo === "rescisao")
      .map((item) => normalizeCodigoImovel(item.apto ?? ""))
      .filter(Boolean),
  )
  const anteriorPorApto = new Map(mesAnterior.map((s) => [normalizeCodigoImovel(s.apto), s]))
  const itens: ContratoNovo[] = []
  const vistos = new Set<string>()
  const registrar = (item: ContratoNovo) => {
    const chave = normalizeCodigoImovel(item.apto)
    if (!chave || vistos.has(chave)) return
    vistos.add(chave)
    itens.push(item)
  }

  for (const linha of prestacao.receitas_por_imovel ?? []) {
    const apto = linha.apto?.trim()
    const aluguel = typeof linha.aluguel === "number" ? linha.aluguel : null
    if (!apto || aluguel === null || aluguel <= 0) continue
    const observacao = normalizarTexto(linha.observacao)
    const inquilino = linha.inquilino?.trim() || null
    const dias = diasProporcionaisDeclarados(linha.observacao)

    if (dias !== null) {
      if (rescindidos.has(normalizeCodigoImovel(apto)) || !proporcionalDeEntrada(observacao, diasNoMes)) continue
      const cheio = aluguelCheioDoProporcional(aluguel, dias, diasNoMes)
      if (cheio !== null) registrar({ apto, inquilino, valorNovo: cheio, vigencia, origem: "proporcional" })
      continue
    }

    const anterior = anteriorPorApto.get(normalizeCodigoImovel(apto))
    if (!anterior || !inquilino) continue
    const trocouInquilino =
      anterior.statusOcupacao === "vago" || normalizarTexto(anterior.inquilino) !== normalizarTexto(inquilino)
    if (trocouInquilino) registrar({ apto, inquilino, valorNovo: roundMoney(aluguel), vigencia, origem: "primeiro_mes_cheio" })
  }

  for (const item of prestacao.acordos_rescisoes_recebidos ?? []) {
    if (item.tipo !== "intermediacao") continue
    const apto = item.apto?.trim()
    const normalizado = normalizarItemLegado(item)
    const aluguel = normalizado.tipo === "intermediacao" ? normalizado.componentes.aluguel : null
    if (!apto || aluguel === null || aluguel <= 0) continue
    registrar({ apto, inquilino: item.inquilino?.trim() || null, valorNovo: roundMoney(aluguel), vigencia, origem: "intermediacao" })
  }

  return itens
}

const ORIGEM_LABEL: Record<OrigemContratoNovo, string> = {
  proporcional: "proporcional declarado na linha",
  intermediacao: "seção de intermediações",
  primeiro_mes_cheio: "primeiro mês cheio do inquilino novo",
}

export async function aplicarContratosNovosDoFechamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  options: { dryRun?: boolean; usuario?: string } = {},
): Promise<DecisaoReajuste[]> {
  const contexto = await carregarContextoDeAluguel(supabase, fechamentoId, {
    documentoTipo: "prestacao_contas",
    usuario: options.usuario,
    dryRun: options.dryRun,
  })
  const analise = contexto.fechamento.analise_completa as PackageAnalysis | null
  const competencia = contexto.competencia
  const [ano, mes] = competencia.split("-").map(Number)
  const anterior = new Date(Date.UTC(ano, mes - 2, 1))
  const competenciaAnterior = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, "0")}-01`

  const { data: snapshotsRaw, error } = await supabase
    .from("imovel_competencias")
    .select("imovel_id,inquilino_nome,status_ocupacao,imoveis(unidade)")
    .eq("competencia", competenciaAnterior)
    .in("imovel_id", contexto.imoveis.map((imovel) => imovel.id))
  if (error) throw error
  const mesAnterior: SnapshotAnterior[] = (snapshotsRaw ?? []).map((row) => {
    const relacao = (row as { imoveis: { unidade: string } | { unidade: string }[] | null }).imoveis
    const unidade = (Array.isArray(relacao) ? relacao[0]?.unidade : relacao?.unidade) ?? ""
    return { apto: unidade, inquilino: (row as { inquilino_nome: string | null }).inquilino_nome, statusOcupacao: (row as { status_ocupacao: string }).status_ocupacao }
  })

  const itens = contratosNovosDoFechamento(analise?.prestacao, competencia, mesAnterior)
  const decisoes: DecisaoReajuste[] = []
  for (const item of itens) {
    const reajuste: Omit<ReajusteAplicavel, "valorAnterior"> = {
      apto: item.apto,
      inquilino: item.inquilino,
      valorNovo: item.valorNovo,
      percentual: null,
      vigencia: item.vigencia,
      observacao: null,
    }
    decisoes.push(
      await aplicarValorDeAluguel(contexto, reajuste, {
        fonte: `Contrato novo na prestação de contas da competência ${mes.toString().padStart(2, "0")}/${ano}`,
        justificativa: `Aluguel do contrato novo (${ORIGEM_LABEL[item.origem]}${item.inquilino ? `, ${item.inquilino}` : ""}) na prestação de contas de ${mes.toString().padStart(2, "0")}/${ano}, aplicado ao cadastro e à vigência.`,
      }),
    )
  }
  return decisoes
}

