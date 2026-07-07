import { z } from "zod"

// ---------------------------------------------------------------------------
// Legado: extracao de certidao por PDF (import). Mantido apenas por
// compatibilidade — nao faz parte da experiencia principal de contas a pagar.
// ---------------------------------------------------------------------------

export const iptuExtracaoApartamentoSchema = z
  .object({
    unidade: z.string().trim().min(1),
    parcelas_pagas: z.number().int().nonnegative(),
    ano_carne: z.number().int().nullable(),
  })
  .strict()

export const iptuExtracaoSchema = z
  .object({
    competencia_relatorio: z.string().regex(/^\d{2}\/\d{4}$/),
    apartamentos: z.array(iptuExtracaoApartamentoSchema),
  })
  .strict()

export type IptuExtracaoApartamento = z.infer<typeof iptuExtracaoApartamentoSchema>
export type IptuExtracao = z.infer<typeof iptuExtracaoSchema>

export type IptuAnomaliaTipo = "regressao" | "excede_carne"

export type IptuAnomalia = {
  unidade: string
  tipo: IptuAnomaliaTipo
  detalhe: string
}

export type IptuImportacao = {
  id: string
  empreendimento_id: string
  arquivo_nome: string
  arquivo_path: string
  competencia_relatorio: string
  resultado_bruto: IptuExtracao
  apartamentos_nao_vinculados: string[]
  anomalias: IptuAnomalia[]
  criado_em: string
}

// ---------------------------------------------------------------------------
// Contas a pagar manual (experiencia principal)
// ---------------------------------------------------------------------------

export type IptuResponsavel = "inquilino" | "proprietario"

export type IptuStatus = "aberto" | "vencido" | "pago"

export type IptuOrigem = "manual" | "importacao"

/** Parcela de IPTU como conta a pagar individual. */
export interface IptuParcela {
  id: string
  carneId: string
  imovelId: string
  ano: number
  numeroParcela: number
  dataVencimento: string | null
  valorPrevisto: number
  valorPago: number | null
  dataBaixa: string | null
  observacoes: string | null
  responsavel: IptuResponsavel | null
  origem: IptuOrigem
  status: IptuStatus
}

/** Item retornado por GET /api/iptu: parcela + dados do imovel para a tabela. */
export interface IptuParcelaListItem extends IptuParcela {
  unidade: string
  inquilinoNome: string | null
  imobiliariaId: string | null
  imobiliariaNome: string | null
  empreendimentoId: string | null
  empreendimentoNome: string | null
}

export interface IptuResumo {
  totalAberto: number
  totalVencido: number
  totalPago: number
  quantidadeVencidas: number
  proximoVencimento: string | null
}

export interface IptuPaginacao {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface IptuListaResponse {
  parcelas: IptuParcelaListItem[]
  pagination: IptuPaginacao
  resumo: IptuResumo
}

export interface IptuFiltros {
  imobiliariaId?: string
  empreendimentoId?: string
  imovelId?: string
  ano?: number
  status?: IptuStatus
  vencimentoInicio?: string
  vencimentoFim?: string
  mesVencimento?: string
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD.")

// POST /api/iptu/gerar
export const gerarIptuSchema = z
  .object({
    ano: z.number().int().min(2000).max(2100),
    imobiliariaId: z.string().uuid().optional(),
    empreendimentoId: z.string().uuid().optional(),
    imovelIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um imovel."),
    numeroParcelas: z.number().int().min(1).max(24),
    vencimentos: z.array(dateOnly).min(1, "Informe os vencimentos."),
    valorPadrao: z.number().finite().min(0).optional(),
    observacoes: z.string().trim().min(1).optional(),
    responsavel: z.enum(["inquilino", "proprietario"]).optional(),
    confirmarConflitos: z.boolean().optional(),
  })
  .refine((d) => d.vencimentos.length === d.numeroParcelas, {
    message: "A quantidade de vencimentos deve ser igual ao numero de parcelas.",
    path: ["vencimentos"],
  })

export type GerarIptuPayload = z.infer<typeof gerarIptuSchema>

// POST /api/iptu/parcelas/baixa
export const baixarIptuSchema = z.object({
  parcelaIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma parcela."),
  dataBaixa: dateOnly,
  valoresPagos: z.record(z.string(), z.number().finite().min(0)).optional(),
  observacoes: z.string().trim().min(1).optional(),
})

export type BaixarIptuParcelasPayload = z.infer<typeof baixarIptuSchema>

// PATCH /api/iptu/parcelas/[id]
export const iptuParcelaPatchSchema = z
  .object({
    dataVencimento: dateOnly.optional(),
    valorPrevisto: z.number().finite().min(0).optional(),
    observacoes: z.string().nullable().optional(),
    responsavel: z.enum(["inquilino", "proprietario"]).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Nenhum campo para atualizar.",
  })

export type IptuParcelaPatch = z.infer<typeof iptuParcelaPatchSchema>

// PATCH /api/iptu/carnes/[id]
export const iptuCarnePatchSchema = z
  .object({
    numero_parcelas: z.number().int().positive(),
  })
  .strict()
