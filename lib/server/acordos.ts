import { createSupabaseAdmin } from "./supabase"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type { Acordo, AcordoParcela, AcordosResponse } from "@/lib/acordos-types"

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : 0
}

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : null
}

function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return e?.code === "42P01" || /does not exist|could not find the table|schema cache/i.test(e?.message ?? "")
}

function normTexto(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

// "ACORDO RESCISAO. PARCELA (2/7)" -> { numero: 2, total: 7 }
function parcelaInfo(obs: string | null | undefined): { numero: number; total: number } | null {
  const m = /parcela\s*\(?\s*(\d+)\s*\/\s*(\d+)/i.exec(obs ?? "")
  if (!m) return null
  const numero = Number(m[1])
  const total = Number(m[2])
  if (!Number.isFinite(numero) || !Number.isFinite(total) || total < 1 || numero < 1) return null
  return { numero, total }
}

function parseBR(value: string): number | null {
  const n = Number(value.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// Soma "06 PARCELAS DE R$ 300,00 + 01 PARCELA DE R$ 280,41" -> 2080.41 (quando presente).
function valorTotalFromObs(obs: string | null | undefined): number | null {
  if (!obs) return null
  let total = 0
  let achou = false
  const re = /(\d+)\s*parcelas?\s*de\s*r\$\s*([\d.,]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(obs)) !== null) {
    const qtd = Number(m[1])
    const val = parseBR(m[2])
    if (Number.isFinite(qtd) && val !== null) {
      total += qtd * val
      achou = true
    }
  }
  return achou ? Math.round(total * 100) / 100 : null
}

function descricaoLimpa(obs: string | null | undefined): string | null {
  if (!obs) return null
  const limpo = obs.replace(/parcela\s*\(?\s*\d+\s*\/\s*\d+\)?\.?/i, "").replace(/\s+/g, " ").trim()
  return limpo || null
}

interface ParcelaDetectada {
  numero: number
  valor: number | null
  competencia: string
  fechamentoId: string
}

interface AcordoAcumulado {
  chave: string
  imobiliariaId: string | null
  empreendimentoId: string
  unidade: string
  inquilino: string | null
  tipo: "acordo" | "rescisao"
  descricao: string | null
  totalParcelas: number
  valorParcelaSamples: number[]
  valorTotalObs: number | null
  primeiraCompetencia: string
  parcelas: Map<number, ParcelaDetectada>
}

export interface SyncAcordosResult {
  acordos: number
  parcelasBaixadas: number
}

// Detecta acordos/rescisoes PARCELADOS nas prestacoes (em acordos_rescisoes_recebidos
// e em inadimplencias_acumuladas) e persiste/atualiza, dando baixa automatica nas
// parcelas recebidas. Idempotente: re-rodar nao desfaz baixas manuais.
export async function syncAcordosFromFechamentos(
  query: { empreendimentoId?: string | null } = {},
): Promise<SyncAcordosResult> {
  const supabase = createSupabaseAdmin()

  let fechQuery = supabase
    .from("fechamentos")
    .select("id, competencia, imobiliaria_id, empreendimento_id, analise_completa")
    .eq("arquivado", false)
    .order("competencia", { ascending: true })
  if (query.empreendimentoId) fechQuery = fechQuery.eq("empreendimento_id", query.empreendimentoId)

  const { data: fechRaw, error } = await fechQuery
  if (error) throw error

  const fechamentos = (fechRaw ?? []) as Array<{
    id: string
    competencia: string
    imobiliaria_id: string | null
    empreendimento_id: string
    analise_completa: PackageAnalysis | null
  }>

  const acumulados = new Map<string, AcordoAcumulado>()

  for (const f of fechamentos) {
    const prestacao = f.analise_completa?.prestacao
    if (!prestacao) continue
    const linhas: Array<{ apto?: string | null; inquilino?: string | null; valor?: number; observacao?: string | null }> = [
      ...(prestacao.acordos_rescisoes_recebidos ?? []).filter((a) => a.tipo === "acordo" || a.tipo === "rescisao" || a.tipo === "atraso"),
      ...(prestacao.inadimplencias_acumuladas ?? []),
    ]
    for (const linha of linhas) {
      const info = parcelaInfo(linha.observacao)
      if (!info) continue
      const unidade = (linha.apto ?? "").trim()
      if (!unidade) continue
      const inquilino = linha.inquilino?.trim() || null
      const chave = `${f.empreendimento_id}|${unidade}|${normTexto(inquilino)}|${info.total}`
      const tipo: "acordo" | "rescisao" = /rescis/i.test(linha.observacao ?? "") ? "rescisao" : "acordo"

      let acc = acumulados.get(chave)
      if (!acc) {
        acc = {
          chave,
          imobiliariaId: f.imobiliaria_id,
          empreendimentoId: f.empreendimento_id,
          unidade,
          inquilino,
          tipo,
          descricao: descricaoLimpa(linha.observacao),
          totalParcelas: info.total,
          valorParcelaSamples: [],
          valorTotalObs: valorTotalFromObs(linha.observacao),
          primeiraCompetencia: f.competencia,
          parcelas: new Map(),
        }
        acumulados.set(chave, acc)
      }
      const valorParcela = numOrNull(linha.valor)
      if (valorParcela !== null) acc.valorParcelaSamples.push(valorParcela)
      if (acc.valorTotalObs === null) acc.valorTotalObs = valorTotalFromObs(linha.observacao)
      if (f.competencia < acc.primeiraCompetencia) acc.primeiraCompetencia = f.competencia
      // a parcela mais recente vence (mesma parcela repetida em meses diferentes e rara)
      acc.parcelas.set(info.numero, {
        numero: info.numero,
        valor: valorParcela,
        competencia: f.competencia,
        fechamentoId: f.id,
      })
    }
  }

  if (acumulados.size === 0) return { acordos: 0, parcelasBaixadas: 0 }

  // valida existencia das tabelas antes de escrever
  const probe = await supabase.from("acordos").select("id").limit(1)
  if (probe.error && isMissingTable(probe.error)) {
    throw new Error("Tabelas de acordos ainda nao existem. Aplique a migration 202606240001_acordos_parcelas.sql.")
  }

  let parcelasBaixadas = 0
  for (const acc of acumulados.values()) {
    const valorParcela = moda(acc.valorParcelaSamples)
    const valorTotal = acc.valorTotalObs ?? (valorParcela !== null ? Math.round(valorParcela * acc.totalParcelas * 100) / 100 : null)

    const { data: acordoRow, error: upErr } = await supabase
      .from("acordos")
      .upsert(
        {
          imobiliaria_id: acc.imobiliariaId,
          empreendimento_id: acc.empreendimentoId,
          unidade: acc.unidade,
          inquilino: acc.inquilino,
          tipo: acc.tipo,
          descricao: acc.descricao,
          valor_total: valorTotal,
          valor_parcela: valorParcela,
          total_parcelas: acc.totalParcelas,
          primeira_competencia: acc.primeiraCompetencia,
          chave: acc.chave,
        },
        { onConflict: "chave" },
      )
      .select("id")
      .single()
    if (upErr) throw upErr
    const acordoId = acordoRow.id as string

    const { data: existentesRaw } = await supabase
      .from("acordo_parcelas")
      .select("id, numero, status")
      .eq("acordo_id", acordoId)
    const existentes = new Map(
      ((existentesRaw ?? []) as Array<{ id: string; numero: number; status: string }>).map((p) => [p.numero, p]),
    )

    for (let numero = 1; numero <= acc.totalParcelas; numero++) {
      const detectada = acc.parcelas.get(numero)
      const existente = existentes.get(numero)
      if (detectada) {
        if (existente) {
          if (existente.status !== "pago") {
            await supabase
              .from("acordo_parcelas")
              .update({
                status: "pago",
                valor: detectada.valor,
                competencia_pagamento: detectada.competencia,
                fechamento_id: detectada.fechamentoId,
                origem: "derivado",
                baixado_em: new Date().toISOString(),
              })
              .eq("id", existente.id)
            parcelasBaixadas += 1
          }
        } else {
          await supabase.from("acordo_parcelas").insert({
            acordo_id: acordoId,
            numero,
            valor: detectada.valor,
            status: "pago",
            competencia_pagamento: detectada.competencia,
            fechamento_id: detectada.fechamentoId,
            origem: "derivado",
            baixado_em: new Date().toISOString(),
          })
          parcelasBaixadas += 1
        }
      } else if (!existente) {
        await supabase.from("acordo_parcelas").insert({
          acordo_id: acordoId,
          numero,
          valor: valorParcela,
          status: "pendente",
          origem: "derivado",
        })
      }
    }

    await atualizarStatusAcordo(supabase, acordoId)
  }

  return { acordos: acumulados.size, parcelasBaixadas }
}

async function atualizarStatusAcordo(supabase: ReturnType<typeof createSupabaseAdmin>, acordoId: string) {
  const { data } = await supabase.from("acordo_parcelas").select("status").eq("acordo_id", acordoId)
  const parcelas = (data ?? []) as Array<{ status: string }>
  const todasPagas = parcelas.length > 0 && parcelas.every((p) => p.status === "pago")
  await supabase.from("acordos").update({ status: todasPagas ? "quitado" : "aberto" }).eq("id", acordoId)
}

function moda(values: number[]): number | null {
  if (values.length === 0) return null
  const cont = new Map<number, number>()
  for (const v of values) cont.set(v, (cont.get(v) ?? 0) + 1)
  let melhor = values[0]
  let max = 0
  for (const [v, c] of cont) {
    if (c > max) {
      max = c
      melhor = v
    }
  }
  return melhor
}

export async function getAcordosByUnidade(query: {
  empreendimentoId: string
  unidade: string
}): Promise<AcordosResponse> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("acordos")
    .select(
      "id, unidade, inquilino, tipo, descricao, valor_total, valor_parcela, total_parcelas, status, primeira_competencia, acordo_parcelas ( id, numero, valor, status, competencia_pagamento, origem )",
    )
    .eq("empreendimento_id", query.empreendimentoId)
    .eq("unidade", query.unidade)
    .order("primeira_competencia", { ascending: false })

  if (error) {
    if (isMissingTable(error)) return { acordos: [], pendenteMigration: true }
    throw error
  }

  const acordos: Acordo[] = ((data ?? []) as RawAcordo[]).map(mapAcordo)
  return { acordos }
}

interface RawParcela {
  id: string
  numero: number
  valor: number | string | null
  status: string
  competencia_pagamento: string | null
  origem: string
}
interface RawAcordo {
  id: string
  unidade: string
  inquilino: string | null
  tipo: string
  descricao: string | null
  valor_total: number | string | null
  valor_parcela: number | string | null
  total_parcelas: number | null
  status: string
  primeira_competencia: string | null
  acordo_parcelas: RawParcela[] | null
}

function mapAcordo(raw: RawAcordo): Acordo {
  const parcelas: AcordoParcela[] = (raw.acordo_parcelas ?? [])
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      valor: numOrNull(p.valor),
      status: p.status === "pago" ? ("pago" as const) : ("pendente" as const),
      competenciaPagamento: p.competencia_pagamento,
      origem: p.origem === "manual" ? ("manual" as const) : ("derivado" as const),
    }))
    .sort((a, b) => a.numero - b.numero)
  const pagas = parcelas.filter((p) => p.status === "pago")
  return {
    id: raw.id,
    unidade: raw.unidade,
    inquilino: raw.inquilino,
    tipo: raw.tipo === "rescisao" ? "rescisao" : "acordo",
    descricao: raw.descricao,
    valorTotal: numOrNull(raw.valor_total),
    valorParcela: numOrNull(raw.valor_parcela),
    totalParcelas: raw.total_parcelas,
    status: raw.status === "quitado" ? "quitado" : raw.status === "cancelado" ? "cancelado" : "aberto",
    primeiraCompetencia: raw.primeira_competencia,
    parcelasPagas: pagas.length,
    valorPago: Math.round(pagas.reduce((acc, p) => acc + num(p.valor), 0) * 100) / 100,
    parcelas,
  }
}

// Baixa manual (ou estorno) de uma parcela.
export async function darBaixaParcela(parcelaId: string, pago: boolean): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { data: parcela, error } = await supabase
    .from("acordo_parcelas")
    .update({
      status: pago ? "pago" : "pendente",
      origem: "manual",
      baixado_em: pago ? new Date().toISOString() : null,
      competencia_pagamento: pago ? undefined : null,
    })
    .eq("id", parcelaId)
    .select("acordo_id")
    .single()
  if (error) throw error
  if (parcela?.acordo_id) await atualizarStatusAcordo(supabase, parcela.acordo_id as string)
}
