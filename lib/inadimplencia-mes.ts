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
  if (cobrancaEsperada !== null && cobrancaEsperada !== 0) return Number(cobrancaEsperada.toFixed(2))
  const pagos = snapshots
    .filter((s) => (s.aluguel_recebido ?? 0) > 0 && s.status_ocupacao !== "inadimplente")
    .filter((s) => (s.receita_total ?? 0) > 0)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))

  if (pagos.length > 0) return Number((pagos[0].receita_total ?? 0).toFixed(2))
  // Zero no cadastro e placeholder de migracao, nao aluguel (classe C do
  // registro de incidentes): a divida do mes fica desconhecida, nunca R$ 0,00.
  // Indicadores ja tratam assim; sem isto as duas telas divergiam (TERRENO
  // CASTELAO mai/26: Revisao 0, Indicadores —).
  if (aluguelEsperado === null || aluguelEsperado === 0) return null
  return Number(aluguelEsperado.toFixed(2))
}

// ---------------------------------------------------------------------------
// Saldo em aberto ao longo do historico da unidade.
//
// Contar MESES que ja estiveram inadimplentes e historico, nao divida. O
// drawer do imovel exibia "Inadimplente 3" para a Luana (apto 7 GM II) quando
// junho ja tinha sido pago em julho e julho em agosto — so agosto seguia
// devendo. O numero estava certo e a leitura, errada: quem ve "3" entende que
// a unidade deve tres meses.
//
// A quitacao NAO e inferida aqui: ela ja vive no snapshot, em
// `atrasos_competencia_origem`, escrita quando o documento diz a que mes o
// atraso recuperado se refere (estruturado em `competencia_original` ou pelo
// texto, "VIGENCIA DE JUNHO DE 2026"). E a mesma evidencia que o mapa de calor
// usa para pintar a competencia como quitada. Mes sem origem informada nunca e
// dado como pago por chute.

export interface SnapshotInadimplente {
  competencia: string // "YYYY-MM-DD"
  statusOcupacao: string | null
  cobrancaEsperada: number | null
  aluguelEsperado: number | null
  atrasosRecuperados: number | null
  atrasosCompetenciaOrigem: string | null
}

export interface ResumoInadimplencia {
  /** Meses que ja estiveram inadimplentes — o historico. */
  meses: number
  /** Desses, quantos um mes POSTERIOR declarou ter quitado. */
  quitadas: number
  /** Os que seguem devendo. */
  emAberto: number
  competenciasEmAberto: string[]
  /**
   * Soma da cobranca esperada dos meses em aberto. `null` quando algum deles
   * nao tem base de calculo: zero afirmaria que a unidade nao deve nada, que e
   * a mesma mentira que `receitaEsperadaInadimplente` evita. Sem nenhum mes em
   * aberto o valor e 0 — ai a ausencia de divida e fato, nao desconhecimento.
   */
  valorEmAberto: number | null
}

export function resumirInadimplencia(snapshots: SnapshotInadimplente[]): ResumoInadimplencia {
  const inadimplentes = snapshots.filter((s) => s.statusOcupacao === "inadimplente")

  // Um pagamento so quita uma divida que JA existia: origem apontando para mes
  // igual ou posterior ao proprio pagamento e erro de atribuicao, nao
  // adiantamento. Set desdobra pagamentos repetidos para a mesma competencia
  // (parcelamento) numa quitacao so.
  const quitadas = new Set(
    snapshots
      .filter(
        (s) =>
          s.atrasosCompetenciaOrigem !== null
          && (s.atrasosRecuperados ?? 0) > 0
          && s.atrasosCompetenciaOrigem < s.competencia,
      )
      .map((s) => s.atrasosCompetenciaOrigem as string),
  )

  const emAberto = inadimplentes.filter((s) => !quitadas.has(s.competencia))
  const bases = emAberto.map((s) => s.cobrancaEsperada ?? s.aluguelEsperado)
  // Zero e placeholder de cadastro migrado, nao cobranca: trata como ausente.
  const semBase = bases.some((base) => base === null || base === 0)
  const conhecidas = bases.filter((base): base is number => base !== null && base !== 0)

  return {
    meses: inadimplentes.length,
    quitadas: inadimplentes.filter((s) => quitadas.has(s.competencia)).length,
    emAberto: emAberto.length,
    competenciasEmAberto: emAberto.map((s) => s.competencia).sort(),
    valorEmAberto: semBase
      ? null
      : Number(conhecidas.reduce((total, base) => total + base, 0).toFixed(2)),
  }
}
