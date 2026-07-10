/**
 * Backfill pontual do histórico de fechamentos (Plural + Cesar Rego).
 * Ver docs/superpowers/specs/2026-07-08-backfill-historico-fechamentos-design.md
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-historico.ts --dry-run
 *   node --env-file=.env.local --import tsx scripts/backfill-historico.ts --commit
 *
 * Fatia cada extrato consolidado por empreendimento e cria 1 fechamento por
 * empreendimento por mês, reutilizando validatePackage + persistPackage.
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"

// Carrega .env.local (SUPABASE_*, etc.) sem depender de `node --env-file`,
// para rodar via `npx tsx`. Os módulos server leem env em tempo de chamada.
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
import {
  extractPdfTextLines,
  isCesarRegoConsolidado,
  parseCesarRegoPrestacao,
} from "../lib/server/cesar-rego-parser"
import { validatePackage } from "../lib/server/package-rechecks"
import { persistPackage } from "../lib/server/persist-package"
import { getCommercialRuleForValidation } from "../lib/server/regras-comerciais"
import { createSupabaseAdmin } from "../lib/server/supabase"
import { normalizeCadastroKey } from "../lib/server/cadastros"
import type {
  ClassifiedDocument,
  PrestacaoAnalysis,
  ReceitaPorImovel,
} from "../lib/prestacao-types"

const DOWNLOADS = process.env.HOME ? join(process.env.HOME, "Downloads") : "/Users/arthurbrito/Downloads"

const IMOBILIARIAS = {
  plural: { id: "6b51bfec-9ab5-41cd-9a80-c82b51c198ea", nome: "Plural Imobiliaria" },
  cesarRego: { id: "9aa92df3-a760-4360-8747-5275e1551037", nome: "Cesar Rego Imoveis" },
} as const

// Empreendimentos: os que existem reusam pelo ID; os novos têm id=null e são
// criados por nome (findOrCreate) na primeira vez.
type Empreendimento = { id: string | null; nome: string; imob: keyof typeof IMOBILIARIAS }
const EMP: Record<string, Empreendimento> = {
  joseWalter: { id: "bba97a49-ffe4-46cd-a1cf-cffe8e7ca4e5", nome: "Galpão José Walter", imob: "plural" },
  fernandoRocha: { id: null, nome: "Fernando Rocha", imob: "plural" },
  pompilio: { id: "28e2156a-6295-4b52-92d2-1e632497dc4f", nome: "Galpão Pompilio Gomes", imob: "cesarRego" },
  joaoCordeiro: { id: null, nome: "João Cordeiro", imob: "cesarRego" },
}

// Mapa código-do-imóvel → chave de empreendimento.
const CESAR_CODE_TO_EMP: Record<string, keyof typeof EMP> = {
  "0002520": "joaoCordeiro",
  "0002521": "joaoCordeiro",
  "0002526": "pompilio",
  "0002527": "pompilio",
}
const PLURAL_CODE_TO_EMP: Record<string, keyof typeof EMP> = {
  AP0361: "fernandoRocha",
  GA0002: "joseWalter",
}

const MESES: Record<string, string> = {
  JANEIRO: "01",
  FEVEREIRO: "02",
  "MARÇO": "03",
  ABRIL: "04",
  MAIO: "05",
}

type Job = { imob: keyof typeof IMOBILIARIAS; layout: "plural" | "cesar"; mes: string; file: string }
const JOBS: Job[] = [
  ...["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO"].map(
    (m): Job => ({ imob: "plural", layout: "plural", mes: m, file: `PRESTAÇÃO DE CONTAS PLURAL ${m}.pdf` }),
  ),
  ...["FEVEREIRO", "MARÇO", "ABRIL", "MAIO"].map(
    (m): Job => ({ imob: "cesarRego", layout: "cesar", mes: m, file: `PRESTAÇÃO DE CONTAS CESAR REGO ${m}.pdf` }),
  ),
]

function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".")
  return Number(cleaned)
}

function competenciaFrom(mes: string): string {
  return `2026-${MESES[mes]}`
}

// ---- Parser Plural (layout "Extrato agrupado simplificado"), local ao script ----
function parsePluralReceitas(lines: { text: string }[]): ReceitaPorImovel[] {
  const receitas: ReceitaPorImovel[] = []
  let current: { code: string; desc: string; aluguel: number; comissao: number; repasse: number; outras: string[] } | null = null

  const close = () => {
    if (!current) return
    receitas.push({
      apto: current.code,
      inquilino: current.desc,
      aluguel: current.aluguel || null,
      desconto: null,
      aluguel_com_desconto: null,
      garagem: null,
      vagas_garagem: null,
      agua: null,
      iptu: null,
      seguro_incendio: null,
      total: roundMoney(current.aluguel),
      comissao: current.comissao || null,
      repasse: roundMoney(current.repasse),
      vencimento: null,
      observacao: current.outras.join("; ") || null,
      confianca: 1.0,
    })
    current = null
  }

  const moneyAtEnd = (text: string): number | null => {
    const m = text.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/)
    return m ? parseMoney(m[1]) : null
  }

  for (const line of lines) {
    const text = line.text.trim()
    if (/^Total do extrato/i.test(text)) {
      close()
      break
    }
    const contrato = text.match(/^Contrato\s+([A-Z]{2}\d+)\S*\s*-\s*(.+)/i)
    if (contrato) {
      close()
      current = { code: contrato[1].toUpperCase(), desc: contrato[2].trim(), aluguel: 0, comissao: 0, repasse: 0, outras: [] }
      continue
    }
    if (!current) continue
    if (/^Total para repasse/i.test(text)) {
      current.repasse = moneyAtEnd(text) ?? 0
      close()
      continue
    }
    const val = moneyAtEnd(text)
    if (val === null) continue
    if (/^Aluguel/i.test(text)) current.aluguel = val
    else if (/Taxa de administra/i.test(text)) current.comissao = Math.abs(val)
    else current.outras.push(`${text.replace(/\s{2,}/g, " ")}`)
  }
  close()
  return receitas
}

// ---- Recompõe resumo_financeiro/totais a partir de um subconjunto de linhas ----
function buildSubset(
  base: Pick<PrestacaoAnalysis, "plano_extracao">,
  imobiliariaNome: string,
  empreendimentoNome: string,
  competencia: string,
  rows: ReceitaPorImovel[],
): PrestacaoAnalysis {
  const receitas = roundMoney(rows.reduce((t, r) => t + r.total, 0))
  const comissoes = roundMoney(rows.reduce((t, r) => t + (r.comissao ?? 0), 0))
  const repasse = roundMoney(rows.reduce((t, r) => t + (r.repasse ?? 0), 0))
  const totalComissaoDespesas = roundMoney(receitas - repasse)
  const outras = roundMoney(totalComissaoDespesas - comissoes)

  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: imobiliariaNome,
    empreendimento: empreendimentoNome,
    competencia,
    plano_extracao: base.plano_extracao,
    receitas_por_imovel: rows,
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: receitas,
      total_linhas_comissoes: comissoes,
      total_linhas_repasse: repasse,
      comissao_administracao: comissoes,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: outras,
      total_comissao_despesas: totalComissaoDespesas,
      recebidos_em_nome_locador: receitas,
      total_a_repassar: repasse,
      repasse_embutido: true,
      confianca: 1.0,
    },
    totais: { total_receitas: receitas, total_comissoes: comissoes, total_repassar: repasse },
    campos_ausentes: [],
    observacoes: [`Backfill determinístico — fatiado por empreendimento (${empreendimentoNome}).`],
    confianca_geral: 1.0,
  }
}

async function resolveEmpreendimentoId(emp: Empreendimento, commit: boolean): Promise<string> {
  if (emp.id) return emp.id
  const supabase = createSupabaseAdmin()
  const { data: rows } = await supabase.from("empreendimentos").select("id,nome")
  const key = normalizeCadastroKey(emp.nome)
  const existing = (rows ?? []).find((r) => normalizeCadastroKey(r.nome as string) === key)
  if (existing) {
    emp.id = existing.id as string
    return emp.id
  }
  if (!commit) {
    emp.id = `NOVO(${emp.nome})`
    return emp.id
  }
  const { data, error } = await supabase
    .from("empreendimentos")
    .insert({ nome: emp.nome, descricao: `Empreendimento criado no backfill de histórico.`, ativo: true })
    .select("id")
    .single()
  if (error) throw error
  emp.id = data.id as string
  console.log(`  + empreendimento criado: "${emp.nome}" (${emp.id})`)
  return emp.id
}

async function main() {
  const commit = process.argv.includes("--commit")
  const dryRun = !commit
  console.log(`\n=== Backfill histórico — modo ${dryRun ? "DRY-RUN (nada gravado)" : "COMMIT (grava na base real)"} ===\n`)

  // Agrupa por (empreendimento, competência) através dos PDFs.
  type Bucket = { emp: Empreendimento; competencia: string; rows: ReceitaPorImovel[]; file: string; fileBuffer: Buffer; plano: PrestacaoAnalysis["plano_extracao"] }
  const buckets: Bucket[] = []

  for (const job of JOBS) {
    const path = join(DOWNLOADS, job.file)
    const fileBuffer = readFileSync(path)
    const competencia = competenciaFrom(job.mes)
    const lines = await extractPdfTextLines(fileBuffer)

    let rows: ReceitaPorImovel[]
    let plano: PrestacaoAnalysis["plano_extracao"]
    let codeToEmp: Record<string, keyof typeof EMP>

    if (job.layout === "cesar") {
      if (!isCesarRegoConsolidado(lines)) throw new Error(`Layout Cesar Rego não detectado em ${job.file}`)
      const analysis = parseCesarRegoPrestacao(lines, competencia)
      rows = analysis.receitas_por_imovel
      plano = analysis.plano_extracao
      codeToEmp = CESAR_CODE_TO_EMP
    } else {
      rows = parsePluralReceitas(lines)
      plano = {
        documento_lido_integralmente: true,
        secoes_identificadas: ["extrato agrupado simplificado"],
        estrategia: ["Parser determinístico local (layout Plural)."],
        alertas: [],
      }
      codeToEmp = PLURAL_CODE_TO_EMP
    }

    // Particiona as linhas por empreendimento.
    const byEmp = new Map<keyof typeof EMP, ReceitaPorImovel[]>()
    for (const row of rows) {
      const empKey = codeToEmp[row.apto]
      if (!empKey) {
        console.warn(`  ! linha sem mapa de empreendimento (${job.file}): apto=${row.apto} — ignorada`)
        continue
      }
      const arr = byEmp.get(empKey) ?? []
      arr.push(row)
      byEmp.set(empKey, arr)
    }

    for (const [empKey, empRows] of byEmp) {
      buckets.push({ emp: EMP[empKey], competencia, rows: empRows, file: job.file, fileBuffer, plano })
    }
  }

  console.log(`Total de fechamentos a processar: ${buckets.length}\n`)

  let ok = 0
  for (const b of buckets) {
    const imob = IMOBILIARIAS[b.emp.imob]
    const empId = await resolveEmpreendimentoId(b.emp, commit)
    const subset = buildSubset({ plano_extracao: b.plano }, imob.nome, b.emp.nome, b.competencia, b.rows)

    const classified: ClassifiedDocument = {
      fileName: b.file,
      fileType: "application/pdf",
      fileSize: b.fileBuffer.length,
      documentType: "prestacao_contas",
      confidence: 1,
      reason: "Backfill determinístico.",
    }

    const commercialRule = await getCommercialRuleForValidation(imob.id, empId.startsWith("NOVO(") ? null : empId)
    const validation = validatePackage({
      documents: [classified],
      prestacao: subset,
      repasse: null,
      despesas: null,
      reajuste: null,
      commercialRule,
      historicalAgreementKeys: [],
    })

    const t = validation.totals
    console.log(
      `[${b.emp.imob === "plural" ? "Plural" : "CesarRego"}] ${b.emp.nome} · ${b.competencia} · ${b.rows.length} linha(s)` +
        ` → receitas ${t.total_receitas} | comissão ${t.total_comissoes} | repasse ${t.total_a_repassar}` +
        ` | parecer ${validation.parecer.status}${validation.parecer.requer_revisao_humana ? " (revisão)" : ""}`,
    )

    if (dryRun) {
      ok++
      continue
    }

    await persistPackage({
      files: [{ fileName: b.file, fileType: "application/pdf", fileSize: b.fileBuffer.length, fileBuffer: b.fileBuffer, classification: classified }],
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
        id: `${empId}:${b.competencia}`,
        imobiliariaId: imob.id,
        imobiliariaNome: imob.nome,
        empreendimentoId: empId,
        empreendimentoNome: b.emp.nome,
        competencia: b.competencia,
      },
    })
    ok++
    console.log(`  ✓ persistido`)
  }

  console.log(`\n=== ${dryRun ? "DRY-RUN concluído" : "COMMIT concluído"}: ${ok}/${buckets.length} fechamentos ===\n`)
}

main().catch((error) => {
  console.error("FALHA:", error)
  process.exit(1)
})
