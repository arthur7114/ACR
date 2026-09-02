import { z } from "zod"

export const documentTypeSchema = z.enum([
  "prestacao_contas",
  "comprovante_repasse",
  "relatorio_reajuste",
  "despesas_comprovantes",
  "desconhecido",
])

export type DocumentType = z.infer<typeof documentTypeSchema>

export const classifiedDocumentSchema = z
  .object({
    fileName: z.string(),
    fileType: z.string(),
    fileSize: z.number(),
    documentType: documentTypeSchema,
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    storagePath: z.string().nullable().optional(),
    documentoId: z.string().nullable().optional(),
  })
  .strict()

export type ClassifiedDocument = z.infer<typeof classifiedDocumentSchema>

export const receitaPorImovelSchema = z
  .object({
    linha_id: z.string().min(1).nullable().optional(),
    apto: z.string(),
    inquilino: z.string(),
    aluguel: z.number().nullable(),
    desconto: z.number().nullable(),
    aluguel_com_desconto: z.number().nullable(),
    garagem: z.number().nullable(),
    vagas_garagem: z.number().int().nonnegative().nullable().optional(),
    agua: z.number().nullable(),
    iptu: z.number().nullable(),
    seguro_incendio: z.number().nullable(),
    total: z.number(),
    comissao: z.number().nullable(),
    repasse: z.number().nullable(),
    // Mes ("MM") do reajuste anual do contrato, quando o documento imprime a
    // coluna REAJUSTE. Igual ao mes da competencia = atualizacao monetaria no mes.
    reajuste_mes: z.string().regex(/^(0[1-9]|1[0-2])$/).nullable().optional(),
    imovel_id: z.string().uuid().nullable().optional(),
    // Competencia do aluguel e mes em que o valor entrou no fechamento sao
    // dimensoes distintas. O vencimento permanece como campo legado de leitura.
    competencia_original: z.string().nullable().optional(),
    competencia_recebimento: z.string().nullable().optional(),
    dia_vencimento: z.number().int().min(1).max(31).nullable().optional(),
    // Aluguel que o DOCUMENTO declara como devido na competencia (ex.: coluna
    // ALUGUEL da Relacao de Imoveis no layout Cesar Rego). Preenchido so quando
    // a fonte e o proprio documento; e a base preferida da inadimplencia do mes.
    aluguel_esperado: z.number().nullable().optional(),
    // Dimensoes da conciliacao v2. Permanecem opcionais para que analises
    // historicas continuem validas ate serem reprocessadas.
    outros_recebimentos: z.number().nullable().optional(),
    entradas_passagem: z.number().nullable().optional(),
    saidas_passagem: z.number().nullable().optional(),
    vencimento: z.string().nullable(),
    observacao: z.string().nullable(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export interface ReceitaPorImovel {
  linha_id?: string | null
  apto: string
  inquilino: string
  aluguel: number | null
  desconto: number | null
  aluguel_com_desconto: number | null
  garagem: number | null
  vagas_garagem?: number | null
  agua: number | null
  iptu: number | null
  seguro_incendio: number | null
  total: number
  comissao: number | null
  repasse: number | null
  reajuste_mes?: string | null
  imovel_id?: string | null
  competencia_original?: string | null
  competencia_recebimento?: string | null
  dia_vencimento?: number | null
  aluguel_esperado?: number | null
  outros_recebimentos?: number | null
  entradas_passagem?: number | null
  saidas_passagem?: number | null
  vencimento: string | null
  observacao: string | null
  confianca: number
}

export const acordoRescisaoRecebidoSchema = z
  .object({
    tipo: z.enum(["acordo", "rescisao", "intermediacao", "atraso", "outro"]),
    apto: z.string().nullable(),
    inquilino: z.string().nullable(),
    valor: z.number(),
    // Componentes monetários da linha (CA14.2 revisado / CA27). Opcionais para
    // manter compatibilidade com análises persistidas antes destes campos.
    // Em intermediação, aluguel e garagem formam a base comissionável; nos
    // demais tipos, `valor` segue como principal bruto e `ajuste` carrega
    // desconto (negativo) ou crédito (positivo).
    aluguel: z.number().nullable().optional(),
    garagem: z.number().nullable().optional(),
    ajuste: z.number().nullable().optional(),
    agua: z.number().nullable().optional(),
    iptu: z.number().nullable().optional(),
    seguro_incendio: z.number().nullable().optional(),
    total_recebido: z.number().nullable().optional(),
    repasse: z.number().nullable().optional(),
    // Comissao retida sobre este recebimento (ex.: comissao do acordo, taxa de
    // intermediacao). Soma-se a comissao de administracao das linhas regulares.
    comissao: z.number().nullable().optional(),
    // Percentual de intermediacao impresso no documento (ex.: 60). null quando ausente.
    percentual: z.number().nullable().optional(),
    vagas_garagem: z.number().int().min(0).nullable().optional(),
    competencia_original: z.string().nullable(),
    competencia_recebimento: z.string().nullable(),
    observacao: z.string().nullable(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type AcordoRescisaoRecebido = z.infer<typeof acordoRescisaoRecebidoSchema>

export const inadimplenciaAcumuladaSchema = z
  .object({
    apto: z.string().nullable(),
    inquilino: z.string().nullable(),
    valor: z.number(),
    condicao: z.string().nullable(),
    observacao: z.string().nullable(),
    competencia_original: z.string().nullable().optional(),
    dia_vencimento: z.number().int().min(1).max(31).nullable().optional(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type InadimplenciaAcumulada = z.infer<typeof inadimplenciaAcumuladaSchema>

export const colunaNaoLidaSchema = z
  .object({
    coluna: z.string(),
    total: z.number(),
    linhas: z.number().int().nonnegative(),
  })
  .strict()

export type ColunaNaoLida = z.infer<typeof colunaNaoLidaSchema>

export const extractionPlanSchema = z
  .object({
    documento_lido_integralmente: z.boolean(),
    secoes_identificadas: z.array(z.string()),
    estrategia: z.array(z.string()),
    alertas: z.array(z.string()),
    // Colunas numericas do documento que o parser deterministico nao mapeou.
    // Opcional: analises antigas e a extracao por IA nao preenchem.
    colunas_nao_lidas: z.array(colunaNaoLidaSchema).optional(),
  })
  .strict()

export type ExtractionPlan = z.infer<typeof extractionPlanSchema>

export const prestacaoResumoDespesaSchema = z
  .object({
    descricao: z.string(),
    valor: z.number(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type PrestacaoResumoDespesa = z.infer<typeof prestacaoResumoDespesaSchema>

export const prestacaoResumoFinanceiroSchema = z
  .object({
    numero_documento: z.string().nullable().optional(),
    data_emissao: z.string().nullable().optional(),
    data_vencimento: z.string().nullable().optional(),
    total_linhas_receitas: z.number().nullable(),
    total_linhas_comissoes: z.number().nullable(),
    total_linhas_repasse: z.number().nullable(),
    comissao_administracao: z.number().nullable(),
    outras_comissoes_despesas: z.array(prestacaoResumoDespesaSchema),
    total_outras_comissoes_despesas: z.number().nullable(),
    total_comissao_despesas: z.number().nullable(),
    recebidos_em_nome_locador: z.number().nullable(),
    total_a_repassar: z.number().nullable(),
    // Layouts de extrato consolidado (Cesar Rego, Plural) trazem o repasse dentro
    // do proprio documento; nao ha comprovante bancario separado.
    repasse_embutido: z.boolean().optional(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type PrestacaoResumoFinanceiro = z.infer<typeof prestacaoResumoFinanceiroSchema>

export const prestacaoAnalysisSchema = z
  .object({
    tipo_documento: z.literal("prestacao_contas"),
    imobiliaria: z.string(),
    empreendimento: z.string(),
    competencia: z.string(),
    plano_extracao: extractionPlanSchema,
    receitas_por_imovel: z.array(receitaPorImovelSchema),
    acordos_rescisoes_recebidos: z.array(acordoRescisaoRecebidoSchema).default([]),
    inadimplencias_acumuladas: z.array(inadimplenciaAcumuladaSchema).default([]),
    resumo_financeiro: prestacaoResumoFinanceiroSchema,
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
  plano_extracao: ExtractionPlan
  receitas_por_imovel: ReceitaPorImovel[]
  acordos_rescisoes_recebidos: AcordoRescisaoRecebido[]
  inadimplencias_acumuladas: InadimplenciaAcumulada[]
  resumo_financeiro: PrestacaoResumoFinanceiro
  totais: {
    total_receitas: number | null
    total_comissoes: number | null
    total_repassar: number | null
  }
  campos_ausentes: string[]
  observacoes: string[]
  confianca_geral: number
}

export const repasseAnalysisSchema = z
  .object({
    valor: z.number().nullable(),
    data: z.string().nullable(),
    origem_nome: z.string().nullable(),
    destino_nome: z.string().nullable(),
    destino_banco: z.string().nullable(),
    destino_agencia: z.string().nullable(),
    destino_conta: z.string().nullable(),
    protocolo: z.string().nullable(),
    campos_ausentes: z.array(z.string()),
    observacoes: z.array(z.string()),
    confianca_geral: z.number().min(0).max(1),
  })
  .strict()

export type RepasseAnalysis = z.infer<typeof repasseAnalysisSchema>

export const despesaSchema = z
  .object({
    tipo: z.enum(["energia", "agua", "iptu", "seguro", "outro"]),
    fornecedor: z.string().nullable(),
    referencia: z.string().nullable(),
    vencimento: z.string().nullable(),
    valor: z.number(),
    endereco: z.string().nullable(),
    unidade_consumidora: z.string().nullable(),
    pago_em: z.string().nullable(),
    pago_por: z.string().nullable(),
    observacao: z.string().nullable(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type Despesa = z.infer<typeof despesaSchema>

export const despesasAnalysisSchema = z
  .object({
    despesas: z.array(despesaSchema),
    total_despesas: z.number().nullable(),
    campos_ausentes: z.array(z.string()),
    observacoes: z.array(z.string()),
    confianca_geral: z.number().min(0).max(1),
  })
  .strict()

export type DespesasAnalysis = z.infer<typeof despesasAnalysisSchema>

export const reajusteItemSchema = z
  .object({
    apto: z.string().nullable(),
    inquilino: z.string().nullable(),
    descricao: z.string(),
    valor_anterior: z.number().nullable(),
    valor_novo: z.number().nullable(),
    percentual: z.number().nullable(),
    vigencia: z.string().nullable(),
    observacao: z.string().nullable(),
    confianca: z.number().min(0).max(1),
  })
  .strict()

export type ReajusteItem = z.infer<typeof reajusteItemSchema>

export const reajusteAnalysisSchema = z
  .object({
    itens: z.array(reajusteItemSchema),
    campos_ausentes: z.array(z.string()),
    observacoes: z.array(z.string()),
    confianca_geral: z.number().min(0).max(1),
  })
  .strict()

export type ReajusteAnalysis = z.infer<typeof reajusteAnalysisSchema>

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
    databaseId: z.string().nullable().optional(),
    dbStatus: z.string().optional(),
    justificativa: z.string().nullable().optional(),
  })
  .strict()

export type PrestacaoRecheck = z.infer<typeof recheckSchema>

export const guardrailSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.enum(["passed", "warning", "blocked"]),
    message: z.string(),
    databaseId: z.string().nullable().optional(),
    dbStatus: z.string().optional(),
    justificativa: z.string().nullable().optional(),
  })
  .strict()

export type PrestacaoGuardrail = z.infer<typeof guardrailSchema>

export const packageTotalsSchema = z
  .object({
    total_receitas: z.number(),
    total_aluguel: z.number(),
    total_garagem: z.number(),
    total_agua: z.number(),
    total_iptu: z.number(),
    total_seguro_incendio: z.number(),
    total_comissoes: z.number(),
    total_repasse_bruto: z.number(),
    total_despesas: z.number(),
    total_comissao_despesas: z.number(),
    total_a_repassar: z.number(),
    valor_comprovado: z.number().nullable(),
    diferenca_repasse: z.number().nullable(),
    taxa_administracao_percent: z.number().nullable(),
    taxa_intermediacao_percent: z.number().nullable(),
    comissao_administracao_calculada: z.number().nullable(),
    base_comissao_administracao: z.number(),
    comissao_realizada_percent: z.number().nullable(),
    // Repasse informado no proprio extrato (sem comprovante bancario separado).
    repasse_embutido: z.boolean().optional(),
    // Dimensoes da conciliacao v2. Opcionais durante o rollout para manter a
    // leitura de fechamentos materializados pelas versoes anteriores.
    entradas_passagem: z.number().optional(),
    saidas_passagem: z.number().optional(),
    total_tarifas: z.number().optional(),
    repasse_declarado: z.number().nullable().optional(),
  })
  .strict()

export type PackageTotals = z.infer<typeof packageTotalsSchema>

export const packageAnalysisSchema = z
  .object({
    documents: z.array(classifiedDocumentSchema),
    prestacao: prestacaoAnalysisSchema.nullable(),
    repasse: repasseAnalysisSchema.nullable(),
    despesas: despesasAnalysisSchema.nullable(),
    reajuste: reajusteAnalysisSchema.nullable(),
    totals: packageTotalsSchema,
    parecer: technicalOpinionSchema,
    rechecks: z.array(recheckSchema),
    guardrails: z.array(guardrailSchema),
    fechamentoId: z.string().nullable(),
    storagePath: z.string().nullable(),
  })
  .strict()

export type PackageAnalysis = z.infer<typeof packageAnalysisSchema>

export const processingEventSchema = z
  .object({
    type: z.enum([
      "workflow_started",
      "file_saved",
      "document_classified",
      "extraction_started",
      "extraction_completed",
      "validation_started",
      "validation_completed",
      "persistence_completed",
      "workflow_completed",
      "workflow_failed",
    ]),
    message: z.string(),
    fileName: z.string().optional(),
    documentType: documentTypeSchema.optional(),
    progress: z.number().min(0).max(100),
    result: packageAnalysisSchema.optional(),
    error: z.string().optional(),
  })
  .strict()

export type ProcessingEvent = z.infer<typeof processingEventSchema>

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
