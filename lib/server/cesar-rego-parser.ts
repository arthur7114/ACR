import type {
  PrestacaoAnalysis,
  PrestacaoResumoDespesa,
  ReceitaPorImovel,
} from "@/lib/prestacao-types"

// Parser deterministico para o LAYOUT C ("Extrato de Conta - Consolidado por
// Lancamentos", ex.: Cesar Rego). O modelo de visao erra a matematica do razao
// por linha (saldos, IPTU de passagem, agrupadores de inquilino), entao este
// layout e extraido localmente a partir do texto do PDF, nos moldes do
// excel-parser.ts.

interface TextCell {
  text: string
  x: number
  width: number
}

interface TextLine {
  page: number
  y: number
  cells: TextCell[]
  text: string
}

interface Lancamento {
  codigo: string
  descricao: string
  mesAno: string | null
  debito: number | null
  credito: number | null
  saldo: number | null
  inquilino: string
}

interface RelacaoImovel {
  codigo: string
  endereco: string
  aluguel: number | null
  ultimoPagamento: string | null
  situacao: string | null
}

// Itens na mesma linha visual variam ~1pt em y; linhas consecutivas distam
// ~13pt e continuacoes de descricao quebrada ~8pt.
const LINE_Y_TOLERANCE = 2
const WRAP_GAP_MAX = 10

const MONEY_RE = /^R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/
const CODIGO_RE = /^\d{6,7}$/
const MES_ANO_RE = /^\d{2}\/\d{4}$/
const DATA_RE = /^\d{2}\/\d{2}\/\d{4}$/

export async function extractPdfTextLines(fileBuffer: Buffer): Promise<TextLine[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) })
  const doc = await loadingTask.promise

  try {
    const lines: TextLine[] = []

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items
        .flatMap((item) => {
          if (!("str" in item)) return []
          return [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }]
        })
        .filter((item) => item.text.trim().length > 0)
        .sort((a, b) => b.y - a.y || a.x - b.x)

      let current: { y: number; cells: TextCell[] } | null = null
      for (const item of items) {
        if (!current || current.y - item.y > LINE_Y_TOLERANCE) {
          if (current) lines.push(buildLine(pageNumber, current))
          current = { y: item.y, cells: [] }
        }
        current.cells.push({ text: item.text.trim(), x: item.x, width: item.width })
      }
      if (current) lines.push(buildLine(pageNumber, current))
    }

    return lines
  } finally {
    await loadingTask.destroy()
  }
}

function buildLine(page: number, line: { y: number; cells: TextCell[] }): TextLine {
  const cells = [...line.cells].sort((a, b) => a.x - b.x)
  return { page, y: line.y, cells, text: cells.map((cell) => cell.text).join(" ") }
}

export function isCesarRegoConsolidado(lines: TextLine[]): boolean {
  const text = normalize(lines.map((line) => line.text).join("\n"))
  if (text.includes("EXTRATO DE CONTA - CONSOLIDADO POR LANCAMENTOS")) return true
  return text.includes("RELACAO DE IMOVEIS") && text.includes("LANCAMENTOS EFETUADOS")
}

