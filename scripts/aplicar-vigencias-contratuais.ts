// Corrige `imovel_vigencias.aluguel_contratado` quando o cadastro ficou defasado
// em relacao ao que o documento da competencia comprova. Sintoma na tela: a
// carteira aparece recebendo MAIS do que o contratado, o que e impossivel e e
// exatamente o numero que o cliente confere na planilha.
//
// Duas fontes, nesta ordem de autoridade:
//
//   A. Relatorio de vigencia da imobiliaria (documento 3), secoes ATUALIZACAO
//      MONETARIA e APARTAMENTO ALUGADO. Guardrail: o valor "anterior" impresso
//      precisa bater com o cadastrado; se nao bater, a linha e RECUSADA em vez
//      de sobrescrever um valor que veio de outra origem.
//
//   B. Coluna ALUGUEL da prestacao, so em mes cheio (sem PROPORCIONAL) e so
//      quando comprova valor MAIOR que o cadastrado. Mesmo precedente do reparo
//      Pompilio/Cesar Rego (migration 202608120001): a prestacao e fonte aceita
//      do aluguel contratado quando nao ha relatorio de reajuste.
//
// Nunca reduz valor sem documento, nunca toca unidade de receita variavel
// (Airbnb, sem aluguel fixo) e nunca inventa vigencia para linha sem imovel
// vinculado. Dry-run por padrao.
//
// Uso:
//   node --import tsx scripts/aplicar-vigencias-contratuais.ts [--competencia 2026-07-01] [--commit]
//
// Depois de --commit, rode o reparador para os snapshots relerem as vigencias:
//   node --import tsx scripts/repair-indicadores-confiabilidade.ts --competencia 2026-07-01 --commit
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { extractPdfTextLines } from "@/lib/server/cesar-rego-parser"
import { parseRelatorioReajuste, type RelatorioReajuste } from "@/lib/server/reajuste-relatorio-parser"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"
import type { PackageAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"

const BUCKET = "fechamento-documentos"

type Origem = "relatorio_reajuste" | "relatorio_contrato_novo" | "prestacao_mes_cheio"

interface Ajuste {
  empreendimento: string
  unidade: string
  imovelId: string
  imobiliariaId: string
  empreendimentoId: string
  vigenciaAtualId: string | null
  vigenciaAtualInicio: string | null
  valorAnterior: number | null
  valorNovo: number
  garagemNova: number | null
  vigenciaInicio: string
  origem: Origem
  fonte: string
  documentoFonteId: string | null
  fechamentoId: string
}

interface Recusa {
  empreendimento: string
  unidade: string
  motivo: string
}

const dinheiro = (valor: number | null) => (valor === null ? "—" : valor.toFixed(2))

function primeiroDiaDoMes(competencia: string) {
  return `${competencia.slice(0, 7)}-01`
}

// Convencao do banco (ver 202608120001): a vigencia encerrada recebe como
// `vigencia_fim` o PRIMEIRO DIA do ultimo mes que ela cobre, nao o ultimo dia.
function fimDaVigenciaAnterior(competencia: string) {
  const [ano, mes] = competencia.slice(0, 7).split("-").map(Number)
  const anterior = new Date(Date.UTC(ano, mes - 2, 1))
  return anterior.toISOString().slice(0, 10)
}

function ehMesCheio(linha: ReceitaPorImovel) {
  return !/proporcional/i.test(linha.observacao ?? "")
}

function ehReceitaVariavel(linha: ReceitaPorImovel) {
  return /air\s*bnb/i.test(`${linha.inquilino ?? ""} ${linha.observacao ?? ""}`)
}

async function carregarRelatorio(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  fechamentoId: string,
): Promise<{ relatorio: RelatorioReajuste; documentoId: string } | null> {
  const { data, error } = await supabase
    .from("documentos_fechamento")
    .select("id,nome_arquivo,arquivo_url,tipo_documento")
    .eq("fechamento_id", fechamentoId)
  if (error) throw error
  // O documento pode estar classificado como `desconhecido` (a classificacao da
  // IA ficou abaixo do limiar). O nome do arquivo decide, nao o rotulo. O nome
  // vem do upload em NFD ("RELATO" + acento combinante), entao comparar sem
  // normalizar nunca casa "RELATORIO".
  const semAcento = (valor: string) =>
    valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  const candidato = (data ?? []).find(
    (documento) =>
      documento.tipo_documento === "relatorio_reajuste" ||
      semAcento(documento.nome_arquivo ?? "").includes("RELATORIO"),
  )
  if (!candidato?.arquivo_url) return null

  const download = await supabase.storage.from(BUCKET).download(candidato.arquivo_url)
  if (download.error) {
    console.warn(`  aviso: relatório ${candidato.nome_arquivo} indisponível no Storage (${download.error.message}).`)
    return null
  }
  const buffer = Buffer.from(await download.data.arrayBuffer())
  const linhas = await extractPdfTextLines(buffer)
  try {
    return { relatorio: parseRelatorioReajuste(linhas.map((linha) => linha.text).join("\n")), documentoId: candidato.id }
  } catch (erro) {
    console.warn(`  aviso: ${candidato.nome_arquivo} não é um relatório de vigência legível (${(erro as Error).message}).`)
    return null
  }
}

async function montarPlano(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  competencia: string,
) {
  const ajustes: Ajuste[] = []
  const recusas: Recusa[] = []

  const { data: fechamentos, error } = await supabase
    .from("fechamentos")
    .select("id,competencia,imobiliaria_id,empreendimento_id,analise_completa,empreendimentos(nome)")
    .eq("competencia", competencia)
  if (error) throw error

  for (const fechamento of fechamentos ?? []) {
    const nome = (fechamento.empreendimentos as { nome?: string } | null)?.nome ?? String(fechamento.id)
    const analise = fechamento.analise_completa as PackageAnalysis | null
    const linhas = analise?.prestacao?.receitas_por_imovel ?? []
    if (linhas.length === 0) continue

    console.log(`\n### ${nome}`)
    const relatorio = await carregarRelatorio(supabase, fechamento.id as string)
    if (relatorio) {
      console.log(
        `  relatório de vigência lido: ${relatorio.relatorio.reajustes.length} reajuste(s), ${relatorio.relatorio.novosContratos.length} contrato(s) novo(s).`,
      )
    } else {
      console.log("  sem relatório de vigência; fonte será a prestação (mês cheio).")
    }

    const { data: imoveis, error: erroImoveis } = await supabase
      .from("imoveis")
      .select("id,unidade,codigo_imobiliaria,imobiliaria_id,empreendimento_id")
      .eq("empreendimento_id", fechamento.empreendimento_id)
      .eq("ativo", true)
    if (erroImoveis) throw erroImoveis

    const { data: vigencias, error: erroVigencias } = await supabase
      .from("imovel_vigencias")
      .select("id,imovel_id,vigencia_inicio,vigencia_fim,modelo_receita,aluguel_contratado")
      .in("imovel_id", (imoveis ?? []).map((imovel) => imovel.id))
      .eq("ativo", true)
    if (erroVigencias) throw erroVigencias

    const inicioCompetencia = primeiroDiaDoMes(competencia)
    const vigenciaVigente = new Map<string, (typeof vigencias)[number]>()
    for (const vigencia of vigencias ?? []) {
      if (vigencia.vigencia_inicio > inicioCompetencia) continue
      if (vigencia.vigencia_fim && vigencia.vigencia_fim < inicioCompetencia) continue
      vigenciaVigente.set(vigencia.imovel_id, vigencia)
    }

    const porReajuste = new Map(relatorio?.relatorio.reajustes.map((item) => [item.apto, item]) ?? [])
    const porContratoNovo = new Map(relatorio?.relatorio.novosContratos.map((item) => [item.apto, item]) ?? [])

    for (const linha of linhas) {
      const imovel = (imoveis ?? []).find(
        (candidato) =>
          normalizeCodigoImovel(candidato.unidade ?? "") === normalizeCodigoImovel(linha.apto) ||
          normalizeCodigoImovel(candidato.codigo_imobiliaria ?? "") === normalizeCodigoImovel(linha.apto),
      )
      if (!imovel) {
        recusas.push({ empreendimento: nome, unidade: linha.apto, motivo: "sem imóvel cadastrado" })
        continue
      }
      if (ehReceitaVariavel(linha)) continue

      const vigencia = vigenciaVigente.get(imovel.id) ?? null
      if (vigencia && vigencia.modelo_receita !== "fixo") continue
      const atual = vigencia?.aluguel_contratado ?? null

      const chave = String(Number(linha.apto) || linha.apto)
      const reajuste = porReajuste.get(chave)
      const contratoNovo = porContratoNovo.get(chave)

      let valorNovo: number | null = null
      let garagemNova: number | null = null
      let origem: Origem = "prestacao_mes_cheio"
      let vigenciaInicio = inicioCompetencia
      let fonte = ""

      if (reajuste) {
        // Ja aplicado: o cadastro esta no valor novo do relatorio. Re-execucao
        // e silenciosa em vez de virar recusa (o script e idempotente).
        if (atual !== null && Math.abs(atual - reajuste.aluguelNovo) <= 0.01) continue
        // Guardrail: o "anterior" impresso tem de bater com o cadastrado.
        if (atual !== null && Math.abs(atual - (reajuste.aluguelAnterior ?? Number.NaN)) > 0.01) {
          recusas.push({
            empreendimento: nome,
            unidade: linha.apto,
            motivo: `relatório diz anterior ${dinheiro(reajuste.aluguelAnterior)} mas cadastro tem ${dinheiro(atual)}`,
          })
          continue
        }
        valorNovo = reajuste.aluguelNovo
        garagemNova = reajuste.garagemNova
        origem = "relatorio_reajuste"
        fonte = `Relatório de vigência ${competencia.slice(0, 7)} — atualização monetária`
      } else if (contratoNovo) {
        valorNovo = contratoNovo.aluguel
        garagemNova = contratoNovo.garagem
        origem = "relatorio_contrato_novo"
        // A tabela exige vigencia_inicio no dia 1 (granularidade mensal, check
        // `imovel_vigencias_competencia_inicio_check`). A data real do contrato
        // fica registrada na fonte para nao se perder.
        vigenciaInicio = inicioCompetencia
        fonte = contratoNovo.vigenciaInicio
          ? `Relatório de vigência ${competencia.slice(0, 7)} — contrato novo desde ${contratoNovo.vigenciaInicio}`
          : `Relatório de vigência ${competencia.slice(0, 7)} — contrato novo`
      } else if (ehMesCheio(linha) && (linha.aluguel ?? 0) > 0 && (atual === null || linha.aluguel! > atual + 0.01)) {
        // Só a direção defasada: o documento comprova cobrança MAIOR que o
        // cadastro. Reduzir valor exigiria evidência que a prestação não dá.
        valorNovo = linha.aluguel!
        origem = "prestacao_mes_cheio"
        fonte = `Prestação de contas ${competencia.slice(0, 7)} — coluna ALUGUEL (mês cheio)`
      }

      if (valorNovo === null) continue
      if (atual !== null && Math.abs(valorNovo - atual) <= 0.01) continue

      ajustes.push({
        empreendimento: nome,
        unidade: linha.apto,
        imovelId: imovel.id,
        imobiliariaId: imovel.imobiliaria_id,
        empreendimentoId: imovel.empreendimento_id,
        vigenciaAtualId: vigencia?.id ?? null,
        vigenciaAtualInicio: vigencia?.vigencia_inicio ?? null,
        valorAnterior: atual,
        valorNovo,
        garagemNova,
        vigenciaInicio,
        origem,
        fonte,
        documentoFonteId: relatorio?.documentoId ?? null,
        fechamentoId: fechamento.id as string,
      })
    }
  }

  return { ajustes, recusas }
}

async function aplicar(supabase: ReturnType<typeof createSupabaseAdmin>, ajustes: Ajuste[], competencia: string) {
  const fim = fimDaVigenciaAnterior(competencia)
  for (const ajuste of ajustes) {
    // Encerra a vigência anterior em vez de sobrescrevê-la: o histórico do
    // valor antigo é o que explica os meses já fechados. Só encerra quando o
    // fim calculado é POSTERIOR ao início dela — fechar uma vigência com fim
    // antes do próprio início criaria um intervalo impossível.
    if (
      ajuste.vigenciaAtualId &&
      ajuste.vigenciaAtualInicio &&
      ajuste.vigenciaAtualInicio < ajuste.vigenciaInicio &&
      ajuste.vigenciaAtualInicio <= fim
    ) {
      const { error } = await supabase
        .from("imovel_vigencias")
        .update({ vigencia_fim: fim })
        .eq("id", ajuste.vigenciaAtualId)
      if (error) throw error
    } else if (ajuste.vigenciaAtualId) {
      const { error } = await supabase.from("imovel_vigencias").delete().eq("id", ajuste.vigenciaAtualId)
      if (error) throw error
    }

    const { error: erroInsert } = await supabase.from("imovel_vigencias").insert({
      imovel_id: ajuste.imovelId,
      imobiliaria_id: ajuste.imobiliariaId,
      empreendimento_id: ajuste.empreendimentoId,
      vigencia_inicio: ajuste.vigenciaInicio,
      vigencia_fim: null,
      modelo_receita: "fixo",
      aluguel_contratado: ajuste.valorNovo,
      garagem_contratada: ajuste.garagemNova,
      fonte: ajuste.fonte,
      documento_fonte_id: ajuste.documentoFonteId,
      ativo: true,
    })
    if (erroInsert) throw erroInsert

    const { error: erroImovel } = await supabase
      .from("imoveis")
      .update({ valor_aluguel_esperado: ajuste.valorNovo })
      .eq("id", ajuste.imovelId)
    if (erroImovel) throw erroImovel

    const { error: erroAuditoria } = await supabase.from("auditoria_correcoes").insert({
      fechamento_id: ajuste.fechamentoId,
      usuario: "Sistema",
      campo_alterado: `imovel_vigencias.aluguel_contratado[${ajuste.unidade}]`,
      valor_anterior: ajuste.valorAnterior === null ? "" : String(ajuste.valorAnterior),
      valor_novo: String(ajuste.valorNovo),
      justificativa: ajuste.fonte,
    })
    if (erroAuditoria) throw erroAuditoria
  }
}

function parseArgs(argv: string[]) {
  let competencia = "2026-07-01"
  let commit = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--commit") { commit = true; continue }
    if (argv[i] === "--competencia") { competencia = argv[i + 1] ?? competencia; i += 1; continue }
    throw new Error(`Argumento desconhecido: ${argv[i]}`)
  }
  return { competencia, commit }
}

