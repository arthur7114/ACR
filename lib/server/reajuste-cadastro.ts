// Reajuste declarado no relatorio de reajuste -> cadastro do imovel.
//
// Pedido do cliente (WhatsApp, 2026-09-17, GM II ago/2026): "Quando houver
// atualizacao monetaria corrigir automaticamente o valor do cadastro." O
// relatorio da Alive dizia apto 17: R$ 628,06 -> R$ 655,96 (IPCA 4,44%), a
// prestacao ja cobrava 655,96, e o cadastro de Imoveis seguia em 628,06 — os
// Indicadores mostravam R$ 27,90 "sem explicacao" e o cliente tinha que
// corrigir a mao.
//
// O cadastro tem duas camadas e as duas mudam juntas:
//   - `imoveis.valor_aluguel_esperado`: o valor que a tela de Imoveis mostra;
//   - `imovel_vigencias.aluguel_contratado`: o que os Indicadores usam como
//     "contratado" por competencia (reajuste = troca de vigencia com aluguel
//     diferente; e dai que a linha do tempo do imovel deriva o evento).
//
// Quando: na APROVACAO do fechamento, nunca na extracao. A leitura por IA pode
// errar; a aprovacao e o momento em que um humano deu o documento por bom.
//
// Guarda (a mesma da migration 202608120001 do Pompilio): so troca quando o
// cadastro ainda esta no valor ANTERIOR que o documento declara (ou vazio). Se
// ja esta no novo, nada a fazer. Se esta em qualquer outro valor, nao
// sobrescreve: o documento fala de um "de -> para" que o cadastro nao confirma,
// e isso e decisao de gente. Toda troca vai para `auditoria_correcoes`.
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import type { PackageAnalysis, ReajusteAnalysis } from "@/lib/prestacao-types"

export interface ReajusteAplicavel {
  apto: string
  inquilino: string | null
  valorAnterior: number
  valorNovo: number
  percentual: number | null
  // Primeiro dia do mes em que o novo aluguel passa a valer (YYYY-MM-01).
  vigencia: string
  observacao: string | null
}

export type ResultadoReajuste =
  | "aplicado"
  | "ja_aplicado"
  | "sem_imovel"
  | "cadastro_divergente"
  | "vigencia_divergente"

export interface DecisaoReajuste {
  apto: string
  valorAnterior: number
  valorNovo: number
  resultado: ResultadoReajuste
  detalhe: string
}

const TOLERANCIA = 0.005

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function iguais(a: number | null | undefined, b: number) {
  return typeof a === "number" && Math.abs(a - b) < TOLERANCIA
}

// "2026-08", "2026-08-01", "08/2026" -> "2026-08-01". Qualquer outra forma
// (intervalo de contrato, texto) e desconhecida: o chamador cai na competencia.
export function mesDaVigencia(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim()
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(texto)
  if (iso) return `${iso[1]}-${iso[2]}-01`
  const br = /^(\d{2})\/(\d{4})$/.exec(texto)
  if (br) return `${br[2]}-${br[1]}-01`
  return null
}

