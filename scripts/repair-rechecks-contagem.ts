/**
 * Repara rechecks que expunham uma CONTAGEM (acordos/rescisões com
 * competência divergente, pagamentos possivelmente repetidos) como se fosse
 * um valor monetário em `actual`/`expected` — a lista de pendências e o modal
 * de resolução formatam ambos os campos como R$, então "3 acordos" aparecia
 * como "R$ 3,00" e o operador achava que precisava informar um valor.
 *
 * Toca apenas `analise_completa.rechecks` (metadado de conferência); não
 * altera prestacao, totals, status do fechamento nem nada já enviado ao
 * eGestor.
 *
 * Seguro por padrão:
 *   node --import tsx scripts/repair-rechecks-contagem.ts
 *
 * Escrita exige opt-in explícito:
 *   node --import tsx scripts/repair-rechecks-contagem.ts --commit
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PackageAnalysis } from "../lib/prestacao-types"
import { nullifyCountBasedRecheckValues } from "../lib/rechecks-contagem"

interface ClosureRow {
  id: string
  atualizado_em: string
  analise_completa: PackageAnalysis | null
}

export function parseArgs(argv: string[]) {
  return { commit: argv.includes("--commit") }
}

function loadEnvLocal() {
  const file = join(process.cwd(), ".env.local")
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}

async function loadClosures(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id,atualizado_em,analise_completa")
    .eq("arquivado", false)
  if (error) throw error
  return (data ?? []) as ClosureRow[]
}

async function commitClosure(
  supabase: SupabaseClient,
  closure: ClosureRow,
  analiseCompleta: PackageAnalysis,
) {
  const { data, error } = await supabase
    .from("fechamentos")
    .update({ analise_completa: analiseCompleta })
    .eq("id", closure.id)
    .eq("atualizado_em", closure.atualizado_em)
    .select("id")
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(`Fechamento ${closure.id} foi alterado por outra operação; reparo abortado para essa linha.`)
  }
}

async function main() {
  loadEnvLocal()
  const { commit } = parseArgs(process.argv.slice(2))
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const closures = await loadClosures(supabase)

  const report: Array<{ id: string; rechecksAfetados: string[] }> = []
  for (const closure of closures) {
    const analysis = closure.analise_completa
    if (!analysis?.rechecks) continue
    const { changed, rechecks } = nullifyCountBasedRecheckValues(analysis.rechecks)
    if (!changed) continue
    const rechecksAfetados = analysis.rechecks
      .filter((check, index) => check.actual !== rechecks[index]?.actual)
      .map((check) => check.id)
    report.push({ id: closure.id, rechecksAfetados })
    if (commit) {
      await commitClosure(supabase, closure, { ...analysis, rechecks })
    }
  }

  console.log(JSON.stringify({ mode: commit ? "commit" : "dry-run", total: closures.length, afetados: report.length, report }, null, 2))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : JSON.stringify(error))
    process.exitCode = 1
  })
}
