import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { testEgestorConnection } from "@/lib/server/egestor"
import type { EgestorImobiliariaContato } from "@/lib/egestor-types"

const GLOBAL_CONTA_ID = "00000000-0000-0000-0000-000000000001"

// Categorias padrao criadas quando uma nova conta e adicionada pela UI.
const DEFAULT_CATEGORIAS = [
  { categoria: "repasse_mensal", tipo_lancamento: "recebimento", descricao: "Repasse mensal consolidado" },
  { categoria: "comissao_administrativa", tipo_lancamento: "pagamento", descricao: "Comissao administrativa" },
  { categoria: "energia", tipo_lancamento: "pagamento", descricao: "Despesas de energia eletrica" },
  { categoria: "agua", tipo_lancamento: "pagamento", descricao: "Despesas de agua/esgoto" },
  { categoria: "iptu", tipo_lancamento: "pagamento", descricao: "Despesas de IPTU" },
  { categoria: "seguro", tipo_lancamento: "pagamento", descricao: "Despesas de seguro" },
  { categoria: "outras_despesas", tipo_lancamento: "pagamento", descricao: "Outras despesas" },
] as const

const contaSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1),
  personal_token: z.string().trim().min(1).optional(),
  cod_disponivel_padrao: z.coerce.number().int().positive().nullable().optional(),
  ativo: z.boolean().optional(),
})

const mapeamentoSchema = z.object({
  conta_id: z.string().uuid(),
  categoria: z.string().min(1),
  tipo_lancamento: z.enum(["recebimento", "pagamento"]),
  cod_plano_contas: z.coerce.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).default([]),
  ativo: z.boolean().default(true),
})

const contatoSchema = z.object({
  conta_id: z.string().uuid(),
  egestor_contato_id: z.coerce.number().int().positive().nullable().optional(),
})

const imobiliariaSchema = z.object({
  id: z.string().uuid(),
  egestor_tag_id: z.string().trim().nullable().optional(),
  contatos: z.array(contatoSchema).default([]),
})

const empreendimentoSchema = z.object({
  id: z.string().uuid(),
  egestor_tag_id: z.string().trim().nullable().optional(),
  egestor_conta_id: z.string().uuid().nullable().optional(),
})

const configSchema = z.object({
  contas: z.array(contaSchema).optional(),
  mapeamentos: z.array(mapeamentoSchema).optional(),
  imobiliarias: z.array(imobiliariaSchema).optional(),
  empreendimentos: z.array(empreendimentoSchema).optional(),
  testar_conexao_conta_id: z.string().uuid().optional(),
})

type SupabaseError = { message?: string; code?: string }

function isMissingRelation(error: SupabaseError | null, name: string) {
  if (!error) return false
  if (error.code === "42P01" || error.code === "42703") return true
  return typeof error.message === "string" && new RegExp(name, "i").test(error.message)
}

function fail(error: SupabaseError, status = 500) {
  return NextResponse.json({ error: error.message ?? "Erro inesperado." }, { status })
}

export async function GET() {
  const supabase = createSupabaseAdmin()

  const contasRes = await supabase.from("egestor_contas").select("*").order("nome")
  // Resiliencia: antes da migration multi-conta, le o singleton como conta Global.
  if (contasRes.error && isMissingRelation(contasRes.error, "egestor_contas")) {
    return legacyGet(supabase)
  }
  if (contasRes.error) return fail(contasRes.error)

  const [mapeamentos, imobiliarias, empreendimentos, contatos] = await Promise.all([
    supabase
      .from("egestor_mapeamentos_categoria")
      .select("conta_id,categoria,tipo_lancamento,cod_plano_contas,tags,descricao,ativo")
      .order("categoria"),
    supabase.from("imobiliarias").select("id,nome,egestor_tag_id").eq("ativo", true).order("nome"),
    supabase.from("empreendimentos").select("id,nome,egestor_tag_id,egestor_conta_id").eq("ativo", true).order("nome"),
    supabase.from("egestor_imobiliaria_contatos").select("imobiliaria_id,conta_id,egestor_contato_id"),
  ])

  const error = mapeamentos.error ?? imobiliarias.error ?? empreendimentos.error ?? contatos.error
  if (error) return fail(error)

  const contatosByImob = new Map<string, EgestorImobiliariaContato[]>()
  for (const row of contatos.data ?? []) {
    const list = contatosByImob.get(row.imobiliaria_id) ?? []
    list.push({ conta_id: row.conta_id, egestor_contato_id: row.egestor_contato_id })
    contatosByImob.set(row.imobiliaria_id, list)
  }

  return NextResponse.json({
    contas: (contasRes.data ?? []).map(normalizeConta),
    mapeamentos: mapeamentos.data ?? [],
    imobiliarias: (imobiliarias.data ?? []).map((imob) => ({
      ...imob,
      contatos: contatosByImob.get(imob.id) ?? [],
    })),
    empreendimentos: empreendimentos.data ?? [],
  })
}

