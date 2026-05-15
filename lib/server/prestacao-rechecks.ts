import type {
  PrestacaoAnalysis,
  PrestacaoGuardrail,
  PrestacaoRecheck,
  TechnicalOpinion,
} from "@/lib/prestacao-types"

const MONEY_TOLERANCE = 0.01
const MIN_CONFIDENCE = 0.7

export function applyDeterministicRechecks(analysis: PrestacaoAnalysis) {
  const calculatedTotals = {
    total_receitas: roundMoney(sum(analysis.receitas_por_imovel.map((row) => row.total))),
    total_comissoes: roundMoney(sum(analysis.receitas_por_imovel.map((row) => row.comissao ?? 0))),
    total_repassar: roundMoney(sum(analysis.receitas_por_imovel.map((row) => row.repasse ?? 0))),
  }

  const normalizedAnalysis: PrestacaoAnalysis = {
    ...analysis,
    totais: calculatedTotals,
    confianca_geral: clampConfidence(analysis.confianca_geral),
    receitas_por_imovel: analysis.receitas_por_imovel.map((row) => ({
      ...row,
      total: roundMoney(row.total),
      comissao: row.comissao === null ? null : roundMoney(row.comissao),
      repasse: row.repasse === null ? null : roundMoney(row.repasse),
      confianca: clampConfidence(row.confianca),
    })),
  }

  const rechecks: PrestacaoRecheck[] = [
    compareTotal("total_receitas", "Total de receitas", analysis.totais.total_receitas, calculatedTotals.total_receitas),
    compareTotal(
      "total_comissoes",
      "Total de comissoes",
      analysis.totais.total_comissoes,
      calculatedTotals.total_comissoes,
    ),
    compareTotal(
      "total_repassar",
      "Total a repassar",
      analysis.totais.total_repassar,
      calculatedTotals.total_repassar,
    ),
    checkRows(normalizedAnalysis),
    checkConfidence(normalizedAnalysis),
  ]

  const guardrails: PrestacaoGuardrail[] = [
    {
      id: "schema",
      label: "Schema estruturado",
      status: "passed",
      message: "A resposta da IA foi aceita pelo schema estrito.",
    },
    {
      id: "document_type",
      label: "Tipo de documento",
      status: normalizedAnalysis.tipo_documento === "prestacao_contas" ? "passed" : "blocked",
      message: "Documento classificado como prestacao de contas.",
    },
    {
      id: "deterministic_totals",
      label: "Totais recalculados",
      status: "passed",
      message: "Totais finais foram recalculados por codigo e substituem os totais sugeridos pela IA.",
    },
    {
      id: "confidence_floor",
      label: "Confianca minima",
      status: hasLowConfidence(normalizedAnalysis) ? "warning" : "passed",
      message: hasLowConfidence(normalizedAnalysis)
        ? "Ha linhas ou parecer abaixo de 0.70; revisao humana permanece obrigatoria."
        : "Todas as confiancas ficaram acima do piso de 0.70.",
    },
  ]

  const parecer = buildTechnicalOpinion(rechecks, normalizedAnalysis)

  return {
    analysis: normalizedAnalysis,
    calculatedTotals,
    rechecks,
    guardrails,
    parecer,
  }
}

function compareTotal(id: string, label: string, extracted: number | null, calculated: number): PrestacaoRecheck {
  if (extracted === null) {
    return {
      id,
      label,
      status: "warning",
      message: `${label} nao veio explicitamente da IA; valor calculado por codigo.`,
      expected: calculated,
      actual: null,
      difference: null,
    }
  }

  const actual = roundMoney(extracted)
  const difference = roundMoney(Math.abs(actual - calculated))
  const status = difference <= MONEY_TOLERANCE ? "passed" : "failed"

  return {
    id,
    label,
    status,
    message:
      status === "passed"
        ? `${label} bate com o recalculo deterministico.`
        : `${label} diverge do recalculo deterministico e foi substituido pelo valor calculado.`,
    expected: calculated,
    actual,
    difference,
  }
}

function checkRows(analysis: PrestacaoAnalysis): PrestacaoRecheck {
  const rows = analysis.receitas_por_imovel.length

  return {
    id: "rows_present",
    label: "Linhas extraidas",
    status: rows > 0 ? "passed" : "failed",
    message: rows > 0 ? `${rows} imoveis extraidos da Secao 1.` : "Nenhum imovel foi extraido da Secao 1.",
    actual: rows,
  }
}

function checkConfidence(analysis: PrestacaoAnalysis): PrestacaoRecheck {
  const lowest = Math.min(analysis.confianca_geral, ...analysis.receitas_por_imovel.map((row) => row.confianca))

  return {
    id: "confidence",
    label: "Confianca da extracao",
    status: lowest >= MIN_CONFIDENCE ? "passed" : "warning",
    message:
      lowest >= MIN_CONFIDENCE
        ? "Confianca minima da extracao ficou acima de 0.70."
        : "Ao menos uma confianca ficou abaixo de 0.70.",
    actual: roundConfidence(lowest),
  }
}

function buildTechnicalOpinion(rechecks: PrestacaoRecheck[], analysis: PrestacaoAnalysis): TechnicalOpinion {
  const failed = rechecks.filter((check) => check.status === "failed")
  const warnings = rechecks.filter((check) => check.status === "warning")
  const lowestConfidence = Math.min(analysis.confianca_geral, ...analysis.receitas_por_imovel.map((row) => row.confianca))

  if (failed.length > 0) {
    return {
      status: "bloqueado",
      resumo: "Parecer tecnico bloqueado por divergencia deterministica nos totais extraidos.",
      motivos: failed.map((check) => check.message),
      confianca: roundConfidence(Math.min(lowestConfidence, 0.65)),
      requer_revisao_humana: true,
    }
  }

  if (warnings.length > 0 || lowestConfidence < MIN_CONFIDENCE) {
    return {
      status: "aprovado_com_ressalvas",
      resumo: "Prestacao revisada com ressalvas; os totais finais foram recalculados por codigo.",
      motivos: warnings.map((check) => check.message),
      confianca: roundConfidence(Math.min(lowestConfidence, 0.82)),
      requer_revisao_humana: true,
    }
  }

  return {
    status: "aprovado_tecnico",
    resumo: "Prestacao revisada tecnicamente; schema, documento e totais passaram nos rechecks.",
    motivos: ["Totais recalculados por codigo batem com a extracao estruturada."],
    confianca: roundConfidence(lowestConfidence),
    requer_revisao_humana: false,
  }
}

function hasLowConfidence(analysis: PrestacaoAnalysis) {
  return analysis.confianca_geral < MIN_CONFIDENCE || analysis.receitas_por_imovel.some((row) => row.confianca < MIN_CONFIDENCE)
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundConfidence(value: number) {
  return Math.round(clampConfidence(value) * 100) / 100
}

function clampConfidence(value: number) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
