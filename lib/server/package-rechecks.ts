import type {
  AcordoRescisaoRecebido,
  ClassifiedDocument,
  DespesasAnalysis,
  PackageTotals,
  PrestacaoAnalysis,
  PrestacaoGuardrail,
  PrestacaoRecheck,
  ReajusteAnalysis,
  RepasseAnalysis,
  TechnicalOpinion,
} from "@/lib/prestacao-types"
import type { CommercialRuleForValidation } from "./regras-comerciais"

const MONEY_TOLERANCE = 0.01
const REPASSE_ALERT_TOLERANCE = 5
const MIN_CONFIDENCE = 0.7
const OPERATIONAL_RECHECK_IDS = new Set([
  "required_prestacao_contas",
  "required_comprovante_repasse",
  "rows_present",
  "total_linhas_receitas",
  "total_linhas_comissoes",
  "total_linhas_repasse",
  "comissao_administracao_regra",
  "acordos_competencias",
  "duplicate_agreement_payment",
  "resumo_financeiro",
  "repasse_conciliation",
])

export interface PackageValidationInput {
  documents: ClassifiedDocument[]
  prestacao: PrestacaoAnalysis | null
  repasse: RepasseAnalysis | null
  despesas: DespesasAnalysis | null
  reajuste: ReajusteAnalysis | null
  commercialRule?: CommercialRuleForValidation | null
  historicalAgreementKeys?: string[]
}

export function validatePackage(input: PackageValidationInput) {
  // A inadimplencia da vigencia do mes corrente PERMANECE em receitas_por_imovel
  // (linha zerada, marcada INADIMPLENCIA) para contar como inadimplente do mes.
  // Apenas a secao dedicada de dividas acumuladas vai para inadimplencias_acumuladas
  // (responsabilidade da extracao). Por isso nao movemos mais linhas aqui.
  const normalizedPrestacao = input.prestacao ? normalizePrestacao(input.prestacao) : null
  const normalizedDespesas = input.despesas ? normalizeDespesas(input.despesas) : null
  const normalizedRepasse = input.repasse ? normalizeRepasse(input.repasse) : null
  const normalizedReajuste = input.reajuste ? normalizeReajuste(input.reajuste) : null
  // Extrato consolidado (Cesar Rego/Plural): o repasse vem dentro do proprio
  // documento. Sinal explicito do parser OU pacote de documento unico que e a
  // propria prestacao (sem comprovante separado). Se houver comprovante de
  // repasse de verdade, ele tem precedencia (a conciliacao bancaria continua).
  const repasseEmbutido =
    normalizedPrestacao?.resumo_financeiro.repasse_embutido === true ||
    (!input.repasse && input.documents.length === 1 && input.documents[0]?.documentType === "prestacao_contas")
  const totals = calculateTotals(normalizedPrestacao, normalizedDespesas, normalizedRepasse, input.commercialRule ?? null, repasseEmbutido)
  const rechecks = buildRechecks({
    documents: input.documents,
    prestacao: normalizedPrestacao,
    repasse: normalizedRepasse,
    despesas: normalizedDespesas,
    reajuste: normalizedReajuste,
    commercialRule: input.commercialRule ?? null,
    historicalAgreementKeys: input.historicalAgreementKeys ?? [],
    totals,
    repasseEmbutido,
  })
  const guardrails = buildGuardrails(input.documents, rechecks)
  const parecer = buildTechnicalOpinion(rechecks, guardrails)

  return {
    prestacao: normalizedPrestacao,
    repasse: normalizedRepasse,
    despesas: normalizedDespesas,
    reajuste: normalizedReajuste,
    totals,
    rechecks,
    guardrails,
    parecer,
  }
}

