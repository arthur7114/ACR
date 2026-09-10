/**
 * Congela os fechamentos de uma competência como fixtures versionadas.
 *
 * Um replay em banco zerado precisa provar a LÓGICA, não a extração. A
 * extração por LLM não é determinística — não há `temperature` nem `seed`
 * fixados —, então reprocessar os PDFs mistura duas variáveis e torna
 * qualquer divergência inatribuível. Congelando `analise_completa`, o replay
 * responde só uma pergunta: dado este documento já lido, o pipeline produz os
 * mesmos snapshots?
 *
 * Cada arquivo é auto-contido: traz também os imóveis e as vigências do par,
 * que `loadActiveIndicadoresProperties` lê do banco. Assim a fixture roda sem
 * nenhuma linha pré-existente.
 *
 *   npx tsx scripts/exportar-fixtures-fechamento.ts 2026-07-01
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
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
loadEnvLocal()

interface FechamentoExportado {
  id: string
  competencia: string
  status: string
  imobiliaria_id: string
  empreendimento_id: string
  total_receitas: number | null
  total_despesas: number | null
  total_comissoes: number | null
  total_repassar: number | null
  valor_repassado_comprovante: number | null
  diferenca_total: number | null
  analise_completa: unknown
  imobiliarias: { nome: string } | null
  empreendimentos: { nome: string } | null
}

function slug(valor: string) {
  return valor
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

async function main() {
  const competencia = process.argv[2]
  if (!competencia || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
    throw new Error("Informe a competência no formato AAAA-MM-DD. Ex.: 2026-07-01")
  }
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()
  const destino = join(process.cwd(), "tests", "fixtures", "fechamentos", competencia.slice(0, 7))
  mkdirSync(destino, { recursive: true })

  const { data: fechamentos, error } = await supabase
    .from("fechamentos")
    .select(
      "id,competencia,status,imobiliaria_id,empreendimento_id,total_receitas,total_despesas," +
        "total_comissoes,total_repassar,valor_repassado_comprovante,diferenca_total," +
        "analise_completa,imobiliarias(nome),empreendimentos(nome)",
    )
    .eq("competencia", competencia)
    .order("id")
  if (error) throw error
  if (!fechamentos?.length) throw new Error(`Nenhum fechamento em ${competencia}.`)

  const indice: Array<Record<string, unknown>> = []

  for (const fechamento of fechamentos as unknown as FechamentoExportado[]) {
    if (!fechamento.analise_completa) {
      console.warn(`  pulando ${fechamento.id}: sem analise_completa`)
      continue
    }
    const { data: imoveis, error: erroImoveis } = await supabase
      .from("imoveis")
      .select("id,unidade,ativo,valor_aluguel_esperado,imobiliaria_id,empreendimento_id")
      .eq("imobiliaria_id", fechamento.imobiliaria_id)
      .eq("empreendimento_id", fechamento.empreendimento_id)
      .order("id")
    if (erroImoveis) throw erroImoveis

    const { data: vigencias, error: erroVigencias } = await supabase
      .from("imovel_vigencias")
      .select(
        "imovel_id,modelo_receita,aluguel_contratado,garagem_contratada,vigencia_inicio," +
          "vigencia_fim,ativo,fonte,imobiliaria_id,empreendimento_id",
      )
      .eq("imobiliaria_id", fechamento.imobiliaria_id)
      .eq("empreendimento_id", fechamento.empreendimento_id)
      // Mesmos predicados de `loadSnapshotVigencies`: a fixture guarda as
      // vigencias que o loader TERIA visto naquela competencia, nao todas as
      // do par. Guardar todas faria o replay escolher a vigencia errada.
      .eq("ativo", true)
      .lte("vigencia_inicio", competencia)
      .or(`vigencia_fim.is.null,vigencia_fim.gte.${competencia}`)
      .order("imovel_id")
    if (erroVigencias) throw erroVigencias

    const { data: esperados, error: erroEsperados } = await supabase
      .from("imovel_competencias")
      .select(
        "imovel_id,competencia,status_ocupacao,status_origem,inquilino_nome,aluguel_esperado," +
          "aluguel_esperado_origem,cobranca_esperada,eventos,garagem_recebida,aluguel_recebido," +
          "aluguel_competencia,atrasos_recuperados,atrasos_competencia_origem,outros_recebimentos," +
          "entradas_passagem,saidas_passagem,receita_total,desconto,comissao_administracao," +
          "repasse_apurado,vencimento_referencia,competencia_original,competencia_recebimento," +
          "dia_vencimento,modelo_receita,status_mensal_explicito,quantidade_linhas,origem," +
          "qualidade,calculo_versao,checksum,observacao",
      )
      .eq("fechamento_id", fechamento.id)
      .order("imovel_id")
    if (erroEsperados) throw erroEsperados

    const nome = `${slug(fechamento.imobiliarias?.nome ?? "sem-imobiliaria")}__${slug(
      fechamento.empreendimentos?.nome ?? "sem-empreendimento",
    )}.json`

    const fixture = {
      // AVISO: `snapshotsNoBancoEm` é o estado ATUAL, não um gabarito. Serve
      // para detectar o que MUDOU num replay, nunca para afirmar que está
      // certo — a conferência manual do cliente é que decide isso.
      // Sem carimbo de tempo aqui de proposito: re-exportar dado igual tem de
      // produzir diff vazio, senao o ruido esconde a mudanca real. A data da
      // exportacao fica no index.json.
      _aviso:
        "snapshotsNoBancoEm registra o estado do banco na exportacao. " +
        "Use como deteccao de mudanca, nao como resultado esperado.",
      competencia: fechamento.competencia,
      imobiliaria: { id: fechamento.imobiliaria_id, nome: fechamento.imobiliarias?.nome ?? null },
      empreendimento: {
        id: fechamento.empreendimento_id,
        nome: fechamento.empreendimentos?.nome ?? null,
      },
      fechamento: {
        id: fechamento.id,
        status: fechamento.status,
        total_receitas: fechamento.total_receitas,
        total_despesas: fechamento.total_despesas,
        total_comissoes: fechamento.total_comissoes,
        total_repassar: fechamento.total_repassar,
        valor_repassado_comprovante: fechamento.valor_repassado_comprovante,
        diferenca_total: fechamento.diferenca_total,
      },
      imoveis: imoveis ?? [],
      vigencias: vigencias ?? [],
      analiseCompleta: fechamento.analise_completa,
      snapshotsNoBancoEm: esperados ?? [],
    }

    writeFileSync(join(destino, nome), `${JSON.stringify(fixture, null, 2)}\n`)
    indice.push({
      arquivo: nome,
      imobiliaria: fixture.imobiliaria.nome,
      empreendimento: fixture.empreendimento.nome,
      imoveis: fixture.imoveis.length,
      snapshots: fixture.snapshotsNoBancoEm.length,
    })
    console.log(
      `  ${nome} — ${fixture.imoveis.length} imóveis, ${fixture.snapshotsNoBancoEm.length} snapshots`,
    )
  }

  writeFileSync(
    join(destino, "index.json"),
    `${JSON.stringify({ competencia, exportadoEm: new Date().toISOString(), fechamentos: indice }, null, 2)}\n`,
  )
  console.log(`\n${indice.length} fixtures em tests/fixtures/fechamentos/${competencia.slice(0, 7)}/`)
}

main().catch((erro) => {
  console.error("ERRO:", erro?.message ?? erro)
  process.exit(1)
})
