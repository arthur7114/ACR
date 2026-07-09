import { createSupabaseAdmin } from "@/lib/server/supabase"
import {
  calcularStatusParcela,
  detectarConflitos,
  gerarParcelasImovel,
  hojeLocalISO,
  planejarAjusteParcelas,
  validarBaixa,
  validarEdicaoParcela,
} from "@/lib/iptu-logic"
import type {
  BaixarIptuParcelasPayload,
  GerarIptuPayload,
  IptuFiltros,
  IptuListaResponse,
  IptuParcelaListItem,
  IptuParcelaPatch,
  IptuResumo,
} from "@/lib/iptu-types"

type Supabase = ReturnType<typeof createSupabaseAdmin>

const PARCELA_SELECT = `
  id,
  carne_id,
  numero,
  data_vencimento,
  valor_previsto,
  valor_pago,
  data_baixa,
  observacoes,
  responsavel,
  ano_referencia,
  origem,
  imovel_id,
  unidade,
  inquilino_nome,
  imobiliaria_id,
  empreendimento_id,
  imobiliaria_nome,
  empreendimento_nome
`

interface ParcelaRawRow {
  id: string
  carne_id: string
  numero: number
  data_vencimento: string | null
  valor_previsto: number | string | null
  valor_pago: number | string | null
  data_baixa: string | null
  observacoes: string | null
  responsavel: "inquilino" | "proprietario" | null
  ano_referencia: number
  origem: "manual" | "importacao"
  imovel_id: string
  unidade: string
  inquilino_nome: string | null
  imobiliaria_id: string | null
  empreendimento_id: string | null
  imobiliaria_nome: string | null
  empreendimento_nome: string | null
}

function num(value: number | string | null): number {
  if (value === null) return 0
  return typeof value === "string" ? Number(value) : value
}

function mapParcela(row: ParcelaRawRow, hoje: string): IptuParcelaListItem {
  const status = calcularStatusParcela(
    { dataBaixa: row.data_baixa, dataVencimento: row.data_vencimento },
    hoje,
  )
  return {
    id: row.id,
    carneId: row.carne_id,
    imovelId: row.imovel_id,
    ano: row.ano_referencia,
    numeroParcela: row.numero,
    dataVencimento: row.data_vencimento,
    valorPrevisto: num(row.valor_previsto),
    valorPago: row.valor_pago === null ? null : num(row.valor_pago),
    dataBaixa: row.data_baixa,
    observacoes: row.observacoes,
    responsavel: row.responsavel,
    origem: row.origem,
    status,
    unidade: row.unidade,
    inquilinoNome: row.inquilino_nome,
    imobiliariaId: row.imobiliaria_id,
    imobiliariaNome: row.imobiliaria_nome,
    empreendimentoId: row.empreendimento_id,
    empreendimentoNome: row.empreendimento_nome,
  }
}