export function parseCesarRegoPrestacao(lines: TextLine[], competencia: string): PrestacaoAnalysis {
  const relacao: RelacaoImovel[] = []
  const lancamentos: Lancamento[] = []
  const resumoValores = new Map<string, number>()
  const alertas: string[] = []

  let section: "header" | "relacao" | "lancamentos" | "resumo" = "header"
  let currentInquilino = ""
  // Limite horizontal entre as colunas DEBITO e CREDITO, calibrado pelo
  // cabecalho da secao de lancamentos quando disponivel.
  let debitoCreditoBoundary: number | null = null
  let previous: { line: TextLine; target: RelacaoImovel | Lancamento | null } | null = null

  for (const line of lines) {
    const normalized = normalize(line.text)

    if (normalized.includes("RELACAO DE IMOVEIS")) {
      section = "relacao"
      previous = null
      continue
    }
    if (normalized.includes("LANCAMENTOS EFETUADOS")) {
      section = "lancamentos"
      previous = null
      continue
    }
    if (section === "lancamentos" && /^RESUMO\b/.test(normalized)) {
      section = "resumo"
      previous = null
      continue
    }

    if (section === "relacao" || section === "lancamentos") {
      // Cabecalhos de coluna (repetem a cada pagina)
      if (normalized.includes("CODIGO") && (normalized.includes("ENDERECO") || normalized.includes("DESCRICAO"))) {
        if (section === "lancamentos") {
          const debitoCell = line.cells.find((cell) => normalize(cell.text) === "DEBITO")
          const creditoCell = line.cells.find((cell) => normalize(cell.text) === "CREDITO")
          if (debitoCell && creditoCell) {
            debitoCreditoBoundary = (debitoCell.x + debitoCell.width + creditoCell.x) / 2
          }
        }
        previous = null
        continue
      }
    }

    if (section === "relacao") {
      const imovel = parseRelacaoRow(line)
      if (imovel) {
        relacao.push(imovel)
        previous = { line, target: imovel }
      } else if (isWrappedContinuation(line, previous) && previous?.target && "endereco" in previous.target) {
        previous.target.endereco = `${previous.target.endereco} ${line.text}`.trim()
      }
      continue
    }

    if (section === "lancamentos") {
      const lancamento = parseLancamentoRow(line, debitoCreditoBoundary, currentInquilino)
      if (lancamento) {
        lancamentos.push(lancamento)
        previous = { line, target: lancamento }
        continue
      }
      if (isWrappedContinuation(line, previous) && previous?.target && "descricao" in previous.target) {
        previous.target.descricao = `${previous.target.descricao} ${line.text}`.trim()
        continue
      }
      // Linha agrupadora com o nome do inquilino (quando o documento a possui
      // na camada de texto): texto sem valores, sem codigo e sem mes/ano.
      if (isTenantGroupLine(line)) {
        currentInquilino = line.text.trim()
        previous = null
      }
      continue
    }

    if (section === "resumo") {
      collectResumoValor(line, resumoValores)
    }
  }

  if (relacao.length === 0 && lancamentos.length === 0) {
    throw new Error("Layout Cesar Rego identificado, mas nenhuma secao foi extraida do PDF.")
  }

  const receitas = buildReceitas(relacao, lancamentos)
  const resumo = buildResumo(resumoValores, receitas, alertas)

  const totalLinhasReceitas = roundMoney(receitas.reduce((total, row) => total + row.total, 0))
  const totalLinhasComissoes = roundMoney(receitas.reduce((total, row) => total + (row.comissao ?? 0), 0))
  const totalLinhasRepasse = roundMoney(receitas.reduce((total, row) => total + (row.repasse ?? 0), 0))

  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Cesar Rego Imoveis",
    empreendimento: "",
    competencia,
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["relacao de imoveis", "lancamentos efetuados", "resumo"],
      estrategia: [
        "Extracao deterministica do layout C (Extrato de Conta - Consolidado por Lancamentos) via texto do PDF.",
      ],
      alertas,
    },
    receitas_por_imovel: receitas,
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: totalLinhasReceitas,
      total_linhas_comissoes: totalLinhasComissoes,
      total_linhas_repasse: totalLinhasRepasse,
      comissao_administracao: resumo.comissaoAdministracao,
      outras_comissoes_despesas: resumo.outrasDespesas,
      total_outras_comissoes_despesas: resumo.totalOutrasDespesas,
      total_comissao_despesas: resumo.totalComissaoDespesas,
      recebidos_em_nome_locador: resumo.recebidosEmNomeLocador,
      total_a_repassar: resumo.totalARepassar,
      repasse_embutido: true,
      confianca: 1.0,
    },
    totais: {
      total_receitas: totalLinhasReceitas,
      total_comissoes: totalLinhasComissoes,
      total_repassar: resumo.totalARepassar ?? totalLinhasRepasse,
    },
    campos_ausentes: [],
    observacoes: ["Processado deterministicamente a partir do texto do PDF (layout Cesar Rego)."],
    confianca_geral: 1.0,
  }
}

