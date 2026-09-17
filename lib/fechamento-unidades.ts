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

function normalizarNome(nome: string | null | undefined) {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

// Intermediacoes declaradas pelo fechamento, por apto, com os inquilinos da
// secao. Nao ha filtro por competencia: a secao pertence a este fechamento mesmo
// quando cobra a vigencia do mes anterior (GM II ago/2026 lista
// "INTERMEDIACOES DE JULHO 2026").
export function intermediacoesPorApto(
  acordos: Array<Pick<AcordoRescisaoRecebido, "tipo" | "apto" | "inquilino">>,
) {
  const mapa = new Map<string, string[]>()
  for (const item of acordos) {
    if (item.tipo !== "intermediacao") continue
    const key = aptoKey(item.apto)
    if (!key) continue
    const inquilinos = mapa.get(key) ?? []
    inquilinos.push(normalizarNome(item.inquilino))
    mapa.set(key, inquilinos)
  }
  return mapa
}

export function criarClassificadorUnidades(
  intermediacoes: Map<string, string[]> = new Map(),
): ClassificadorUnidades {
  const textoDaLinha = (row: LinhaUnidade) =>
    `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()

  const isAirbnbRow: ClassificadorUnidades["isAirbnbRow"] = (row) => /air\s*bnb/.test(textoDaLinha(row))

  // Unidade de INTERMEDIACAO: tem categoria propria (tabela de Intermediacao).
  // Nao e alugada, vaga nem inadimplente. Duas evidencias equivalentes: a
  // observacao da linha ou a secao de intermediacoes do fechamento.
  //
  // A secao so classifica a linha quando as duas falam da MESMA locacao: linha
  // zerada (o mes da unidade foi cobrado na secao) ou mesmo inquilino. Secao e
  // linha podem descrever inquilinos diferentes no mesmo apto — Grand Castelao I
  // mai/2026 tem rescisao do inquilino que saiu (Felipe, apto 2) enquanto a
  // linha da vigencia ja e do novo (Lucas), pagando aluguel cheio. Sem esta
  // guarda, um apto intermediado e reocupado no mesmo mes perderia a etiqueta de
  // pagante.
  const isIntermediacaoRow: ClassificadorUnidades["isIntermediacaoRow"] = (row) => {
    if (/intermedia/.test(textoDaLinha(row))) return true
    const key = aptoKey(row.apto)
    if (key === "") return false
    const inquilinosDaSecao = intermediacoes.get(key)
    if (!inquilinosDaSecao) return false
    const semReceita = (row.aluguel ?? 0) <= 0 && (row.total ?? 0) <= 0
    if (semReceita) return true
    const inquilinoDaLinha = normalizarNome(row.inquilino)
    if (!inquilinoDaLinha) return false
    return inquilinosDaSecao.some(
      (nome) =>
        nome !== ""
        && (nome === inquilinoDaLinha
          || nome.startsWith(inquilinoDaLinha)
          || inquilinoDaLinha.startsWith(nome)),
    )
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

// Contagem do tile "Intermediacao": unidades distintas que a secao de
// intermediacoes declara MAIS as linhas marcadas INTERMEDIACAO no texto. E a
// conta que o cliente faz — ele conferiu "tem tres intermediacoes na planilha"
// olhando as tres linhas da secao.
//
// Nao passa pela guarda de inquilino de `isIntermediacaoRow` de proposito: a
// guarda decide a ETIQUETA da linha (se a unidade, no mes, esta ocupada por um
// pagante diferente, a linha e dele), enquanto o tile conta o evento de
// intermediacao do fechamento. Nos 31 fechamentos ate ago/2026 as duas leituras
// coincidem; separa-las evita que uma unidade reocupada suma da contagem.
export function contarUnidadesIntermediadas(
  linhasUnidades: LinhaUnidade[],
  intermediacoes: Array<Pick<AcordoRescisaoRecebido, "tipo" | "apto">>,
): number {
  const aptos = new Set<string>()
  // Intermediacao sem apto informado nao casa com nenhuma linha: conta por si so.
  let semApto = 0

  for (const item of intermediacoes) {
    if (item.tipo !== "intermediacao") continue
    const key = aptoKey(item.apto)
    if (key) aptos.add(key)
    else semApto += 1
  }

  for (const row of linhasUnidades) {
    const marcada = /intermedia/.test(`${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase())
    if (!marcada) continue
    const key = aptoKey(row.apto)
    if (key) aptos.add(key)
    else semApto += 1
  }

  return aptos.size + semApto
}
