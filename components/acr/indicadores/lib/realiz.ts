// Cores e rótulos de "realização" (recebido ÷ esperado) por imóvel.
// Retornam tokens --acr-* para manter a paleta centralizada.

export type RealizTone = "ok" | "mid" | "bad"

/** Cor da barra/percentual conforme o quanto o imóvel entregou do esperado. */
export function realizColor(pct: number): string {
  if (pct >= 95) return "var(--acr-green)"
  if (pct >= 85) return "var(--acr-heat-2)"
  if (pct >= 70) return "var(--acr-amber)"
  return "var(--acr-red)"
}

/** [tom, rótulo] para a etiqueta de status. */
export function realizTag(pct: number): [RealizTone, string] {
  if (pct >= 95) return ["ok", "Integral"]
  if (pct >= 85) return ["ok", "Saudável"]
  if (pct >= 70) return ["mid", "Parcial"]
  return ["bad", "Atenção"]
}