function parseRelacaoRow(line: TextLine): RelacaoImovel | null {
  const first = line.cells[0]
  if (!first || !CODIGO_RE.test(first.text)) return null

  const dateIndex = line.cells.findIndex((cell) => DATA_RE.test(cell.text))
  const enderecoCells = (dateIndex >= 0 ? line.cells.slice(1, dateIndex) : line.cells.slice(1)).filter(
    (cell) => !MONEY_RE.test(cell.text) && !MES_ANO_RE.test(cell.text),
  )
  const aluguelCell = line.cells.find((cell) => MONEY_RE.test(cell.text) && /R\$/.test(cell.text))
  const ultPgCell = line.cells.find((cell) => MES_ANO_RE.test(cell.text))
  const situacaoCells = line.cells.filter(
    (cell, index) =>
      index > 0 &&
      (dateIndex < 0 || index > dateIndex) &&
      /^[A-ZÀ-Ü.]+$/i.test(cell.text) &&
      !DATA_RE.test(cell.text),
  )

  return {
    codigo: first.text,
    endereco: enderecoCells.map((cell) => cell.text).join(" ").trim(),
    aluguel: aluguelCell ? parseMoney(aluguelCell.text) : null,
    ultimoPagamento: ultPgCell?.text ?? null,
    situacao: situacaoCells.length > 0 ? situacaoCells.map((cell) => cell.text).join(" ") : null,
  }
}

function parseLancamentoRow(
  line: TextLine,
  debitoCreditoBoundary: number | null,
  inquilino: string,
): Lancamento | null {
  const first = line.cells[0]
  if (!first || !CODIGO_RE.test(first.text)) return null

  const moneyCells = line.cells.filter((cell) => MONEY_RE.test(cell.text) && !/R\$/.test(cell.text))
  if (moneyCells.length === 0) return null

  const mesAnoCell = line.cells.find((cell) => MES_ANO_RE.test(cell.text))
  const dcCell = [...line.cells].reverse().find((cell) => /^[CD]$/.test(cell.text))

  const valorCell = moneyCells[0]
  const saldoCell = moneyCells.length > 1 ? moneyCells[moneyCells.length - 1] : null
  const valor = parseMoney(valorCell.text)

  let isCredito: boolean
  if (debitoCreditoBoundary !== null) {
    isCredito = valorCell.x + valorCell.width > debitoCreditoBoundary
  } else if (dcCell) {
    isCredito = dcCell.text === "C"
  } else {
    isCredito = true
  }

  const descricao = line.cells
    .slice(1)
    .filter(
      (cell) =>
        cell !== mesAnoCell &&
        cell !== valorCell &&
        cell !== saldoCell &&
        cell !== dcCell &&
        !/^(Sim|Nao|Não)$/i.test(cell.text),
    )
    .map((cell) => cell.text)
    .join(" ")
    .trim()

  return {
    codigo: first.text,
    descricao,
    mesAno: mesAnoCell?.text ?? null,
    debito: isCredito ? null : valor,
    credito: isCredito ? valor : null,
    saldo: saldoCell ? parseMoney(saldoCell.text) : null,
    inquilino,
  }
}

function isWrappedContinuation(
  line: TextLine,
  previous: { line: TextLine; target: RelacaoImovel | Lancamento | null } | null,
): boolean {
  if (!previous || previous.line.page !== line.page) return false
  const gap = previous.line.y - line.y
  if (gap <= 0 || gap >= WRAP_GAP_MAX) return false
  return !line.cells.some((cell) => MONEY_RE.test(cell.text) || CODIGO_RE.test(cell.text))
}

function isTenantGroupLine(line: TextLine): boolean {
  const text = line.text.trim()
  if (text.length < 3) return false
  if (line.cells.some((cell) => MONEY_RE.test(cell.text) || MES_ANO_RE.test(cell.text) || DATA_RE.test(cell.text))) {
    return false
  }
  const normalized = normalize(text)
  if (/^(CODIGO|DESCRICAO|RESUMO|TOTAL|VL\.|FORMA|BANCO|AGENCIA|CHV|RECEBI|DATA|ASSINATURA)/.test(normalized)) {
    return false
  }
  // Nome de pessoa ou empresa: letras maiusculas (com acentos), espacos e
  // pontuacao leve, sem sequencias numericas longas.
  return /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 .,&\-\/]+$/.test(text) && !/\d{3,}/.test(text)
}

function isDescontoLancamento(item: Lancamento): boolean {
  if (item.debito === null) return false
  const descricao = normalize(item.descricao)
  return /\bDESCONTO\b/.test(descricao) || /\bDESC\./.test(descricao)
}

