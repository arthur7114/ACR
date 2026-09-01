// Inadimplencia do MES CORRENTE (distinta da acumulada de meses anteriores).
//
// A linha da unidade inadimplente vem ZERADA no documento (o extrato imprime 0
// quando o inquilino nao pagou). Para exibir o valor real "perdido" no mes, o
// melhor proxy e a receita_total do snapshot PAGO mais recente daquela unidade
// (ex.: Apto 7 GM II junho -> receita_total de maio = 810,44). Fallback: o
// aluguel esperado do cadastro; sem nenhuma base, o valor e desconhecido.

export interface SnapshotReceita {
  competencia: string // "YYYY-MM-DD"
  receita_total: number | null
  aluguel_recebido: number | null
  status_ocupacao: string | null
}

// Uma linha de receita e inadimplencia do mes quando a observacao a marca
// explicitamente como INADIMPLENCIA (mesmo padrao da tela).
//
// O vinculo com o cadastro NAO entra nesta decisao. Exigir `imovel_id` aqui
// zerava a metrica em silencio: GM I maio/2026 tem 4 unidades marcadas como
// INADIMPLENCIA no documento e as 23 linhas foram gravadas sem vinculo, o que
// fazia a Revisao exibir R$ 0,00 (falha aberta) enquanto os indicadores
// mostravam R$ 2.631,90. Quem trata a falta de vinculo e o loader, como
// pendencia explicita.
export function ehInadimplenteDoMes(row: { observacao?: string | null }): boolean {
  const obs = (row.observacao ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
  return obs.includes("INADIMPL")
}

// Valor "perdido" no mes inadimplente. Precedencia (CA-IND22/P0.4): a cobranca
// esperada da competencia (aluguel + garagem da vigencia) e deterministica e
// auditavel — quando existe, ela e o valor. Sem ela, mantem o proxy anterior:
// receita_total do snapshot pago mais recente ("pago" = recebeu aluguel e nao
// esta marcado inadimplente); depois o aluguel esperado do cadastro.
//
// Sem nenhuma dessas bases o retorno e `null` (desconhecido), nunca zero: zero
// afirmaria que a unidade inadimplente nao devia nada.
export function receitaEsperadaInadimplente(
  snapshots: SnapshotReceita[],
  aluguelEsperado: number | null,
  cobrancaEsperada: number | null = null,
): number | null {
  if (cobrancaEsperada !== null) return Number(cobrancaEsperada.toFixed(2))
  const pagos = snapshots
    .filter((s) => (s.aluguel_recebido ?? 0) > 0 && s.status_ocupacao !== "inadimplente")
    .filter((s) => (s.receita_total ?? 0) > 0)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))

  if (pagos.length > 0) return Number((pagos[0].receita_total ?? 0).toFixed(2))
  if (aluguelEsperado === null) return null
  return Number(aluguelEsperado.toFixed(2))
}
