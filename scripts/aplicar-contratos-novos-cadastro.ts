/**
 * Leva ao cadastro o aluguel dos contratos NOVOS dos fechamentos JÁ APROVADOS
 * (aprovados antes de a aprovação fazer isso sozinha, 2026-09-18). Mesma
 * função e mesmas guardas da aprovação (`aplicarContratosNovosDoFechamento`).
 *
 *   npx tsx scripts/aplicar-contratos-novos-cadastro.ts              # dry-run
 *   npx tsx scripts/aplicar-contratos-novos-cadastro.ts --aplicar    # escreve
 *   npx tsx scripts/aplicar-contratos-novos-cadastro.ts <fechamentoId> [--aplicar]
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
  const { aplicarContratosNovosDoFechamento } = await import("../lib/server/contrato-novo-cadastro")
  const { STATUS_APROVADOS } = await import("../lib/server/cadastro-ocupacao")
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
  for (const f of fechamentos) {
    const nome = Array.isArray(f.empreendimentos) ? f.empreendimentos[0]?.nome : f.empreendimentos?.nome
    const decisoes = await aplicarContratosNovosDoFechamento(supabase, f.id, { dryRun: !aplicar, usuario: "Sistema" })
    if (decisoes.length === 0) continue
    console.log(`\n${nome ?? "?"} ${String(f.competencia).slice(0, 7)} (${f.status}) — ${f.id}`)
    for (const d of decisoes) console.log(`  ${String(d.apto).padEnd(10)} ${d.resultado.padEnd(20)} ${d.detalhe}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
