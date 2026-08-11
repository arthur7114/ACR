import * as xlsx from "xlsx"
import type {
  AcordoRescisaoRecebido,
  InadimplenciaAcumulada,
  PrestacaoAnalysis,
  ReceitaPorImovel,
} from "@/lib/prestacao-types"
import { contarVagasDeTexto } from "@/lib/vagas"

type Row = unknown[]
type ColumnMap = Record<string, number>

const MONTHS: Record<string, { short: string; long: string }> = {
  "01": { short: "JAN", long: "JANEIRO" },
  "02": { short: "FEV", long: "FEVEREIRO" },
  "03": { short: "MAR", long: "MARCO" },
  "04": { short: "ABR", long: "ABRIL" },
  "05": { short: "MAI", long: "MAIO" },
  "06": { short: "JUN", long: "JUNHO" },
  "07": { short: "JUL", long: "JULHO" },
  "08": { short: "AGO", long: "AGOSTO" },
  "09": { short: "SET", long: "SETEMBRO" },
  "10": { short: "OUT", long: "OUTUBRO" },
  "11": { short: "NOV", long: "NOVEMBRO" },
  "12": { short: "DEZ", long: "DEZEMBRO" },
}

export function parseExcelPrestacao(fileBuffer: Buffer, competencia: string): PrestacaoAnalysis {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" })
  const sheetName = findCompetenceSheet(workbook.SheetNames, competencia)
  const rows = xlsx.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  })
  const vigenciaIndex = findRow(rows, (text) => text.includes("VIGENCIA"))
  if (vigenciaIndex < 0) {
    throw new Error(`Layout de prestação não reconhecido na aba "${sheetName}".`)
  }

  const empreendimento = firstText(rows[0]) || "Empreendimento não identificado"
  const receitas = parseReceitas(rows, vigenciaIndex, competencia)
  const intermediacoes = parseReceivedSection(rows, "INTERMEDIAC", competencia)
  const acordos = parseReceivedSection(rows, "ACORDOS", competencia)
  const atrasados = parseReceivedSection(rows, "ATRASADOS", competencia)
  const inadimplencias = parseInadimplencias(rows)
  const resumo = parseResumo(rows, receitas)

  if (receitas.length === 0 && intermediacoes.length === 0 && acordos.length === 0 && atrasados.length === 0) {
    throw new Error(`Layout de prestação sem lançamentos reconhecíveis na aba "${sheetName}".`)
  }
  if (resumo.recebidos === null || resumo.totalRepassar === null) {
    throw new Error(`Layout de prestação sem resumo financeiro completo na aba "${sheetName}".`)
  }

  const recebidos = resumo.recebidos
  const totalRepassar = resumo.totalRepassar
  const comissoesLinhas = sumMoney(receitas.map((item) => item.comissao))
  const repassesLinhas = sumMoney(receitas.map((item) => item.repasse))
  const receitasLinhas = sumMoney(receitas.map((item) => item.total))
  const totalComissaoDespesas = resumo.totalComissaoDespesas ?? roundMoney(recebidos - totalRepassar)

  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imoveis",
    empreendimento,
    competencia,
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["intermediações", "receitas", "acordos/rescisões", "inadimplências", "resumo financeiro"],
      estrategia: ["Extração determinística por cabeçalhos da planilha e valores monetários arredondados."],
      alertas: [],
    },
    receitas_por_imovel: receitas,
    acordos_rescisoes_recebidos: deduplicateReceivedItems([
      ...intermediacoes,
      ...acordos,
      ...atrasados,
    ]),
    inadimplencias_acumuladas: inadimplencias,
    resumo_financeiro: {
      numero_documento: null,
      data_emissao: null,
      data_vencimento: null,
      total_linhas_receitas: receitasLinhas,
      total_linhas_comissoes: comissoesLinhas,
      total_linhas_repasse: repassesLinhas,
      comissao_administracao: comissoesLinhas,
      outras_comissoes_despesas: resumo.despesas,
      total_outras_comissoes_despesas: roundMoney(Math.max(totalComissaoDespesas - comissoesLinhas, 0)),
      total_comissao_despesas: totalComissaoDespesas,
      recebidos_em_nome_locador: recebidos,
      total_a_repassar: totalRepassar,
      repasse_embutido: false,
      confianca: 1,
    },
    totais: {
      total_receitas: recebidos,
      total_comissoes: comissoesLinhas,
      total_repassar: totalRepassar,
    },
    campos_ausentes: [],
    observacoes: [`Processado deterministicamente a partir da aba ${sheetName}.`],
    confianca_geral: 1,
  }
}

