// Verificador do aluguel contratado contra o que a competencia recebeu.
//
// Nasceu do reparo de 2026-09-02: 32 das 118 unidades de julho tinham
// `aluguel_contratado` MENOR que o recebido porque o reajuste nunca chegou ao
// cadastro. A carteira aparecia rendendo mais que o contratado — impossivel — e
// isso puxava "Cobranca esperada", "Vacancia" e o percentual de realizacao.
//
// A comparacao ingenua (recebido > contratado) acusa junto as quitacoes de
// atraso, que sao legitimas: quem paga dois meses de uma vez recebe mais que um
// aluguel sem que o contrato tenha mudado. Por isso o atraso recuperado e
// DESCONTADO antes de comparar — `aluguel_recebido` ja o inclui.
//
// Somente leitura. Uso:
//   node --import tsx scripts/verify-aluguel-contratado.ts                 # todas as competencias
//   node --import tsx scripts/verify-aluguel-contratado.ts 2026-07-01      # uma ou mais competencias
import { pathToFileURL } from "node:url"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export interface LinhaContratada {
  competencia: string
  empreendimento: string
  unidade: string
  statusOcupacao: string
  /** "fixo" quando ha vigencia de aluguel fixo; null quando nao ha vigencia. */
  modeloReceita: string | null
  aluguelContratado: number | null
  aluguelRecebido: number | null
  atrasosRecuperados: number | null
}

export type MotivoDivergencia = "contratado_defasado" | "contratado_zerado"

