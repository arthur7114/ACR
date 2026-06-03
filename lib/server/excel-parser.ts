import * as xlsx from "xlsx"
import type { PrestacaoAnalysis, ReceitaPorImovel } from "@/lib/prestacao-types"

const MONTH_MAP: Record<string, string> = {
  "01": "JAN",
  "02": "FEV",
  "03": "MAR",
  "04": "ABR",
  "05": "MAI",
  "06": "JUN",
  "07": "JUL",
  "08": "AGO",
  "09": "SET",
  "10": "OUT",
  "11": "NOV",
  "12": "DEZ",
}

export function parseExcelPrestacao(fileBuffer: Buffer, competencia: string): PrestacaoAnalysis {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" })
  
  // Resolve sheet name from competency (e.g. "2026-03" -> "MAR 26")
  const [year, month] = competencia.split("-")
  const shortYear = year.substring(2)
  const shortMonth = MONTH_MAP[month] || ""
  
  // Try to find matching sheet (case-insensitive)
  const targetName = `${shortMonth} ${shortYear}`.toLowerCase()
  const sheetName = workbook.SheetNames.find(
    (name) => name.toLowerCase() === targetName || name.toLowerCase().includes(shortMonth.toLowerCase()) && name.includes(shortYear)
  ) || workbook.SheetNames[workbook.SheetNames.length - 1] // fallback to last sheet if not matched

  if (!sheetName) {
    throw new Error("Nenhuma aba encontrada no arquivo Excel.")
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  const receitas: ReceitaPorImovel[] = []
  let readingVigencia = false
  
  // Headers indices
  const colApto = 1
  const colNome = 0
  const colReajuste = 2
  const colAluguel = 3
  const colDesconto = 4
  const colAluguelDesconto = 5
  const colGaragem = 6
  const colAgua = 7
  const colIptu = 8
  const colSegInc = 9
  const colTotal = 10
  const colComissao = 11
  const colRepasse = 12
  const colObservacao = 13
  const colVenc = 14
  const colCarencia = 15

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const firstCell = String(row[0] || "").trim()

    // Section triggers
    if (firstCell.toUpperCase().includes("VIGÊNCIA DE") || firstCell.toUpperCase().includes("VIGENCIA DE")) {
      readingVigencia = true
      continue
    }

    if (firstCell.toUpperCase() === "TOTAL" && readingVigencia) {
      // End of vigencia table
      break
    }

    // Skip headers and irrelevant lines
    if (firstCell.toUpperCase() === "NOME" || firstCell.toUpperCase().includes("GRAND MESSEJANA")) {
      continue
    }

    if (readingVigencia) {
      const aptoVal = String(row[colApto] || "").trim()
      if (!aptoVal || isNaN(Number(aptoVal))) continue // Skip empty or total rows

      const aluguel = parseNumber(row[colAluguel])
      const total = parseNumber(row[colTotal]) || 0
      const comissao = parseNumber(row[colComissao])
      const repasse = parseNumber(row[colRepasse])
      
      const obs = row[colObservacao] ? String(row[colObservacao]).trim() : null
      const vagas_garagem = parseVagasGaragem(obs)

      receitas.push({
        apto: aptoVal,
        inquilino: row[colNome] ? String(row[colNome]).trim() : "",
        aluguel,
        desconto: parseNumber(row[colDesconto]),
        aluguel_com_desconto: parseNumber(row[colAluguelDesconto]),
        garagem: parseNumber(row[colGaragem]),
        vagas_garagem,
        agua: parseNumber(row[colAgua]),
        iptu: parseNumber(row[colIptu]),
        seguro_incendio: parseNumber(row[colSegInc]),
        total,
        comissao,
        repasse,
        vencimento: row[colVenc] ? String(row[colVenc]).trim() : null,
        observacao: obs,
        confianca: 1.0,
      })
    }
  }

  // Calculate final totals
  const total_receitas = receitas.reduce((sum, r) => sum + (r.total || 0), 0)
  const total_comissoes = receitas.reduce((sum, r) => sum + (r.comissao || 0), 0)
  const total_repassar = receitas.reduce((sum, r) => sum + (r.repasse || 0), 0)

  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imoveis",
    empreendimento: "Grand Messejana II",
    competencia,
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: ["receitas", "resumo financeiro"],
      estrategia: ["Extração determinística via planilha Excel local."],
      alertas: [],
    },
    receitas_por_imovel: receitas,
    acordos_rescisoes_recebidos: [],
    resumo_financeiro: {
      total_linhas_receitas: total_receitas,
      total_linhas_comissoes: total_comissoes,
      total_linhas_repasse: total_repassar,
      comissao_administracao: total_comissoes,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: total_comissoes,
      recebidos_em_nome_locador: total_receitas,
      total_a_repassar: total_repassar,
      confianca: 1.0,
    },
    totais: {
      total_receitas,
      total_comissoes,
      total_repassar,
    },
    campos_ausentes: [],
    observacoes: ["Processado deterministicamente a partir de planilha Excel."],
    confianca_geral: 1.0,
  }
}

function parseNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null
  const num = Number(val)
  return isNaN(num) ? null : num
}

function parseVagasGaragem(observacao: string | null): number | null {
  if (!observacao) return null
  const obsLower = observacao.toLowerCase()
  const match = obsLower.match(/(\d+)\s*vagas?/)
  if (match) {
    return parseInt(match[1], 10)
  }
  if (obsLower.includes("vaga")) {
    return 1
  }
  return null
}
