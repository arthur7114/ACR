import { z } from "zod"

const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}, z.string().nullable().optional())

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null
  if (typeof value === "string") return Number(value.replace(",", "."))
  return value
}, z.number().finite().nullable().optional())

export const idSchema = z.object({
  id: z.string().uuid(),
})

export const imobiliariaInputSchema = z.object({
  nome: z.string().trim().min(1),
  cnpj: optionalText,
  email: optionalText,
  telefone: optionalText,
  layout: z.string().trim().min(1).default("outro"),
  ativo: z.boolean().default(true),
  tolerancia_repasse_reais: optionalNumber.default(0.1),
  janela_antes_dias: z.coerce.number().int().min(0).default(15),
  janela_depois_dias: z.coerce.number().int().min(0).default(45),
  egestor_tag_id: optionalText,
  observacoes: optionalText,
})

export const imobiliariaPatchSchema = imobiliariaInputSchema.partial().extend({
  id: z.string().uuid(),
})

export const empreendimentoInputSchema = z.object({
  nome: z.string().trim().min(1),
  codigo: optionalText,
  descricao: optionalText,
  endereco: optionalText,
  ativo: z.boolean().default(true),
  egestor_tag_id: optionalText,
})

export const empreendimentoPatchSchema = empreendimentoInputSchema.partial().extend({
  id: z.string().uuid(),
})

export const imovelStatusSchema = z.enum(["ocupado", "vago", "inadimplente", "em_rescisao", "em_negociacao", "inativo"])

export const imovelInputSchema = z.object({
  empreendimento_id: z.string().uuid(),
  imobiliaria_id: z.string().uuid(),
  codigo_imobiliaria: z.string().trim().min(1),
  unidade: z.string().trim().min(1),
  tipo: optionalText,
  inquilino_nome: optionalText,
  status: imovelStatusSchema.default("ocupado"),
  valor_aluguel_esperado: optionalNumber,
  taxa_administracao_percent: optionalNumber,
  ativo: z.boolean().default(true),
  egestor_tag_id: optionalText,
  observacoes: optionalText,
})

export const imovelPatchSchema = imovelInputSchema.partial().extend({
  id: z.string().uuid(),
})

export const fechamentoInputSchema = z.object({
  imobiliaria_id: z.string().uuid(),
  empreendimento_id: z.string().uuid(),
  competencia: z.string().regex(/^\d{4}-\d{2}-01$/),
  observacoes: optionalText,
})

export function parseJson<T>(schema: z.ZodSchema<T>, value: unknown) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return {
      data: null,
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    }
  }

  return { data: parsed.data, error: null }
}

export function normalizeCsvHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}
