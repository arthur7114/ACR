import { z } from "zod"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { createSupabaseAdmin } from "./supabase"

const submittedContextSchema = z.object({ id: z.string().uuid() }).passthrough()

export function parseSubmittedFechamentoId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null
  try {
    const parsed = submittedContextSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.id : null
  } catch {
    return null
  }
}

export async function loadAuthoritativeFechamentoContext(id: string): Promise<FechamentoContext | null> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id,competencia,imobiliarias(nome),empreendimentos(nome)")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const imobiliaria = relationName(data.imobiliarias)
  const empreendimento = relationName(data.empreendimentos)
  if (!imobiliaria || !empreendimento) {
    throw new Error("Cadastro do fechamento incompleto.")
  }

  return {
    id: data.id,
    imobiliariaId: data.imobiliaria_id,
    imobiliariaNome: imobiliaria,
    empreendimentoId: data.empreendimento_id,
    empreendimentoNome: empreendimento,
    competencia: String(data.competencia).slice(0, 7),
  }
}

function relationName(value: unknown): string | null {
  if (Array.isArray(value)) return relationName(value[0])
  if (value && typeof value === "object" && typeof (value as { nome?: unknown }).nome === "string") {
    return (value as { nome: string }).nome
  }
  return null
}