async function main() {
  const { competencia, commit } = parseArgs(process.argv.slice(2))
  const supabase = createSupabaseAdmin()
  const { ajustes, recusas } = await montarPlano(supabase, competencia)

  console.log(`\n=== PLANO (${competencia}) ===`)
  const porOrigem = new Map<Origem, number>()
  for (const ajuste of ajustes) porOrigem.set(ajuste.origem, (porOrigem.get(ajuste.origem) ?? 0) + 1)
  for (const ajuste of ajustes) {
    console.log(
      `  ${ajuste.empreendimento} apto ${ajuste.unidade}: ${dinheiro(ajuste.valorAnterior)} -> ${dinheiro(ajuste.valorNovo)}` +
        `${ajuste.garagemNova !== null ? ` (garagem ${dinheiro(ajuste.garagemNova)})` : ""} [${ajuste.origem}, desde ${ajuste.vigenciaInicio}]`,
    )
  }
  console.log(`\n  total: ${ajustes.length} ajuste(s)`)
  for (const [origem, quantidade] of porOrigem) console.log(`    ${origem}: ${quantidade}`)
  if (recusas.length > 0) {
    console.log(`\n  RECUSADOS (${recusas.length}):`)
    for (const recusa of recusas) console.log(`    ${recusa.empreendimento} apto ${recusa.unidade}: ${recusa.motivo}`)
  }

  if (!commit) {
    console.log("\n  MODO DRY-RUN: nenhuma escrita realizada.")
    return
  }
  await aplicar(supabase, ajustes, competencia)
  console.log(`\n  GRAVADO: ${ajustes.length} vigência(s) e ${ajustes.length} registro(s) de auditoria.`)
  console.log("  Rode agora: node --import tsx scripts/repair-indicadores-confiabilidade.ts --competencia " + competencia + " --commit")
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
