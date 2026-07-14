import { z } from "zod"
import {
  aggregateIndicadores,
  type IndicadoresAnalysisInput,
  type IndicadoresClosingInput,
  type IndicadoresPairInput,
  type IndicadoresPropertyInput,
  type IndicadoresRuleInput,
  type IndicadoresSnapshotInput,
} from "@/lib/indicadores-aggregation"
import {
  normalizePropertyKeyPart,
  roundMoney,
  type OccupancyStatus,
} from "@/lib/indicadores-domain"
import {
  IndicadoresQueryValidationError,
  type IndicadoresQuery,
} from "@/lib/indicadores-query"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { INDICADORES_SNAPSHOT_CALCULATION_VERSION } from "./indicadores-snapshots"
import { createSupabaseAdmin } from "./supabase"

const relationSchema = z
  .union([
    z.object({ nome: z.string(), egestor_conta_id: z.string().nullable().optional() }),
    z.array(z.object({ nome: z.string(), egestor_conta_id: z.string().nullable().optional() })),
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
    receita_total: databaseMoneySchema,
    desconto: databaseMoneySchema,
    comissao_administracao: databaseMoneySchema,
    repasse_apurado: databaseMoneySchema,
    vencimento_referencia: z.string().nullable(),
    origem: z.enum(["processamento", "backfill"]),
    qualidade: z.enum(["completo", "parcial", "sem_linha"]),
    atualizado_em: z.string(),
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
      })
      .passthrough(),
    prestacao: z
      .object({
        receitas_por_imovel: z.array(z.object({ apto: z.string() }).passthrough()).default([]),
        acordos_rescisoes_recebidos: z
          .array(
            z
              .object({
                tipo: z.enum(["intermediacao", "acordo", "rescisao", "atraso", "outro"]),
                comissao: z.number().nullable().optional(),
              })
              .passthrough(),
          )
          .optional(),
        inadimplencias_acumuladas: z
          .array(z.object({ valor: z.number() }).passthrough())
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
}

export async function getIndicadores(query: IndicadoresQuery = {}): Promise<IndicadoresData> {
  const supabase = createSupabaseAdmin()
  const loaded = await loadBaseRows(supabase)
  const competencia = query.competencia ?? latestCompetence(loaded.closings)
  const snapshotStart = offsetCompetence(competencia, -11)
  const { data: snapshotData, error: snapshotError } = await supabase
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

  if (snapshotError) throw snapshotError

  const accountById = new Map(loaded.accounts.map((account) => [account.id, account]))
  const rules = loaded.rules.map((row) => mapRule(row, accountById))
  const properties = loaded.properties.map((row) => mapProperty(row, accountById))
  const closings = loaded.closings.map((row) => mapClosing(row, accountById))
  const snapshots = snapshotRowsSchema.parse(snapshotData ?? []).map(mapSnapshot)

  validateFilterCoherence(query, rules, properties)

  return aggregateIndicadores({
    calculoVersao: INDICADORES_SNAPSHOT_CALCULATION_VERSION,
    competencia,
    atualizadoEm: latestUpdate(loaded.properties, loaded.closings, snapshotData ?? []),
    filtros: {
      empresaId: query.empresaId ?? null,
      empreendimentoId: query.empreendimentoId ?? null,
      imovelId: query.imovelId ?? null,
    },
    regrasAtivas: rules,
    imoveisAtivos: properties,
    fechamentos: closings,
    snapshots,
    linhasNaoVinculadas: findUnlinkedLines(closings, properties),
  })
}

async function loadBaseRows(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<LoadedIndicadoresRows> {
  const [accountsResult, rulesResult, propertiesResult, closingsResult] = await Promise.all([
    supabase.from("egestor_contas").select("id, nome, tag_padrao").eq("ativo", true),
    supabase
      .from("regras_comerciais")
      .select(
        `imobiliaria_id, empreendimento_id, ativo,
         imobiliarias ( nome ), empreendimentos ( nome, egestor_conta_id )`,
      )
      .eq("ativo", true),
    supabase
      .from("imoveis")
      .select(
        `id, imobiliaria_id, empreendimento_id, unidade, inquilino_nome, status,
         valor_aluguel_esperado, ativo, atualizado_em,
         imobiliarias ( nome ), empreendimentos ( nome, egestor_conta_id )`,
      )
      .eq("ativo", true),
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

  return {
    accounts: accountRowsSchema.parse(accountsResult.data ?? []),
    rules: ruleRowsSchema.parse(rulesResult.data ?? []),
    properties: propertyRowsSchema.parse(propertiesResult.data ?? []),
    closings: closingRowsSchema.parse(closingsResult.data ?? []),
  }
}

function mapRule(row: RuleRow, accountById: Map<string, AccountRow>): IndicadoresRuleInput {
  return {
    ...mapPair(row, accountById),
    ativo: row.ativo,
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
    receitaTotal: nullableMoney(row.receita_total),
    desconto: nullableMoney(row.desconto),
    comissaoAdministracao: nullableMoney(row.comissao_administracao),
    repasseApurado: nullableMoney(row.repasse_apurado),
    vencimentoReferencia: row.vencimento_referencia,
    origem: row.origem,
    qualidade: row.qualidade,
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
    },
    prestacao: prestacao
      ? {
          receitas_por_imovel: prestacao.receitas_por_imovel.map((line) => ({ apto: line.apto })),
          acordos_rescisoes_recebidos:
            prestacao.acordos_rescisoes_recebidos?.map((item) => ({
              tipo: item.tipo,
              comissao: item.comissao ?? null,
            })) ?? null,
          inadimplencias_acumuladas:
            prestacao.inadimplencias_acumuladas?.map((item) => ({ valor: item.valor })) ?? null,
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
    units.add(normalizePropertyKeyPart(property.unidade))
    unitsByPair.set(key, units)
  }

  return closings.map((closing) => {
    const units = unitsByPair.get(pairKey(closing)) ?? new Set<string>()
    const lines = closing.analiseCompleta?.prestacao?.receitas_por_imovel ?? []
    const unlinkedLines = lines.filter(
      (line) => !units.has(normalizePropertyKeyPart(line.apto)),
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
