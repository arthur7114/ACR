// Verificador das identidades dos indicadores contra o banco real.
//
// Roda `getIndicadores` headless e confere, por competência:
//
//   1. as identidades canônicas de `lib/indicadores-identidades.ts` (ponte,
//      realização, ocupação, série e compatibilidade v1/v2);
//   2. aditividade: a soma dos empreendimentos tem de dar o consolidado — um
//      filtro que perde ou duplica registro aparece aqui e em nenhum outro
//      lugar, porque cada escopo isolado continua internamente coerente;
//   3. amarra ao ground truth já verificado: o repasse declarado pelos
//      indicadores tem de bater com a soma de `fechamentos.total_repassar`,
//      cuja reconciliação `scripts/verify-reconciliacao-repasse.ts` garante.
//      Sem esse elo, os indicadores poderiam estar coerentes consigo mesmos e
//      errados em relação ao fechamento.
//
// Também imprime a decomposição de `valoresSemClassificacao` por unidade
// quando ele existe — o número que impede `Confirmado` (CA-IND06) sem dizer de
// onde vem.
//
// Somente leitura. Uso:
//   node --import tsx scripts/verify-indicadores-identidades.ts               # todas as competências
//   node --import tsx scripts/verify-indicadores-identidades.ts 2026-07-01    # uma ou mais
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { getIndicadores } from "@/lib/server/indicadores"
import {
  decomporResiduoRealizacao,
  verificarIdentidades,
  type DivergenciaIdentidade,
} from "@/lib/indicadores-identidades"

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100
const dinheiro = (valor: number | null) => (valor === null ? "—" : valor.toFixed(2))
const TOLERANCIA_AGREGADA = 0.02

interface Agregado {
  rotulo: string
  esperado: number | null
  obtido: number | null
}

function compararAgregados(agregados: Agregado[]): DivergenciaIdentidade[] {
  return agregados.flatMap((agregado): DivergenciaIdentidade[] => {
    const { rotulo, esperado, obtido } = agregado
    if (esperado === null && obtido === null) return []
    if (esperado === null || obtido === null) {
      return [{ id: rotulo, descricao: rotulo, esperado, obtido, diferenca: null, motivo: "lado_ausente" }]
    }
    const diferenca = arredondar(Math.abs(esperado - obtido))
    if (diferenca <= TOLERANCIA_AGREGADA) return []
    return [{ id: rotulo, descricao: rotulo, esperado, obtido, diferenca, motivo: "valor_divergente" }]
  })
}