export function mesAnterior(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number)
  const data = new Date(Date.UTC(ano, mes - 2, 1))
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-01`
}

// Itens do relatorio que sao reajuste de aluguel de fato: tem o "de" e o
// "para", ambos positivos e diferentes. Rescisoes e outros eventos do mesmo
// relatorio vem sem valor_anterior e ficam de fora.
export function reajustesAplicaveis(
  reajuste: ReajusteAnalysis | null | undefined,
  competencia: string,
): ReajusteAplicavel[] {
  const itens: ReajusteAplicavel[] = []
  for (const item of reajuste?.itens ?? []) {
    const apto = item.apto?.trim()
    if (!apto) continue
    if (typeof item.valor_anterior !== "number" || typeof item.valor_novo !== "number") continue
    if (item.valor_anterior <= 0 || item.valor_novo <= 0) continue
    if (iguais(item.valor_anterior, item.valor_novo)) continue
    if (!/reajust|atualiza|ipca|igp/i.test(`${item.descricao} ${item.observacao ?? ""}`)) continue
    itens.push({
      apto,
      inquilino: item.inquilino ?? null,
      valorAnterior: roundMoney(item.valor_anterior),
      valorNovo: roundMoney(item.valor_novo),
      percentual: item.percentual ?? null,
      vigencia: mesDaVigencia(item.vigencia) ?? mesDaVigencia(competencia) ?? competencia,
      observacao: item.observacao ?? null,
    })
  }
  return itens
}

export interface ImovelParaReajuste {
  id: string
  codigo_imobiliaria: string | null
  unidade: string | null
  valor_aluguel_esperado: number | string | null
}

export function encontrarImovel(apto: string, imoveis: ImovelParaReajuste[]): ImovelParaReajuste | null {
  const chave = normalizeCodigoImovel(apto)
  if (!chave) return null
  return (
    imoveis.find(
      (imovel) =>
        normalizeCodigoImovel(imovel.unidade) === chave || normalizeCodigoImovel(imovel.codigo_imobiliaria) === chave,
    ) ?? null
  )
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const n = typeof valor === "string" ? Number(valor) : valor
  return Number.isFinite(n) ? n : null
}

// Decisao pura sobre o cadastro (`imoveis.valor_aluguel_esperado`).
export function decidirCadastro(
  item: ReajusteAplicavel,
  imovel: ImovelParaReajuste | null,
): Exclude<ResultadoReajuste, "vigencia_divergente"> {
  if (!imovel) return "sem_imovel"
  const atual = numero(imovel.valor_aluguel_esperado)
  if (iguais(atual, item.valorNovo)) return "ja_aplicado"
  if (atual === null || iguais(atual, item.valorAnterior)) return "aplicado"
  return "cadastro_divergente"
}

export interface VigenciaParaReajuste {
  id: string
  vigencia_inicio: string
  vigencia_fim: string | null
  modelo_receita: string
  aluguel_contratado: number | string | null
}

export type PlanoVigencia =
  | { acao: "nada" }
  | { acao: "atualizar"; id: string }
  | { acao: "encerrar_e_abrir"; encerrarId: string; fimAnterior: string; fimNovo: string | null }
  | { acao: "abrir"; fim: string | null }
  | { acao: "divergente"; motivo: string }

// Decisao pura sobre as vigencias ativas do imovel. A vigencia que cobre o mes
// do reajuste precisa ser de aluguel fixo e ainda estar no valor anterior (ou
// vazia); fora disso o historico contratual diz outra coisa e nao se mexe.
export function planejarVigencia(item: ReajusteAplicavel, vigencias: VigenciaParaReajuste[]): PlanoVigencia {
  const alvo = item.vigencia
  const cobre = vigencias.find(
    (v) => String(v.vigencia_inicio).slice(0, 10) <= alvo && (v.vigencia_fim === null || String(v.vigencia_fim).slice(0, 10) >= alvo),
  )
  if (!cobre) {
    // Sem vigencia no mes: abre uma a partir do reajuste, ate a proxima que exista.
    const proxima = vigencias
      .filter((v) => String(v.vigencia_inicio).slice(0, 10) > alvo)
      .sort((a, b) => String(a.vigencia_inicio).localeCompare(String(b.vigencia_inicio)))[0]
    return { acao: "abrir", fim: proxima ? mesAnterior(String(proxima.vigencia_inicio).slice(0, 10)) : null }
  }
  if (cobre.modelo_receita !== "fixo") {
    return { acao: "divergente", motivo: `vigência do mês é de receita ${cobre.modelo_receita}, não aluguel fixo` }
  }
  const atual = numero(cobre.aluguel_contratado)
  if (iguais(atual, item.valorNovo)) return { acao: "nada" }
  if (atual !== null && !iguais(atual, item.valorAnterior)) {
    return { acao: "divergente", motivo: `vigência do mês está em ${atual.toFixed(2)}, não em ${item.valorAnterior.toFixed(2)}` }
  }
  if (String(cobre.vigencia_inicio).slice(0, 10) === alvo) return { acao: "atualizar", id: cobre.id }
  return {
    acao: "encerrar_e_abrir",
    encerrarId: cobre.id,
    fimAnterior: mesAnterior(alvo),
    fimNovo: cobre.vigencia_fim ? String(cobre.vigencia_fim).slice(0, 10) : null,
  }
}

function formatPercentual(valor: number | null) {
  return valor === null ? "" : ` (${valor.toFixed(2).replace(".", ",")}%)`
}

function competenciaLabel(competencia: string) {
  const [ano, mes] = competencia.split("-")
  return `${mes}/${ano}`
}

interface FechamentoParaReajuste {
  id: string
  competencia: string
  imobiliaria_id: string
  empreendimento_id: string
  analise_completa: PackageAnalysis | null
}

export interface AplicarReajustesOptions {
  // Sem escrever nada: devolve o que FARIA. Usado pelo script de backfill.
  dryRun?: boolean
  usuario?: string
}

export async function aplicarReajustesDoFechamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  options: AplicarReajustesOptions = {},
): Promise<DecisaoReajuste[]> {
  const { data: fechamentoRaw, error: erroFechamento } = await supabase
    .from("fechamentos")
    .select("id,competencia,imobiliaria_id,empreendimento_id,analise_completa")
    .eq("id", fechamentoId)
    .single()
  if (erroFechamento) throw erroFechamento
  const fechamento = fechamentoRaw as FechamentoParaReajuste
  const competencia = String(fechamento.competencia).slice(0, 10)

  const itens = reajustesAplicaveis(fechamento.analise_completa?.reajuste, competencia)
  if (itens.length === 0) return []

  const { data: imoveisRaw, error: erroImoveis } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,valor_aluguel_esperado")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
  if (erroImoveis) throw erroImoveis
  const imoveis = (imoveisRaw ?? []) as ImovelParaReajuste[]

  const { data: documentos } = await supabase
    .from("documentos_fechamento")
    .select("id")
    .eq("fechamento_id", fechamentoId)
    .eq("tipo_documento", "relatorio_reajuste")
    .limit(1)
  const documentoFonteId = (documentos?.[0] as { id: string } | undefined)?.id ?? null

  const usuario = options.usuario ?? "Sistema"
  const decisoes: DecisaoReajuste[] = []

  for (const item of itens) {
    const imovel = encontrarImovel(item.apto, imoveis)
    const base = { apto: item.apto, valorAnterior: item.valorAnterior, valorNovo: item.valorNovo }
    const cadastro = decidirCadastro(item, imovel)

    if (cadastro === "sem_imovel") {
      decisoes.push({ ...base, resultado: cadastro, detalhe: "Nenhum imóvel ativo com essa unidade no empreendimento." })
      continue
    }
    if (cadastro === "cadastro_divergente") {
      decisoes.push({
        ...base,
        resultado: cadastro,
        detalhe: `Cadastro está em ${Number(imovel!.valor_aluguel_esperado).toFixed(2)}, não em ${item.valorAnterior.toFixed(2)} como o relatório declara.`,
      })
      continue
    }

    const { data: vigenciasRaw, error: erroVigencias } = await supabase
      .from("imovel_vigencias")
      .select("id,vigencia_inicio,vigencia_fim,modelo_receita,aluguel_contratado")
      .eq("imovel_id", imovel!.id)
      .eq("ativo", true)
      .order("vigencia_inicio", { ascending: true })
    if (erroVigencias) throw erroVigencias
    const plano = planejarVigencia(item, (vigenciasRaw ?? []) as VigenciaParaReajuste[])

    if (plano.acao === "divergente") {
      decisoes.push({ ...base, resultado: "vigencia_divergente", detalhe: plano.motivo })
      continue
    }
    if (cadastro === "ja_aplicado" && plano.acao === "nada") {
      decisoes.push({ ...base, resultado: "ja_aplicado", detalhe: "Cadastro e vigência já estão no valor novo." })
      continue
    }

    const detalhe = `${item.valorAnterior.toFixed(2)} -> ${item.valorNovo.toFixed(2)} a partir de ${competenciaLabel(item.vigencia)}`
    if (options.dryRun) {
      decisoes.push({ ...base, resultado: "aplicado", detalhe: `[dry-run] ${detalhe}; vigência: ${plano.acao}` })
      continue
    }

    if (cadastro === "aplicado") {
      const { error } = await supabase
        .from("imoveis")
        .update({ valor_aluguel_esperado: item.valorNovo })
        .eq("id", imovel!.id)
      if (error) throw error
    }

    const fonte = `Relatório de reajuste da competência ${competenciaLabel(competencia)}`
    const novaVigencia = {
      imovel_id: imovel!.id,
      imobiliaria_id: fechamento.imobiliaria_id,
      empreendimento_id: fechamento.empreendimento_id,
      vigencia_inicio: item.vigencia,
      modelo_receita: "fixo",
      aluguel_contratado: item.valorNovo,
      fonte,
      documento_fonte_id: documentoFonteId,
      ativo: true,
    }
    if (plano.acao === "atualizar") {
      const { error } = await supabase
        .from("imovel_vigencias")
        .update({ aluguel_contratado: item.valorNovo, fonte, documento_fonte_id: documentoFonteId })
        .eq("id", plano.id)
      if (error) throw error
    } else if (plano.acao === "encerrar_e_abrir") {
      const encerrar = await supabase
        .from("imovel_vigencias")
        .update({ vigencia_fim: plano.fimAnterior })
        .eq("id", plano.encerrarId)
      if (encerrar.error) throw encerrar.error
      const abrir = await supabase.from("imovel_vigencias").insert({ ...novaVigencia, vigencia_fim: plano.fimNovo })
      if (abrir.error) throw abrir.error
    } else if (plano.acao === "abrir") {
      const abrir = await supabase.from("imovel_vigencias").insert({ ...novaVigencia, vigencia_fim: plano.fim })
      if (abrir.error) throw abrir.error
    }

    const { error: erroAuditoria } = await supabase.from("auditoria_correcoes").insert({
      fechamento_id: fechamentoId,
      usuario,
      campo_alterado: `imoveis.valor_aluguel_esperado[${imovel!.unidade ?? item.apto}]`,
      valor_anterior: item.valorAnterior.toFixed(2),
      valor_novo: item.valorNovo.toFixed(2),
      justificativa: `Reajuste declarado no relatório de reajuste da competência ${competenciaLabel(competencia)}${formatPercentual(item.percentual)}, aplicado ao cadastro e à vigência a partir de ${competenciaLabel(item.vigencia)}.`,
    })
    if (erroAuditoria) throw erroAuditoria

    decisoes.push({ ...base, resultado: "aplicado", detalhe })
  }

  return decisoes
}
