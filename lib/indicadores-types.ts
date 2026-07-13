import type { OccupancyStatus } from "./indicadores-domain"

export type IndicadoresQuality = "completa" | "preliminar"
export type IndicadoresSnapshotOrigin = "processamento" | "backfill"
export type IndicadoresSnapshotQuality = "completo" | "parcial" | "sem_linha"

export interface IndicadoresFiltroOption {
  value: string
  label: string
}

export interface IndicadoresCoverageGap {
  codigo:
    | "par_ausente"
    | "snapshot_ausente"
    | "snapshot_desconhecido"
    | "aluguel_esperado_ausente"
    | "linha_nao_vinculada"
    | "nao_atribuivel_ao_imovel"
  quantidade: number
  mensagem: string
}

export interface IndicadoresOccupancy {
  ocupados: number
  inadimplentes: number
  emRescisao: number
  vagos: number
  desconhecidos: number
  numerador: number
  denominador: number
  percentual: number | null
  coberturaPercentual: number | null
}

export interface IndicadoresMeta {
  calculoVersao: string
  competencia: string
  competenciaLabel: string
  atualizadoEm: string
  qualidade: IndicadoresQuality
  naturezaBase: "fechamentos_e_snapshots"
  historicoRecomposto: boolean
}

export interface IndicadoresCoverage {
  pares: {
    esperados: number
    processados: number
    aprovados: number
    pendentes: number
    rascunhos: number
    emAtualizacao: number
    ausentes: number
    percentual: number | null
  }
  imoveis: {
    esperados: number
    snapshotsDisponiveis: number
    snapshotsDesconhecidos: number
    semAluguelEsperado: number
    percentual: number | null
  }
  linhasNaoVinculadas: number
  lacunas: IndicadoresCoverageGap[]
}

export interface IndicadoresSummary {
  receitaTotal: number | null
  aluguelContratado: number | null
  aluguelRecebido: number | null
  comissaoAdministracao: number | null
  comissaoIntermediacao: number | null
  despesasRetidas: number | null
  despesaOperacionalDetalhada: {
    agua: number | null
    iptu: number | null
    seguro: number | null
    total: number | null
  }
  repasseApurado: number | null
  repasseComprovado: number | null
  repasseInformadoExtrato: number | null
  diferencaRepasse: number | null
  ocupacaoCompetencia: IndicadoresOccupancy
  ocupacaoHoje: IndicadoresOccupancy
  inadimplenciaAcumulada: number | null
}

export interface IndicadoresFinancialBridge {
  receitaTotal: number | null
  comissaoAdministracao: number | null
  despesasRetidas: number | null
  comissaoIntermediacao: number | null
  repasseApurado: number | null
  residuo: number | null
  tolerancia: number
  reconciliada: boolean | null
  alerta: boolean
}

export interface IndicadoresRentRealization {
  contratado: number | null
  vacancia: number | null
  inadimplenciaMes: number | null
  descontos: number | null
  outrosAjustes: number | null
  recebido: number | null
}

export interface IndicadoresMonthlyPoint {
  competencia: string
  label: string
  receitaTotal: number | null
  aluguelContratado: number | null
  aluguelRecebido: number | null
  repasseApurado: number | null
  ocupacaoPercentual: number | null
  coberturaPercentual: number | null
  qualidade: IndicadoresQuality
}

export interface IndicadoresAttentionItem {
  imovelId: string
  unidade: string
  inquilinoNome: string | null
  empreendimentoId: string
  empreendimentoNome: string
  esperado: number | null
  recebido: number | null
  gapValor: number | null
  statusOcupacao: OccupancyStatus
}

export interface IndicadoresHeatCell {
  competencia: string
  statusOcupacao: OccupancyStatus | null
  valor: number | null
  inadimplenciaPercentual: number | null
  vacanciaPercentual: number | null
  origem: IndicadoresSnapshotOrigin | null
  qualidade: IndicadoresSnapshotQuality | null
}

export interface IndicadoresHeatRow {
  imovelId: string
  unidade: string
  inquilinoNome: string | null
  empreendimentoId: string
  empreendimentoNome: string
  hoje: OccupancyStatus
  celulas: IndicadoresHeatCell[]
}

export interface IndicadoresPropertyRevenue {
  imovelId: string
  competencia: string
  unidade: string
  inquilinoNome: string | null
  empreendimentoId: string
  empreendimentoNome: string
  statusOcupacao: OccupancyStatus
  aluguelEsperado: number | null
  aluguelRecebido: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  vencimentoReferencia: string | null
  origem: IndicadoresSnapshotOrigin
  qualidade: IndicadoresSnapshotQuality
}

export interface IndicadoresFilters {
  selecionados: {
    empresaId: string | null
    empreendimentoId: string | null
    imovelId: string | null
  }
  competencias: IndicadoresFiltroOption[]
  empresas: IndicadoresFiltroOption[]
  empreendimentos: IndicadoresFiltroOption[]
  imoveis: IndicadoresFiltroOption[]
}

export interface IndicadoresData {
  meta: IndicadoresMeta
  cobertura: IndicadoresCoverage
  resumo: IndicadoresSummary
  ponteFinanceira: IndicadoresFinancialBridge
  realizacaoAluguel: IndicadoresRentRealization
  serieMensal: IndicadoresMonthlyPoint[]
  rankingAtencao: IndicadoresAttentionItem[]
  heat: {
    meses: Array<{ competencia: string; label: string }>
    linhas: IndicadoresHeatRow[]
  }
  receitasPorImovel: IndicadoresPropertyRevenue[]
  filtros: IndicadoresFilters
}