function normalizePrestacao(analysis: PrestacaoAnalysis): PrestacaoAnalysis {
  // "Outras despesas" deve refletir apenas despesas reais do locador. Comissoes,
  // intermediacao, taxas de transferencia (TED/PIX/TX) e descontos de inquilino
  // NAO sao despesas: comissao tem balde proprio, descontos abatem o aluguel por
  // linha e taxas bancarias entram no consolidado comissao+despesas. Removemos
  // esses itens da lista para o numero de "despesas" nao inflar (ponto #1).
  const outrasDespesasFiltradas = analysis.resumo_financeiro.outras_comissoes_despesas
    .map((item) => ({ ...item, valor: roundMoney(item.valor), confianca: clampConfidence(item.confianca) }))
    .filter((item) => !isNaoDespesaLocador(item.descricao))
  const totalOutrasDespesasRecalc = outrasDespesasFiltradas.length > 0 ? roundMoney(sum(outrasDespesasFiltradas.map((d) => d.valor))) : 0

  const competenciaFechamento = normalizeCompetenciaKey(analysis.competencia)

  return {
    ...analysis,
    confianca_geral: clampConfidence(analysis.confianca_geral),
    resumo_financeiro: {
      ...analysis.resumo_financeiro,
      total_linhas_receitas: nullableMoney(analysis.resumo_financeiro.total_linhas_receitas),
      total_linhas_comissoes: nullableMoney(analysis.resumo_financeiro.total_linhas_comissoes),
      total_linhas_repasse: nullableMoney(analysis.resumo_financeiro.total_linhas_repasse),
      comissao_administracao: nullableMoney(analysis.resumo_financeiro.comissao_administracao),
      total_outras_comissoes_despesas: totalOutrasDespesasRecalc,
      total_comissao_despesas: nullableMoney(analysis.resumo_financeiro.total_comissao_despesas),
      recebidos_em_nome_locador: nullableMoney(analysis.resumo_financeiro.recebidos_em_nome_locador),
      total_a_repassar: nullableMoney(analysis.resumo_financeiro.total_a_repassar),
      confianca: clampConfidence(analysis.resumo_financeiro.confianca),
      outras_comissoes_despesas: outrasDespesasFiltradas,
    },
    receitas_por_imovel: analysis.receitas_por_imovel.map((row) => {
      const base = {
        ...row,
        total: roundMoney(row.total),
        aluguel: nullableMoney(row.aluguel),
        desconto: nullableMoney(row.desconto),
        aluguel_com_desconto: nullableMoney(row.aluguel_com_desconto),
        garagem: nullableMoney(row.garagem),
        agua: nullableMoney(row.agua),
        iptu: nullableMoney(row.iptu),
        seguro_incendio: nullableMoney(row.seguro_incendio),
        comissao: nullableMoney(row.comissao),
        repasse: nullableMoney(row.repasse),
        confianca: clampConfidence(row.confianca),
      }
      // #3 IPTU de passagem: quando o IPTU foi cobrado do inquilino e repassado
      // (mesmo valor em credito e debito), ele se anula e nao e receita do locador.
      const semIptuDePassagem = anularIptuDePassagem(base)
      // #4 Inadimplencia por competencia: pagamento de ALUGUEL referente a um mes
      // ANTERIOR ao fechamento => a unidade esta inadimplente no mes corrente.
      return marcarInadimplenciaPorCompetencia(semIptuDePassagem, competenciaFechamento)
    }),
    acordos_rescisoes_recebidos: dropHallucinatedIntermediacoes(
      (analysis.acordos_rescisoes_recebidos ?? []).map((item) => ({
        ...item,
        valor: roundMoney(item.valor),
        comissao: item.comissao === null || item.comissao === undefined ? item.comissao ?? null : roundMoney(item.comissao),
        confianca: clampConfidence(item.confianca),
      })),
      analysis.resumo_financeiro.outras_comissoes_despesas ?? [],
    ),
  }
}

// #1 Itens que NAO sao "despesa do locador": comissao da administradora,
// intermediacao, taxas de transferencia bancaria (TED/PIX/TX) e descontos/
// reembolsos concedidos ao inquilino (estes abatem o aluguel por linha).
function isNaoDespesaLocador(descricao: string): boolean {
  const texto = normalizeText(descricao)
  return /comiss|intermedia|\bted\b|\bpix\b|\btx\b|\bdesconto\b|\bdesc\.|reembolso/.test(texto)
}

// #3 Anula o IPTU "de passagem": IPTU cobrado do inquilino e repassado a
// prefeitura no mesmo mes (aparece como credito E debito de mesmo valor no
// razao). Ele nao e receita do locador, entao removemos sua contribuicao do
// total e zeramos o campo iptu. Sinal: a observacao cita o IPTU sendo debitado/
// repassado com valor igual ao iptu creditado da linha.
function anularIptuDePassagem<T extends { iptu: number | null; total: number; observacao: string | null }>(row: T): T {
  const iptu = row.iptu
  if (iptu === null || iptu === 0) return row
  const obs = row.observacao ?? ""
  if (!/iptu/i.test(obs)) return row
  // Procura no texto um valor de IPTU debitado/repassado igual ao iptu da linha.
  const matchesIptuDebito = /iptu[^;]*?(?:debit|repass)/i.test(obs)
  const valoresObs = (obs.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []).map((v) => roundMoney(Number(v.replace(/\./g, "").replace(",", "."))))
  const temDebitoIgual = matchesIptuDebito && valoresObs.some((v) => Math.abs(v - iptu) <= MONEY_TOLERANCE)
  if (!temDebitoIgual) return row
  return {
    ...row,
    iptu: 0,
    total: roundMoney(row.total - iptu),
    observacao: appendObservacao(row.observacao, `IPTU de passagem (R$ ${iptu.toFixed(2)}) anulado: cobrado do inquilino e repassado.`),
  }
}

