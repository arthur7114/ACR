import { z } from "zod"

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

export type IptuResponsavel = "inquilino" | "proprietario"

export type IptuCarne = {
  id: string
  imovel_id: string
  ano_referencia: number
  numero_parcelas: number
  criado_em: string
  atualizado_em: string
}

export type IptuParcela = {
  id: string
  carne_id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  origem_importacao_id: string | null
  registrado_em: string | null
}

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

export const iptuParcelaPatchSchema = z
  .object({
    responsavel: z.enum(["inquilino", "proprietario"]),
  })
  .strict()

export const iptuCarnePatchSchema = z
  .object({
    numero_parcelas: z.number().int().positive(),
  })
  .strict()
