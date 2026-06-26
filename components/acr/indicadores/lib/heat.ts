// Escala de cores do mapa de calor: verde -> amarelo -> vermelho (6 faixas).
// As classes vivem em app/globals.css (@layer components: .acr-heat-q0..q5).

const BUCKETS = ["acr-heat-q0", "acr-heat-q1", "acr-heat-q2", "acr-heat-q3", "acr-heat-q4", "acr-heat-q5"] as const

/** Faixa de cor para um valor relativo ao máximo da métrica. */
export function heatClass(value: number | null, max: number): string {
  if (value === null) return "acr-heat-empty"
  const r = max > 0 ? value / max : 0
  if (r <= 0.1) return BUCKETS[0]
  if (r <= 0.25) return BUCKETS[1]
  if (r <= 0.45) return BUCKETS[2]
  if (r <= 0.65) return BUCKETS[3]
  if (r <= 0.85) return BUCKETS[4]
  return BUCKETS[5]
}

/** Tokens da escala, na ordem, para a legenda (verde -> vermelho). */
export const HEAT_SCALE_TOKENS = [
  "var(--acr-heat-0)",
  "var(--acr-heat-1)",
  "var(--acr-heat-2)",
  "var(--acr-heat-3)",
  "var(--acr-heat-4)",
  "var(--acr-heat-5)",
] as const

/** Número com 1 casa e vírgula decimal: 4.25 -> "4,3". */
export const fmt1 = (v: number) => v.toFixed(1).replace(".", ",")
