// Tipos do Historico por imovel (Nivel 1 — derivado de analise_completa).
// O historico e reconstruido a partir das prestacoes ja processadas, sem
// depender de uma tabela de eventos persistida (essa vem no Nivel 2).

export type EventoTipo =
  | "pago"
  | "inadimplente"
  | "vago"
  | "acordo"
  | "rescisao"
  | "atraso"
  | "intermediacao"
  // Mudanca do aluguel contratado entre duas vigencias consecutivas. Nao vem
  // da prestacao: vem de `imovel_vigencias`, e por isso aparece mesmo em mes
  // sem fechamento.
  | "reajuste"

export interface EventoImovel {
  competencia: string
  competenciaLabel: string
  tipo: EventoTipo
  inquilino: string | null
  // Valores relevantes ao evento (null quando nao se aplica).
  aluguel: number | null
  total: number | null
  comissao: number | null
  repasse: number | null
  vencimento: string | null
  observacao: string | null
}

export interface InquilinoPeriodo {
  inquilino: string
  primeiraCompetencia: string
  ultimaCompetencia: string
  meses: number
}

export interface ImovelHistoricoResumo {
  mesesObservados: number
  mesesPago: number
  /** Meses que JA estiveram inadimplentes — historico, nao divida. */
  mesesInadimplente: number
  /**
   * Desses, quantos seguem devendo: um mes posterior nao declarou ter quitado.
   * E o numero que responde "quanto essa unidade deve", que `mesesInadimplente`
   * nao responde (Luana, apto 7 GM II: 3 meses, 2 quitados, 1 em aberto).
   */
  inadimplenciasEmAberto: number
  inadimplenciasQuitadas: number
  /** Quais competencias seguem devendo — a linha do tempo marca as outras como quitadas. */
  competenciasEmAberto: string[]
  /** Cobranca esperada somada dos meses em aberto; `null` = sem base de calculo. */
  valorEmAberto: number | null
  mesesVago: number
  acordos: number
  rescisoes: number
  atrasosQuitados: number
  intermediacoes: number
  reajustes: number
  totalRecebido: number
  situacaoAtual: EventoTipo | null
  inquilinoAtual: string | null
}

export interface ImovelHistorico {
  empreendimentoId: string
  empreendimentoNome: string
  unidade: string
  resumo: ImovelHistoricoResumo
  inquilinos: InquilinoPeriodo[]
  eventos: EventoImovel[]
}
