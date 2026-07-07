import { createSupabaseAdmin } from "./supabase"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import { formatCompetenciaShort } from "@/lib/format"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type {
  HeatRow,
  IndicadoresData,
  OfensorReceita,
  RealizacaoImovel,
  RegistroPagamento,
  SerieMensalPonto,
} from "@/lib/indicadores-types"

export interface IndicadoresQuery {
  competencia?: string | null
  empresaId?: string | null
  empreendimentoId?: string | null
  imovel?: string | null
}

// Tetos fixos da escala do mapa de calor: a mesma % pinta sempre a mesma cor.
const INAD_ESCALA_MAX = 15
const VAC_ESCALA_MAX = 22

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : 0
}

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : null
}

/** Joins do Supabase podem vir como objeto ou array; normaliza para o nome. */
const relNome = (rel: unknown): string => {
  if (!rel) return ""
  const obj = Array.isArray(rel) ? rel[0] : rel
  return (obj as { nome?: string } | undefined)?.nome ?? ""
}

interface FechamentoRow {
  id: string
  competencia: string
  total_receitas: number | string | null
  total_despesas: number | string | null
  total_comissoes: number | string | null
  total_repassar: number | string | null
  empreendimento_id: string
  empreendimentos: unknown
  analise_completa: PackageAnalysis | null
}

interface ImovelRow {
  id: string
  unidade: string
  inquilino_nome: string | null
  status: string
  valor_aluguel_esperado: number | string | null
  empreendimento_id: string
  empreendimentos: unknown
}

interface RegraRow {
  empreendimento_id: string
  taxa_administracao_percent: number | string | null
  taxa_intermediacao_percent: number | string | null
}

