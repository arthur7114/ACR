// Leitura deterministica do "RELATORIO VIGENCIA DE <MES>/<ANO>" da Alive
// (documento 3 do pacote). Ele e a fonte autoritativa do aluguel contratado:
// a secao ATUALIZACAO MONETARIA traz o valor do ano anterior e o do ano
// corrente por apartamento, e a secao APARTAMENTO ALUGADO traz o contrato novo.
//
// O texto vem de `pdftotext -layout`. Nada aqui usa IA: o layout e estavel e um
// erro de leitura precisa falhar, nao ser inventado.

const MESES: Record<string, string> = {
  JANEIRO: "01",
  FEVEREIRO: "02",
  MARCO: "03",
  ABRIL: "04",
  MAIO: "05",
  JUNHO: "06",
  JULHO: "07",
  AGOSTO: "08",
  SETEMBRO: "09",
  OUTUBRO: "10",
  NOVEMBRO: "11",
  DEZEMBRO: "12",
}

export interface ReajusteMonetario {
  apto: string
  inquilino: string
  aluguelAnterior: number | null
  aluguelNovo: number
  garagemAnterior: number | null
  garagemNova: number | null
}

export interface NovoContrato {
  apto: string
  inquilino: string
  /** Data ISO de inicio da vigencia, quando o documento a informa. */
  vigenciaInicio: string | null
  aluguel: number
  garagem: number | null
}

export interface RelatorioReajuste {
  empreendimento: string
  /** Competencia do relatorio em "AAAA-MM". */
  competencia: string
  reajustes: ReajusteMonetario[]
  novosContratos: NovoContrato[]
}

// Rodape repetido em toda pagina do PDF; sem remover, ele entra no meio dos
// blocos de apartamento e quebra o agrupamento.
const RODAPE = /ALIVE IM[OÓ]VEIS LTDA|aliveimobiliaria@|Fortaleza\/CE|Atenciosamente/i

const SECOES = {
  alugado: /APARTAMENTO\s+ALUGADO\s*:/i,
  reajuste: /ATUALIZA[CÇ][AÃ]O\s+MONET[AÁ]RIA\s*:/i,
  atrasado: /ATRASADOS\s+QUE\s+FORAM\s+RECEBIDOS\s*:/i,
  rescisao: /RESCIS[AÃ]O\s*:/i,
}

export function parseRelatorioReajuste(texto: string): RelatorioReajuste {
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0 && !RODAPE.test(linha))

  const cabecalho = linhas.find((linha) => /RELAT[OÓ]RIO\s+VIG[EÊ]NCIA\s+DE/i.test(linha))
  if (!cabecalho) {
    throw new Error("Relatório de vigência não reconhecido: cabeçalho ausente.")
  }
  const competencia = parseCompetenciaCabecalho(cabecalho)
  const empreendimento = cabecalho.split(/[–—-]/).slice(1).join("-").trim()

  const blocos = agruparPorSecao(linhas)
  return {
    empreendimento,
    competencia,
    reajustes: parseReajustes(blocos.reajuste, competencia),
    novosContratos: parseNovosContratos(blocos.alugado),
  }
}

function parseCompetenciaCabecalho(cabecalho: string) {
  const match = /VIG[EÊ]NCIA\s+DE\s+([A-ZÇÃÉÊÍÓÔÚ]+)\s*\/\s*(\d{4})/i.exec(cabecalho)
  if (!match) throw new Error(`Competência ilegível no cabeçalho: "${cabecalho}".`)
  const mes = MESES[normalizar(match[1])]
  if (!mes) throw new Error(`Mês desconhecido no cabeçalho: "${match[1]}".`)
  return `${match[2]}-${mes}`
}

// Percorre o documento uma vez, guardando as linhas de cada secao. Uma linha so
// pertence a uma secao — o mesmo apartamento pode aparecer em ATUALIZACAO e em
// ATRASADOS com significados diferentes, e confundir os dois inventa reajuste.
function agruparPorSecao(linhas: string[]) {
  const blocos: Record<keyof typeof SECOES, string[]> = {
    alugado: [],
    reajuste: [],
    atrasado: [],
    rescisao: [],
  }
  let atual: keyof typeof SECOES | null = null
  for (const linha of linhas) {
    const secao = (Object.keys(SECOES) as Array<keyof typeof SECOES>).find((chave) =>
      SECOES[chave].test(linha),
    )
    if (secao) {
      atual = secao
      continue
    }
    if (atual) blocos[atual].push(linha)
  }
  return blocos
}

