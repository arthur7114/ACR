import { z } from "zod"
import {
  aggregateIndicadores,
  type IndicadoresAnalysisInput,
  type IndicadoresClosingInput,
  type IndicadoresPairInput,
  type IndicadoresPropertyInput,
  type IndicadoresRuleInput,
  type IndicadoresSnapshotInput,
  type IndicadoresVigencyInput,
} from "@/lib/indicadores-aggregation"
import {
  normalizePropertyKeyPart,
  roundMoney,
  type OccupancyStatus,
} from "@/lib/indicadores-domain"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import {
  IndicadoresQueryValidationError,
  type IndicadoresQuery,
} from "@/lib/indicadores-query"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { INDICADORES_SNAPSHOT_CALCULATION_VERSION } from "./indicadores-snapshots"
import { createSupabaseAdmin } from "./supabase"

const relationSchema = z
  .union([
    z.object({
      nome: z.string(),
      egestor_conta_id: z.string().nullable().optional(),
      ativo: z.boolean().optional(),
    }),
    z.array(
      z.object({
        nome: z.string(),
        egestor_conta_id: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
      }),
    ),
    z.null(),
  ])
  .optional()
const databaseMoneySchema = z.union([z.number(), z.string(), z.null()])
const accountRowsSchema = z.array(
  z.object({
    id: z.string(),
    nome: z.string(),
    tag_padrao: z.string().nullable(),
  }),
)
const ruleRowsSchema = z.array(
  z.object({
    imobiliaria_id: z.string(),
    empreendimento_id: z.string(),
    ativo: z.boolean(),
    imobiliarias: relationSchema,
    empreendimentos: relationSchema,
  }),
)
const propertyRowsSchema = z.array(
  z.object({
    id: z.string(),
    imobiliaria_id: z.string(),
    empreendimento_id: z.string(),
    unidade: z.string(),
    inquilino_nome: z.string().nullable(),
    status: z.string(),
    valor_aluguel_esperado: databaseMoneySchema,
    ativo: z.boolean(),
    atualizado_em: z.string(),
    imobiliarias: relationSchema,
    empreendimentos: relationSchema,
  }),
)
const closingRowsSchema = z.array(
  z.object({
    id: z.string(),
    imobiliaria_id: z.string(),
    empreendimento_id: z.string(),
    competencia: z.string(),
    status: z.string(),
    arquivado: z.boolean(),
    processamento_status: z.string().nullable(),
    analise_completa: z.unknown().nullable(),
    atualizado_em: z.string(),
    imobiliarias: relationSchema,
    empreendimentos: relationSchema,
  }),
)
const snapshotRowsSchema = z.array(
  z.object({
    imovel_id: z.string(),
    fechamento_id: z.string(),
    competencia: z.string(),
    status_ocupacao: z.enum([
      "ocupado",
      "inadimplente",
      "vago",
      "em_rescisao",
      "desconhecido",
    ]),
    status_origem: z.string(),
    inquilino_nome: z.string().nullable(),
    aluguel_esperado: databaseMoneySchema,
    aluguel_recebido: databaseMoneySchema,
    aluguel_competencia: databaseMoneySchema.optional(),
    atrasos_recuperados: databaseMoneySchema.optional(),
    outros_recebimentos: databaseMoneySchema.optional(),
    entradas_passagem: databaseMoneySchema.optional(),
    saidas_passagem: databaseMoneySchema.optional(),
    receita_total: databaseMoneySchema,
    desconto: databaseMoneySchema,
    comissao_administracao: databaseMoneySchema,
    repasse_apurado: databaseMoneySchema,
    vencimento_referencia: z.string().nullable(),
    competencia_original: z.string().nullable().optional(),
    competencia_recebimento: z.string().nullable().optional(),
    dia_vencimento: z.number().int().min(1).max(31).nullable().optional(),
    modelo_receita: z.enum(["fixo", "variavel", "nao_aplicavel"]).optional(),
    status_mensal_explicito: z
      .enum(["ocupado", "inadimplente", "vago", "em_rescisao", "desconhecido"])
      .nullable()
      .optional(),
    origem: z.enum(["processamento", "backfill"]),
    qualidade: z.enum(["completo", "parcial", "sem_linha"]),
    atualizado_em: z.string(),
  }),
)
const vigencyRowsSchema = z.array(
  z.object({
    id: z.string(),
    imovel_id: z.string(),
    imobiliaria_id: z.string(),
    empreendimento_id: z.string(),
    vigencia_inicio: z.string(),
    vigencia_fim: z.string().nullable(),
    modelo_receita: z.enum(["fixo", "variavel", "nao_aplicavel"]),
    aluguel_contratado: databaseMoneySchema,
    fonte: z.string(),
    ativo: z.boolean(),
  }),
)
const calculationAnalysisSchema = z
  .object({
    totals: z
      .object({
        total_receitas: z.number(),
        total_comissoes: z.number(),
        total_despesas: z.number(),
        total_a_repassar: z.number(),
        valor_comprovado: z.number().nullable().optional(),
        total_agua: z.number().nullable().optional(),
        total_iptu: z.number().nullable().optional(),
        total_seguro_incendio: z.number().nullable().optional(),
        repasse_embutido: z.boolean().optional(),
        entradas_passagem: z.number().nullable().optional(),
        saidas_passagem: z.number().nullable().optional(),
        total_tarifas: z.number().nullable().optional(),
        repasse_declarado: z.number().nullable().optional(),
      })
      .passthrough(),
    prestacao: z
      .object({
        receitas_por_imovel: z
          .array(
            z
              .object({
                apto: z.string(),
                imovel_id: z.string().nullable().optional(),
                aluguel: z.number().nullable().optional(),
                aluguel_com_desconto: z.number().nullable().optional(),
                total: z.number().nullable().optional(),
                outros_recebimentos: z.number().nullable().optional(),
                entradas_passagem: z.number().nullable().optional(),
                saidas_passagem: z.number().nullable().optional(),
                competencia_original: z.string().nullable().optional(),
                competencia_recebimento: z.string().nullable().optional(),
                dia_vencimento: z.number().nullable().optional(),
              })
              .passthrough(),
          )
          .default([]),
        acordos_rescisoes_recebidos: z
          .array(
            z
              .object({
                tipo: z.enum(["intermediacao", "acordo", "rescisao", "atraso", "outro"]),
                comissao: z.number().nullable().optional(),
                apto: z.string().nullable().optional(),
                valor: z.number().nullable().optional(),
                competencia_original: z.string().nullable().optional(),
                competencia_recebimento: z.string().nullable().optional(),
              })
              .passthrough(),
          )
          .optional(),
        inadimplencias_acumuladas: z
          .array(z.object({ valor: z.number() }).passthrough())
          .optional(),
        resumo_financeiro: z
          .object({
            outras_comissoes_despesas: z
              .array(z.object({ descricao: z.string(), valor: z.number() }).passthrough())
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

type AccountRow = z.infer<typeof accountRowsSchema>[number]
type RuleRow = z.infer<typeof ruleRowsSchema>[number]
type PropertyRow = z.infer<typeof propertyRowsSchema>[number]
type ClosingRow = z.infer<typeof closingRowsSchema>[number]

interface CompanyDefinition {
  id: string
  label: string
}

interface LoadedIndicadoresRows {
  accounts: AccountRow[]
  rules: RuleRow[]
  properties: PropertyRow[]
  closings: ClosingRow[]
  vigencies: z.infer<typeof vigencyRowsSchema>
  vigenciesAvailable: boolean
}

export async function getIndicadores(query: IndicadoresQuery = {}): Promise<IndicadoresData> {
  const supabase = createSupabaseAdmin()
  const v2Enabled = process.env.INDICADORES_CONFIABILIDADE_V2 !== "false"
  const loaded = await loadBaseRows(supabase, v2Enabled)
  const competencia = query.competencia ?? latestCompetence(loaded.closings)
  const snapshotStart = offsetCompetence(competencia, -11)
  const snapshotData = await loadSnapshotRows(
    supabase,
    snapshotStart,
    competencia,
    v2Enabled,
  )

  const accountById = new Map(loaded.accounts.map((account) => [account.id, account]))
  const rules = loaded.rules.map((row) => mapRule(row, accountById))
  const properties = loaded.properties.map((row) => mapProperty(row, accountById))
  const closings = loaded.closings.map((row) => mapClosing(row, accountById))
  const vigencies = loaded.vigencies.map((row) => mapVigency(row, properties))
  const snapshots = snapshotRowsSchema
    .parse(snapshotData ?? [])
    .map(mapSnapshot)
    .map((snapshot) => applyHistoricalContract(snapshot, vigencies))

  validateFilterCoherence(query, rules, properties)

  return aggregateIndicadores({
    calculoVersao: v2Enabled
      ? INDICADORES_SNAPSHOT_CALCULATION_VERSION
      : "indicadores-operacionais-v1-rollback",
    competencia,
    atualizadoEm: latestUpdate(loaded.properties, loaded.closings, snapshotData ?? []),
    vigenciasDisponiveis: v2Enabled ? loaded.vigenciesAvailable : undefined,
    filtros: {
      empresaId: query.empresaId ?? null,
      empreendimentoId: query.empreendimentoId ?? null,
      imovelId: query.imovelId ?? null,
    },
    regrasAtivas: rules,
    imoveisAtivos: properties,
    vigencias: vigencies,
    fechamentos: closings,
    snapshots,
    linhasNaoVinculadas: findUnlinkedLines(closings, properties),
  })
}

async function loadBaseRows(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  v2Enabled: boolean,
): Promise<LoadedIndicadoresRows> {
  const [accountsResult, rulesResult, propertiesResult, closingsResult] = await Promise.all([
    supabase.from("egestor_contas").select("id, nome, tag_padrao").eq("ativo", true),
    supabase
      .from("regras_comerciais")
      .select(
        `imobiliaria_id, empreendimento_id, ativo,
         imobiliarias ( nome, ativo ), empreendimentos ( nome, egestor_conta_id, ativo )`,
      )
      .eq("ativo", true),
    supabase
      .from("imoveis")
      .select(
        `id, imobiliaria_id, empreendimento_id, unidade, inquilino_nome, status,
         valor_aluguel_esperado, ativo, atualizado_em,
         imobiliarias ( nome, ativo ), empreendimentos ( nome, egestor_conta_id, ativo )`,
      )
      .order("id"),
    supabase
      .from("fechamentos")
      .select(
        `id, imobiliaria_id, empreendimento_id, competencia, status, arquivado,
         processamento_status, analise_completa, atualizado_em,
         imobiliarias ( nome ), empreendimentos ( nome, egestor_conta_id )`,
      )
      .eq("arquivado", false)
      .order("competencia", { ascending: true }),
  ])

  for (const result of [accountsResult, rulesResult, propertiesResult, closingsResult]) {
    if (result.error) throw result.error
  }
  const vigencyResult = v2Enabled
    ? await supabase
        .from("imovel_vigencias")
        .select(
          `id, imovel_id, imobiliaria_id, empreendimento_id, vigencia_inicio,
           vigencia_fim, modelo_receita, aluguel_contratado, fonte, ativo`,
        )
        .eq("ativo", true)
        .order("vigencia_inicio", { ascending: true })
    : { data: [], error: null }
  if (vigencyResult.error && !isMissingDatabaseObject(vigencyResult.error)) {
    throw vigencyResult.error
  }

  return {
    accounts: accountRowsSchema.parse(accountsResult.data ?? []),
    rules: ruleRowsSchema.parse(rulesResult.data ?? []),
    properties: propertyRowsSchema.parse(propertiesResult.data ?? []),
    closings: closingRowsSchema.parse(closingsResult.data ?? []),
    vigencies: vigencyRowsSchema.parse(vigencyResult.data ?? []),
    vigenciesAvailable: !v2Enabled || vigencyResult.error === null,
  }
}

async function loadSnapshotRows(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  snapshotStart: string,
  competencia: string,
  v2Enabled: boolean,
) {
  if (v2Enabled) {
    const v2 = await supabase
      .from("imovel_competencias")
      .select(
        `imovel_id, fechamento_id, competencia, status_ocupacao, status_origem,
         inquilino_nome, aluguel_esperado, aluguel_recebido, aluguel_competencia,
         atrasos_recuperados, outros_recebimentos, entradas_passagem, saidas_passagem,
         receita_total, desconto, comissao_administracao, repasse_apurado,
         vencimento_referencia, competencia_original, competencia_recebimento,
         dia_vencimento, modelo_receita, status_mensal_explicito, origem,
         qualidade, atualizado_em`,
      )
      .gte("competencia", snapshotStart)
      .lte("competencia", competencia)
      .order("competencia", { ascending: true })
    if (!v2.error) return v2.data ?? []
    if (!isMissingDatabaseObject(v2.error)) throw v2.error
  }

  const legacy = await supabase
    .from("imovel_competencias")
    .select(
      `imovel_id, fechamento_id, competencia, status_ocupacao, status_origem,
       inquilino_nome, aluguel_esperado, aluguel_recebido, receita_total, desconto,
       comissao_administracao, repasse_apurado, vencimento_referencia, origem,
       qualidade, atualizado_em`,
    )
    .gte("competencia", snapshotStart)
    .lte("competencia", competencia)
    .order("competencia", { ascending: true })
  if (legacy.error) throw legacy.error
  return legacy.data ?? []
}

function isMissingDatabaseObject(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /does not exist|could not find|schema cache/i.test(error.message ?? "")
  )
}

function mapRule(row: RuleRow, accountById: Map<string, AccountRow>): IndicadoresRuleInput {
  const agency = relation(row.imobiliarias)
  const development = relation(row.empreendimentos)
  return {
    ...mapPair(row, accountById),
    ativo: row.ativo && agency?.ativo !== false && development?.ativo !== false,
  }
}

function mapProperty(
  row: PropertyRow,
  accountById: Map<string, AccountRow>,
): IndicadoresPropertyInput {
  return {
    ...mapPair(row, accountById),
    id: row.id,
    unidade: row.unidade,
    inquilinoNome: row.inquilino_nome,
    statusAtual: mapCurrentStatus(row.status),
    aluguelEsperadoAtual: nullableMoney(row.valor_aluguel_esperado),
    ativo: row.ativo,
  }
}

function mapVigency(
  row: z.infer<typeof vigencyRowsSchema>[number],
  properties: IndicadoresPropertyInput[],
): IndicadoresVigencyInput {
  const property = properties.find((item) => item.id === row.imovel_id)
  if (!property) {
    throw new Error(`Vigência ${row.id} referencia imóvel inexistente nos indicadores.`)
  }
  return {
    empresaId: property.empresaId,
    empresaNome: property.empresaNome,
    imobiliariaId: row.imobiliaria_id,
    imobiliariaNome: property.imobiliariaNome,
    empreendimentoId: row.empreendimento_id,
    empreendimentoNome: property.empreendimentoNome,
    id: row.id,
    imovelId: row.imovel_id,
    vigenciaInicio: normalizeCompetence(row.vigencia_inicio),
    vigenciaFim: row.vigencia_fim ? normalizeCompetence(row.vigencia_fim) : null,
    modeloReceita: row.modelo_receita,
    aluguelContratado: nullableMoney(row.aluguel_contratado),
    fonte: row.fonte,
    ativo: row.ativo,
  }
}

function mapClosing(
  row: ClosingRow,
  accountById: Map<string, AccountRow>,
): IndicadoresClosingInput {
  return {
    ...mapPair(row, accountById),
    id: row.id,
    competencia: normalizeCompetence(row.competencia),
    status: row.status,
    arquivado: row.arquivado,
    processamentoStatus: row.processamento_status,
    analiseCompleta: parseCalculationAnalysis(row.analise_completa),
  }
}

function mapSnapshot(row: z.infer<typeof snapshotRowsSchema>[number]): IndicadoresSnapshotInput {
  return {
    imovelId: row.imovel_id,
    fechamentoId: row.fechamento_id,
    competencia: normalizeCompetence(row.competencia),
    statusOcupacao: row.status_ocupacao,
    statusOrigem: row.status_origem,
    inquilinoNome: row.inquilino_nome,
    aluguelEsperado: nullableMoney(row.aluguel_esperado),
    aluguelRecebido: nullableMoney(row.aluguel_recebido),
    aluguelRecebidoCompetencia: nullableOptionalMoney(row.aluguel_competencia),
    atrasosRecuperados: nullableOptionalMoney(row.atrasos_recuperados),
    outrosRecebimentos: nullableOptionalMoney(row.outros_recebimentos),
    entradasPassagem: nullableOptionalMoney(row.entradas_passagem),
    saidasPassagem: nullableOptionalMoney(row.saidas_passagem),
    receitaTotal: nullableMoney(row.receita_total),
    desconto: nullableMoney(row.desconto),
    comissaoAdministracao: nullableMoney(row.comissao_administracao),
    repasseApurado: nullableMoney(row.repasse_apurado),
    vencimentoReferencia: row.vencimento_referencia,
    competenciaOriginal: row.competencia_original
      ? normalizeCompetence(row.competencia_original)
      : null,
    competenciaRecebimento: row.competencia_recebimento
      ? normalizeCompetence(row.competencia_recebimento)
      : null,
    diaVencimento: row.dia_vencimento ?? null,
    modeloReceita: row.modelo_receita ?? "fixo",
    statusMensalExplicito: row.status_mensal_explicito ?? null,
    origem: row.origem,
    qualidade: row.qualidade,
  }
}

function applyHistoricalContract(
  snapshot: IndicadoresSnapshotInput,
  vigencies: IndicadoresVigencyInput[],
) {
  const vigency = vigencies.find(
    (item) =>
      item.imovelId === snapshot.imovelId &&
      item.vigenciaInicio <= snapshot.competencia &&
      (item.vigenciaFim === null || item.vigenciaFim >= snapshot.competencia),
  )
  if (!vigency) return snapshot
  return {
    ...snapshot,
    modeloReceita: vigency.modeloReceita,
    aluguelEsperado:
      vigency.modeloReceita === "fixo" ? vigency.aluguelContratado : null,
  }
}

function mapPair(
  row: Pick<RuleRow, "imobiliaria_id" | "empreendimento_id" | "imobiliarias" | "empreendimentos">,
  accountById: Map<string, AccountRow>,
): IndicadoresPairInput {
  const agency = relation(row.imobiliarias)
  const development = relation(row.empreendimentos)
  const company = resolveCompany(development?.egestor_conta_id ?? null, accountById)

  return {
    empresaId: company.id,
    empresaNome: company.label,
    imobiliariaId: row.imobiliaria_id,
    imobiliariaNome: agency?.nome ?? row.imobiliaria_id,
    empreendimentoId: row.empreendimento_id,
    empreendimentoNome: development?.nome ?? row.empreendimento_id,
  }
}

function resolveCompany(
  accountId: string | null,
  accountById: Map<string, AccountRow>,
): CompanyDefinition {
  const account = accountId ? accountById.get(accountId) : undefined
  const tag = account?.tag_padrao?.trim() || "ACR"
  return { id: tag, label: account?.nome ? `${tag} · ${account.nome}` : tag }
}

function parseCalculationAnalysis(value: unknown): IndicadoresAnalysisInput | null {
  const parsed = calculationAnalysisSchema.safeParse(value)
  if (!parsed.success) return null
  const { totals, prestacao } = parsed.data

  return {
    totals: {
      total_receitas: totals.total_receitas,
      total_comissoes: totals.total_comissoes,
      total_despesas: totals.total_despesas,
      total_a_repassar: totals.total_a_repassar,
      valor_comprovado: totals.valor_comprovado ?? null,
      total_agua: totals.total_agua ?? null,
      total_iptu: totals.total_iptu ?? null,
      total_seguro_incendio: totals.total_seguro_incendio ?? null,
      repasse_embutido: totals.repasse_embutido,
      entradas_passagem: totals.entradas_passagem ?? null,
      saidas_passagem: totals.saidas_passagem ?? null,
      total_tarifas: totals.total_tarifas ?? null,
      repasse_declarado: totals.repasse_declarado ?? null,
    },
    prestacao: prestacao
      ? {
          receitas_por_imovel: prestacao.receitas_por_imovel.map((line) => ({
            apto: line.apto,
            imovel_id: line.imovel_id ?? null,
            aluguel: line.aluguel ?? null,
            aluguel_com_desconto: line.aluguel_com_desconto ?? null,
            total: line.total ?? null,
            outros_recebimentos: line.outros_recebimentos ?? null,
            entradas_passagem: line.entradas_passagem ?? null,
            saidas_passagem: line.saidas_passagem ?? null,
            competencia_original: line.competencia_original ?? null,
            competencia_recebimento: line.competencia_recebimento ?? null,
            dia_vencimento: line.dia_vencimento ?? null,
          })),
          acordos_rescisoes_recebidos:
            prestacao.acordos_rescisoes_recebidos?.map((item) => ({
              tipo: item.tipo,
              comissao: item.comissao ?? null,
              apto: item.apto ?? null,
              valor: item.valor ?? null,
              competencia_original: item.competencia_original ?? null,
              competencia_recebimento: item.competencia_recebimento ?? null,
            })) ?? null,
          inadimplencias_acumuladas:
            prestacao.inadimplencias_acumuladas?.map((item) => ({ valor: item.valor })) ?? null,
          outras_comissoes_despesas:
            prestacao.resumo_financeiro?.outras_comissoes_despesas?.map((item) => ({
              descricao: item.descricao,
              valor: item.valor,
            })) ?? null,
        }
      : null,
  }
}

function findUnlinkedLines(
  closings: IndicadoresClosingInput[],
  properties: IndicadoresPropertyInput[],
) {
  const unitsByPair = new Map<string, Set<string>>()
  for (const property of properties) {
    const key = pairKey(property)
    const units = unitsByPair.get(key) ?? new Set<string>()
    units.add(normalizeCodigoImovel(property.unidade))
    unitsByPair.set(key, units)
  }

  return closings.map((closing) => {
    const units = unitsByPair.get(pairKey(closing)) ?? new Set<string>()
    const lines = closing.analiseCompleta?.prestacao?.receitas_por_imovel ?? []
    const unlinkedLines = lines.filter(
      (line) => !units.has(normalizeCodigoImovel(line.apto)),
    )
    return {
      fechamentoId: closing.id,
      quantidade: unlinkedLines.length,
      detalhes: [...new Set(unlinkedLines.map((line) =>
        `${closing.imobiliariaNome ?? closing.imobiliariaId} · ${closing.empreendimentoNome ?? closing.empreendimentoId} · Unidade ${line.apto}`,
      ))],
    }
  })
}

function validateFilterCoherence(
  query: IndicadoresQuery,
  rules: IndicadoresRuleInput[],
  properties: IndicadoresPropertyInput[],
) {
  const pairs = [...rules, ...properties]
  if (query.empresaId && !pairs.some((item) => item.empresaId === query.empresaId)) {
    throw new IndicadoresQueryValidationError("Empresa nao encontrada nos indicadores.")
  }
  if (
    query.empreendimentoId &&
    !pairs.some(
      (item) =>
        item.empreendimentoId === query.empreendimentoId &&
        (!query.empresaId || item.empresaId === query.empresaId),
    )
  ) {
    throw new IndicadoresQueryValidationError("Empreendimento incompatível com os filtros.")
  }
  if (query.imovelId) {
    const property = properties.find((item) => item.id === query.imovelId)
    const isCoherent =
      property &&
      (!query.empresaId || property.empresaId === query.empresaId) &&
      (!query.empreendimentoId || property.empreendimentoId === query.empreendimentoId)
    if (!isCoherent) throw new IndicadoresQueryValidationError("Imovel incompatível com os filtros.")
  }
}

function latestCompetence(closings: ClosingRow[]) {
  const latest = closings
    .filter((closing) => !closing.arquivado)
    .map((closing) => normalizeCompetence(closing.competencia))
    .sort()
    .at(-1)
  if (latest) return latest
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function latestUpdate(
  properties: Array<{ atualizado_em: string }>,
  closings: Array<{ atualizado_em: string }>,
  snapshots: unknown[],
) {
  const snapshotUpdates = snapshotRowsSchema.parse(snapshots).map((row) => row.atualizado_em)
  return [...properties, ...closings]
    .map((row) => row.atualizado_em)
    .concat(snapshotUpdates)
    .sort()
    .at(-1) ?? new Date().toISOString()
}

function relation(value: z.infer<typeof relationSchema>) {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function nullableMoney(value: z.infer<typeof databaseMoneySchema>) {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error("Valor monetario invalido na base de indicadores.")
  return roundMoney(parsed)
}

function nullableOptionalMoney(
  value: z.infer<typeof databaseMoneySchema> | undefined,
) {
  return value === undefined ? null : nullableMoney(value)
}

function mapCurrentStatus(value: string): OccupancyStatus {
  if (value === "ocupado" || value === "inadimplente" || value === "vago" || value === "em_rescisao") {
    return value
  }
  return "desconhecido"
}

function normalizeCompetence(value: string) {
  return `${value.slice(0, 7)}-01`
}

function offsetCompetence(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function pairKey(pair: Pick<IndicadoresPairInput, "imobiliariaId" | "empreendimentoId">) {
  return `${pair.imobiliariaId}::${pair.empreendimentoId}`
}
