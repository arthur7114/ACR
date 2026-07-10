/**
 * Auditoria (read-only) dos indicadores: roda getIndicadores headless contra o
 * banco real e imprime os KPIs para conferência. Não grava nada.
 *   npx tsx scripts/audit-indicadores.ts
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { getIndicadores } from "../lib/server/indicadores"

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local")
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, "utf-8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    if (!(k in process.env)) process.env[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
  }
}
loadEnvLocal()

const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

async function dump(label: string, q: Parameters<typeof getIndicadores>[0]) {
  const d = await getIndicadores(q)
  console.log(`\n########## ${label} ##########`)
  console.log(`competência ref: ${d.competencia} (${d.competenciaLabel})`)
  console.log(`competências disp.: ${d.competenciasDisponiveis.map((c) => c.value).join(", ")}`)
  console.log(`empresas: ${d.empresas.map((e) => e.id).join(", ")}`)
  console.log(`empreendimentos (opts): ${d.empreendimentos.map((e) => e.label).join(", ")}`)
  console.log(`--- KPIs financeiros (mês ref) ---`)
  console.log(`receita ${brl(d.receita)} | taxaTotal ${brl(d.taxaTotal)} | repassar ${brl(d.totalRepassar)} | despOperacUnal ${brl(d.despesaOperacional)}`)
  console.log(`desp categoria: água ${brl(d.movimentacoes.despesaPorCategoria.agua)} | iptu ${brl(d.movimentacoes.despesaPorCategoria.iptu)} | seguro ${brl(d.movimentacoes.despesaPorCategoria.seguro)}`)
  console.log(`acordos ${d.movimentacoes.acordos.count}/${brl(d.movimentacoes.acordos.valor)} | rescisões ${d.movimentacoes.rescisoes.count}/${brl(d.movimentacoes.rescisoes.valor)} | descontos ${brl(d.movimentacoes.descontos)}`)
  console.log(`--- ocupação (estado atual do cadastro) ---`)
  console.log(`ocupados ${d.ocupacao.ocupados} | vagos ${d.ocupacao.vagos} | total ${d.ocupacao.total} | ocupação ${d.ocupacao.pct.toFixed(1)}% | vacânciaR$ ${brl(d.ocupacao.vacanciaValor)}`)
  console.log(`--- taxas ---`)
  console.log(`admin% ${d.percentuais.administracaoPct ?? "—"} | interm% ${d.percentuais.intermediacaoPct ?? "—"} | despOperac% ${d.percentuais.despesaOperacionalPct.toFixed(1)}`)
  console.log(`--- cascata ---`)
  console.log(`potencial ${brl(d.cascata.potencial)} | contratado ${brl(d.cascata.potencialContratado)} | realizado ${brl(d.cascata.realizado)} (${d.cascata.realizadoPct.toFixed(1)}%) | inadAcum ${brl(d.cascata.inadimplenciaAcumulada)}`)
  console.log(`ofensores: ${d.cascata.ofensores.map((o) => `${o.label} ${brl(o.valor)} (${o.pct.toFixed(1)}%)${o.pending ? " [pend]" : ""}`).join(" | ")}`)
  console.log(`--- série mensal ---`)
  console.log(d.serieMensal.map((s) => `${s.competencia}=${brl(s.receita)}`).join("  "))
  console.log(`--- ranking (${d.ranking.length}) top5 ---`)
  d.ranking.slice(0, 5).forEach((r) => console.log(`  ${r.empreendimento} ${r.apto} — esp ${brl(r.esperado)} real ${brl(r.realizado)} (${r.pct.toFixed(0)}%)`))
  console.log(`heat: inad ${d.heat.inad.length} emp, vac ${d.heat.vac.length} emp, inadApto ${d.heat.inadApto.length}, meses ${d.heat.meses.map((m) => m.value).join(",")}`)
  console.log(`registro: ${d.registro.length} linhas`)
  console.log(`pendências: ${d.pendencias.join(" || ") || "nenhuma"}`)
}

async function main() {
  await dump("DEFAULT (sem filtro → competência mais recente)", {})
  await dump("2026-03-01 (mês mais completo)", { competencia: "2026-03-01" })
  await dump("2026-01-01", { competencia: "2026-01-01" })
}

main().catch((e) => {
  console.error("FALHA:", e)
  process.exit(1)
})