function findCompetenceSheet(sheetNames: string[], competencia: string) {
  const match = competencia.match(/^(\d{4})-(\d{2})$/)
  if (!match || !MONTHS[match[2]]) throw new Error(`Competência inválida para planilha: ${competencia}.`)
  const [, year, month] = match
  const { short, long } = MONTHS[month]
  const shortYear = year.slice(-2)
  const candidates = [
    `${short} ${shortYear}`,
    short,
    `${long} ${year}`,
    `${long} ${shortYear}`,
  ].map(normalizeText)
  const normalizedNames = sheetNames.map((name) => ({ name, normalized: normalizeText(name) }))
  const exact = candidates
    .map((candidate) => normalizedNames.find((item) => item.normalized === candidate))
    .find(Boolean)
  if (exact) return exact.name
  const partial = normalizedNames.find(
    (item) => item.normalized.includes(short) && item.normalized.includes(shortYear),
  )
  if (partial) return partial.name
  throw new Error(`Nenhuma aba da competência ${competencia} foi encontrada na planilha.`)
}

function parseReceitas(rows: Row[], sectionIndex: number, competencia: string) {
  const table = locateTable(rows, sectionIndex)
  if (!table) return []
  return table.rows.map((row) => buildReceita(row, table.columns, competencia)).filter(Boolean) as ReceitaPorImovel[]
}

function buildReceita(row: Row, columns: ColumnMap, competencia: string): ReceitaPorImovel | null {
  const inquilino = textAt(row, columns.nome)
  const apto = textAt(row, columns.unidade) || (inquilino ? "UNIDADE ÚNICA" : "")
  if (!apto && !inquilino) return null
  const observacao = nullableText(row, columns.observacao)
  const diaVencimento = integerAt(row, columns.vencimento)
  return {
    apto,
    inquilino,
    aluguel: moneyAt(row, columns.aluguel),
    desconto: moneyAt(row, columns.desconto),
    aluguel_com_desconto: moneyAt(row, columns.aluguelComDesconto),
    garagem: moneyAt(row, columns.garagem),
    vagas_garagem: contarVagasDeTexto(observacao),
    agua: moneyAt(row, columns.agua),
    iptu: moneyAt(row, columns.iptu),
    seguro_incendio: moneyAt(row, columns.seguro),
    total: moneyAt(row, columns.total) ?? 0,
    comissao: moneyAt(row, columns.comissao),
    repasse: moneyAt(row, columns.repasse),
    competencia_original: competencia,
    competencia_recebimento: competencia,
    dia_vencimento: diaVencimento,
    vencimento: diaVencimento === null ? null : String(diaVencimento),
    observacao,
    confianca: 1,
  }
}

function parseReceivedSection(rows: Row[], marker: string, competencia: string) {
  const sectionIndex = findRow(rows, (text) => text.includes(marker) && text.includes("RECEBID"))
  if (sectionIndex < 0) return []
  const table = locateTable(rows, sectionIndex)
  if (!table) return []
  return table.rows.flatMap((row) => {
    const inquilino = textAt(row, table.columns.nome)
    const apto = nullableText(row, table.columns.unidade)
    const observacao = nullableText(row, table.columns.observacao)
    const totalRecebido = moneyAt(row, table.columns.total)
    const principal = moneyAt(row, table.columns.principal) ?? moneyAt(row, table.columns.aluguel)
    if (!inquilino && !apto) return []
    if ((totalRecebido ?? principal ?? 0) === 0) return []
    const tipo = inferReceivedType(`${marker} ${observacao ?? ""}`)
    const comissao = moneyAt(row, table.columns.comissao)
    const base = principal ?? totalRecebido ?? 0
    return [{
      tipo,
      apto,
      inquilino: inquilino || null,
      valor: base,
      iptu: moneyAt(row, table.columns.iptu),
      total_recebido: totalRecebido,
      repasse: moneyAt(row, table.columns.repasse),
      comissao,
      percentual: comissao !== null && base > 0 ? roundMoney((comissao / base) * 100) : null,
      competencia_original: parseCompetenceFromText(observacao),
      competencia_recebimento: competencia,
      observacao,
      confianca: 1,
    } satisfies AcordoRescisaoRecebido]
  })
}

