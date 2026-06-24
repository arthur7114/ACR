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
  mesesInadimplente: number
  mesesVago: number
  acordos: number
  rescisoes: number
  atrasosQuitados: number
  intermediacoes: number
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