export async function PATCH(request: Request) {
  const parsed = configSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()
  const { contas, mapeamentos, imobiliarias, empreendimentos, testar_conexao_conta_id } = parsed.data

  // 1. Contas (upsert). Token gravado apenas quando enviado nao-vazio.
  for (const conta of contas ?? []) {
    if (conta.id) {
      const changes: Record<string, unknown> = { nome: conta.nome }
      if (conta.personal_token) changes.personal_token = conta.personal_token
      if (conta.cod_disponivel_padrao !== undefined) changes.cod_disponivel_padrao = conta.cod_disponivel_padrao
      if (conta.ativo !== undefined) changes.ativo = conta.ativo
      const { error } = await supabase.from("egestor_contas").update(changes).eq("id", conta.id)
      if (error) return fail(error)
    } else {
      const insert: Record<string, unknown> = { nome: conta.nome, ativo: conta.ativo ?? true }
      if (conta.personal_token) insert.personal_token = conta.personal_token
      if (conta.cod_disponivel_padrao !== undefined) insert.cod_disponivel_padrao = conta.cod_disponivel_padrao
      const created = await supabase.from("egestor_contas").insert(insert).select("id").single()
      if (created.error) return fail(created.error)
      const seed = DEFAULT_CATEGORIAS.map((cat) => ({ conta_id: created.data.id, ...cat }))
      const { error: seedError } = await supabase
        .from("egestor_mapeamentos_categoria")
        .upsert(seed, { onConflict: "conta_id,categoria" })
      if (seedError) return fail(seedError)
    }
  }

  // 2. Planos de contas por conta.
  if ((mapeamentos ?? []).length > 0) {
    const rows = (mapeamentos ?? []).map((map) => ({
      conta_id: map.conta_id,
      categoria: map.categoria,
      tipo_lancamento: map.tipo_lancamento,
      cod_plano_contas: map.cod_plano_contas ?? null,
      tags: map.tags,
      ativo: map.ativo,
    }))
    const { error } = await supabase
      .from("egestor_mapeamentos_categoria")
      .upsert(rows, { onConflict: "conta_id,categoria" })
    if (error) return fail(error)
  }

  // 3. Imobiliarias: tag + contato por conta.
  for (const imob of imobiliarias ?? []) {
    const { error } = await supabase
      .from("imobiliarias")
      .update({ egestor_tag_id: normalizeText(imob.egestor_tag_id) })
      .eq("id", imob.id)
    if (error) return fail(error)

    const preenchidos = imob.contatos
      .filter((contato) => contato.egestor_contato_id != null)
      .map((contato) => ({
        imobiliaria_id: imob.id,
        conta_id: contato.conta_id,
        egestor_contato_id: contato.egestor_contato_id,
      }))
    const zerados = imob.contatos.filter((contato) => contato.egestor_contato_id == null).map((contato) => contato.conta_id)

    if (preenchidos.length > 0) {
      const { error: upsertError } = await supabase
        .from("egestor_imobiliaria_contatos")
        .upsert(preenchidos, { onConflict: "imobiliaria_id,conta_id" })
      if (upsertError) return fail(upsertError)
    }
    if (zerados.length > 0) {
      const { error: deleteError } = await supabase
        .from("egestor_imobiliaria_contatos")
        .delete()
        .eq("imobiliaria_id", imob.id)
        .in("conta_id", zerados)
      if (deleteError) return fail(deleteError)
    }
  }

  // 4. Empreendimentos: tag + conta de roteamento.
  for (const empreendimento of empreendimentos ?? []) {
    const { error } = await supabase
      .from("empreendimentos")
      .update({
        egestor_tag_id: normalizeText(empreendimento.egestor_tag_id),
        egestor_conta_id: empreendimento.egestor_conta_id ?? null,
      })
      .eq("id", empreendimento.id)
    if (error) return fail(error)
  }

  // 5. Teste de conexao de uma conta especifica.
  if (testar_conexao_conta_id) {
    try {
      await testEgestorConnection(supabase, testar_conexao_conta_id)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao testar eGestor." }, { status: 400 })
    }
  }

  return GET()
}

async function legacyGet(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const [config, mapeamentos, imobiliarias, empreendimentos] = await Promise.all([
    supabase.from("egestor_configuracoes").select("*").eq("id", true).single(),
    supabase
      .from("egestor_mapeamentos_categoria")
      .select("categoria,tipo_lancamento,cod_plano_contas,tags,descricao,ativo")
      .order("categoria"),
    supabase.from("imobiliarias").select("id,nome,egestor_contato_id,egestor_tag_id").eq("ativo", true).order("nome"),
    supabase.from("empreendimentos").select("id,nome,egestor_tag_id").eq("ativo", true).order("nome"),
  ])

  const error = config.error ?? mapeamentos.error ?? imobiliarias.error ?? empreendimentos.error
  if (error) return fail(error)

  return NextResponse.json({
    contas: [normalizeConta({ id: GLOBAL_CONTA_ID, nome: "Global", ...(config.data as Record<string, unknown>) })],
    mapeamentos: (mapeamentos.data ?? []).map((map) => ({ ...map, conta_id: GLOBAL_CONTA_ID })),
    imobiliarias: (imobiliarias.data ?? []).map((imob) => ({
      id: imob.id,
      nome: imob.nome,
      egestor_tag_id: imob.egestor_tag_id,
      contatos:
        imob.egestor_contato_id != null
          ? [{ conta_id: GLOBAL_CONTA_ID, egestor_contato_id: imob.egestor_contato_id }]
          : [],
    })),
    empreendimentos: (empreendimentos.data ?? []).map((emp) => ({ ...emp, egestor_conta_id: null })),
  })
}

function normalizeConta(conta: Record<string, unknown>) {
  const token = typeof conta.personal_token === "string" ? conta.personal_token : ""
  return {
    id: conta.id,
    nome: conta.nome,
    token_configurado: token.length > 0,
    token_mascarado: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : null,
    cod_disponivel_padrao: conta.cod_disponivel_padrao ?? null,
    ativo: Boolean(conta.ativo),
    ultimo_teste_status: conta.ultimo_teste_status ?? null,
    ultimo_teste_mensagem: conta.ultimo_teste_mensagem ?? null,
    ultimo_teste_em: conta.ultimo_teste_em ?? null,
  }
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
