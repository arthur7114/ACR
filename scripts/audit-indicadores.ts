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
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`)

async function dump(label: string, q: Parameters<typeof getIndicadores>[0]) {
  const d = await getIndicadores(q)
  console.log(`\n########## ${label} ##########`)
  console.log(`competência ref: ${d.meta.competencia} (${d.meta.competenciaLabel})`)
  console.log(`qualidade: ${d.meta.qualidade} | base: ${d.meta.naturezaBase} | versão: ${d.meta.calculoVersao}`)
  console.log(`competências disp.: ${d.filtros.competencias.map((c) => c.value).join(", ")}`)
  console.log(`empresas: ${d.filtros.empresas.map((e) => e.value).join(", ")}`)
  console.log(`empreendimentos (opts): ${d.filtros.empreendimentos.map((e) => e.label).join(", ")}`)
  console.log(`--- cobertura ---`)
  console.log(`pares ${d.cobertura.pares.processados}/${d.cobertura.pares.esperados} (${pct(d.cobertura.pares.percentual)}) | imóveis ${d.cobertura.imoveis.snapshotsDisponiveis}/${d.cobertura.imoveis.esperados} (${pct(d.cobertura.imoveis.percentual)}) | desconhecidos ${d.cobertura.imoveis.snapshotsDesconhecidos} | linhas sem vínculo ${d.cobertura.linhasNaoVinculadas}`)
  console.log(`lacunas: ${d.cobertura.lacunas.map((gap) => `${gap.codigo}=${gap.quantidade}`).join(" | ") || "nenhuma"}`)
  console.log(`--- KPIs financeiros (mês ref) ---`)
  console.log(`receita ${brl(d.resumo.receitaTotal)} | aluguel contratado ${brl(d.resumo.aluguelContratado)} | recebido ${brl(d.resumo.aluguelRecebido)} | repasse ${brl(d.resumo.repasseApurado)}`)
  console.log(`comissão adm. ${brl(d.resumo.comissaoAdministracao)} | intermediação ${brl(d.resumo.comissaoIntermediacao)} | despesas retidas ${brl(d.resumo.despesasRetidas)}`)
  console.log(`despesa operacional detalhada: água ${brl(d.resumo.despesaOperacionalDetalhada.agua)} | iptu ${brl(d.resumo.despesaOperacionalDetalhada.iptu)} | seguro ${brl(d.resumo.despesaOperacionalDetalhada.seguro)} | total ${brl(d.resumo.despesaOperacionalDetalhada.total)}`)
  console.log(`repasse comprovado ${brl(d.resumo.repasseComprovado)} | informado no extrato ${brl(d.resumo.repasseInformadoExtrato)} | diferença ${brl(d.resumo.diferencaRepasse)}`)
  console.log(`--- ocupação ---`)
  console.log(`competência ${d.resumo.ocupacaoCompetencia.numerador}/${d.resumo.ocupacaoCompetencia.denominador} (${pct(d.resumo.ocupacaoCompetencia.percentual)}), desconhecidos ${d.resumo.ocupacaoCompetencia.desconhecidos} | hoje ${d.resumo.ocupacaoHoje.numerador}/${d.resumo.ocupacaoHoje.denominador} (${pct(d.resumo.ocupacaoHoje.percentual)})`)
  console.log(`--- ponte e realização ---`)
  console.log(`resíduo ${brl(d.ponteFinanceira.residuo)} | reconciliada ${d.ponteFinanceira.reconciliada ?? "—"} | alerta ${d.ponteFinanceira.alerta}`)
  console.log(`contratado ${brl(d.realizacaoAluguel.contratado)} | vacância ${brl(d.realizacaoAluguel.vacancia)} | inadimplência mês ${brl(d.realizacaoAluguel.inadimplenciaMes)} | descontos ${brl(d.realizacaoAluguel.descontos)} | ajustes ${brl(d.realizacaoAluguel.outrosAjustes)} | recebido ${brl(d.realizacaoAluguel.recebido)}`)
  console.log(`--- série mensal ---`)
  console.log(d.serieMensal.map((s) => `${s.competencia}=${brl(s.receitaTotal)} [${s.qualidade}]`).join("  "))
  console.log(`--- ranking (${d.rankingAtencao.length}) top5 ---`)
  d.rankingAtencao.slice(0, 5).forEach((r) => console.log(`  ${r.empreendimentoNome} ${r.unidade} — esp ${brl(r.esperado)} recebido ${brl(r.recebido)} gap ${brl(r.gapValor)}`))
  console.log(`heat: ${d.heat.linhas.length} imóveis, meses ${d.heat.meses.map((m) => m.competencia).join(",")}`)
  console.log(`receitas por imóvel: ${d.receitasPorImovel.length} linhas`)
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
