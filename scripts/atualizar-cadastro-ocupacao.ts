/**
 * Leva ao cadastro (`imoveis.status`, `imoveis.inquilino_nome`) a ocupação dos
 * fechamentos JÁ APROVADOS — os aprovados antes de a aprovação passar a fazer
 * isso sozinha (2026-09-17). Mesma função e mesmas guardas da aprovação
 * (`atualizarCadastroOcupacaoDoFechamento`), do mais antigo para o mais novo,
 * então o último fechamento de cada par é o que fica valendo.
 *
 *   npx tsx scripts/atualizar-cadastro-ocupacao.ts              # dry-run: só mostra
 *   npx tsx scripts/atualizar-cadastro-ocupacao.ts --aplicar    # escreve
 *   npx tsx scripts/atualizar-cadastro-ocupacao.ts <fechamentoId> [--aplicar]
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function loadEnvLocal() {
  const caminho = join(process.cwd(), ".env.local")
  if (!existsSync(caminho)) return
  for (const bruta of readFileSync(caminho, "utf-8").split("\n")) {
    const linha = bruta.trim()
    if (!linha || linha.startsWith("#")) continue
    const igual = linha.indexOf("=")
    if (igual < 0) continue
    const chave = linha.slice(0, igual).trim()
    if (!(chave in process.env)) {
      process.env[chave] = linha.slice(igual + 1).trim().replace(/^["']|["']$/g, "")
    }
  }
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const aplicar = args.includes("--aplicar")
  const alvo = args.find((arg) => !arg.startsWith("--")) ?? null

  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const { atualizarCadastroOcupacaoDoFechamento, STATUS_APROVADOS } = await import("../lib/server/cadastro-ocupacao")
  const supabase = createSupabaseAdmin()

  let query = supabase
    .from("fechamentos")
    .select("id,competencia,status,empreendimentos(nome)")
    .eq("arquivado", false)
    .order("competencia", { ascending: true })
  query = alvo ? query.eq("id", alvo) : query.in("status", STATUS_APROVADOS)
  const { data, error } = await query
  if (error) throw error

  const fechamentos = (data ?? []) as Array<{
    id: string
    competencia: string
    status: string
    empreendimentos: { nome: string } | { nome: string }[] | null
  }>

  console.log(`${aplicar ? "APLICANDO" : "DRY-RUN"} — ${fechamentos.length} fechamento(s) aprovado(s)`)
  let total = 0
  for (const f of fechamentos) {
    const nome = Array.isArray(f.empreendimentos) ? f.empreendimentos[0]?.nome : f.empreendimentos?.nome
    const mudancas = await atualizarCadastroOcupacaoDoFechamento(supabase, f.id, { dryRun: !aplicar, usuario: "Sistema" })
    if (mudancas.length === 0) continue
    total += mudancas.length
    console.log(`\n${nome ?? "?"} ${String(f.competencia).slice(0, 7)} (${f.status}) — ${f.id}`)
    for (const m of mudancas) {
      console.log(`  ${m.unidade.padEnd(10)} ${m.statusAnterior}${m.inquilinoAnterior ? ` (${m.inquilinoAnterior})` : ""} -> ${m.statusNovo}${m.inquilinoNovo ? ` (${m.inquilinoNovo})` : ""}`)
    }
  }
  console.log(`\n${total} mudança(s) ${aplicar ? "aplicada(s)" : "prevista(s)"}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
