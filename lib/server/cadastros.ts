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

export const regraComercialInputSchema = z.object({
  imobiliaria_id: z.string().uuid(),
  empreendimento_id: z.string().uuid(),
  taxa_administracao_percent: z.coerce.number().finite().min(0).max(100),
  taxa_intermediacao_percent: z.coerce.number().finite().min(0).max(100),
  ativo: z.boolean().default(true),
})

export const regraComercialPatchSchema = regraComercialInputSchema.partial().extend({
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

export function normalizeCadastroKey(value: string | null | undefined) {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

// Compara um empreendimento cadastrado (nome + aliases opcionais) contra um
// r\u00f3tulo de entrada (documento/IA). Aliases permitem que uma varia\u00e7\u00e3o de nome
// (ex.: sufixo de fase/etapa) resolva para o MESMO registro/regra comercial,
// em vez de criar silenciosamente um empreendimento novo sem regra associada.
export function matchesEmpreendimento(
  row: { nome: string; aliases?: string[] | null },
  nome: string,
): boolean {
  const alvo = normalizeCadastroKey(nome)
  if (normalizeCadastroKey(row.nome) === alvo) return true
  return (row.aliases ?? []).some((alias) => normalizeCadastroKey(alias) === alvo)
}
