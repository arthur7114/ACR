import type { PrestacaoRecheck } from "@/lib/prestacao-types"

// Validacao objetiva: qualquer recheck que NAO seja um score de confianca da IA.
// E a base tanto da CONTAGEM do parecer quanto da LISTA de pendencias — as duas
// tem que usar a MESMA peneira, senao o topo diz "N bloqueios" e a abinha mostra
// menos (bug relatado no GM II junho).
export function isObjectiveValidation(check: PrestacaoRecheck): boolean {
  if (check.id.endsWith("_confidence") || check.id.startsWith("optional_")) {
    return false
  }
  if (
    check.id === "total_despesas" &&
    (check.expected === 0 || check.expected === null || check.expected === undefined) &&
    (check.actual === null || check.actual === undefined) &&
    (check.difference === null || check.difference === undefined)
  ) {
    return false
  }
  return true
}

// Alerta nao bloqueante (`warning`) nao existe na interface — decisao de produto
// de 2026-09-02: "nao devem aparecer em nenhum lugar, nunca". Segue persistido
// como `alerta` no banco para auditoria, mas nao entra em lista, contagem,
// banner nem no grupo de resolvidos.
export function isVisibleValidation(check: PrestacaoRecheck): boolean {
  return isObjectiveValidation(check) && check.status !== "warning"
}

export function isResolvedCheck(check: PrestacaoRecheck): boolean {
  return check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
}

export interface PendenciasDerivadas {
  failed: PrestacaoRecheck[]
  resolved: PrestacaoRecheck[]
}

// Separa os rechecks visiveis nos dois grupos exibidos (bloqueios, resolvidos).
// O que aparece aqui e exatamente o que getValidationSummary conta.
export function derivePendencias(rechecks: PrestacaoRecheck[]): PendenciasDerivadas {
  const visiveis = rechecks.filter(isVisibleValidation)
  return {
    failed: visiveis.filter((check) => check.status === "failed" && !isResolvedCheck(check)),
    resolved: visiveis.filter(isResolvedCheck),
  }
}

export interface ValidationSummary {
  blocked: number
  passed: number
}

// Contagem do parecer automatico. Derivada da MESMA base de derivePendencias
// para garantir que contagem == lista.
export function getValidationSummary(rechecks: PrestacaoRecheck[]): ValidationSummary {
  const visiveis = rechecks.filter(isVisibleValidation)
  const { failed } = derivePendencias(rechecks)
  return {
    blocked: failed.length,
    // passed inclui os checks aprovados e os resolvidos (contam como ok).
    passed: visiveis.length - failed.length,
  }
}
