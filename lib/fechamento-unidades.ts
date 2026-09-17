// Classificacao das UNIDADES de um fechamento (tiles "Situacao das unidades" e
// etiquetas da tabela de receitas por imovel, na Revisao).
//
// A classificacao nao sai so do texto da linha. A prestacao tem DUAS fontes
// sobre a mesma unidade e elas podem discordar:
//
//   1. a linha da vigencia do mes, com a coluna OBSERVACAO; e
//   2. a tabela de intermediacoes do proprio fechamento
//      (`acordos_rescisoes_recebidos` com tipo "intermediacao"), onde a
//      imobiliaria cobra a taxa da nova locacao.
//
// Quando a unidade e intermediada, a linha da vigencia vem ZERADA — o mesmo
// formato de uma inadimplencia. Se so o texto da linha decidisse, a unidade
// intermediada cuja observacao nao repete "INTERMEDIACAO" seria lida como
// inadimplente (GM II ago/2026, apto 23: a tabela de intermediacoes lista o
// apto com comissao de R$ 420,00, mas a observacao da linha diz apenas
// "IPTU (8/12). SEGURO QUITADO."). Por isso a tabela de intermediacoes entra na
// classificacao como evidencia de igual peso: unidade intermediada e a que a
// linha marca OU que a tabela declara.
import type { AcordoRescisaoRecebido } from "./prestacao-types"

// Subconjunto de `ReceitaPorImovel` de que a classificacao depende — permite
// montar casos de teste sem preencher a linha financeira inteira.
export interface LinhaUnidade {
  apto: string | null
  inquilino: string | null
  aluguel: number | null
  total: number
  observacao: string | null
  reajuste_mes?: string | null
}

export interface ClassificadorUnidades {
  isAirbnbRow(row: LinhaUnidade): boolean
  isIntermediacaoRow(row: LinhaUnidade): boolean
  isVacantRow(row: LinhaUnidade): boolean
  isDelinquentRow(row: LinhaUnidade): boolean
  isExplicitInadimplencia(row: LinhaUnidade): boolean
  isRescisaoRow(row: LinhaUnidade): boolean
  isOccupiedRow(row: LinhaUnidade): boolean
  isReajusteRow(row: LinhaUnidade, competenciaMes: string | null): boolean
}

const VAGO_INQUILINO_TOKENS = new Set([
  "",
  "vago",
  "vaga",
  "disponivel",
  "disponível",
  "-",
  "--",
  "null",
  ": null",
  "nulo",
  "undefined",
])

export function isInquilinoVazio(inquilino: string | null | undefined) {
  if (!inquilino) return true
  return VAGO_INQUILINO_TOKENS.has(inquilino.trim().toLowerCase())
}

// Normaliza o numero do apto para comparar receitas x acordos/rescisoes.
export function aptoKey(apto: string | null | undefined) {
  return (apto ?? "").trim().toLowerCase()
}

// Aptos que a tabela de intermediacoes do fechamento declara. Nao ha filtro por
// competencia: a secao de intermediacoes pertence a este fechamento mesmo
// quando a vigencia cobrada e do mes anterior (GM II ago/2026 lista
// "INTERMEDIACOES DE JULHO 2026").
export function aptosDeIntermediacao(acordos: Array<Pick<AcordoRescisaoRecebido, "tipo" | "apto">>) {
  return new Set(
    acordos
      .filter((item) => item.tipo === "intermediacao")
      .map((item) => aptoKey(item.apto))
      .filter(Boolean),
  )
}

