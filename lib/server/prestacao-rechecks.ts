import type {
  PrestacaoAnalysis,
  PrestacaoGuardrail,
  PrestacaoRecheck,
  TechnicalOpinion,
  TotalSecao,
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
    ...conferirTotaisDeSecao(normalizedAnalysis),
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


// ---------------------------------------------------------------------------
// Conferencia contra o TOTAL impresso de cada secao.
//
// Recalcular a soma das linhas e coerente consigo mesmo e nao prova nada: se a
// extracao perde uma coluna inteira, a nossa soma erra junto e ninguem percebe.
// Grand Castelao I ago/2026 perdeu AGUA (R$ 47,60 por apto) e o fechamento
// passou. Comparar com o total IMPRESSO e o unico jeito de a falha se
// denunciar sozinha.
//
// Coluna a coluna, de proposito: se so o TOTAL fosse comparado, uma agua que
// sumiu da coluna mas entrou no total nao apareceria.

// Mapeia cada secao do documento para as linhas que deveriam soma-la.
const COLUNAS_CONFERIDAS = [
  "aluguel",
  "garagem",
  "agua",
  "iptu",
  "seguro_incendio",
  "lixo",
  "encargos",
  "total",
  "comissao",
  "repasse",
] as const

type ColunaConferida = (typeof COLUNAS_CONFERIDAS)[number]

const ROTULO_COLUNA: Record<ColunaConferida, string> = {
  aluguel: "aluguel",
  garagem: "garagem",
  agua: "água",
  iptu: "IPTU",
  seguro_incendio: "seguro",
  lixo: "lixo",
  encargos: "encargos",
  total: "total",
  comissao: "comissão",
  repasse: "repasse",
}

interface LinhaConferivel {
  aluguel?: number | null
  garagem?: number | null
  agua?: number | null
  iptu?: number | null
  seguro_incendio?: number | null
  lixo?: number | null
  encargos?: number | null
  total?: number | null
  comissao?: number | null
  repasse?: number | null
}

function linhasDaSecao(analysis: PrestacaoAnalysis, secao: TotalSecao["secao"]): LinhaConferivel[] {
  const extraordinarios = analysis.acordos_rescisoes_recebidos ?? []
  if (secao === "vigencia") return analysis.receitas_por_imovel
  if (secao === "intermediacao") {
    return extraordinarios
      .filter((item) => item.tipo === "intermediacao")
      .map((item) => ({ ...item, total: item.total_recebido ?? item.valor }))
  }
  if (secao === "acordos_rescisoes") {
    return extraordinarios
      .filter((item) => item.tipo === "acordo" || item.tipo === "rescisao" || item.tipo === "atraso")
      .map((item) => ({ ...item, total: item.total_recebido ?? item.valor }))
  }
  return analysis.inadimplencias_acumuladas.map((item) => ({ total: item.valor }))
}

// Tolerancia proporcional as linhas: o documento arredonda CADA coluna por
// conta propria, entao N linhas acumulam ate N centavos de diferenca legitima
// (GM II ago/2026 imprime IPTU 4,30 onde 1,43 x 3 = 4,29). Um centavo fixo
// acusaria divergencia em documento correto.
function tolerancia(linhas: number) {
  return roundMoney(MONEY_TOLERANCE * Math.max(1, linhas) + MONEY_TOLERANCE)
}

export function conferirTotaisDeSecao(analysis: PrestacaoAnalysis): PrestacaoRecheck[] {
  const secoes = analysis.totais_secoes ?? []
  // Sem total impresso nao ha o que conferir. Nao emite recheck: um "passou"
  // aqui afirmaria uma conferencia que nao aconteceu.
  if (secoes.length === 0) return []

  return secoes.map((impresso) => {
    const linhas = linhasDaSecao(analysis, impresso.secao)
    const limite = tolerancia(linhas.length)
    const divergentes: string[] = []
    let maiorDiferenca = 0

    for (const coluna of COLUNAS_CONFERIDAS) {
      const valorImpresso = impresso[coluna]
      // Coluna que a secao nao imprime nao e conferivel: o layout varia por
      // imobiliaria (Grand Maracanau nao tem AGUA) e por mes.
      if (valorImpresso === null || valorImpresso === undefined) continue
      const valores = linhas.map((linha) => linha[coluna])
      const informados = valores.filter((valor): valor is number => typeof valor === "number")
      // Coluna impressa com valor e nenhuma linha informada e o caso que este
      // recheck existe para pegar: a extracao perdeu a coluna inteira.
      const calculado = roundMoney(sum(informados))
      const diferenca = roundMoney(Math.abs(calculado - roundMoney(valorImpresso)))
      if (diferenca > limite) {
        divergentes.push(
          `${ROTULO_COLUNA[coluna]} (documento ${formatMoney(valorImpresso)}, linhas ${formatMoney(calculado)})`,
        )
        maiorDiferenca = Math.max(maiorDiferenca, diferenca)
      }
    }

    const nome = impresso.rotulo ?? impresso.secao
    if (divergentes.length === 0) {
      return {
        id: `total_secao_${impresso.secao}`,
        label: `Total impresso — ${nome}`,
        status: "passed" as const,
        message: `A soma das ${linhas.length} linhas bate com o TOTAL impresso da seção, coluna a coluna.`,
        difference: 0,
      }
    }

    return {
      id: `total_secao_${impresso.secao}`,
      label: `Total impresso — ${nome}`,
      status: "failed" as const,
      message:
        `A soma das linhas não bate com o TOTAL impresso da seção em `
        + `${divergentes.length} coluna(s): ${divergentes.join("; ")}. `
        + `Coluna inteira faltando na extração é a causa mais comum.`,
      difference: maiorDiferenca,
    }
  })
}

function formatMoney(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
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
