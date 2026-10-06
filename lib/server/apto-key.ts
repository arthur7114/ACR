// Chave de comparação de unidade: sem acento, caixa ou espaços, e sem zeros à
// esquerda quando for numérica (apto "08" == "8").
export function aptoKey(value: string | null | undefined): string {
  if (!value) return ""
  const base = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
  return /^\d+$/.test(base) ? String(Number(base)) : base
}