// Aplica filtros comuns a listagem e ao resumo. Retorna a query encadeada.
function aplicarFiltros<Q extends {
  eq: (col: string, value: unknown) => Q
  gte: (col: string, value: unknown) => Q
  lte: (col: string, value: unknown) => Q
  lt: (col: string, value: unknown) => Q
  is: (col: string, value: unknown) => Q
  not: (col: string, op: string, value: unknown) => Q
  or: (filters: string) => Q
}>(query: Q, filtros: IptuFiltros, hoje: string): Q {
  if (filtros.ano) query = query.eq("ano_referencia", filtros.ano)
  if (filtros.imovelId) query = query.eq("imovel_id", filtros.imovelId)
  if (filtros.imobiliariaId) query = query.eq("imobiliaria_id", filtros.imobiliariaId)
  if (filtros.empreendimentoId) query = query.eq("empreendimento_id", filtros.empreendimentoId)
  if (filtros.vencimentoInicio) query = query.gte("data_vencimento", filtros.vencimentoInicio)
  if (filtros.vencimentoFim) query = query.lte("data_vencimento", filtros.vencimentoFim)
  if (filtros.mesVencimento && /^\d{4}-\d{2}$/.test(filtros.mesVencimento)) {
    const [ano, mes] = filtros.mesVencimento.split("-").map(Number)
    const inicio = `${filtros.mesVencimento}-01`
    const proximo =
      mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`
    query = query.gte("data_vencimento", inicio).lt("data_vencimento", proximo)
  }
  if (filtros.status === "pago") {
    query = query.not("data_baixa", "is", null)
  } else if (filtros.status === "vencido") {
    query = query.is("data_baixa", null).lt("data_vencimento", hoje)
  } else if (filtros.status === "aberto") {
    query = query.is("data_baixa", null).or(`data_vencimento.gte.${hoje},data_vencimento.is.null`)
  }
  return query
}

export interface ListarParcelasOpts {
  page: number
  pageSize: number
  sort?: string
}

export async function listarParcelas(
  filtros: IptuFiltros,
  opts: ListarParcelasOpts,
): Promise<IptuListaResponse> {
  const supabase = createSupabaseAdmin()
  const hoje = hojeLocalISO()
  const page = Math.max(1, opts.page)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const ascending = opts.sort !== "-vencimento" && opts.sort !== "-valor"
  const orderColumn = opts.sort === "valor" || opts.sort === "-valor" ? "valor_previsto" : "data_vencimento"

  let listQuery = supabase
    .from("iptu_parcelas_detalhe")
    .select(PARCELA_SELECT, { count: "exact" })
    .order(orderColumn, { ascending, nullsFirst: false })
    .order("numero", { ascending: true })
    .range(from, to)
  listQuery = aplicarFiltros(listQuery, filtros, hoje)

  const { data, error, count } = await listQuery
  if (error) throw error

  const parcelas = ((data ?? []) as unknown as ParcelaRawRow[]).map((row) => mapParcela(row, hoje))

  // Resumo sobre o conjunto filtrado inteiro (sem paginacao).
  let resumoQuery = supabase
    .from("iptu_parcelas_detalhe")
    .select("data_vencimento, valor_previsto, valor_pago, data_baixa")
  resumoQuery = aplicarFiltros(resumoQuery, filtros, hoje)
  const { data: resumoData, error: resumoError } = await resumoQuery
  if (resumoError) throw resumoError

  const resumo = calcularResumo(
    (resumoData ?? []) as Array<{
      data_vencimento: string | null
      valor_previsto: number | string | null
      valor_pago: number | string | null
      data_baixa: string | null
    }>,
    hoje,
  )

  const total = count ?? 0
  return {
    parcelas,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    resumo,
  }
}

function calcularResumo(
  rows: Array<{
    data_vencimento: string | null
    valor_previsto: number | string | null
    valor_pago: number | string | null
    data_baixa: string | null
  }>,
  hoje: string,
): IptuResumo {
  let totalAberto = 0
  let totalVencido = 0
  let totalPago = 0
  let quantidadeVencidas = 0
  let proximoVencimento: string | null = null

  for (const row of rows) {
    const status = calcularStatusParcela(
      { dataBaixa: row.data_baixa, dataVencimento: row.data_vencimento },
      hoje,
    )
    if (status === "pago") {
      totalPago += num(row.valor_pago)
    } else if (status === "vencido") {
      totalVencido += num(row.valor_previsto)
      quantidadeVencidas += 1
    } else {
      totalAberto += num(row.valor_previsto)
      if (row.data_vencimento && (!proximoVencimento || row.data_vencimento < proximoVencimento)) {
        proximoVencimento = row.data_vencimento
      }
    }
  }

  return { totalAberto, totalVencido, totalPago, quantidadeVencidas, proximoVencimento }
}

export interface GerarParcelasResultado {
  conflito: boolean
  conflitos: string[]
  carnesCriados: number
  parcelasCriadas: number
  imoveisPulados: string[]
}

export async function gerarParcelasLote(payload: GerarIptuPayload): Promise<GerarParcelasResultado> {
  const supabase = createSupabaseAdmin()

  // Valida existencia dos imoveis selecionados.
  const { data: imoveisData, error: imoveisError } = await supabase
    .from("imoveis")
    .select("id")
    .in("id", payload.imovelIds)
  if (imoveisError) throw imoveisError
  const existentes = new Set((imoveisData ?? []).map((i) => i.id as string))
  const inexistentes = payload.imovelIds.filter((id) => !existentes.has(id))
  if (inexistentes.length > 0) {
    throw new Error(`Imoveis nao encontrados: ${inexistentes.join(", ")}`)
  }

  // Detecta conflitos (carne ja existente para imovel+ano).
  const { data: carnesData, error: carnesError } = await supabase
    .from("iptu_carnes")
    .select("imovel_id, ano_referencia")
    .in("imovel_id", payload.imovelIds)
    .eq("ano_referencia", payload.ano)
  if (carnesError) throw carnesError

  const conflitos = detectarConflitos(carnesData ?? [], payload.imovelIds, payload.ano)
  if (conflitos.length > 0 && !payload.confirmarConflitos) {
    return { conflito: true, conflitos, carnesCriados: 0, parcelasCriadas: 0, imoveisPulados: [] }
  }

  const conflitoSet = new Set(conflitos)
  const imoveisParaGerar = payload.imovelIds.filter((id) => !conflitoSet.has(id))

  if (imoveisParaGerar.length === 0) {
    return {
      conflito: false,
      conflitos,
      carnesCriados: 0,
      parcelasCriadas: 0,
      imoveisPulados: conflitos,
    }
  }

  const carnesPayload = imoveisParaGerar.map((imovelId) => ({
    imovel_id: imovelId,
    ano: payload.ano,
    numero_parcelas: payload.numeroParcelas,
    origem: "manual",
    observacoes: payload.observacoes ?? null,
    parcelas: gerarParcelasImovel({
      numeroParcelas: payload.numeroParcelas,
      vencimentos: payload.vencimentos,
      valorPadrao: payload.valorPadrao ?? 0,
      observacoes: null,
      responsavel: payload.responsavel ?? null,
    }),
  }))

  const { data: rpcData, error: rpcError } = await supabase.rpc("iptu_gerar_lote", {
    p_carnes: carnesPayload,
  })
  if (rpcError) throw rpcError

  const resultado = (rpcData ?? {}) as { carnes_criados?: number; parcelas_criadas?: number }
  return {
    conflito: false,
    conflitos,
    carnesCriados: resultado.carnes_criados ?? 0,
    parcelasCriadas: resultado.parcelas_criadas ?? 0,
    imoveisPulados: conflitos,
  }
}

export async function editarParcela(
  id: string,
  patch: IptuParcelaPatch,
  supabase: Supabase = createSupabaseAdmin(),
): Promise<IptuParcelaListItem> {
  const { data: atual, error: buscaError } = await supabase
    .from("iptu_parcelas")
    .select("id, data_baixa")
    .eq("id", id)
    .single()
  if (buscaError) throw buscaError

  const paga = atual.data_baixa != null
  if (paga && (patch.dataVencimento !== undefined || patch.valorPrevisto !== undefined)) {
    throw new Error("Parcela paga: vencimento e valor previsto nao podem ser alterados.")
  }

  validarEdicaoParcela({ dataVencimento: patch.dataVencimento, valorPrevisto: patch.valorPrevisto })

  const changes: Record<string, unknown> = {}
  if (patch.dataVencimento !== undefined) changes.data_vencimento = patch.dataVencimento
  if (patch.valorPrevisto !== undefined) changes.valor_previsto = patch.valorPrevisto
  if (patch.observacoes !== undefined) changes.observacoes = patch.observacoes
  if (patch.responsavel !== undefined) changes.responsavel = patch.responsavel

  const { error: updateError } = await supabase.from("iptu_parcelas").update(changes).eq("id", id)
  if (updateError) throw updateError

  const { data, error } = await supabase
    .from("iptu_parcelas_detalhe")
    .select(PARCELA_SELECT)
    .eq("id", id)
    .single()
  if (error) throw error
  return mapParcela(data as unknown as ParcelaRawRow, hojeLocalISO())
}

export interface BaixaResultado {
  parcelasBaixadas: number
  totalPrevisto: number
  totalPago: number
  imoveisAfetados: number
}

export async function baixarParcelas(payload: BaixarIptuParcelasPayload): Promise<BaixaResultado> {
  const supabase = createSupabaseAdmin()

  const { data: alvos, error: alvosError } = await supabase
    .from("iptu_parcelas")
    .select("id, valor_previsto, data_baixa, iptu_carnes!inner ( imovel_id )")
    .in("id", payload.parcelaIds)
  if (alvosError) throw alvosError

  const encontrados = (alvos ?? []) as unknown as Array<{
    id: string
    valor_previsto: number | string | null
    data_baixa: string | null
    iptu_carnes: { imovel_id: string }
  }>

  if (encontrados.length !== payload.parcelaIds.length) {
    throw new Error("Uma ou mais parcelas nao foram encontradas.")
  }
  const jaPagas = encontrados.filter((p) => p.data_baixa != null)
  if (jaPagas.length > 0) {
    throw new Error("Uma ou mais parcelas ja estao pagas e nao podem ser baixadas novamente.")
  }

  let totalPrevisto = 0
  let totalPago = 0
  const imoveis = new Set<string>()
  const updates = encontrados.map((p) => {
    const previsto = num(p.valor_previsto)
    const valorPago = payload.valoresPagos?.[p.id] ?? previsto
    validarBaixa({ dataBaixa: payload.dataBaixa, valorPago })
    totalPrevisto += previsto
    totalPago += valorPago
    imoveis.add(p.iptu_carnes.imovel_id)
    return { id: p.id, valor_pago: valorPago }
  })

  const { error: rpcError } = await supabase.rpc("iptu_baixar_parcelas", {
    p_updates: updates,
    p_data_baixa: payload.dataBaixa,
    p_observacoes: payload.observacoes ?? null,
  })
  if (rpcError) throw rpcError

  return {
    parcelasBaixadas: updates.length,
    totalPrevisto,
    totalPago,
    imoveisAfetados: imoveis.size,
  }
}

export async function ajustarNumeroParcelas(
  carneId: string,
  numeroParcelas: number,
): Promise<{ id: string; numero_parcelas: number }> {
  const supabase = createSupabaseAdmin()

  const { data: parcelas, error: parcelasError } = await supabase
    .from("iptu_parcelas")
    .select("id, numero, pago, data_baixa")
    .eq("carne_id", carneId)
  if (parcelasError) throw parcelasError

  const plano = planejarAjusteParcelas(
    (parcelas ?? []).map((p) => ({
      id: p.id as string,
      numero: p.numero as number,
      pago: p.pago as boolean,
      dataBaixa: (p.data_baixa as string | null) ?? null,
    })),
    numeroParcelas,
  )

  const { data: carne, error: carneError } = await supabase
    .from("iptu_carnes")
    .update({ numero_parcelas: numeroParcelas })
    .eq("id", carneId)
    .select("id, numero_parcelas")
    .single()
  if (carneError) throw carneError

  if (plano.criar.length > 0) {
    const { error } = await supabase.from("iptu_parcelas").insert(
      plano.criar.map((numero) => ({
        carne_id: carneId,
        numero,
        valor_previsto: 0,
        pago: false,
      })),
    )
    if (error) throw error
  }

  if (plano.remover.length > 0) {
    const { error } = await supabase.from("iptu_parcelas").delete().in("id", plano.remover)
    if (error) throw error
  }

  return carne
}
