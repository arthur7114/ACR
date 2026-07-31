import type { PrestacaoRecheck } from "./prestacao-types"

// Rechecks cujo actual/expected representam uma CONTAGEM, não um valor
// monetário. A UI (lista de pendências e modal de resolução) formata ambos os
// campos como R$ — nunca devem carregar uma contagem. A contagem já está no
// texto de `message`.
const COUNT_BASED_RECHECK_IDS = new Set(["acordos_competencias", "duplicate_agreement_payment"])

export function nullifyCountBasedRecheckValues(rechecks: PrestacaoRecheck[]): {
  changed: boolean
  rechecks: PrestacaoRecheck[]
} {
  let changed = false
  const fixed = rechecks.map((check) => {
    if (!COUNT_BASED_RECHECK_IDS.has(check.id)) return check
    if (check.actual == null && check.expected == null) return check
    changed = true
    return { ...check, actual: null, expected: null }
  })
  return { changed, rechecks: fixed }
}
