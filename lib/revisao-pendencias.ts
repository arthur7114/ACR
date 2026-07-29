import type { PrestacaoRecheck } from "@/lib/prestacao-types"

// Validacao objetiva: qualquer recheck que NAO seja um score de confianca da IA.
// E a base tanto da CONTAGEM do parecer quanto da LISTA de pendencias — as duas
// tem que usar a MESMA peneira, senao o topo diz "N alertas" e a abinha mostra
// menos (bug relatado no GM II junho).
export function isObjectiveValidation(check: PrestacaoRecheck): boolean {
  return !check.id.endsWith("_confidence")
}

export function isResolvedCheck(check: PrestacaoRecheck): boolean {
  return check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
}

export interface PendenciasDerivadas {
  failed: PrestacaoRecheck[]
  warning: PrestacaoRecheck[]
  resolved: PrestacaoRecheck[]
}

// Separa os rechecks objetivos nos tres grupos exibidos (bloqueios, alertas,
// resolvidos). O que aparece aqui e exatamente o que getValidationSummary conta.
export function derivePendencias(rechecks: PrestacaoRecheck[]): PendenciasDerivadas {
  const objetivos = rechecks.filter(isObjectiveValidation)
  return {
    failed: objetivos.filter((check) => check.status === "failed" && !isResolvedCheck(check)),
    warning: objetivos.filter((check) => check.status === "warning" && !isResolvedCheck(check)),
    resolved: objetivos.filter(isResolvedCheck),
  }
}

export interface ValidationSummary {
  blocked: number
  warnings: number
  passed: number
}

// Contagem do parecer automatico. Derivada da MESMA base de derivePendencias
// para garantir que contagem == lista.
export function getValidationSummary(rechecks: PrestacaoRecheck[]): ValidationSummary {
  const objetivos = rechecks.filter(isObjectiveValidation)
  const { failed, warning } = derivePendencias(rechecks)
  return {
    blocked: failed.length,
    warnings: warning.length,
    // passed inclui os checks aprovados e os resolvidos (contam como ok).
    passed: objetivos.length - failed.length - warning.length,
  }
}
