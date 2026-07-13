export interface IntermediacaoInput {
  valor: number
  iptu?: number | null
  total_recebido?: number | null
  repasse?: number | null
  comissao?: number | null
  percentual?: number | null
  observacao?: string | null
}

export interface IntermediacaoFinanceiro {
  baseAluguel: number
  iptu: number
  totalRecebido: number
  comissao: number
  percentual: number | null
  repasse: number
}

export function calcularIntermediacao(item: IntermediacaoInput): IntermediacaoFinanceiro {
  const baseAluguel = roundMoney(item.valor)
  const comissao = roundMoney(item.comissao ?? 0)
  const { iptu, totalRecebido, repasse } = resolveValores(item, baseAluguel, comissao)

  return {
    baseAluguel,
    iptu,
    totalRecebido,
    comissao,
    percentual: resolvePercentual(item, baseAluguel, comissao),
    repasse,
  }
}

function resolveValores(item: IntermediacaoInput, baseAluguel: number, comissao: number) {
  const observacao = item.observacao ?? ""
  const totalInformado = item.total_recebido ?? parseTaggedMoney(observacao, "total")
  const iptuInformado = item.iptu ?? parseTaggedMoney(observacao, "iptu")
  const iptu = roundMoney(
    iptuInformado ?? (/\biptu\b/i.test(observacao) && totalInformado ? Math.max(totalInformado - baseAluguel, 0) : 0),
  )
  const totalRecebido = roundMoney(Math.max(totalInformado ?? baseAluguel + iptu, baseAluguel))
  const repasseInformado = item.repasse ?? parseTaggedMoney(observacao, "repasse")
  return { iptu, totalRecebido, repasse: roundMoney(repasseInformado ?? totalRecebido - comissao) }
}

function resolvePercentual(item: IntermediacaoInput, baseAluguel: number, comissao: number) {
  if (typeof item.percentual === "number") return item.percentual
  return baseAluguel > 0 ? Math.round((comissao / baseAluguel) * 10_000) / 100 : null
}

function parseTaggedMoney(text: string, label: string): number | null {
  const match = new RegExp(`${label}[^.;]{0,40}?R\\$\\s*([\\d.]+(?:,\\d{1,2})?)`, "i").exec(text)
  if (!match) return null
  const value = Number(match[1].replace(/\./g, "").replace(",", "."))
  return Number.isFinite(value) ? value : null
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
