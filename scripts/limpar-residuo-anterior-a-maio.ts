// Limpa o residuo anterior a maio/2026 que a limpeza de 2026-08-28 nao cobriu.
// Aquele script (scripts/sql/limpar-historico-anterior-a-maio.sql) tratou
// fechamentos, snapshots, movimentacoes, validacoes, documentos e eventos —
// todas essas tabelas ja estao em zero. Sobraram duas coisas:
//
//   lancamentos  Linhas de `lancamentos_competencia` escritas pelo backfill de
//                contratos. TODAS tem `fechamento_id` nulo (nao pertencem a
//                nenhum fechamento) e nenhum codigo da aplicacao le a tabela.
//                Apaga so o que e anterior a maio.
//
//   storage      Objetos do bucket sob o prefixo legado, sem nenhuma linha que
//                aponte para eles. Sao os binarios das prestacoes cujos
//                registros a limpeza anterior apagou.
//
// NAO TOCA no que tem data anterior a maio mas descreve contrato VIGENTE:
// `imovel_vigencias`, `contratos_locacao` e `contrato_valores`. Um contrato que
// comecou em janeiro e continua valendo precisa manter janeiro como inicio;
// apagar isso destroi a vigencia que cobre maio, junho e julho.
//
// Dry-run por padrao. Uso:
//   node --import tsx scripts/limpar-residuo-anterior-a-maio.ts [--parte lancamentos|storage|tudo] [--commit]
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"

const BUCKET = "fechamento-documentos"
const CORTE = "2026-05-01"

type Parte = "lancamentos" | "storage" | "tudo"

type Supabase = ReturnType<typeof createSupabaseAdmin>

async function limparLancamentos(supabase: Supabase, commit: boolean) {
  console.log("\n### lancamentos_competencia")
  const contar = async (filtro: (q: ReturnType<Supabase["from"]>) => unknown) => {
    const query = supabase.from("lancamentos_competencia").select("id", { count: "exact", head: true })
    const { count, error } = (await filtro(query as never)) as { count: number | null; error: unknown }
    if (error) throw error
    return count ?? 0
  }

  const anteriores = await contar((q) => (q as never as { lt: (a: string, b: string) => unknown }).lt("competencia_recebimento", CORTE))
  const vinculados = await contar((q) => (q as never as { not: (a: string, b: string, c: null) => unknown }).not("fechamento_id", "is", null))

  console.log(`  anteriores a maio: ${anteriores}`)
  console.log(`  ligados a algum fechamento (guarda, deve ser 0): ${vinculados}`)

  // Guarda: se alguma linha pertencer a um fechamento, o pressuposto de que a
  // tabela e residuo do backfill caiu — para em vez de apagar.
  if (vinculados > 0) {
    throw new Error(
      `Abortado: ${vinculados} lançamento(s) pertencem a um fechamento. A tabela deixou de ser resíduo do backfill.`,
    )
  }
  if (!commit) {
    console.log("  DRY-RUN: nada apagado.")
    return
  }
  const { error } = await supabase.from("lancamentos_competencia").delete().lt("competencia_recebimento", CORTE)
  if (error) throw error
  const restantes = await contar((q) => (q as never as { lt: (a: string, b: string) => unknown }).lt("competencia_recebimento", CORTE))
  if (restantes > 0) throw new Error(`Abortado: ainda restam ${restantes} lançamento(s) anteriores a maio.`)
  console.log(`  APAGADOS: ${anteriores} lançamento(s). Restam 0 anteriores a maio.`)
}

async function listarObjetos(supabase: Supabase, prefixo: string, acc: string[] = []): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefixo, { limit: 1000 })
  if (error) throw error
  for (const item of data ?? []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    // `id` nulo identifica pasta no Storage do Supabase.
    if (item.id === null) await listarObjetos(supabase, caminho, acc)
    else acc.push(caminho)
  }
  return acc
}