// #4 Marca como inadimplente do mes corrente a unidade cujo pagamento de ALUGUEL
// se refere a uma competencia ANTERIOR a do fechamento (ex.: recebeu em maio o
// aluguel de marco => abril e maio em aberto). Nao mexe em unidades ja marcadas
// inadimplencia, Airbnb, vagas ou sem aluguel.
function marcarInadimplenciaPorCompetencia<T extends { aluguel: number | null; vencimento: string | null; inquilino: string | null; observacao: string | null }>(
  row: T,
  competenciaFechamento: string | null,
): T {
  if (!competenciaFechamento) return row
  if (row.aluguel === null || row.aluguel <= 0) return row
  const textoAtual = normalizeText(`${row.inquilino ?? ""} ${row.observacao ?? ""}`)
  if (/inadimpl|air ?bnb|intermedia|\bvago\b|vacanci/.test(textoAtual)) return row
  const competenciaAluguel = normalizeCompetenciaKey(row.vencimento)
  // Compara apenas quando o vencimento esta no formato de competencia (AAAA-MM).
  if (!competenciaAluguel || !/^\d{4}-\d{2}$/.test(competenciaAluguel)) return row
  if (competenciaAluguel >= competenciaFechamento) return row
  const [ano, mes] = competenciaAluguel.split("-")
  return {
    ...row,
    observacao: appendObservacao(
      row.observacao,
      `INADIMPLENCIA: pagamento referente a ${mes}/${ano}; competencia ${competenciaFechamento} em aberto.`,
    ),
  }
}

function appendObservacao(atual: string | null, extra: string): string {
  const base = (atual ?? "").trim()
  return base.length > 0 ? `${base} | ${extra}` : extra
}

// Guarda deterministica: a IA as vezes "inventa" uma intermediacao copiando o
// valor de uma despesa de utilidade (CAGECE, ENEL, agua...) que aparece em
// OUTRAS COMISSOES E DESPESAS. Esses fantasmas vem sem apto e sem inquilino e
// com valor/comissao identicos a uma despesa listada. Quando os tres sinais
// batem, removemos a linha (intermediacao real tem apto/inquilino ou valor
// proprio que nao coincide com uma despesa).
function dropHallucinatedIntermediacoes(
  items: AcordoRescisaoRecebido[],
  outrasDespesas: Array<{ valor: number }>,
): AcordoRescisaoRecebido[] {
  if (outrasDespesas.length === 0) return items
  const despesaValores = outrasDespesas.map((d) => roundMoney(d.valor))
  const bateDespesa = (valor: number | null | undefined) =>
    typeof valor === "number" && despesaValores.some((d) => Math.abs(d - roundMoney(valor)) <= MONEY_TOLERANCE)

  return items.filter((item) => {
    if (item.tipo !== "intermediacao") return true
    const semIdentificacao = !normalizeText(item.apto) && !normalizeText(item.inquilino)
    if (semIdentificacao && (bateDespesa(item.comissao) || bateDespesa(item.valor))) return false
    return true
  })
}

function normalizeRepasse(analysis: RepasseAnalysis): RepasseAnalysis {
  return {
    ...analysis,
    valor: nullableMoney(analysis.valor),
    confianca_geral: clampConfidence(analysis.confianca_geral),
  }
}

function normalizeDespesas(analysis: DespesasAnalysis): DespesasAnalysis {
  return {
    ...analysis,
    total_despesas: nullableMoney(analysis.total_despesas),
    confianca_geral: clampConfidence(analysis.confianca_geral),
    despesas: analysis.despesas.map((despesa) => ({
      ...despesa,
      valor: roundMoney(despesa.valor),
      confianca: clampConfidence(despesa.confianca),
    })),
  }
}

function normalizeReajuste(analysis: ReajusteAnalysis): ReajusteAnalysis {
  return {
    ...analysis,
    confianca_geral: clampConfidence(analysis.confianca_geral),
    itens: analysis.itens.map((item) => ({
      ...item,
      valor_anterior: nullableMoney(item.valor_anterior),
      valor_novo: nullableMoney(item.valor_novo),
      confianca: clampConfidence(item.confianca),
    })),
  }
}