export interface DivergenciaContratada extends LinhaContratada {
  motivo: MotivoDivergencia
  /** Recebido da propria competencia: aluguel recebido menos atraso recuperado. */
  recebidoDaCompetencia: number
  diferenca: number
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100

export function verificarAluguelContratado(
  linhas: LinhaContratada[],
  tolerancia = 0.01,
): DivergenciaContratada[] {
  return linhas.flatMap((linha): DivergenciaContratada[] => {
    // Receita variavel (Airbnb) e unidade sem vigencia nao tem aluguel fixo a
    // comparar; status desconhecido e falta de dado, nao defeito de contrato.
    if (linha.modeloReceita !== "fixo") return []
    if (linha.statusOcupacao === "desconhecido") return []
    if (linha.aluguelContratado === null) return []

    // `aluguel_recebido` inclui o atraso recuperado. Sem descontar, quem quitou
    // mes anterior aparece como contrato defasado.
    const recebidoDaCompetencia = arredondar(
      Math.max((linha.aluguelRecebido ?? 0) - (linha.atrasosRecuperados ?? 0), 0),
    )

    if (linha.aluguelContratado === 0) {
      if (recebidoDaCompetencia <= tolerancia) return []
      return [{ ...linha, motivo: "contratado_zerado", recebidoDaCompetencia, diferenca: recebidoDaCompetencia }]
    }

    const diferenca = arredondar(recebidoDaCompetencia - linha.aluguelContratado)
    if (diferenca <= tolerancia) return []
    return [{ ...linha, motivo: "contratado_defasado", recebidoDaCompetencia, diferenca }]
  })
}

interface RegistroBanco {
  competencia: string
  status_ocupacao: string
  aluguel_recebido: number | string | null
  atrasos_recuperados: number | string | null
  imoveis: { unidade: string | null } | null
  fechamentos: { empreendimentos: { nome: string | null } | null } | null
}

const numero = (valor: number | string | null) => (valor === null ? null : Number(valor))

async function carregarLinhas(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  competencias: string[],
): Promise<LinhaContratada[]> {
  let consulta = supabase
    .from("imovel_competencias")
    .select(
      "competencia,imovel_id,status_ocupacao,aluguel_recebido,atrasos_recuperados," +
        "imoveis(unidade),fechamentos(empreendimentos(nome))",
    )
  if (competencias.length > 0) consulta = consulta.in("competencia", competencias)
  const { data, error } = await consulta
  if (error) throw error

  const registros = (data ?? []) as unknown as Array<RegistroBanco & { imovel_id: string }>
  const { data: vigencias, error: erroVigencias } = await supabase
    .from("imovel_vigencias")
    .select("imovel_id,vigencia_inicio,vigencia_fim,modelo_receita,aluguel_contratado")
    .eq("ativo", true)
  if (erroVigencias) throw erroVigencias

  return registros.map((registro) => {
    // A vigencia que cobre a competencia: comeca ate ela e ainda nao terminou.
    // `vigencia_fim` guarda o PRIMEIRO dia do ultimo mes coberto (convencao da
    // migration 202608120001), por isso a comparacao e >=, nao >.
    const vigencia = (vigencias ?? []).find(
      (candidata) =>
        candidata.imovel_id === registro.imovel_id &&
        candidata.vigencia_inicio <= registro.competencia &&
        (candidata.vigencia_fim === null || candidata.vigencia_fim >= registro.competencia),
    )
    return {
      competencia: registro.competencia,
      empreendimento: registro.fechamentos?.empreendimentos?.nome ?? "—",
      unidade: registro.imoveis?.unidade ?? "—",
      statusOcupacao: registro.status_ocupacao,
      modeloReceita: vigencia?.modelo_receita ?? null,
      aluguelContratado: vigencia ? numero(vigencia.aluguel_contratado) : null,
      aluguelRecebido: numero(registro.aluguel_recebido),
      atrasosRecuperados: numero(registro.atrasos_recuperados),
    }
  })
}

const dinheiro = (valor: number | null) => (valor === null ? "—" : valor.toFixed(2))

async function main() {
  const competencias = process.argv.slice(2)
  const supabase = createSupabaseAdmin()
  const linhas = await carregarLinhas(supabase, competencias)
  const divergencias = verificarAluguelContratado(linhas)

  const escopo = competencias.length > 0 ? competencias.join(", ") : "todas as competências"
  // Cobertura explicita: um verificador que pula tudo em silencio (por exemplo
  // se a vigencia deixar de casar) daria o mesmo "sem divergencia" de um banco
  // saudavel. O numero de unidades efetivamente comparadas precisa aparecer.
  const comparadas = linhas.filter(
    (linha) => linha.modeloReceita === "fixo" && linha.statusOcupacao !== "desconhecido" && linha.aluguelContratado !== null,
  ).length
  const semVigencia = linhas.filter((linha) => linha.modeloReceita === null).length
  const variavel = linhas.filter((linha) => linha.modeloReceita !== null && linha.modeloReceita !== "fixo").length

  console.log(`Aluguel contratado x recebido da competência (atraso recuperado descontado) — ${escopo}`)
  console.log(
    `${linhas.length} unidade(s) no período; ${comparadas} comparada(s), ` +
      `${variavel} de receita variável, ${semVigencia} sem vigência.\n`,
  )
  if (comparadas === 0 && linhas.length > 0) {
    console.log("Nenhuma unidade pôde ser comparada — vigências não casaram. Verificação inconclusiva.")
    process.exitCode = 1
    return
  }

  if (divergencias.length === 0) {
    console.log("Nenhuma divergência: nenhuma unidade recebeu, na própria competência, mais do que o contratado.")
    return
  }

  const porCompetencia = new Map<string, DivergenciaContratada[]>()
  for (const divergencia of divergencias) {
    const lista = porCompetencia.get(divergencia.competencia) ?? []
    lista.push(divergencia)
    porCompetencia.set(divergencia.competencia, lista)
  }
  for (const competencia of [...porCompetencia.keys()].sort()) {
    console.log(`=== ${competencia} ===`)
    for (const divergencia of porCompetencia.get(competencia) ?? []) {
      console.log(
        `  ${divergencia.empreendimento} ${divergencia.unidade}: contratado ${dinheiro(divergencia.aluguelContratado)}, ` +
          `recebido na competência ${dinheiro(divergencia.recebidoDaCompetencia)} ` +
          `(bruto ${dinheiro(divergencia.aluguelRecebido)} − atraso ${dinheiro(divergencia.atrasosRecuperados)}) ` +
          `→ ${divergencia.motivo} de ${dinheiro(divergencia.diferenca)}`,
      )
    }
    console.log("")
  }
  console.log(`${divergencias.length} divergência(s).`)
  process.exitCode = 1
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
