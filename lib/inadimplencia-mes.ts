// Inadimplencia do MES CORRENTE (distinta da acumulada de meses anteriores).
//
// A linha da unidade inadimplente vem ZERADA no documento (o extrato imprime 0
// quando o inquilino nao pagou). Para exibir o valor real "perdido" no mes, o
// melhor proxy e a receita_total do snapshot PAGO mais recente daquela unidade
// (ex.: Apto 7 GM II junho -> receita_total de maio = 810,44). Fallback: o
// aluguel esperado do cadastro; se nada, zero.

export interface SnapshotReceita {
  competencia: string // "YYYY-MM-DD"
  receita_total: number | null
  aluguel_recebido: number | null
  status_ocupacao: string | null
}

// Uma linha de receita e inadimplencia do mes quando tem imovel vinculado e a
// observacao a marca explicitamente como INADIMPLENCIA (mesmo padrao da tela).
export function ehInadimplenteDoMes(row: {
  imovel_id?: string | null
  observacao?: string | null
}): boolean {
  if (!row.imovel_id) return false
  const obs = (row.observacao ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
  return obs.includes("INADIMPL")
}

// Escolhe a receita_total do snapshot pago mais recente. "Pago" = recebeu
// aluguel (aluguel_recebido > 0) e nao esta marcado inadimplente.
export function receitaEsperadaInadimplente(
  snapshots: SnapshotReceita[],
  aluguelEsperado: number | null,
): number {
  const pagos = snapshots
    .filter((s) => (s.aluguel_recebido ?? 0) > 0 && s.status_ocupacao !== "inadimplente")
    .filter((s) => (s.receita_total ?? 0) > 0)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))

  if (pagos.length > 0) return Number((pagos[0].receita_total ?? 0).toFixed(2))
  return Number(((aluguelEsperado ?? 0)).toFixed(2))
}