async function limparStorage(supabase: Supabase, commit: boolean) {
  console.log(`\n### Storage (${BUCKET})`)
  const objetos = await listarObjetos(supabase, "")

  // Referencia vem das DUAS tabelas que apontam para o bucket. Ler so uma
  // classificaria como orfao um arquivo que a outra ainda usa.
  const documentos = await supabase.from("documentos_fechamento").select("arquivo_url")
  if (documentos.error) throw documentos.error
  const fontes = await supabase.from("documento_fontes").select("arquivo_url")
  if (fontes.error) throw fontes.error

  const referenciados = new Set(
    [...documentos.data, ...fontes.data]
      .map((linha) => (linha as { arquivo_url: string | null }).arquivo_url)
      .filter((valor): valor is string => Boolean(valor)),
  )
  const orfaos = objetos.filter((caminho) => !referenciados.has(caminho))
  // Referencia no banco apontando para arquivo que NAO existe. E o inverso do
  // orfao e precisa ser medido ANTES de apagar: senao a conferencia final
  // acusa como dano do proprio script algo que ja estava quebrado.
  const existentes = new Set(objetos)
  const pendentesAntes = [...referenciados].filter((caminho) => !existentes.has(caminho))

  console.log(`  objetos no bucket: ${objetos.length}`)
  console.log(`  referenciados no banco: ${referenciados.size}`)
  console.log(`  órfãos (arquivo sem registro): ${orfaos.length}`)
  console.log(`  referências quebradas (registro sem arquivo, pré-existentes): ${pendentesAntes.length}`)
  if (pendentesAntes.length > 0) {
    for (const caminho of pendentesAntes) console.log(`    ${caminho}`)
  }

  // Guarda de sanidade: se a lista de referencias vier vazia, alguma consulta
  // mudou de forma e TUDO viraria orfao. Nao apaga nesse estado.
  if (referenciados.size === 0 && objetos.length > 0) {
    throw new Error("Abortado: nenhuma referência encontrada no banco; a checagem de órfãos não é confiável.")
  }
  if (orfaos.length === 0) {
    console.log("  Nada a apagar.")
    return
  }
  if (!commit) {
    console.log(`  DRY-RUN: nada apagado. Exemplos: ${orfaos.slice(0, 3).join(", ")}`)
    return
  }

  // Remove em lotes; a API aceita ate 1000 caminhos por chamada.
  for (let inicio = 0; inicio < orfaos.length; inicio += 100) {
    const lote = orfaos.slice(inicio, inicio + 100)
    const { error } = await supabase.storage.from(BUCKET).remove(lote)
    if (error) throw error
  }

  const restantes = await listarObjetos(supabase, "")
  const sobrando = new Set(restantes)
  const aindaOrfaos = restantes.filter((caminho) => !referenciados.has(caminho))
  // So alarma o que o proprio delete quebrou: referencia que tinha arquivo
  // antes e nao tem depois. As pre-existentes ja foram listadas acima.
  const conhecidas = new Set(pendentesAntes)
  const quebradasPeloScript = [...referenciados].filter(
    (caminho) => !sobrando.has(caminho) && !conhecidas.has(caminho),
  )
  console.log(`  APAGADOS: ${orfaos.length} objeto(s). Restam ${restantes.length} no bucket, ${aindaOrfaos.length} órfão(s).`)
  if (quebradasPeloScript.length > 0) {
    throw new Error(
      `ATENÇÃO: o delete removeu ${quebradasPeloScript.length} objeto(s) referenciado(s): ${quebradasPeloScript.slice(0, 5).join(", ")}`,
    )
  }
  if (pendentesAntes.length > 0) {
    console.log(
      `  ${pendentesAntes.length} referência(s) quebrada(s) continuam quebradas — já estavam assim antes desta execução.`,
    )
  }
}

function parseArgs(argv: string[]) {
  let parte: Parte = "tudo"
  let commit = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--commit") { commit = true; continue }
    if (argv[i] === "--parte") {
      const valor = argv[i + 1]
      if (valor !== "lancamentos" && valor !== "storage" && valor !== "tudo") {
        throw new Error(`--parte aceita lancamentos, storage ou tudo; recebeu "${valor}".`)
      }
      parte = valor
      i += 1
      continue
    }
    throw new Error(`Argumento desconhecido: ${argv[i]}`)
  }
  return { parte, commit }
}

async function main() {
  const { parte, commit } = parseArgs(process.argv.slice(2))
  const supabase = createSupabaseAdmin()
  console.log(`Limpeza de resíduo anterior a ${CORTE} — parte: ${parte}, modo: ${commit ? "COMMIT" : "dry-run"}`)
  if (parte === "lancamentos" || parte === "tudo") await limparLancamentos(supabase, commit)
  if (parte === "storage" || parte === "tudo") await limparStorage(supabase, commit)
  if (!commit) console.log("\nNenhuma escrita realizada. Repita com --commit para aplicar.")
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