function parseInadimplencias(rows: Row[]) {
  const sectionIndex = findRow(rows, (text) => text.startsWith("INADIMPLENCIAS"))
  if (sectionIndex < 0) return []
  const headerIndex = findHeaderRow(rows, sectionIndex)
  if (headerIndex < 0) return []
  const columns = mapColumns(rows[headerIndex])
  const items: InadimplenciaAcumulada[] = []
  let emptyRows = 0
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    const normalized = normalizeRow(row)
    if (normalized.includes("COMISSAO ADMINISTRACAO") || normalized.includes("OUTRAS COMISSOES")) break
    if (firstText(row).toUpperCase() === "TOTAL") break
    if (!row.some((cell) => cell !== null && cell !== "")) {
      emptyRows += 1
      if (emptyRows >= 2) break
      continue
    }
    emptyRows = 0
    const inquilino = textAt(row, columns.nome)
    const apto = nullableText(row, columns.unidade)
    if (!inquilino && !apto) continue
    const valor = moneyAt(row, columns.parcela) ?? moneyAt(row, columns.total) ?? moneyAt(row, columns.principal)
    if (valor === null) continue
    const observacao = nullableText(row, columns.observacao)
    items.push({
      apto: apto ?? (inquilino ? "UNIDADE ÚNICA" : null),
      inquilino: inquilino || null,
      valor,
      condicao: nullableText(row, columns.condicao),
      observacao,
      competencia_original: parseCompetenceFromText(observacao),
      dia_vencimento: integerAt(row, columns.vencimento),
      confianca: 1,
    })
  }
  return items
}

function parseResumo(rows: Row[], receitas: ReceitaPorImovel[]) {
  const recebidos = findSummaryMoney(rows, "RECEBIDOS EM NOME DO LOCADOR")
    ?? findSummaryMoney(rows, "SUBTOTAL RECEBIDOS EM NOME DO LOCADOR")
  const totalRepassar = findSummaryMoney(rows, "TOTAL A REPASSAR")
  const totalComissaoDespesas = findSummaryMoney(rows, "TOTAL COMISSAO + DESPESAS")
  const despesas = parseSummaryExpenses(rows)
  if (totalComissaoDespesas !== null && despesas.length === 0) {
    const comissao = sumMoney(receitas.map((item) => item.comissao))
    const residual = roundMoney(totalComissaoDespesas - comissao)
    if (residual > 0) despesas.push({ descricao: "Despesas consolidadas não discriminadas", valor: residual, confianca: 1 })
  }
  return { recebidos, totalRepassar, totalComissaoDespesas, despesas }
}

function parseSummaryExpenses(rows: Row[]) {
  const start = findRow(rows, (text) => text.includes("OUTRAS COMISSOES E DESPESAS"))
  if (start < 0) return []
  const items: Array<{ descricao: string; valor: number; confianca: number }> = []
  for (let index = start + 1; index < rows.length; index += 1) {
    const row = rows[index]
    const normalized = normalizeRow(row)
    if (normalized.includes("TOTAL COMISSAO + DESPESAS")) break
    const value = lastMoney(row)
    const label = lastTextBeforeMoney(row)
    if (value === null || !label) continue
    items.push({ descricao: label, valor: value, confianca: 1 })
  }
  return items
}

function locateTable(rows: Row[], sectionIndex: number) {
  const headerIndex = findHeaderRow(rows, sectionIndex)
  if (headerIndex < 0) return null
  const tableRows: Row[] = []
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (firstText(row).toUpperCase() === "TOTAL") break
    const normalized = normalizeRow(row)
    if (normalized.startsWith("INADIMPLENCIAS") || normalized.includes("RECEBIDAS EM")) break
    if (row.some((cell) => cell !== null && cell !== "")) tableRows.push(row)
  }
  return { columns: mapColumns(rows[headerIndex]), rows: tableRows }
}

function findHeaderRow(rows: Row[], sectionIndex: number) {
  const limit = Math.min(rows.length, sectionIndex + 5)
  for (let index = sectionIndex + 1; index < limit; index += 1) {
    if (normalizeText(rows[index][0]).startsWith("NOME")) return index
  }
  return -1
}