function buildReceitas(relacao: RelacaoImovel[], lancamentos: Lancamento[]): ReceitaPorImovel[] {
  const porImovel = new Map<string, Lancamento[]>()
  for (const lancamento of lancamentos) {
    const grupo = porImovel.get(lancamento.codigo) ?? []
    grupo.push(lancamento)
    porImovel.set(lancamento.codigo, grupo)
  }

  const codigos = relacao.map((imovel) => imovel.codigo)
  for (const codigo of porImovel.keys()) {
    if (!codigos.includes(codigo)) codigos.push(codigo)
  }

  return codigos.map((codigo) => {
    const imovel = relacao.find((item) => item.codigo === codigo) ?? null
    const grupo = porImovel.get(codigo) ?? []

    if (grupo.length === 0) {
      const ultimoPagamento = imovel?.ultimoPagamento ? ` (ult. pg ${imovel.ultimoPagamento})` : ""
      return buildReceita(codigo, "", {
        observacao: joinObservacao(imovel?.endereco, `Sem lancamentos no mes${ultimoPagamento}.`),
      })
    }

    const creditos = grupo.filter((item) => item.credito !== null)
    const aluguelCreditos = creditos.filter((item) => normalize(item.descricao).startsWith("ALUGUEL"))
    const iptuCreditos = creditos.filter((item) => normalize(item.descricao).startsWith("IPTU"))
    const comissoes = grupo.filter(
      (item) => item.debito !== null && normalize(item.descricao).includes("COMISSAO"),
    )
    // Descontos sao debitos (ex.: "DESC. LOCATARIO", "DESCONTO FORNECIDO"); o
    // credito de "ENCARGOS FINANCEIROS POR ATRASO" nao entra aqui.
    const descontos = grupo.filter((item) => isDescontoLancamento(item) && !comissoes.includes(item))
    const outros = grupo.filter(
      (item) =>
        !aluguelCreditos.includes(item) &&
        !iptuCreditos.includes(item) &&
        !comissoes.includes(item) &&
        !descontos.includes(item),
    )

    const detalhes = outros.map((item) => {
      const natureza = item.credito !== null ? "credito" : "debito"
      const valor = item.credito ?? item.debito ?? 0
      return `${item.descricao}: ${natureza} de ${formatBRL(valor)}`
    })

    const aluguel = sumOrNull(aluguelCreditos.map((item) => item.credito ?? 0))
    const desconto = sumOrNull(descontos.map((item) => item.debito ?? 0))
    const aluguelComDesconto =
      desconto === null ? null : aluguel === null ? null : roundMoney(Math.max(aluguel - desconto, 0))

    // Mes de referencia do aluguel (competencia do proprio lancamento). Quando
    // difere da competencia do fechamento, sinaliza pagamento de mes anterior.
    const vencimento =
      aluguelCreditos.map((item) => item.mesAno).find((mes): mes is string => Boolean(mes)) ?? null

    // O nome do inquilino nao consta neste layout: usa o endereco como
    // identificacao da unidade (por isso o endereco sai da observacao).
    const inquilino = grupo[0].inquilino.trim() || imovel?.endereco?.trim() || ""

    return buildReceita(codigo, inquilino, {
      aluguel,
      desconto,
      aluguel_com_desconto: aluguelComDesconto,
      iptu: sumOrNull(iptuCreditos.map((item) => item.credito ?? 0)),
      comissao: sumOrNull(comissoes.map((item) => item.debito ?? 0)),
      total: roundMoney(creditos.reduce((total, item) => total + (item.credito ?? 0), 0)),
      repasse: grupo[grupo.length - 1].saldo,
      vencimento,
      observacao: detalhes.join("; ") || null,
    })
  })
}

function buildReceita(
  codigo: string,
  inquilino: string,
  values: Partial<
    Pick<
      ReceitaPorImovel,
      | "aluguel"
      | "desconto"
      | "aluguel_com_desconto"
      | "iptu"
      | "comissao"
      | "total"
      | "repasse"
      | "vencimento"
      | "observacao"
    >
  >,
): ReceitaPorImovel {
  return {
    apto: codigo,
    inquilino,
    aluguel: values.aluguel ?? null,
    desconto: values.desconto ?? null,
    aluguel_com_desconto: values.aluguel_com_desconto ?? null,
    garagem: null,
    vagas_garagem: null,
    agua: null,
    iptu: values.iptu ?? null,
    seguro_incendio: null,
    total: values.total ?? 0,
    comissao: values.comissao ?? null,
    repasse: values.repasse ?? null,
    vencimento: values.vencimento ?? null,
    observacao: values.observacao ?? null,
    confianca: 1.0,
  }
}

