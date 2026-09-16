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
  totalOutrosRecebimentos: number
  base: number
}

// Base da comissão de administração = soma das receitas comissionáveis por
// imóvel. Inclui o IPTU (a imobiliária cobra a taxa sobre aluguel + IPTU, não
// só sobre o aluguel bruto). O aluguel com desconto, quando houver, tem
// precedência sobre o aluguel cheio.
//
// `outros_recebimentos` entra porque é onde vivem os ENCARGOS FINANCEIROS POR
// ATRASO, e a imobiliária comissiona sobre eles. João Cordeiro jun/2026: a
// comissão das linhas somava R$ 149,47 e o cálculo dava R$ 140,66 — os
// R$ 176,10 de encargos ficavam fora da base e o fechamento travava num alerta
// que não tinha como ser resolvido. Medido em todos os fechamentos de mai a
// ago/2026: só dois têm encargos, e nos dois o cálculo passa a bater com o
// documento.
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
  const totalOutrosRecebimentos = sum((row) => row.outros_recebimentos)
  const base = round(
    totalAluguel +
      totalGaragem +
      totalAgua +
      totalIptu +
      totalSeguroIncendio +
      totalOutrosRecebimentos,
  )
  return {
    totalAluguel,
    totalGaragem,
    totalAgua,
    totalIptu,
    totalSeguroIncendio,
    totalOutrosRecebimentos,
    base,
  }
}

export function calculatedAdminCommission(
  base: number,
  taxaPercent: number | null | undefined,
): number | null {
  if (taxaPercent === null || taxaPercent === undefined) return null
  return round((base * taxaPercent) / 100)
}
