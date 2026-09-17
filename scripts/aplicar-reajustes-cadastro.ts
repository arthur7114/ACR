/**
 * Aplica ao cadastro os reajustes declarados nos relatórios de reajuste de
 * fechamentos JÁ APROVADOS — os que foram aprovados antes de a aprovação
 * passar a fazer isso sozinha (2026-09-17).
 *
 * Mesma função e mesmas guardas da aprovação (`aplicarReajustesDoFechamento`):
 * só troca o cadastro que ainda está no valor anterior declarado pelo
 * documento, e registra em `auditoria_correcoes`.
 *
 *   npx tsx scripts/aplicar-reajustes-cadastro.ts              # dry-run: só mostra
 *   npx tsx scripts/aplicar-reajustes-cadastro.ts --aplicar    # escreve
 *   npx tsx scripts/aplicar-reajustes-cadastro.ts <fechamentoId> [--aplicar]
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

const STATUS_APROVADOS = ["aprovado", "preparado_egestor", "lancado_egestor", "erro_egestor"]

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const aplicar = args.includes("--aplicar")
  const alvo = args.find((arg) => !arg.startsWith("--")) ?? null

  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const { aplicarReajustesDoFechamento } = await import("../lib/server/reajuste-cadastro")
  const supabase = createSupabaseAdmin()

  let query = supabase
    .from("fechamentos")
    .select("id,competencia,status,analise_completa,empreendimentos(nome)")
    .eq("arquivado", false)
    .order("competencia", { ascending: true })
  query = alvo ? query.eq("id", alvo) : query.in("status", STATUS_APROVADOS)
  const { data, error } = await query
  if (error) throw error

  const fechamentos = (data ?? []) as Array<{
    id: string
    competencia: string
    status: string
    analise_completa: { reajuste?: { itens?: unknown[] } | null } | null
    empreendimentos: { nome: string } | { nome: string }[] | null
  }>
  const comReajuste = fechamentos.filter((f) => (f.analise_completa?.reajuste?.itens?.length ?? 0) > 0)

  console.log(`${aplicar ? "APLICANDO" : "DRY-RUN"} — ${comReajuste.length} fechamento(s) com relatório de reajuste`)
  for (const f of comReajuste) {
    const nome = Array.isArray(f.empreendimentos) ? f.empreendimentos[0]?.nome : f.empreendimentos?.nome
    const decisoes = await aplicarReajustesDoFechamento(supabase, f.id, { dryRun: !aplicar, usuario: "Sistema" })
    console.log(`\n${nome ?? "?"} ${String(f.competencia).slice(0, 7)} (${f.status}) — ${f.id}`)
    if (decisoes.length === 0) console.log("  nenhum item de reajuste aplicável")
    for (const d of decisoes) {
      console.log(`  apto ${d.apto}: ${d.resultado} — ${d.detalhe}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