const RESUMO_LABELS: Array<{ key: string; pattern: RegExp }> = [
  { key: "alugueis_creditados", pattern: /ALUGUEIS CREDITADOS/ },
  { key: "irrf", pattern: /\bIRRF\b/ },
  { key: "comissoes", pattern: /\bCOMISSOES\b/ },
  { key: "outros_debitos", pattern: /OUTROS DEBITOS/ },
  { key: "outros_creditos", pattern: /OUTROS CREDITOS/ },
  { key: "total_bruto", pattern: /TOTAL BRUTO/ },
  { key: "pix", pattern: /\bPIX\b/ },
  { key: "ted", pattern: /\bTED\b/ },
  { key: "tx", pattern: /\bTX\b/ },
  { key: "encargos_sociais", pattern: /ENCARGOS SOCIAIS/ },
  { key: "total_liquido", pattern: /TOTAL LIQUIDO/ },
]

// O bloco RESUMO ocupa a coluna esquerda da pagina: rotulos comecam em
// x ~ 38-44 e os valores em x ~ 170-200. Textos a direita (recibo, dados
// bancarios) comecam em x >= 240 e nao podem contaminar os pares.
const RESUMO_LABEL_MAX_X = 100
const RESUMO_VALUE_MAX_X = 230

function collectResumoValor(line: TextLine, valores: Map<string, number>) {
  const labelCell = line.cells.find((cell) => cell.x < RESUMO_LABEL_MAX_X)
  if (!labelCell) return

  const valueCell = line.cells.find((cell) => cell.x < RESUMO_VALUE_MAX_X && MONEY_RE.test(cell.text))
  if (!valueCell) return

  const normalized = normalize(labelCell.text)
  for (const { key, pattern } of RESUMO_LABELS) {
    if (pattern.test(normalized) && !valores.has(key)) {
      valores.set(key, parseMoney(valueCell.text))
      return
    }
  }
}

function buildResumo(valores: Map<string, number>, receitas: ReceitaPorImovel[], alertas: string[]) {
  const recebidosEmNomeLocador = valores.get("alugueis_creditados") ?? null
  const totalARepassar = valores.get("total_liquido") ?? null
  const comissaoAdministracao =
    valores.get("comissoes") ?? sumOrNull(receitas.map((row) => row.comissao ?? 0))

  if (recebidosEmNomeLocador === null || totalARepassar === null) {
    alertas.push("Bloco RESUMO incompleto: ALUGUEIS CREDITADOS ou TOTAL LIQUIDO nao foram localizados.")
  }

  const outrasDespesas: PrestacaoResumoDespesa[] = []
  const pushDespesa = (key: string, descricao: string, sinal: 1 | -1 = 1) => {
    const valor = valores.get(key)
    if (valor !== undefined && valor !== 0) {
      outrasDespesas.push({ descricao, valor: roundMoney(sinal * valor), confianca: 1.0 })
    }
  }

  pushDespesa("irrf", "IRRF")
  pushDespesa("outros_debitos", "Outros debitos")
  pushDespesa("outros_creditos", "Outros creditos (reduz despesas)", -1)
  pushDespesa("pix", "Taxa de transferencia PIX")
  pushDespesa("ted", "Taxa de transferencia TED")
  pushDespesa("tx", "Taxa de transferencia")
  pushDespesa("encargos_sociais", "Encargos sociais (reduz despesas)", -1)

  const totalOutrasDespesas = roundMoney(outrasDespesas.reduce((total, item) => total + item.valor, 0))
  const totalComissaoDespesas =
    recebidosEmNomeLocador !== null && totalARepassar !== null
      ? roundMoney(recebidosEmNomeLocador - totalARepassar)
      : roundMoney((comissaoAdministracao ?? 0) + totalOutrasDespesas)

  return {
    recebidosEmNomeLocador,
    totalARepassar,
    comissaoAdministracao,
    outrasDespesas,
    totalOutrasDespesas,
    totalComissaoDespesas,
  }
}

function joinObservacao(endereco: string | null | undefined, detalhe: string | null): string | null {
  const parts = [endereco?.trim() || null, detalhe?.trim() || null].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(". ") : null
}

function sumOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  return roundMoney(values.reduce((total, value) => total + value, 0))
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".")
  return Number(cleaned)
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}