function calculateTotals(
  prestacao: PrestacaoAnalysis | null,
  despesas: DespesasAnalysis | null,
  repasse: RepasseAnalysis | null,
  commercialRule: CommercialRuleForValidation | null,
  repasseEmbutido: boolean = false,
): PackageTotals {
  const rows = prestacao?.receitas_por_imovel ?? []
  const lineTotalReceitas = roundMoney(sum(prestacao?.receitas_por_imovel.map((row) => row.total) ?? []))
  const lineTotalComissoes = roundMoney(sum(prestacao?.receitas_por_imovel.map((row) => row.comissao ?? 0) ?? []))
  const lineTotalRepasse = roundMoney(sum(prestacao?.receitas_por_imovel.map((row) => row.repasse ?? 0) ?? []))
  const totalAluguel = roundMoney(sum(rows.map((row) => row.aluguel_com_desconto ?? row.aluguel ?? 0)))
  const totalGaragem = roundMoney(sum(rows.map((row) => row.garagem ?? 0)))
  const totalAgua = roundMoney(sum(rows.map((row) => row.agua ?? 0)))
  const totalIptu = roundMoney(sum(rows.map((row) => row.iptu ?? 0)))
  const totalSeguroIncendio = roundMoney(sum(rows.map((row) => row.seguro_incendio ?? 0)))
  const commissionBase = roundMoney(totalAluguel + totalGaragem + totalAgua + totalIptu + totalSeguroIncendio)
  const calculatedAdminCommission = commercialRule
    ? roundMoney((commissionBase * commercialRule.taxa_administracao_percent) / 100)
    : null
  const resumo = prestacao?.resumo_financeiro
  const resumoOutrasDespesas = resumo?.total_outras_comissoes_despesas ?? sum(resumo?.outras_comissoes_despesas.map((item) => item.valor) ?? [])
  const externalDespesas = roundMoney(sum(despesas?.despesas.map((despesa) => despesa.valor) ?? []))
  const totalDespesas = roundMoney(resumoOutrasDespesas || externalDespesas)
  const totalComissaoDespesas = roundMoney(resumo?.total_comissao_despesas ?? (resumo?.comissao_administracao ?? lineTotalComissoes) + totalDespesas)
  const totalReceitas = roundMoney(resumo?.recebidos_em_nome_locador ?? resumo?.total_linhas_receitas ?? lineTotalReceitas)
  const totalComissoes = roundMoney(resumo?.comissao_administracao ?? lineTotalComissoes)
  // Comissao realizada = comissao das linhas / total das linhas da tabela (mensal regular),
  // sem misturar comissao de acordos nem o recebido bruto com acordos.
  const realizedCommissionPercent = lineTotalReceitas > 0 ? roundPercent((lineTotalComissoes / lineTotalReceitas) * 100) : null
  const totalRepasseBruto = roundMoney(resumo?.total_linhas_repasse ?? lineTotalRepasse)
  const totalARepassar = roundMoney(resumo?.total_a_repassar ?? totalReceitas - totalComissaoDespesas)
  // Sem comprovante separado, mas com repasse embutido no extrato: o proprio
  // total a repassar do documento e a referencia conciliada.
  const valorComprovado = repasse?.valor ?? (repasseEmbutido ? totalARepassar : null)

  return {
    total_receitas: totalReceitas,
    total_aluguel: totalAluguel,
    total_garagem: totalGaragem,
    total_agua: totalAgua,
    total_iptu: totalIptu,
    total_seguro_incendio: totalSeguroIncendio,
    total_comissoes: totalComissoes,
    total_repasse_bruto: totalRepasseBruto,
    total_despesas: totalDespesas,
    total_comissao_despesas: totalComissaoDespesas,
    total_a_repassar: totalARepassar,
    valor_comprovado: valorComprovado,
    diferenca_repasse: valorComprovado === null ? null : roundMoney(Math.abs(totalARepassar - valorComprovado)),
    taxa_administracao_percent: commercialRule?.taxa_administracao_percent ?? null,
    taxa_intermediacao_percent: commercialRule?.taxa_intermediacao_percent ?? null,
    comissao_administracao_calculada: calculatedAdminCommission,
    base_comissao_administracao: commissionBase,
    comissao_realizada_percent: realizedCommissionPercent,
    repasse_embutido: repasseEmbutido,
  }
}

function buildRechecks({
  documents,
  prestacao,
  repasse,
  despesas,
  reajuste,
  commercialRule,
  historicalAgreementKeys,
  totals,
  repasseEmbutido,
}: PackageValidationInput & { totals: PackageTotals; historicalAgreementKeys: string[]; repasseEmbutido: boolean }) {
  const checks: PrestacaoRecheck[] = [
    checkRequiredDocument(documents, "prestacao_contas", "Prestacao de contas"),
    checkRequiredComprovante(documents, repasseEmbutido),
    checkOptionalDocument(documents, "relatorio_reajuste", "Relatorio de locacao/reajuste"),
    checkOptionalDocument(documents, "despesas_comprovantes", "Despesas e comprovantes"),
    checkUnknownDocuments(documents),
    checkPrestacaoRows(prestacao),
    compareTotal("total_linhas_receitas", "Total das linhas de receitas", "Total", prestacao?.resumo_financeiro.total_linhas_receitas ?? prestacao?.totais.total_receitas ?? null, sum(prestacao?.receitas_por_imovel.map((row) => row.total) ?? [])),
    compareColumnTotal(
      "total_linhas_comissoes",
      "Total das comissoes por linha",
      "Comissao",
      prestacao?.resumo_financeiro.total_linhas_comissoes ?? null,
      prestacao?.receitas_por_imovel.map((row) => row.comissao) ?? [],
    ),
    compareColumnTotal(
      "total_linhas_repasse",
      "Total dos repasses por linha",
      "Repasse",
      prestacao?.resumo_financeiro.total_linhas_repasse ?? null,
      prestacao?.receitas_por_imovel.map((row) => row.repasse) ?? [],
    ),
    compareAdminCommissionRule(prestacao, totals, commercialRule ?? null),
    checkAgreementCompetencies(prestacao),
    checkDuplicateAgreementPayments(prestacao, historicalAgreementKeys),
    compareResumoFormula(prestacao, totals),
    compareDespesasTotal(despesas, totals.total_despesas),
    compareRepasse(totals),
    checkConfidence("prestacao_confidence", "Confianca da prestacao", getLowestPrestacaoConfidence(prestacao)),
    checkConfidence("repasse_confidence", "Confianca do comprovante", repasse?.confianca_geral ?? null),
    checkConfidence("despesas_confidence", "Confianca das despesas", getLowestDespesasConfidence(despesas)),
    checkConfidence("reajuste_confidence", "Confianca do relatorio", getLowestReajusteConfidence(reajuste)),
  ]

  // B3: a divergencia entre a soma das linhas e o consolidado reportado pela IA e
  // sinal de qualidade de leitura, nao de erro de repasse — rebaixa de bloqueio
  // para alerta. A formula do resumo so vira alerta quando a conciliacao com o
  // comprovante ja passou (a IA leu um agregado errado, mas o dinheiro confere).
  const repassePassou = checks.find((c) => c.id === "repasse_conciliation")?.status === "passed"
  const lineTotalIds = new Set(["total_linhas_receitas", "total_linhas_comissoes", "total_linhas_repasse"])
  const adjusted = checks.map((check) => {
    if (lineTotalIds.has(check.id) && check.status === "failed") return { ...check, status: "warning" as const }
    if (check.id === "resumo_financeiro" && check.status === "failed" && repassePassou) return { ...check, status: "warning" as const }
    return check
  })

  return adjusted.filter((check) => check.id !== "skip")
}