async function main() {
  const argumentos = process.argv.slice(2)
  const supabase = createSupabaseAdmin()
  const { data: fechamentos, error } = await supabase
    .from("fechamentos")
    .select("competencia,empreendimento_id,total_repassar")
    .eq("arquivado", false)
  if (error) throw error

  const competencias =
    argumentos.length > 0
      ? argumentos
      : [...new Set((fechamentos ?? []).map((linha) => linha.competencia as string))].sort()

  let divergencias = 0
  let identidadesConferidas = 0

  for (const competencia of competencias) {
    console.log(`\n=== ${competencia} ===`)
    const consolidado = await getIndicadores({ competencia })
    const doMes = (fechamentos ?? []).filter((linha) => linha.competencia === competencia)

    const falhasIdentidade = verificarIdentidades(consolidado)
    identidadesConferidas += 14 - falhasIdentidade.length
    for (const falha of falhasIdentidade) {
      console.log(
        `  ✗ ${falha.descricao}: esperado ${dinheiro(falha.esperado)}, obtido ${dinheiro(falha.obtido)}` +
          (falha.diferenca === null ? " (um lado ausente)" : ` — diferença ${dinheiro(falha.diferenca)}`),
      )
    }
    divergencias += falhasIdentidade.length

    // Aditividade por empreendimento.
    const ids = [...new Set(doMes.map((linha) => linha.empreendimento_id as string))]
    const somas = { receitas: 0, comissoes: 0, despesas: 0, repasse: 0, contratado: 0, inadimplencia: 0 }
    for (const empreendimentoId of ids) {
      const escopo = await getIndicadores({ competencia, empreendimentoId })
      somas.receitas += escopo.ponteFinanceira.receitasEconomicas ?? 0
      somas.comissoes += escopo.ponteFinanceira.comissoes ?? 0
      somas.despesas += escopo.ponteFinanceira.despesas ?? 0
      somas.repasse += escopo.ponteFinanceira.repasseCalculado ?? 0
      somas.contratado += escopo.realizacaoAluguel.contratado ?? 0
      somas.inadimplencia += escopo.realizacaoAluguel.inadimplenciaMes ?? 0
    }
    const repasseFechamentos = arredondar(
      doMes.reduce((total, linha) => total + Number(linha.total_repassar ?? 0), 0),
    )
    const falhasAgregadas = compararAgregados([
      { rotulo: "aditividade: soma(receitas) = consolidado", esperado: arredondar(somas.receitas), obtido: consolidado.ponteFinanceira.receitasEconomicas },
      { rotulo: "aditividade: soma(comissões) = consolidado", esperado: arredondar(somas.comissoes), obtido: consolidado.ponteFinanceira.comissoes },
      { rotulo: "aditividade: soma(despesas) = consolidado", esperado: arredondar(somas.despesas), obtido: consolidado.ponteFinanceira.despesas },
      { rotulo: "aditividade: soma(repasse calculado) = consolidado", esperado: arredondar(somas.repasse), obtido: consolidado.ponteFinanceira.repasseCalculado },
      { rotulo: "aditividade: soma(contratado) = consolidado", esperado: arredondar(somas.contratado), obtido: consolidado.realizacaoAluguel.contratado },
      { rotulo: "aditividade: soma(inadimplência) = consolidado", esperado: arredondar(somas.inadimplencia), obtido: consolidado.realizacaoAluguel.inadimplenciaMes },
      { rotulo: "ground truth: repasse declarado = soma(fechamentos.total_repassar)", esperado: repasseFechamentos, obtido: consolidado.ponteFinanceira.repasseDeclarado },
    ])
    for (const falha of falhasAgregadas) {
      console.log(
        `  ✗ ${falha.descricao}: esperado ${dinheiro(falha.esperado)}, obtido ${dinheiro(falha.obtido)}` +
          (falha.diferenca === null ? " (um lado ausente)" : ` — diferença ${dinheiro(falha.diferenca)}`),
      )
    }
    divergencias += falhasAgregadas.length

    if (falhasIdentidade.length === 0 && falhasAgregadas.length === 0) {
      console.log(
        `  ✓ 14 identidades, 6 agregados e o elo com os ${doMes.length} fechamentos conferem ` +
          `(${ids.length} empreendimento(s), repasse ${dinheiro(repasseFechamentos)})`,
      )
    }

    // O resíduo não é divergência (a identidade o inclui), mas é o número que
    // impede `Confirmado`. Sem a decomposição ele chega opaco à tela.
    const residuo = consolidado.realizacaoAluguel.valoresSemClassificacao
    if (residuo !== null && Math.abs(residuo) > 0.01) {
      const contribuicoes = decomporResiduoRealizacao(consolidado)
      const somaContribuicoes = arredondar(contribuicoes.reduce((total, item) => total + item.contribuicao, 0))
      console.log(
        `  · valores sem classificação ${dinheiro(residuo)} em ${contribuicoes.length} unidade(s) ` +
          `(soma das contribuições ${dinheiro(somaContribuicoes)}):`,
      )
      for (const item of contribuicoes.slice(0, 8)) {
        console.log(
          `      ${item.empreendimentoNome} un ${item.unidade} [${item.statusOcupacao}] ` +
            `esperado ${dinheiro(item.aluguelEsperado)}, recebido ${dinheiro(item.recebidoCompetencia)}, ` +
            `outros ${dinheiro(item.outrosRecebimentos)} → ${dinheiro(item.contribuicao)}`,
        )
      }
      if (contribuicoes.length > 8) console.log(`      … e mais ${contribuicoes.length - 8} unidade(s)`)
      // A decomposição tem de explicar o resíduo inteiro. Se não explicar, a
      // sobra vem de linha sem imóvel vinculado (acordo, atraso, intermediação
      // sem unidade) e a tela precisa saber disso.
      if (Math.abs(arredondar(somaContribuicoes - residuo)) > 0.01) {
        console.log(
          `  ✗ decomposição não explica o resíduo: sobram ${dinheiro(arredondar(residuo - somaContribuicoes))} ` +
            `fora das linhas por imóvel`,
        )
        divergencias++
      }
    }
  }

  console.log(
    `\n${competencias.length} competência(s); ${identidadesConferidas} identidade(s) conferida(s).`,
  )
  if (divergencias > 0) {
    console.log(`${divergencias} divergência(s).`)
    process.exitCode = 1
    return
  }
  console.log("Nenhuma divergência: identidades, aditividade e elo com os fechamentos conferem.")
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
