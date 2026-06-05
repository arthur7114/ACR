import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { testEgestorConnection } from "@/lib/server/egestor"

const categoriaSchema = z.object({
  categoria: z.string().min(1),
  cod_plano_contas: z.coerce.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).default([]),
  ativo: z.boolean().default(true),
})

const imobiliariaSchema = z.object({
  id: z.string().uuid(),
  egestor_contato_id: z.coerce.number().int().positive().nullable().optional(),
  egestor_tag_id: z.string().trim().nullable().optional(),
})

const empreendimentoSchema = z.object({
  id: z.string().uuid(),
  egestor_tag_id: z.string().trim().nullable().optional(),
})

const configSchema = z.object({
  personal_token: z.string().trim().min(1).optional(),
  ativo: z.boolean().optional(),
  cod_disponivel_padrao: z.coerce.number().int().positive().nullable().optional(),
  mapeamentos: z.array(categoriaSchema).optional(),
  imobiliarias: z.array(imobiliariaSchema).optional(),
  empreendimentos: z.array(empreendimentoSchema).optional(),
  testar_conexao: z.boolean().optional(),
})

export async function GET() {
  const supabase = createSupabaseAdmin()
  const [config, mapeamentos, imobiliarias, empreendimentos] = await Promise.all([
    supabase.from("egestor_configuracoes").select("*").eq("id", true).single(),
    supabase.from("egestor_mapeamentos_categoria").select("*").order("categoria"),
    supabase.from("imobiliarias").select("id,nome,egestor_contato_id,egestor_tag_id").eq("ativo", true).order("nome"),
    supabase.from("empreendimentos").select("id,nome,egestor_tag_id").eq("ativo", true).order("nome"),
  ])

  const error = config.error ?? mapeamentos.error ?? imobiliarias.error ?? empreendimentos.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    configuracao: normalizeConfig(config.data),
    mapeamentos: mapeamentos.data ?? [],
    imobiliarias: imobiliarias.data ?? [],
    empreendimentos: empreendimentos.data ?? [],
  })
}

export async function PATCH(request: Request) {
  const parsed = configSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()
  const { personal_token, ativo, cod_disponivel_padrao, mapeamentos, imobiliarias, empreendimentos, testar_conexao } = parsed.data
  const configChanges: Record<string, unknown> = {}
  if (personal_token) configChanges.personal_token = personal_token
  if (ativo !== undefined) configChanges.ativo = ativo
  if (cod_disponivel_padrao !== undefined) configChanges.cod_disponivel_padrao = cod_disponivel_padrao

  if (Object.keys(configChanges).length > 0) {
    const { error } = await supabase.from("egestor_configuracoes").update(configChanges).eq("id", true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const map of mapeamentos ?? []) {
    const { error } = await supabase
      .from("egestor_mapeamentos_categoria")
      .update({ cod_plano_contas: map.cod_plano_contas ?? null, tags: map.tags, ativo: map.ativo })
      .eq("categoria", map.categoria)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const imobiliaria of imobiliarias ?? []) {
    const { error } = await supabase
      .from("imobiliarias")
      .update({
        egestor_contato_id: imobiliaria.egestor_contato_id ?? null,
        egestor_tag_id: normalizeText(imobiliaria.egestor_tag_id),
      })
      .eq("id", imobiliaria.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const empreendimento of empreendimentos ?? []) {
    const { error } = await supabase
      .from("empreendimentos")
      .update({ egestor_tag_id: normalizeText(empreendimento.egestor_tag_id) })
      .eq("id", empreendimento.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (testar_conexao) {
    try {
      await testEgestorConnection(supabase)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao testar eGestor." }, { status: 400 })
    }
  }

  return GET()
}

function normalizeConfig(config: Record<string, unknown>) {
  const token = typeof config.personal_token === "string" ? config.personal_token : ""
  return {
    ativo: Boolean(config.ativo),
    token_configurado: token.length > 0,
    token_mascarado: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : null,
    cod_disponivel_padrao: config.cod_disponivel_padrao,
    ultimo_teste_status: config.ultimo_teste_status,
    ultimo_teste_mensagem: config.ultimo_teste_mensagem,
    ultimo_teste_em: config.ultimo_teste_em,
  }
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
