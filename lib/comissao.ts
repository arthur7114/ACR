import type { ReceitaPorImovel } from "./prestacao-types"

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface CommissionBaseComponents {
  totalAluguel: number
  totalGaragem: number
  totalAgua: number
  totalIptu: number
  totalSeguroIncendio: number
  base: number
}

// Base da comissão de administração = soma das receitas comissionáveis por
// imóvel. Inclui o IPTU (a imobiliária cobra a taxa sobre aluguel + IPTU, não
// só sobre o aluguel bruto). O aluguel com desconto, quando houver, tem
// precedência sobre o aluguel cheio.
export function commissionBaseComponents(
  rows: ReceitaPorImovel[],
): CommissionBaseComponents {
  const sum = (pick: (row: ReceitaPorImovel) => number | null | undefined) =>
    round(rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0))
  const totalAluguel = sum((row) => row.aluguel_com_desconto ?? row.aluguel)
  const totalGaragem = sum((row) => row.garagem)
  const totalAgua = sum((row) => row.agua)
  const totalIptu = sum((row) => row.iptu)
  const totalSeguroIncendio = sum((row) => row.seguro_incendio)
  const base = round(
    totalAluguel + totalGaragem + totalAgua + totalIptu + totalSeguroIncendio,
  )
  return { totalAluguel, totalGaragem, totalAgua, totalIptu, totalSeguroIncendio, base }
}

export function calculatedAdminCommission(
  base: number,
  taxaPercent: number | null | undefined,
): number | null {
  if (taxaPercent === null || taxaPercent === undefined) return null
  return round((base * taxaPercent) / 100)
}