function checkAgreementCompetencies(prestacao: PrestacaoAnalysis | null): PrestacaoRecheck {
  const items = prestacao?.acordos_rescisoes_recebidos ?? []
  const differentCompetencies = items.filter((item) => {
    const original = normalizeCompetenciaKey(item.competencia_original)
    const received = normalizeCompetenciaKey(item.competencia_recebimento ?? prestacao?.competencia ?? null)
    return original && received && original !== received
  })

  if (differentCompetencies.length === 0) {
    return {
      id: "acordos_competencias",
      label: "Competencias de acordos e rescisoes",
      status: "passed",
      message: items.length > 0 ? "Acordos e rescisoes recebidos no mes foram lidos sem divergencia de competencia." : "Nenhum acordo ou rescisao recebido no mes foi identificado.",
      actual: items.length,
    }
  }

  return {
    id: "acordos_competencias",
    label: "Competencias de acordos e rescisoes",
    status: "warning",
    message: `${differentCompetencies.length} acordo(s) ou rescisao(oes) foram recebidos no mes com competencia original diferente. Confira antes de aprovar.`,
    actual: differentCompetencies.length,
  }
}

function checkDuplicateAgreementPayments(prestacao: PrestacaoAnalysis | null, historicalAgreementKeys: string[]): PrestacaoRecheck {
  const items = prestacao?.acordos_rescisoes_recebidos ?? []
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  const historical = new Set(historicalAgreementKeys)

  for (const item of items) {
    const key = buildAgreementPaymentKey(item)
    if (!key) continue
    if (seen.has(key) || historical.has(key)) duplicated.add(key)
    seen.add(key)
  }

  if (duplicated.size === 0) {
    return {
      id: "duplicate_agreement_payment",
      label: "Pagamento de acordo/rescisao repetido",
      status: "passed",
      message: "Nenhum acordo ou rescisao repetido foi identificado pelos dados disponiveis.",
      actual: 0,
    }
  }

  return {
    id: "duplicate_agreement_payment",
    label: "Pagamento de acordo/rescisao repetido",
    status: "failed",
    message: `${duplicated.size} possivel(is) pagamento(s) de acordo/rescisao repetido(s). Resolva ou justifique antes de aprovar.`,
    actual: duplicated.size,
  }
}

function buildGuardrails(documents: ClassifiedDocument[], rechecks: PrestacaoRecheck[]): PrestacaoGuardrail[] {
  const operationalRechecks = rechecks.filter(isOperationalRecheck)
  const hasFailed = operationalRechecks.some((check) => check.status === "failed")
  const hasWarning = operationalRechecks.some((check) => check.status === "warning")

  return [
    {
      id: "package_schema",
      label: "Pacote estruturado",
      status: "passed",
      message: "Extracoes aceitas pelos schemas estritos.",
    },
    {
      id: "documents_received",
      label: "Documentos recebidos",
      status: documents.length > 0 ? "passed" : "blocked",
      message: `${documents.length} documento(s) recebido(s) para processamento.`,
    },
    {
      id: "deterministic_validation",
      label: "Validacao deterministica",
      status: hasFailed ? "blocked" : hasWarning ? "warning" : "passed",
      message: hasFailed
        ? "Ha divergencias bloqueantes calculadas por codigo."
        : hasWarning
          ? "Ha alertas calculados por codigo."
          : "Validacoes financeiras passaram sem bloqueios.",
    },
  ]
}