export async function getIndicadores(query: IndicadoresQuery = {}): Promise<IndicadoresData> {
  const supabase = createSupabaseAdmin()

  const [
    { data: fechRaw, error: fechErr },
    { data: imovRaw, error: imovErr },
    { data: regrasRaw },
    { data: contasRaw },
  ] = await Promise.all([
    supabase
      .from("fechamentos")
      .select(
        `id, competencia, total_receitas, total_despesas, total_comissoes, total_repassar,
           empreendimento_id, empreendimentos ( nome, egestor_conta_id ), analise_completa`,
      )
      .eq("arquivado", false)
      .order("competencia", { ascending: true }),
    supabase
      .from("imoveis")
      .select(
        `id, unidade, inquilino_nome, status, valor_aluguel_esperado,
           empreendimento_id, empreendimentos ( nome, egestor_conta_id )`,
      )
      .eq("ativo", true),
    supabase
      .from("regras_comerciais")
      .select("empreendimento_id, taxa_administracao_percent, taxa_intermediacao_percent")
      .eq("ativo", true),
    supabase.from("egestor_contas").select("id, nome, tag_padrao"),
  ])

  if (fechErr) throw fechErr
  if (imovErr) throw imovErr

  // "Empresa" = etiqueta da conta eGestor do empreendimento (ex.: ACR Global, MMC).
  // Fallback "ACR" quando o empreendimento não tem conta vinculada.
  const contaTag = new Map<string, string>()
  const contaNome = new Map<string, string>()
  for (const c of (contasRaw ?? []) as Array<{ id: string; nome: string | null; tag_padrao: string | null }>) {
    contaTag.set(c.id, (c.tag_padrao || "ACR").trim())
    if (c.tag_padrao) contaNome.set(c.tag_padrao.trim(), c.nome || c.tag_padrao.trim())
  }
  const relContaId = (rel: unknown): string | null => {
    const obj = Array.isArray(rel) ? rel[0] : rel
    return (obj as { egestor_conta_id?: string | null } | undefined)?.egestor_conta_id ?? null
  }
  const empresaTag = (rel: unknown): string => {
    const contaId = relContaId(rel)
    return (contaId && contaTag.get(contaId)) || "ACR"
  }

  const empresaFiltro = query.empresaId || null
  const empFiltro = query.empreendimentoId || null
  const imovelFiltro = query.imovel || null

  const fechamentos = ((fechRaw ?? []) as FechamentoRow[]).filter(
    (f) => (!empresaFiltro || empresaTag(f.empreendimentos) === empresaFiltro) && (!empFiltro || f.empreendimento_id === empFiltro),
  )
  const imoveis = ((imovRaw ?? []) as ImovelRow[]).filter(
    (i) => (!empresaFiltro || empresaTag(i.empreendimentos) === empresaFiltro) && (!empFiltro || i.empreendimento_id === empFiltro),
  )
  const regras = (regrasRaw ?? []) as RegraRow[]

  // --- Competências disponíveis e referência ---
  const competenciasSet = Array.from(new Set(fechamentos.map((f) => f.competencia))).sort()
  const competencia =
    (query.competencia && competenciasSet.includes(query.competencia) ? query.competencia : null) ??
    competenciasSet[competenciasSet.length - 1] ??
    null

  const competenciasDisponiveis = competenciasSet
    .slice()
    .reverse()
    .map((value) => ({ value, label: formatCompetenciaLong(value) }))

  // --- Opções de filtro ---
  const empreendimentosMap = new Map<string, string>()
  for (const f of (fechRaw ?? []) as FechamentoRow[]) {
    if (f.empreendimento_id) empreendimentosMap.set(f.empreendimento_id, relNome(f.empreendimentos))
  }
  for (const i of (imovRaw ?? []) as ImovelRow[]) {
    if (i.empreendimento_id && !empreendimentosMap.has(i.empreendimento_id)) {
      empreendimentosMap.set(i.empreendimento_id, relNome(i.empreendimentos))
    }
  }
  const empreendimentosOpts = Array.from(empreendimentosMap.entries())
    .map(([id, label]) => ({ id, label: label || "Empreendimento" }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Empresas para o filtro = etiquetas das contas eGestor (ex.: ACR, MMC).
  // "ACR" sempre existe (fallback de empreendimentos sem conta vinculada).
  const tagsUniverso = new Set<string>(["ACR"])
  for (const c of (contasRaw ?? []) as Array<{ tag_padrao: string | null }>) {
    if (c.tag_padrao) tagsUniverso.add(c.tag_padrao.trim())
  }
  const empresasOpts = Array.from(tagsUniverso)
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => ({ id: tag, label: tag === "ACR" ? "ACR (Global)" : contaNome.get(tag) ?? tag }))

  const imoveisOpts = imoveis
    .map((i) => ({ id: i.unidade, label: `${i.unidade}${i.inquilino_nome ? ` · ${i.inquilino_nome}` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // --- Fechamentos da competência de referência ---
  const fechMes = competencia ? fechamentos.filter((f) => f.competencia === competencia) : []

  // KPIs financeiros (colunas planas + PackageTotals do analise_completa)
  let receita = 0
  let despesaTotalColuna = 0
  let totalRepassar = 0
  let taxaTotal = 0
  let totalAgua = 0
  let totalIptu = 0
  let totalSeguro = 0
  let inadimplenciaValor = 0
  let descontos = 0
  let acordosCount = 0
  let acordosValor = 0
  let rescisoesCount = 0
  let rescisoesValor = 0
  let reajustesCount = 0
  let temReajusteData = false

  for (const f of fechMes) {
    receita += num(f.total_receitas)
    despesaTotalColuna += num(f.total_despesas)
    totalRepassar += num(f.total_repassar)
    taxaTotal += num(f.total_comissoes)

    const a = f.analise_completa
    if (a?.totals) {
      totalAgua += num(a.totals.total_agua)
      totalIptu += num(a.totals.total_iptu)
      totalSeguro += num(a.totals.total_seguro_incendio)
    }
    const prestacao = a?.prestacao
    if (prestacao) {
      for (const inad of prestacao.inadimplencias_acumuladas ?? []) inadimplenciaValor += num(inad.valor)
      for (const row of prestacao.receitas_por_imovel ?? []) descontos += num(row.desconto)
      for (const mov of prestacao.acordos_rescisoes_recebidos ?? []) {
        if (mov.tipo === "acordo") {
          acordosCount += 1
          acordosValor += num(mov.valor)
        } else if (mov.tipo === "rescisao") {
          rescisoesCount += 1
          rescisoesValor += num(mov.valor)
        }
      }
    }
    if (a?.reajuste) {
      temReajusteData = true
      reajustesCount += (a.reajuste.itens ?? []).length
    }
  }

  // Despesa operacional = água + IPTU + seguro (decisão de produto).
  // Fallback para a coluna total_despesas se o analise_completa não trouxe a quebra.
  const despesaOperacional = totalAgua + totalIptu + totalSeguro || despesaTotalColuna

  // --- Ocupação / vacância (estado atual do cadastro) ---
  const ocupados = imoveis.filter((i) => i.status === "ocupado").length
  const inadimplentes = imoveis.filter((i) => i.status === "inadimplente").length
  const vagos = imoveis.filter((i) => i.status === "vago").length
  const baseOcupacao = ocupados + inadimplentes + vagos
  const ocupacaoPct = baseOcupacao > 0 ? ((ocupados + inadimplentes) / baseOcupacao) * 100 : 0
  const vacanciaValor = imoveis
    .filter((i) => i.status === "vago")
    .reduce((acc, i) => acc + num(i.valor_aluguel_esperado), 0)
  const faturamentoPotencial = imoveis.reduce((acc, i) => acc + num(i.valor_aluguel_esperado), 0)

  // --- Taxas (regras comerciais; média ponderada simples dos empreendimentos do mês) ---
  const empMes = new Set(fechMes.map((f) => f.empreendimento_id))
  const regrasMes = regras.filter((r) => empMes.size === 0 || empMes.has(r.empreendimento_id))
  const avg = (arr: (number | null)[]) => {
    const v = arr.filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const administracaoPct = avg(regrasMes.map((r) => numOrNull(r.taxa_administracao_percent)))
  const intermediacaoPct = avg(regrasMes.map((r) => numOrNull(r.taxa_intermediacao_percent)))

  const despesaOperacionalPct = receita > 0 ? (despesaOperacional / receita) * 100 : 0

  // --- Cascata: potencial -> ofensores -> realizado ---
  // Potencial reconstruído (sempre reconcilia): recebido + vacância + descontos.
  // A inadimplência aqui é ACUMULADA (insight à parte), não um ofensor do mês.
  const realizado = receita
  // Com fechamentos: potencial reconstruído (recebido + vacância + descontos).
  // Sem fechamentos: cai para o potencial contratado (soma dos aluguéis esperados
  // do cadastro), senão o card "Faturamento potencial" mostraria só a vacância.
  const potencialCascata =
    fechMes.length > 0 ? realizado + vacanciaValor + descontos : faturamentoPotencial
  const pctOf = (v: number) => (potencialCascata > 0 ? (v / potencialCascata) * 100 : 0)
  // Vacância só é "sem dados" quando não há cadastro de imóveis; valor 0 com cadastro
  // significa carteira sem vagos (zero real), não pendência.
  const ofensores: OfensorReceita[] = [
    { key: "vacancia", label: "Vacância", valor: vacanciaValor, pct: pctOf(vacanciaValor), pending: baseOcupacao === 0 },
    { key: "descontos", label: "Descontos", valor: descontos, pct: pctOf(descontos) },
  ]
  const realizadoPct = potencialCascata > 0 ? (realizado / potencialCascata) * 100 : 0

  // --- Série mensal (faturamento realizado por competência) ---
  const serieMap = new Map<string, number>()
  for (const f of fechamentos) {
    serieMap.set(f.competencia, (serieMap.get(f.competencia) ?? 0) + num(f.total_receitas))
  }
  const serieMensal: SerieMensalPonto[] = Array.from(serieMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([comp, rec]) => ({
      competencia: comp,
      label: formatCompetenciaShort(comp),
      receita: rec,
      ocupacaoPct: comp === competencia ? ocupacaoPct : null,
    }))

  // --- Ranking de realização por imóvel (competência de referência) ---
  const esperadoPorUnidade = new Map<string, number>()
  for (const i of imoveis) esperadoPorUnidade.set(i.unidade, num(i.valor_aluguel_esperado))
  const rankingMap = new Map<string, RealizacaoImovel>()
  for (const f of fechMes) {
    const empNome = relNome(f.empreendimentos)
    for (const row of f.analise_completa?.prestacao?.receitas_por_imovel ?? []) {
      if (imovelFiltro && row.apto !== imovelFiltro) continue
      // Ignora linhas vazias (sem apto e sem valor) que aparecem em alguns layouts.
      if (!row.apto?.trim() && num(row.total) === 0) continue
      const esperadoCadastro = esperadoPorUnidade.get(row.apto)
      const esperado = esperadoCadastro || num(row.aluguel) || num(row.total)
      const realizadoRow = num(row.aluguel_com_desconto) || num(row.total)
      const key = `${empNome}|${row.apto}`
      rankingMap.set(key, {
        apto: row.apto,
        inquilino: row.inquilino,
        empreendimento: empNome,
        esperado,
        realizado: realizadoRow,
        pct: esperado > 0 ? (realizadoRow / esperado) * 100 : 0,
      })
    }
  }
  const ranking = Array.from(rankingMap.values()).sort((a, b) => b.pct - a.pct)

  // --- Heatmap (inadimplência % e vacância %, por empreendimento e por apartamento) ---
  const heatMeses = competenciasSet.slice(-12)
  const heatMesesLabels = heatMeses.map((value) => ({ value, label: formatCompetenciaShort(value) }))

  // Por empreendimento: emp -> competencia -> { inad, receita }
  const heatAgg = new Map<string, Map<string, { inad: number; receita: number }>>()
  // Por apartamento: "emp||apto" -> competencia -> { inad, receita, vago }
  const aptoAgg = new Map<string, Map<string, { inad: number; receita: number; vago: boolean }>>()
  const aptoLabel = new Map<string, string>()

  for (const f of fechamentos) {
    const empNome = relNome(f.empreendimentos) || "Empreendimento"
    const prest = f.analise_completa?.prestacao

    if (!heatAgg.has(empNome)) heatAgg.set(empNome, new Map())
    const byMes = heatAgg.get(empNome)!
    const cell = byMes.get(f.competencia) ?? { inad: 0, receita: 0 }
    cell.receita += num(f.total_receitas)
    for (const inad of prest?.inadimplencias_acumuladas ?? []) cell.inad += num(inad.valor)
    byMes.set(f.competencia, cell)

    if (!prest) continue
    const touchApto = (apto: string, label: string) => {
      const key = `${empNome}||${apto}`
      if (!aptoAgg.has(key)) aptoAgg.set(key, new Map())
      if (!aptoLabel.has(key) || label) aptoLabel.set(key, label || aptoLabel.get(key) || apto)
      const m = aptoAgg.get(key)!
      const c = m.get(f.competencia) ?? { inad: 0, receita: 0, vago: false }
      m.set(f.competencia, c)
      return c
    }
    for (const row of prest.receitas_por_imovel ?? []) {
      const apto = (row.apto ?? "").trim()
      if (!apto || (imovelFiltro && apto !== imovelFiltro)) continue
      const c = touchApto(apto, `${apto}${row.inquilino ? ` · ${row.inquilino}` : ""}`)
      c.receita += num(row.total)
      if (num(row.total) <= 0 && num(row.aluguel) <= 0) c.vago = true
    }
    for (const inad of prest.inadimplencias_acumuladas ?? []) {
      const apto = (inad.apto ?? "").trim()
      if (!apto || (imovelFiltro && apto !== imovelFiltro)) continue
      const c = touchApto(apto, `${apto}${inad.inquilino ? ` · ${inad.inquilino}` : ""}`)
      c.inad += num(inad.valor)
    }
  }

  const empNomesHeat = Array.from(heatAgg.keys()).sort((a, b) => a.localeCompare(b))
  const inadRows: HeatRow[] = empNomesHeat.map((emp) => {
    const byMes = heatAgg.get(emp)!
    const valores = heatMeses.map((m) => {
      const cell = byMes.get(m)
      if (!cell || cell.receita <= 0) return null
      return (cell.inad / cell.receita) * 100
    })
    return { empreendimento: emp, valores, media: avg(valores) }
  })

  // Vacância por empreendimento: estado atual do cadastro -> só a coluna do mês de referência
  const vacPorEmp = new Map<string, { vagos: number; base: number }>()
  for (const i of imoveis) {
    const empNome = relNome(i.empreendimentos) || "Empreendimento"
    const agg = vacPorEmp.get(empNome) ?? { vagos: 0, base: 0 }
    if (["ocupado", "inadimplente", "vago"].includes(i.status)) agg.base += 1
    if (i.status === "vago") agg.vagos += 1
    vacPorEmp.set(empNome, agg)
  }
  const vacRows: HeatRow[] = empNomesHeat.map((emp) => {
    const valores = heatMeses.map((m) => {
      if (m !== competencia) return null
      const agg = vacPorEmp.get(emp)
      if (!agg || agg.base <= 0) return null
      return (agg.vagos / agg.base) * 100
    })
    return { empreendimento: emp, valores, media: avg(valores) }
  })

  // Por apartamento
  const aptoKeys = Array.from(aptoAgg.keys()).sort((a, b) =>
    (aptoLabel.get(a) ?? a).localeCompare(aptoLabel.get(b) ?? b),
  )
  const inadAptoRows: HeatRow[] = aptoKeys.map((key) => {
    const m = aptoAgg.get(key)!
    const valores = heatMeses.map((mes) => {
      const c = m.get(mes)
      if (!c) return null
      if (c.receita > 0) return (c.inad / c.receita) * 100
      return c.inad > 0 ? 100 : null
    })
    return { empreendimento: aptoLabel.get(key) ?? key, valores, media: avg(valores) }
  })
  const vacAptoRows: HeatRow[] = aptoKeys.map((key) => {
    const m = aptoAgg.get(key)!
    const valores = heatMeses.map((mes) => {
      const c = m.get(mes)
      if (!c) return null
      return c.vago ? 100 : 0
    })
    return { empreendimento: aptoLabel.get(key) ?? key, valores, media: avg(valores) }
  })

  const colAvg = (rows: HeatRow[], j: number): number | null => avg(rows.map((r) => r.valores[j]))
  const inadMediaCarteira = heatMeses.map((_, j) => colAvg(inadRows, j))
  const vacMediaCarteira = heatMeses.map((_, j) => colAvg(vacRows, j))
  const inadAptoMediaCarteira = heatMeses.map((_, j) => colAvg(inadAptoRows, j))
  const vacAptoMediaCarteira = heatMeses.map((_, j) => colAvg(vacAptoRows, j))
  // Escala com teto fixo: a mesma % pinta sempre a mesma cor.
  const inadMax = INAD_ESCALA_MAX
  const vacMax = VAC_ESCALA_MAX

  // --- Registro de pagamentos por apto/inquilino (todas as competências) ---
  const registro: RegistroPagamento[] = []
  for (const f of fechamentos) {
    const empNome = relNome(f.empreendimentos)
    for (const row of f.analise_completa?.prestacao?.receitas_por_imovel ?? []) {
      if (imovelFiltro && row.apto !== imovelFiltro) continue
      if (!row.apto?.trim() && num(row.total) === 0) continue
      registro.push({
        competencia: f.competencia,
        competenciaLabel: formatCompetenciaShort(f.competencia),
        empreendimento: empNome,
        apto: row.apto,
        inquilino: row.inquilino,
        aluguel: numOrNull(row.aluguel),
        desconto: numOrNull(row.desconto),
        total: num(row.total),
        repasse: numOrNull(row.repasse),
        vencimento: row.vencimento,
      })
    }
  }
  registro.sort(
    (a, b) => b.competencia.localeCompare(a.competencia) || a.apto.localeCompare(b.apto),
  )

  // --- Pendências (dados que ainda não temos para alguns widgets) ---
  const pendencias: string[] = []
  if (baseOcupacao === 0)
    pendencias.push("Nenhum imóvel cadastrado — ocupação, vacância e faturamento potencial ficam zerados até o cadastro.")
  if (!temReajusteData) pendencias.push("Relatório de reajustes não processado nesta competência.")
  if (competenciasSet.length < 2) pendencias.push("Histórico mensal incompleto — preenche conforme novos fechamentos.")

  return {
    competencia: competencia ?? "",
    competenciaLabel: competencia ? formatCompetenciaLong(competencia) : "Sem fechamentos",
    competenciasDisponiveis,
    empresas: empresasOpts,
    empreendimentos: empreendimentosOpts,
    imoveis: imoveisOpts,
    filtros: { empresaId: empresaFiltro, empreendimentoId: empFiltro, imovel: imovelFiltro },
    ocupacao: {
      pct: ocupacaoPct,
      ocupados: ocupados + inadimplentes,
      vagos,
      total: baseOcupacao,
      vacanciaValor,
    },
    receita,
    despesaOperacional,
    totalRepassar,
    taxaTotal,
    movimentacoes: {
      acordos: { count: acordosCount, valor: acordosValor },
      rescisoes: { count: rescisoesCount, valor: rescisoesValor },
      reajustes: { count: reajustesCount, pending: !temReajusteData },
      descontos,
      despesaPorCategoria: { agua: totalAgua, iptu: totalIptu, seguro: totalSeguro },
    },
    percentuais: {
      administracaoPct,
      intermediacaoPct,
      ocupacaoPct,
      despesaOperacionalPct,
    },
    despesas: {
      operacional: despesaOperacional,
      venda: null,
      vendaPct: intermediacaoPct,
    },
    cascata: {
      potencial: potencialCascata,
      potencialContratado: faturamentoPotencial,
      inadimplenciaAcumulada: inadimplenciaValor,
      realizado,
      realizadoPct,
      ofensores,
    },
    serieMensal,
    ranking,
    heat: {
      meses: heatMesesLabels,
      inad: inadRows,
      vac: vacRows,
      inadApto: inadAptoRows,
      vacApto: vacAptoRows,
      inadMax,
      vacMax,
      inadMediaCarteira,
      vacMediaCarteira,
      inadAptoMediaCarteira,
      vacAptoMediaCarteira,
    },
    registro,
    pendencias,
  }
}
