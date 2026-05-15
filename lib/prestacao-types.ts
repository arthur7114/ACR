import { z } from "zod"

export const receitaPorImovelSchema = z
  .object({
    apto: z.string(),
    inquilino: z.string(),
    aluguel: z.number().nullable(),
    desconto: z.number().nullable(),
    aluguel_com_desconto: z.number().nullable(),
    garagem: z.number().nullable(),
    agua: z.number().nullable(),
    iptu: z.number().nullable(),
    seguro_incendio: z.number().nullable(),
    total: z.number(),
    comissao: z.number().nullable(),
    repasse: z.number().nullable(),
    vencimento: z.string().nullable(),
    observacao: z.string().nullable(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export interface ReceitaPorImovel {
  apto: string
  inquilino: string
  aluguel: number | null
  desconto: number | null
  aluguel_com_desconto: number | null
  garagem: number | null
  agua: number | null
  iptu: number | null
  seguro_incendio: number | null
  total: number
  comissao: number | null
  repasse: number | null
  vencimento: string | null
  observacao: string | null
  confianca: number
}

export const prestacaoAnalysisSchema = z
  .object({
    tipo_documento: z.literal("prestacao_contas"),
    imobiliaria: z.string(),
    empreendimento: z.string(),
    competencia: z.string(),
    receitas_por_imovel: z.array(receitaPorImovelSchema),
    totais: z
      .object({
        total_receitas: z.number().nullable(),
        total_comissoes: z.number().nullable(),
        total_repassar: z.number().nullable(),
      })
      .strict(),
    campos_ausentes: z.array(z.string()),
    observacoes: z.array(z.string()),
    confianca_geral: z.number().min(0).max(1),
  })
  .strict()

export interface PrestacaoAnalysis {
  tipo_documento: "prestacao_contas"
  imobiliaria: string
  empreendimento: string
  competencia: string
  receitas_por_imovel: ReceitaPorImovel[]
  totais: {
    total_receitas: number | null
    total_comissoes: number | null
    total_repassar: number | null
  }
  campos_ausentes: string[]
  observacoes: string[]
  confianca_geral: number
}

export const technicalOpinionSchema = z
  .object({
    status: z.enum(["aprovado_tecnico", "aprovado_com_ressalvas", "bloqueado"]),
    resumo: z.string(),
    motivos: z.array(z.string()),
    confianca: z.number().min(0).max(1),
    requer_revisao_humana: z.boolean(),
  })
  .strict()

export type TechnicalOpinion = z.infer<typeof technicalOpinionSchema>

export const recheckSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["passed", "warning", "failed"]),
    message: z.string(),
    expected: z.number().nullable().optional(),
    actual: z.number().nullable().optional(),
    difference: z.number().nullable().optional(),
  })
  .strict()

export type PrestacaoRecheck = z.infer<typeof recheckSchema>

export const guardrailSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["passed", "warning", "blocked"]),
    message: z.string(),
  })
  .strict()

export type PrestacaoGuardrail = z.infer<typeof guardrailSchema>

export interface AnalyzePrestacaoResponse {
  analysis: PrestacaoAnalysis
  workflowRunId: string
  parecer: TechnicalOpinion
  rechecks: PrestacaoRecheck[]
  guardrails: PrestacaoGuardrail[]
  fechamentoId: string | null
  documentoId: string | null
  storagePath: string | null
}