function mapColumns(header: Row): ColumnMap {
  const values = header.map(normalizeText)
  return {
    nome: findColumn(values, ["NOME"]),
    unidade: findColumn(values, ["APTO", "IMOVEL", "UNIDADE"]),
    aluguel: findColumn(values, ["ALUGUEL", "PRINCIPAL"]),
    principal: findColumn(values, ["PRINCIPAL"]),
    desconto: findColumn(values, ["DESCONTO"]),
    aluguelComDesconto: findColumn(values, ["ALUGUEL C/ DESCONTO", "ALUGUEL COM DESCONTO"]),
    garagem: findColumn(values, ["GARAGEM"]),
    agua: findColumn(values, ["AGUA"]),
    iptu: findColumn(values, ["IPTU"]),
    seguro: findColumn(values, ["SEG INC", "SEGURO"]),
    total: findColumn(values, ["TOTAL"]),
    comissao: findColumn(values, ["COMISSAO"]),
    repasse: findColumn(values, ["REPASSE"]),
    parcela: findColumn(values, ["R$ PARCELA", "PARCELA"]),
    condicao: findColumn(values, ["CONDICAO"]),
    observacao: findColumn(values, ["OBSERVACAO"]),
    vencimento: findColumn(values, ["VENC"]),
  }
}

function findColumn(values: string[], labels: string[]) {
  return values.findIndex((value) => labels.some((label) => value === label || value.startsWith(`${label} `)))
}

function findSummaryMoney(rows: Row[], label: string) {
  const normalizedLabel = normalizeText(label)
  const row = rows.find((candidate) => normalizeRow(candidate).includes(normalizedLabel))
  return row ? lastMoney(row) : null
}

function findRow(rows: Row[], predicate: (normalizedText: string) => boolean) {
  return rows.findIndex((row) => predicate(normalizeRow(row)))
}

function normalizeRow(row: Row) {
  return row.map(normalizeText).filter(Boolean).join(" ")
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
}

function firstText(row: Row) {
  return row.map((cell) => String(cell ?? "").trim()).find(Boolean) ?? ""
}

function textAt(row: Row, index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : ""
}

function nullableText(row: Row, index: number) {
  const value = textAt(row, index)
  return value || null
}

function moneyAt(row: Row, index: number) {
  return index >= 0 ? parseMoney(row[index]) : null
}

function integerAt(row: Row, index: number) {
  if (index < 0) return null
  const value = Number(row[index])
  return Number.isInteger(value) && value >= 1 && value <= 31 ? value : null
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : null
  const normalized = String(value).replace(/[^\d,.-]/g, "")
  if (!normalized) return null
  const parsed = normalized.includes(",")
    ? Number(normalized.replace(/\./g, "").replace(",", "."))
    : Number(normalized)
  return Number.isFinite(parsed) ? roundMoney(parsed) : null
}

function lastMoney(row: Row) {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (typeof row[index] === "number") return parseMoney(row[index])
  }
  return null
}

function lastTextBeforeMoney(row: Row) {
  const moneyIndex = row.findLastIndex((cell) => typeof cell === "number")
  if (moneyIndex < 0) return null
  for (let index = moneyIndex - 1; index >= 0; index -= 1) {
    const value = String(row[index] ?? "").trim()
    if (value) return value
  }
  return null
}

function inferReceivedType(value: string): AcordoRescisaoRecebido["tipo"] {
  const normalized = normalizeText(value)
  if (normalized.includes("INTERMEDIAC")) return "intermediacao"
  if (normalized.includes("ATRAS")) return "atraso"
  if (normalized.includes("RESCIS")) return "rescisao"
  if (normalized.includes("ACORD")) return "acordo"
  return "outro"
}

function parseCompetenceFromText(value: string | null) {
  if (!value) return null
  const normalized = normalizeText(value)
  const year = normalized.match(/20\d{2}/)?.[0]
  const month = Object.entries(MONTHS).find(([, names]) => normalized.includes(names.long))?.[0]
  return year && month ? `${year}-${month}` : null
}

function deduplicateReceivedItems(items: AcordoRescisaoRecebido[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = [item.tipo, item.apto, item.inquilino, item.valor, item.total_recebido].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sumMoney(values: Array<number | null | undefined>) {
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0))
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