// Cada apartamento comeca em "APTO NN: NOME." e vai ate o proximo APTO.
function dividirPorApartamento(linhas: string[]) {
  const blocos: Array<{ apto: string; inquilino: string; corpo: string[] }> = []
  for (const linha of linhas) {
    const inicio = /^APTO\s*:?\s*(\d+)\s*:\s*(.*?)\.?$/i.exec(linha)
    if (inicio) {
      blocos.push({ apto: String(Number(inicio[1])), inquilino: inicio[2].trim(), corpo: [] })
      continue
    }
    blocos.at(-1)?.corpo.push(linha)
  }
  return blocos
}

function parseReajustes(linhas: string[], competencia: string): ReajusteMonetario[] {
  const [ano, mes] = competencia.split("-")
  const alvo = `${mes}/${ano}`
  return dividirPorApartamento(linhas).flatMap((bloco) => {
    const aluguel = valoresPorReferencia(bloco.corpo, /^Aluguel\s+em\s+/i)
    const garagem = valoresPorReferencia(bloco.corpo, /^Vaga\s+de\s+garagem\b.*?(?:para\s+\w+\s*)?/i)
    const aluguelNovo = aluguel.get(alvo)
    // Sem o valor da competencia do relatorio nao ha reajuste a aplicar: o
    // bloco fica de fora em vez de virar um numero aproximado.
    if (aluguelNovo === undefined) return []
    return [{
      apto: bloco.apto,
      inquilino: bloco.inquilino,
      aluguelAnterior: outroValor(aluguel, alvo),
      aluguelNovo,
      garagemAnterior: outroValor(garagem, alvo),
      garagemNova: garagem.get(alvo) ?? null,
    }]
  })
}

// "Aluguel em 07/2025: R$ 660,00." e "Vaga de garagem para carro 03/2026: R$ 51,91."
// (o "em" some em alguns relatorios) — indexado pela referencia MM/AAAA.
function valoresPorReferencia(corpo: string[], prefixo: RegExp) {
  const mapa = new Map<string, number>()
  for (const linha of corpo) {
    if (!prefixo.test(linha)) continue
    const match = /(\d{2}\/\d{4})\s*:\s*R\$\s*([\d.,]+)/i.exec(linha)
    if (!match) continue
    const valor = parseMoeda(match[2])
    if (valor !== null) mapa.set(match[1], valor)
  }
  return mapa
}

function outroValor(mapa: Map<string, number>, alvo: string) {
  for (const [referencia, valor] of mapa) {
    if (referencia !== alvo) return valor
  }
  return null
}

function parseNovosContratos(linhas: string[]): NovoContrato[] {
  return dividirPorApartamento(linhas).flatMap((bloco) => {
    const aluguel = valorDaRubrica(bloco.corpo, /de\s+aluguel/i)
    if (aluguel === null) return []
    return [{
      apto: bloco.apto,
      inquilino: bloco.inquilino,
      vigenciaInicio: parseInicioVigencia(bloco.corpo),
      aluguel,
      garagem: valorDaRubrica(bloco.corpo, /de\s+vaga\s+de\s+garagem/i),
    }]
  })
}

// "- R$ 700,00 de aluguel;" / "- R$ 25,00 de vaga de garagem para moto;"
function valorDaRubrica(corpo: string[], rubrica: RegExp) {
  for (const linha of corpo) {
    if (!rubrica.test(linha)) continue
    const match = /R\$\s*([\d.,]+)/.exec(linha)
    const valor = match ? parseMoeda(match[1]) : null
    if (valor !== null) return valor
  }
  return null
}

function parseInicioVigencia(corpo: string[]) {
  for (const linha of corpo) {
    const match = /In[ií]cio\s+de\s+vig[eê]ncia\s+dia\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(linha)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }
  return null
}

function parseMoeda(valor: string) {
  const normalizado = valor.replace(/\./g, "").replace(",", ".")
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
}
