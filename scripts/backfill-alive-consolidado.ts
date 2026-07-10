/**
 * Backfill CORRETO das prestações "CAIXA ADMINISTRAÇÃO LOCAÇÃO" da Alive (2026).
 *
 * Supersede scripts/backfill-excel-2026.ts. O parser anterior somava só a tabela
 * "VIGÊNCIA" (rent-roll do mês corrente), mas nessas planilhas o dinheiro de
 * inquilinos em atraso cai em "ACORDOS/RESCISÕES RECEBIDAS" e o total real está no
 * BLOCO DE RESUMO no rodapé ("R$/SUBTOTAL RECEBIDOS EM NOME DO LOCADOR" e
 * "TOTAL A REPASSAR"). Resultado: os 4 fechamentos já carregados ficaram
 * subestimados. Este script lê o resumo (fonte autoritativa) e monta as linhas por
 * imóvel juntando VIGÊNCIA + recebidos atrasados. É repasse embutido, como os
 * consolidados de Plural/Cesar Rego.
 *
 * Uso:
 *   npx tsx scripts/backfill-alive-consolidado.ts --dry-run
 *   npx tsx scripts/backfill-alive-consolidado.ts --commit
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import * as xlsx from "xlsx"
import { validatePackage } from "../lib/server/package-rechecks"
import { persistPackage } from "../lib/server/persist-package"
import { getCommercialRuleForValidation } from "../lib/server/regras-comerciais"
import type { ClassifiedDocument, PrestacaoAnalysis, ReceitaPorImovel } from "../lib/prestacao-types"

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnvLocal()

const DOWNLOADS = join(process.env.HOME ?? "/Users/arthurbrito", "Downloads")
const ALIVE = { id: "d3d5ec0b-eaae-4ccf-b7fa-6dd6a3e79d45", nome: "Alive Imóveis" }
const FILE_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const ARQUIVOS: { file: string; empId: string; empNome: string }[] = [
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - GM I.xlsx", empId: "e0bea7ea-4a6f-40c9-9c3d-477e207ad923", empNome: "Grand Messejana I" },
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - GM II (1).xlsx", empId: "0634e044-ef49-4c12-8021-138977bd0a4b", empNome: "Grand Messejana II" },
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - GRAND CASTELÃO.xlsx", empId: "cda55e14-df4a-4ef5-bdb9-381e6c9eed03", empNome: "Grand Castelão I" },
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - LOC MAIS.xlsx", empId: "ae2d3019-b916-4511-9294-55eab91ba812", empNome: "Locmais" },
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - GRAND MARACANAÚ.xlsx", empId: "f594e267-c589-41ef-8aa7-79e08709a987", empNome: "GRAND MARACANAÚ" },
  { file: "CAIXA ADMINISTRAÇÃO LOCAÇÃO - TERRENO CASTELÃO.xlsx", empId: "480c8ce7-c25e-4302-9506-f58c75471175", empNome: "TERRENO CASTELÃO" },
]

const COMPETENCIAS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
const MONTH_MAP: Record<string, string> = { "01": "JAN", "02": "FEV", "03": "MAR", "04": "ABR", "05": "MAI" }

function norm(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
}
function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
function round(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function resolveSheet(names: string[], competencia: string): string | null {
  const [year, month] = competencia.split("-")
  const y2 = year.slice(2)
  const mon = MONTH_MAP[month]
  return (
    names.find((n) => {
      const N = norm(n)
      return N.includes(mon) && N.includes(y2) && !/(2021|2022|2023|2024|2025)/.test(N)
    }) ?? null
  )
}

function resolveColumns(header: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {}
  header.forEach((cell, i) => {
    const h = norm(cell)
    if (h === "NOME") idx.nome = i
    else if (h === "APTO" || h === "IMOVEL" || h === "UNIDADE") idx.apto = i
    else if (h.startsWith("ALUGUEL C")) idx.aluguelDesc = i
    else if (h === "ALUGUEL") idx.aluguel = i
    else if (h === "DESCONTO") idx.desconto = i
    else if (h === "GARAGEM") idx.garagem = i
    else if (h === "AGUA") idx.agua = i
    else if (h === "IPTU") idx.iptu = i
    else if (h.startsWith("SEG")) idx.seg = i
    else if (h === "TOTAL") idx.total = i
    else if (h.startsWith("COMISSAO")) idx.comissao = i
    else if (h.startsWith("REPASSE")) idx.repasse = i
    else if (h.startsWith("OBSERVA")) idx.obs = i
    else if (h.startsWith("VENC")) idx.venc = i
  })
  return idx
}

type Row = unknown[]
const isTitle = (a: string) => /^(VIGENCIA|INTERMEDIACAO|ACORDO|ATRASADO|RESCISAO|INADIMPL)/.test(a) || a.includes("RESCISOES RECEBIDAS")

// Seções da planilha (título em col 0, cabeçalho "NOME..." na linha seguinte, dados até "TOTAL"/próximo título).
function parseSections(rows: Row[]): { title: string; cols: Record<string, number>; data: Row[] }[] {
  const out: { title: string; cols: Record<string, number>; data: Row[] }[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    const a = norm(r[0])
    if (!isTitle(a)) continue
    const header = rows[i + 1]
    if (!Array.isArray(header) || norm(header[0]) !== "NOME") continue
    const cols = resolveColumns(header)
    const data: Row[] = []
    for (let k = i + 2; k < rows.length; k++) {
      const rr = rows[k]
      if (!Array.isArray(rr) || rr.length === 0) continue
      if (norm(rr[0]) === "TOTAL") break
      if (isTitle(norm(rr[0]))) break
      data.push(rr)
    }
    out.push({ title: a, cols, data })
  }
  return out
}

// Extrai um valor do bloco de resumo pelo rótulo (rótulo numa célula-texto, valor numérico à direita).
function summaryValue(rows: Row[], test: (label: string) => boolean): number | null {
  for (const r of rows) {
    if (!Array.isArray(r)) continue
    for (let j = 0; j < r.length; j++) {
      const cell = r[j]
      if (typeof cell !== "string") continue
      if (!test(norm(cell))) continue
      const v = r.slice(j + 1).find((x) => typeof x === "number")
      if (typeof v === "number") return v
    }
  }
  return null
}

function lineToReceita(row: Row, c: Record<string, number>): ReceitaPorImovel | null {
  const apto = c.apto != null ? String(row[c.apto] ?? "").trim() : ""
  const nome = String(row[c.nome] ?? "").trim()
  const total = num(row[c.total]) ?? 0
  if (!nome && !apto) return null
  if (total === 0) return null // só linhas efetivamente recebidas
  const obs = c.obs != null && row[c.obs] != null ? String(row[c.obs]).trim() : null
  return {
    apto: apto || nome,
    inquilino: nome,
    aluguel: num(row[c.aluguel]),
    desconto: num(row[c.desconto]),
    aluguel_com_desconto: c.aluguelDesc != null ? num(row[c.aluguelDesc]) : null,
    garagem: c.garagem != null ? num(row[c.garagem]) : null,
    vagas_garagem: null,
    agua: c.agua != null ? num(row[c.agua]) : null,
    iptu: c.iptu != null ? num(row[c.iptu]) : null,
    seguro_incendio: c.seg != null ? num(row[c.seg]) : null,
    total: round(total),
    comissao: num(row[c.comissao]),
    repasse: num(row[c.repasse]),
    vencimento: c.venc != null && row[c.venc] != null ? String(row[c.venc]).trim() : null,
    observacao: obs,
    confianca: 1.0,
  }
}

type Parsed = {
  recebidos: number
  repasse: number
  totalComissaoDespesas: number
  comissaoAdmin: number
  outrasDespesas: number
  linhas: ReceitaPorImovel[]
  lineSum: number
}

function parseSheet(sheet: xlsx.WorkSheet): Parsed | null {
  const rows = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1 })
  const recebidos = summaryValue(rows, (l) => l.includes("RECEBIDOS EM NOME DO LOCADOR"))
  const repasse = summaryValue(rows, (l) => l.startsWith("TOTAL A REPASSAR"))
  if (recebidos == null || repasse == null) return null

  const comissaoAdmin =
    summaryValue(
      rows,
      (l) => /^COMISSAO ADMINISTRACAO/.test(l) || /^COMISSAO \d+ ?%/.test(l) || l === "COMISSAO",
    ) ?? null

  // Linhas por imóvel efetivamente recebidas: VIGÊNCIA (mês corrente) + INTERMEDIAÇÃO
  // (1º aluguel/intermediação recebido em nome do locador) + recebidos atrasados
  // (ACORDO/ATRASADO/RESCISÃO RECEBIDA). Nunca INADIMPLÊNCIA (valores devidos, não recebidos).
  const sections = parseSections(rows)
  const linhas: ReceitaPorImovel[] = []
  let lineComissao = 0
  for (const s of sections) {
    // "INADIMPLÊNCIAS" pura (valores devidos) cai fora por não bater isReceita;
    // "INADIMPLÊNCIAS/…/RESCISÕES RECEBIDAS" entra por conter "RECEBID".
    const isReceita = /^VIGENCIA/.test(s.title) || /^INTERMEDIACAO/.test(s.title) || s.title.includes("RECEBID")
    if (!isReceita) continue
    const isInterm = /^INTERMEDIACAO/.test(s.title)
    for (const row of s.data) {
      const rec = lineToReceita(row, s.cols)
      if (rec) {
        linhas.push(rec)
        // Fallback de comissão de ADMINISTRAÇÃO: soma só as comissões de vigência/acordos.
        // A comissão da intermediação (ex.: 60%) é outra rubrica e não entra aqui.
        if (!isInterm) lineComissao += rec.comissao ?? 0
      }
    }
  }
  const lineSum = round(linhas.reduce((t, r) => t + r.total, 0))
  const totalComissaoDespesas = round(recebidos - repasse)
  const comissao = round(comissaoAdmin ?? lineComissao)
  const outrasDespesas = round(totalComissaoDespesas - comissao)
  return { recebidos: round(recebidos), repasse: round(repasse), totalComissaoDespesas, comissaoAdmin: comissao, outrasDespesas, linhas, lineSum }
}

function buildAnalysis(empNome: string, competencia: string, p: Parsed): PrestacaoAnalysis {
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: ALIVE.nome,
    empreendimento: empNome,
    competencia,
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["vigência (rent roll)", "acordos/rescisões recebidas", "resumo financeiro"],
      estrategia: ["Backfill determinístico via Excel — totais do bloco de resumo (recebidos em nome do locador / total a repassar)."],
      alertas: [],
    },
    receitas_por_imovel: p.linhas,
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: p.recebidos,
      total_linhas_comissoes: p.comissaoAdmin,
      total_linhas_repasse: p.repasse,
      comissao_administracao: p.comissaoAdmin,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: p.outrasDespesas,
      total_comissao_despesas: p.totalComissaoDespesas,
      recebidos_em_nome_locador: p.recebidos,
      total_a_repassar: p.repasse,
      repasse_embutido: true,
      confianca: 1.0,
    },
    totais: { total_receitas: p.recebidos, total_comissoes: p.comissaoAdmin, total_repassar: p.repasse },
    campos_ausentes: [],
    observacoes: [`Backfill determinístico via Excel — resumo consolidado (${empNome}).`],
    confianca_geral: 1.0,
  }
}

async function main() {
  const commit = process.argv.includes("--commit")
  const dryRun = !commit
  console.log(`\n=== Backfill Alive consolidado — ${dryRun ? "DRY-RUN (nada gravado)" : "COMMIT (grava na base real)"} ===\n`)

  let ok = 0
  let total = 0
  for (const arq of ARQUIVOS) {
    const path = join(DOWNLOADS, arq.file)
    if (!existsSync(path)) {
      console.warn(`[${arq.empNome}] arquivo não encontrado: ${arq.file}`)
      continue
    }
    const buffer = readFileSync(path)
    const workbook = xlsx.read(buffer, { type: "buffer" })
    for (const competencia of COMPETENCIAS) {
      const sheetName = resolveSheet(workbook.SheetNames, competencia)
      if (!sheetName) continue
      total++
      const parsed = parseSheet(workbook.Sheets[sheetName])
      if (!parsed) {
        console.warn(`[${arq.empNome}] ${competencia} (aba ${sheetName}) · resumo não encontrado — PULADO`)
        continue
      }
      const analysis = buildAnalysis(arq.empNome, competencia, parsed)

      const classified: ClassifiedDocument = {
        fileName: arq.file,
        fileType: FILE_TYPE,
        fileSize: buffer.length,
        documentType: "prestacao_contas",
        confidence: 1,
        reason: "Backfill determinístico (Excel, resumo consolidado).",
      }
      const commercialRule = await getCommercialRuleForValidation(ALIVE.id, arq.empId)
      const validation = validatePackage({
        documents: [classified],
        prestacao: analysis,
        repasse: null,
        despesas: null,
        reajuste: null,
        commercialRule,
        historicalAgreementKeys: [],
      })
      const t = validation.totals
      const check = Math.abs(parsed.recebidos - parsed.totalComissaoDespesas - parsed.repasse) < 0.02 ? "ok" : "*** DIVERGE"
      const lineChk = Math.abs(parsed.lineSum - parsed.recebidos) < 0.5 ? "≈" : `≠(linhas ${parsed.lineSum})`
      console.log(
        `[${arq.empNome}] ${competencia} (${sheetName}) · ${parsed.linhas.length} linha(s)` +
          ` → recebido ${t.total_receitas} | comissão ${t.total_comissoes} | repasse ${t.total_a_repassar}` +
          ` | resumo ${check} | linhas${lineChk} | parecer ${validation.parecer.status}`,
      )

      if (dryRun) {
        ok++
        continue
      }
      await persistPackage({
        files: [{ fileName: arq.file, fileType: FILE_TYPE, fileSize: buffer.length, fileBuffer: buffer, classification: classified }],
        analysis: {
          documents: [classified],
          prestacao: validation.prestacao,
          repasse: validation.repasse,
          despesas: validation.despesas,
          reajuste: validation.reajuste,
          totals: validation.totals,
          parecer: validation.parecer,
          rechecks: validation.rechecks,
          guardrails: validation.guardrails,
        },
        fechamentoContext: {
          id: `${arq.empId}:${competencia}`,
          imobiliariaId: ALIVE.id,
          imobiliariaNome: ALIVE.nome,
          empreendimentoId: arq.empId,
          empreendimentoNome: arq.empNome,
          competencia,
        },
      })
      ok++
      console.log(`  ✓ persistido`)
    }
  }
  console.log(`\n=== ${dryRun ? "DRY-RUN concluído" : "COMMIT concluído"}: ${ok}/${total} fechamentos ===\n`)
}

main().catch((error) => {
  console.error("FALHA:", error)
  process.exit(1)
})
