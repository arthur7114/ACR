/**
 * Importa o prazo dos contratos (início e término previsto) da planilha
 * CADASTRO INQUILINOS do cliente para o cadastro de imóveis. Regras e guardas
 * em `lib/server/planilha-inquilinos.ts`: só grava quando o inquilino da
 * planilha é o do cadastro, nunca regride contrato mais novo, nunca mexe em
 * inquilino, status ou aluguel (diferença de aluguel só é listada).
 *
 *   npx tsx scripts/importar-planilha-inquilinos.ts <planilha.xlsx>             # dry-run
 *   npx tsx scripts/importar-planilha-inquilinos.ts <planilha.xlsx> --aplicar   # escreve
 *
 * Depois, rode scripts/aplicar-prazos-relatorio.ts: os relatórios de vigência
 * aprovados após a referência da planilha trazem os contratos firmados depois.
 */
import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import * as XLSX from "xlsx"

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

const ORDEM = ["aplicar", "inquilino_divergente", "sem_data", "sem_inquilino", "sem_imovel", "cadastro_mais_recente", "ja_aplicado", "sem_prazo"]

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const aplicar = args.includes("--aplicar")
  const arquivo = args.find((arg) => !arg.startsWith("--"))
  if (!arquivo) throw new Error("Informe o caminho da planilha .xlsx.")

  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const { lerPlanilhaInquilinos, planejarImportacao } = await import("../lib/server/planilha-inquilinos")
  const { formatarDataCurta } = await import("../lib/contrato-prazo")
  const supabase = createSupabaseAdmin()

  const workbook = XLSX.readFile(arquivo)
  const aba = workbook.Sheets[workbook.SheetNames[0]]
  const bruto = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: null })
  const referencia = String((bruto[0] ?? [])[0] ?? "").trim()
  const linhas = lerPlanilhaInquilinos(bruto)

  const { data, error } = await supabase
    .from("imoveis")
    .select("id,unidade,codigo_imobiliaria,inquilino_nome,valor_aluguel_esperado,contrato_inicio,contrato_termino,contrato_locatario,empreendimentos(nome)")
    .eq("ativo", true)
  if (error) throw error
  const imoveis = (data ?? []).map((row) => {
    const relacao = row.empreendimentos as { nome: string } | { nome: string }[] | null
    return { ...row, empreendimento: (Array.isArray(relacao) ? relacao[0]?.nome : relacao?.nome) ?? "" }
  })

  const planos = planejarImportacao(linhas, imoveis).sort(
    (a, b) => ORDEM.indexOf(a.resultado) - ORDEM.indexOf(b.resultado) || a.linha.linha - b.linha.linha,
  )
  const fonte = `Planilha ${basename(arquivo)}${referencia ? ` (${referencia})` : ""}`
  console.log(`${aplicar ? "APLICANDO" : "DRY-RUN"} — ${fonte}: ${linhas.length} linhas`)

  let escritos = 0
  for (const plano of planos) {
    const alvo = plano.imovel ? `${plano.imovel.empreendimento} ${plano.imovel.unidade}` : `${plano.empreendimento} ${plano.linha.unidade}`
    const prazo = `${formatarDataCurta(plano.linha.inicio)} a ${formatarDataCurta(plano.linha.termino)}`
    const aluguel = plano.aluguelDivergente
      ? ` [aluguel planilha ${plano.aluguelDivergente.planilha.toFixed(2)} ≠ cadastro ${plano.aluguelDivergente.cadastro.toFixed(2)}]`
      : ""
    if (plano.resultado !== "sem_prazo") {
      console.log(`  L${String(plano.linha.linha).padEnd(3)} ${plano.resultado.padEnd(21)} ${alvo.padEnd(32)} ${prazo}  ${plano.detalhe}${aluguel}`)
    }
    if (!aplicar || plano.resultado !== "aplicar" || !plano.imovel) continue
    const { error: erro } = await supabase
      .from("imoveis")
      .update({
        contrato_inicio: plano.linha.inicio,
        contrato_termino: plano.linha.termino,
        contrato_locatario: plano.locatario,
        contrato_fonte: plano.locatario ? fonte : `${fonte}; locatário ${plano.linha.inquilino ?? "não informado"}`,
      })
      .eq("id", plano.imovel.id)
    if (erro) throw erro
    escritos++
  }

  const contagem = new Map<string, number>()
  for (const plano of planos) contagem.set(plano.resultado, (contagem.get(plano.resultado) ?? 0) + 1)
  console.log(`\nResumo: ${ORDEM.filter((r) => contagem.has(r)).map((r) => `${r}=${contagem.get(r)}`).join(", ")}`)
  if (aplicar) console.log(`${escritos} imóvel(is) atualizado(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