function buildTechnicalOpinion(rechecks: PrestacaoRecheck[], guardrails: PrestacaoGuardrail[]): TechnicalOpinion {
  const operationalRechecks = rechecks.filter(isOperationalRecheck)
  const failed = operationalRechecks.filter((check) => check.status === "failed")
  const warnings = operationalRechecks.filter((check) => check.status === "warning")
  const blocked = guardrails.filter((guardrail) => guardrail.status === "blocked")

  if (failed.length > 0 || blocked.length > 0) {
    return {
      status: "bloqueado",
      resumo: "Fechamento bloqueado por divergencia deterministica ou documento obrigatorio ausente.",
      motivos: [...failed.map((check) => check.message), ...blocked.map((guardrail) => guardrail.message)],
      confianca: 0.65,
      requer_revisao_humana: true,
    }
  }

  if (warnings.length > 0) {
    return {
      status: "aprovado_com_ressalvas",
      resumo: "Fechamento processado com alertas; revisao humana permanece obrigatoria.",
      motivos: warnings.map((check) => check.message),
      confianca: 0.82,
      requer_revisao_humana: true,
    }
  }

  return {
    status: "aprovado_tecnico",
    resumo: "Fechamento revisado tecnicamente; documentos obrigatorios e rechecks passaram.",
    motivos: ["Validacoes deterministicas passaram sem divergencias bloqueantes."],
    confianca: 0.95,
    requer_revisao_humana: false,
  }
}

function checkRequiredDocument(documents: ClassifiedDocument[], documentType: string, label: string): PrestacaoRecheck {
  const found = documents.some((document) => document.documentType === documentType)

  return {
    id: `required_${documentType}`,
    label,
    status: found ? "passed" : "failed",
    message: found ? `${label} presente no pacote.` : `${label} nao foi enviado. Envie o documento antes de aprovar.`,
  }
}

// Comprovante de repasse: extratos consolidados (Cesar Rego/Plural) trazem o
// repasse dentro do proprio documento, sem comprovante bancario separado.
function checkRequiredComprovante(documents: ClassifiedDocument[], repasseEmbutido: boolean): PrestacaoRecheck {
  const found = documents.some((document) => document.documentType === "comprovante_repasse")

  if (found) {
    return {
      id: "required_comprovante_repasse",
      label: "Comprovante de repasse",
      status: "passed",
      message: "Comprovante de repasse presente no pacote.",
    }
  }

  if (repasseEmbutido) {
    return {
      id: "required_comprovante_repasse",
      label: "Comprovante de repasse",
      status: "passed",
      message: "Repasse informado no proprio extrato consolidado; sem comprovante separado.",
    }
  }

  return {
    id: "required_comprovante_repasse",
    label: "Comprovante de repasse",
    status: "failed",
    message: "Comprovante de repasse nao foi enviado. Envie o documento antes de aprovar.",
  }
}

function checkOptionalDocument(documents: ClassifiedDocument[], documentType: string, label: string): PrestacaoRecheck {
  const found = documents.some((document) => document.documentType === documentType)

  return {
    id: `optional_${documentType}`,
    label,
    status: found ? "passed" : "warning",
    message: found ? `${label} presente no pacote.` : `${label} nao enviado no pacote.`,
  }
}

function checkUnknownDocuments(documents: ClassifiedDocument[]): PrestacaoRecheck {
  const unknownCount = documents.filter((document) => document.documentType === "desconhecido").length

  return {
    id: "unknown_documents",
    label: "Documentos desconhecidos",
    status: unknownCount > 0 ? "warning" : "passed",
    message: unknownCount > 0 ? `${unknownCount} documento(s) sem classificacao confiavel.` : "Todos os documentos receberam classificacao.",
    actual: unknownCount,
  }
}

function checkPrestacaoRows(prestacao: PrestacaoAnalysis | null): PrestacaoRecheck {
  const rows = prestacao?.receitas_por_imovel.length ?? 0

  return {
    id: "rows_present",
    label: "Linhas da prestacao",
    status: rows > 0 ? "passed" : "failed",
    message: rows > 0 ? `${rows} imoveis extraidos da prestacao.` : "Nenhuma linha de prestacao foi extraida.",
    actual: rows,
  }
}