export function criarClassificadorUnidades(
  intermediacaoAptos: Set<string> = new Set(),
): ClassificadorUnidades {
  const textoDaLinha = (row: LinhaUnidade) =>
    `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()

  const isAirbnbRow: ClassificadorUnidades["isAirbnbRow"] = (row) => /air\s*bnb/.test(textoDaLinha(row))

  // Unidade de INTERMEDIACAO: tem categoria propria (tabela de Intermediacao).
  // Nao e alugada, vaga nem inadimplente. Duas evidencias equivalentes: a
  // observacao da linha ou a tabela de intermediacoes do fechamento.
  const isIntermediacaoRow: ClassificadorUnidades["isIntermediacaoRow"] = (row) => {
    if (/intermedia/.test(textoDaLinha(row))) return true
    const key = aptoKey(row.apto)
    return key !== "" && intermediacaoAptos.has(key)
  }

  const isVacantRow: ClassificadorUnidades["isVacantRow"] = (row) => {
    if (isAirbnbRow(row) || isIntermediacaoRow(row)) return false
    const text = textoDaLinha(row)
    if (/inadimpl/.test(text)) return false
    if (/\b(vago|vacancia|vacância|disponivel|disponível)\b/.test(text)) return true
    // Unidade que recebeu aluguel (ou tem total > 0) NAO e vaga, mesmo sem o nome
    // do inquilino na linha — no extrato consolidado (Cesar Rego) o inquilino vem
    // como agrupador e nem sempre e preenchido por linha. So tratamos inquilino
    // vazio como vacancia quando tambem nao ha receita na linha.
    if ((row.aluguel ?? 0) > 0 || row.total > 0) return false
    return isInquilinoVazio(row.inquilino)
  }

  const isDelinquentRow: ClassificadorUnidades["isDelinquentRow"] = (row) => {
    if (isAirbnbRow(row) || isIntermediacaoRow(row)) return false
    const text = textoDaLinha(row)
    return !isVacantRow(row) && ((row.aluguel === null || row.aluguel === 0) || /inadimpl/.test(text))
  }

  // Linha explicitamente marcada como INADIMPLENCIA (vigencia do mes nao paga). Um
  // acordo de mes anterior (ex.: pagou abril) nao descaracteriza essa inadimplencia.
  const isExplicitInadimplencia: ClassificadorUnidades["isExplicitInadimplencia"] = (row) => {
    if (isAirbnbRow(row)) return false
    return /inadimpl/.test(textoDaLinha(row))
  }

  // Rescisao no mes (ex.: "RESCISÃO. PROPORCIONAL DE 10 DIAS"): a unidade teve
  // locatario e saiu dentro da competencia. Continua alugada no mes do fechamento;
  // nos indicadores ela encerra o mes vaga (evento de rescisao).
  const isRescisaoRow: ClassificadorUnidades["isRescisaoRow"] = (row) => {
    if (isAirbnbRow(row) || isIntermediacaoRow(row)) return false
    return /rescis/.test(textoDaLinha(row))
  }

  // Unidade ALUGADA na competencia = teve locatario no mes. Inclui pagantes,
  // inadimplentes, intermediacao e rescisoes proporcionais; exclui vagas e
  // aplicativos. Definicao do cliente (GM II jul/26: 22 pagantes + 1 inadimplente
  // + 1 intermediacao = 24 alugadas e 3 vagas). Os demais tiles sao subconjuntos.
  const isOccupiedRow: ClassificadorUnidades["isOccupiedRow"] = (row) =>
    !isAirbnbRow(row) && !isVacantRow(row)

  // Atualizacao monetaria no mes: a coluna REAJUSTE do documento aponta para a
  // competencia e a linha nao e contrato novo (proporcional). Fonte unica: o
  // proprio documento — sem inferir reajuste por comparacao de valores.
  const isReajusteRow: ClassificadorUnidades["isReajusteRow"] = (row, competenciaMes) => {
    if (!competenciaMes || !row.reajuste_mes || row.reajuste_mes !== competenciaMes) return false
    if (isAirbnbRow(row) || isIntermediacaoRow(row) || isVacantRow(row)) return false
    return !/proporcional/i.test(row.observacao ?? "")
  }

  return {
    isAirbnbRow,
    isIntermediacaoRow,
    isVacantRow,
    isDelinquentRow,
    isExplicitInadimplencia,
    isRescisaoRow,
    isOccupiedRow,
    isReajusteRow,
  }
}

// Contagem do tile "Intermediacao": unidades da tabela de receitas classificadas
// como intermediacao MAIS as intermediacoes que nao tem linha correspondente na
// vigencia (documento que so traz a unidade na secao de intermediacoes). Uma
// unidade nunca e contada duas vezes.
export function contarUnidadesIntermediadas(
  linhasUnidades: LinhaUnidade[],
  intermediacoes: Array<Pick<AcordoRescisaoRecebido, "tipo" | "apto">>,
  classificador: ClassificadorUnidades,
): number {
  const aptosComLinha = new Set(linhasUnidades.map((row) => aptoKey(row.apto)).filter(Boolean))
  const comLinha = linhasUnidades.filter(classificador.isIntermediacaoRow).length
  const semLinha = intermediacoes.filter((item) => {
    if (item.tipo !== "intermediacao") return false
    const key = aptoKey(item.apto)
    // Intermediacao sem apto informado nao tem como casar com uma linha: conta
    // por si so, como fazia o fallback anterior.
    return key === "" || !aptosComLinha.has(key)
  }).length

  return comLinha + semLinha
}
