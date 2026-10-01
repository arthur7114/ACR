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

// Denominador da "taxa realizada" = total das linhas + IPTU de passagem.
//
// No extrato Cesar Rego o IPTU pode entrar e sair na mesma linha (credito e
// debito iguais em `entradas_passagem`/`saidas_passagem`) e fica FORA do
// `total` da linha, mas a imobiliaria comissiona sobre ele. Galpao Pompilio
// Gomes ago/2026: 4% sobre 12.414,16 + 342,04 = 510,25, exatamente o cobrado;
// dividindo so pelo total, a tela mostrava 4,11% contra 4% cadastrados e o
// cliente via uma diferenca que nao existia (mai a ago, todos os meses).
//
// So conta a passagem COMPLETA. Credito sem debito e devolucao de IPTU, e essa
// nao e comissionada: Galpao Jose Walter jun/2026 tem 445,95 de "Dev.parc de
// IPTU" e 8% exatos sobre o aluguel; somar a devolucao derrubaria para 7,02%.
export function realizedCommissionBase(rows: ReceitaPorImovel[]): number {
  return round(
    rows.reduce((total, row) => {
      const entrada = Number(row.entradas_passagem) || 0
      const saida = Number(row.saidas_passagem) || 0
      const passagemCompleta = entrada > 0 && round(entrada) === round(saida)
      return total + row.total + (passagemCompleta ? entrada : 0)
    }, 0),
  )
}