function compareTotal(id: string, label: string, columnLabel: string, extracted: number | null, calculated: number): PrestacaoRecheck {
  if (extracted === null) {
    return {
      id,
      label,
      status: "warning",
      message: `O consolidado de ${columnLabel} nao foi identificado. O valor pelo recalculo e ${formatBRL(calculated)}. Verifique manualmente.`,
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
        ? `A soma da coluna ${columnLabel} bate com o consolidado.`
        : `A soma da coluna ${columnLabel} e ${formatBRL(calculated)}, mas o consolidado informa ${formatBRL(actual)}. O correto pelo recalculo e ${formatBRL(calculated)}. Verifique manualmente.`,
    expected: calculated,
    actual,
    difference,
  }
}

function compareColumnTotal(
  id: string,
  label: string,
  columnLabel: string,
  extracted: number | null,
  values: Array<number | null>,
): PrestacaoRecheck {
  const hasRows = values.length > 0
  const hasCompleteColumn = hasRows && values.every((value) => value !== null)

  if (!hasCompleteColumn) {
    return {
      id,
      label,
      status: "warning",
      message: `A coluna ${columnLabel} nao foi extraida em todas as linhas. O recheck financeiro dessa coluna nao foi aplicado.`,
      expected: null,
      actual: extracted,
      difference: null,
    }
  }

  return compareTotal(id, label, columnLabel, extracted, sum(values.map((value) => value ?? 0)))
}

function compareDespesasTotal(despesas: DespesasAnalysis | null, calculated: number): PrestacaoRecheck {
  if (!despesas) {
    return {
      id: "total_despesas",
      label: "Total de despesas",
      status: "warning",
      message: "Nenhum documento de despesas foi extraido; total de despesas considerado R$ 0,00.",
      expected: 0,
      actual: null,
      difference: null,
    }
  }

  return compareTotal("total_despesas", "Total de despesas", "Despesas", despesas.total_despesas, calculated)
}

function compareAdminCommissionRule(
  prestacao: PrestacaoAnalysis | null,
  totals: PackageTotals,
  commercialRule: CommercialRuleForValidation | null,
): PrestacaoRecheck {
  if (!commercialRule || totals.comissao_administracao_calculada === null) {
    return {
      id: "comissao_administracao_regra",
      label: "Comissao administrativa pela regra",
      status: "warning",
      message: "Regra comercial ativa nao encontrada para esta imobiliaria e empreendimento. Cadastre a taxa para validar a comissao administrativa.",
      expected: null,
      actual: prestacao?.resumo_financeiro.comissao_administracao ?? totals.total_comissoes,
      difference: null,
    }
  }

  const expected = totals.comissao_administracao_calculada
  const actual = roundMoney(prestacao?.resumo_financeiro.comissao_administracao ?? totals.total_comissoes)
  const difference = roundMoney(Math.abs(expected - actual))
  const status = difference <= MONEY_TOLERANCE ? "passed" : "warning"

  return {
    id: "comissao_administracao_regra",
    label: "Comissao administrativa pela regra",
    status,
    message:
      status === "passed"
        ? `Comissao administrativa confere com a taxa de ${formatPercent(commercialRule.taxa_administracao_percent)} sobre o total pago pelo inquilino.`
        : `A taxa administrativa de ${formatPercent(commercialRule.taxa_administracao_percent)} sobre aluguel, garagem, agua, IPTU e seguro resulta em ${formatBRL(expected)}, mas o documento informa ${formatBRL(actual)}. Verifique manualmente.`,
    expected,
    actual,
    difference,
  }
}

function compareResumoFormula(prestacao: PrestacaoAnalysis | null, totals: PackageTotals): PrestacaoRecheck {
  if (
    prestacao?.resumo_financeiro.recebidos_em_nome_locador === null ||
    prestacao?.resumo_financeiro.recebidos_em_nome_locador === undefined ||
    prestacao.resumo_financeiro.total_comissao_despesas === null ||
    prestacao.resumo_financeiro.total_comissao_despesas === undefined
  ) {
    return {
      id: "resumo_financeiro",
      label: "Resumo financeiro final",
      status: "warning",
      message: `O resumo financeiro esta incompleto. O total a repassar calculado com os dados disponiveis e ${formatBRL(totals.total_a_repassar)}. Verifique manualmente.`,
      expected: totals.total_a_repassar,
      actual: prestacao?.resumo_financeiro.total_a_repassar ?? null,
      difference: null,
    }
  }

  const expected = roundMoney(prestacao.resumo_financeiro.recebidos_em_nome_locador - prestacao.resumo_financeiro.total_comissao_despesas)
  const actual = prestacao.resumo_financeiro.total_a_repassar

  if (actual === null) {
    return {
      id: "resumo_financeiro",
      label: "Resumo financeiro final",
      status: "warning",
      message: `O total a repassar nao foi identificado no resumo. O correto pela formula e ${formatBRL(expected)}. Verifique manualmente.`,
      expected,
      actual: null,
      difference: null,
    }
  }

  const difference = roundMoney(Math.abs(expected - actual))
  const status = difference <= MONEY_TOLERANCE ? "passed" : "failed"

  return {
    id: "resumo_financeiro",
    label: "Resumo financeiro final",
    status,
    message:
      status === "passed"
        ? "Recebidos em nome do locador menos total de comissoes e despesas bate com o total a repassar."
        : `Recebidos menos comissoes/despesas resulta em ${formatBRL(expected)}, mas o resumo informa ${formatBRL(actual)}. O correto pela formula e ${formatBRL(expected)}. Verifique manualmente.`,
    expected,
    actual,
    difference,
  }
}

function compareRepasse(totals: PackageTotals): PrestacaoRecheck {
  if (totals.valor_comprovado === null || totals.diferenca_repasse === null) {
    return {
      id: "repasse_conciliation",
      label: "Conciliacao do repasse",
      status: "failed",
      message: "Nao foi possivel confirmar o valor do comprovante de repasse. Envie ou revise o comprovante antes de aprovar.",
      expected: totals.total_a_repassar,
      actual: null,
      difference: null,
    }
  }

  const status =
    totals.diferenca_repasse <= MONEY_TOLERANCE
      ? "passed"
      : totals.diferenca_repasse <= REPASSE_ALERT_TOLERANCE
        ? "warning"
        : "failed"

  return {
    id: "repasse_conciliation",
    label: "Conciliacao do repasse",
    status,
    message:
      status === "passed"
        ? totals.repasse_embutido
          ? "Repasse conferido com o total do proprio extrato consolidado."
          : "Valor a repassar bate com o comprovante bancario."
        : status === "warning"
          ? `O total a repassar calculado e ${formatBRL(totals.total_a_repassar)}, mas o comprovante bancario tem ${formatBRL(totals.valor_comprovado)}. Diferenca de ${formatBRL(totals.diferenca_repasse)}. Verifique manualmente.`
          : `O total a repassar calculado e ${formatBRL(totals.total_a_repassar)}, mas o comprovante bancario tem ${formatBRL(totals.valor_comprovado)}. Diferenca de ${formatBRL(totals.diferenca_repasse)}. Verifique manualmente.`,
    expected: totals.total_a_repassar,
    actual: totals.valor_comprovado,
    difference: totals.diferenca_repasse,
  }
}

function checkConfidence(id: string, label: string, confidence: number | null): PrestacaoRecheck {
  if (confidence === null) {
    return {
      id,
      label,
      status: "warning",
      message: `${label} indisponivel porque o documento nao foi extraido.`,
      actual: null,
    }
  }

  const normalized = roundConfidence(confidence)

  return {
    id,
    label,
    status: normalized >= MIN_CONFIDENCE ? "passed" : "warning",
    message:
      normalized >= MIN_CONFIDENCE
        ? `${label} acima do piso de 0.70.`
        : `${label} abaixo do piso de 0.70; revisao humana obrigatoria.`,
    actual: normalized,
  }
}

function getLowestPrestacaoConfidence(prestacao: PrestacaoAnalysis | null) {
  if (!prestacao) return null
  return Math.min(prestacao.confianca_geral, ...prestacao.receitas_por_imovel.map((row) => row.confianca))
}

function getLowestDespesasConfidence(despesas: DespesasAnalysis | null) {
  if (!despesas) return null
  if (despesas.despesas.length === 0) return despesas.confianca_geral
  return Math.min(despesas.confianca_geral, ...despesas.despesas.map((despesa) => despesa.confianca))
}

function getLowestReajusteConfidence(reajuste: ReajusteAnalysis | null) {
  if (!reajuste) return null
  if (reajuste.itens.length === 0) return reajuste.confianca_geral
  return Math.min(reajuste.confianca_geral, ...reajuste.itens.map((item) => item.confianca))
}

function isOperationalRecheck(check: PrestacaoRecheck) {
  if (!OPERATIONAL_RECHECK_IDS.has(check.id)) return false
  if (check.status === "passed") return true
  if (
    check.id === "total_linhas_receitas" ||
    check.id === "total_linhas_comissoes" ||
    check.id === "total_linhas_repasse" ||
    check.id === "comissao_administracao_regra"
  ) {
    return typeof check.difference === "number"
  }
  return true
}

function nullableMoney(value: number | null) {
  return value === null ? null : roundMoney(value)
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function buildAgreementPaymentKey(item: AcordoRescisaoRecebido) {
  const inquilino = normalizeText(item.inquilino)
  const apto = normalizeText(item.apto)
  // Um pagamento de acordo/rescisao e unico por: tipo + apto + inquilino +
  // competencia de recebimento + competencia de origem + valor. Incluir apto e a
  // competencia de origem evita falso "pagamento repetido" quando varias parcelas
  // de meses-origem diferentes (ex.: jan, fev, mar) sao recebidas no mesmo mes —
  // tem origem distinta e sao legitimas. Uma reimportacao real (mesma origem,
  // mesmo recebimento, mesmo valor) ainda colide e e detectada.
  const recebimento = normalizeCompetenciaKey(item.competencia_recebimento ?? item.competencia_original)
  const origem = normalizeCompetenciaKey(item.competencia_original) ?? ""
  if (!inquilino || !recebimento || !Number.isFinite(item.valor)) return null
  return [item.tipo, apto, inquilino, recebimento, origem, roundMoney(item.valor).toFixed(2)].join("|")
}

function normalizeCompetenciaKey(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim()
  const iso = normalized.match(/(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const numeric = normalized.match(/(\d{1,2})\/(\d{4})/)
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, "0")}`
  return normalizeText(normalized)
}

function normalizeText(value: string | null | undefined) {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function roundConfidence(value: number) {
  return Math.round(clampConfidence(value) * 100) / 100
}

function clampConfidence(value: number) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`
}
