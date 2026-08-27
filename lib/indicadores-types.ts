import type { OccupancyStatus } from "./indicadores-domain"

export type IndicadoresQuality = "completa" | "preliminar"
export type IndicadoresSnapshotOrigin = "processamento" | "backfill"
export type IndicadoresSnapshotQuality = "completo" | "parcial" | "sem_linha"
export type IndicadoresConfidenceStatus =
  | "confirmado"
  | "em_conferencia"
  | "incompleto"
  | "com_divergencia"
export type IndicadoresRevenueModel = "fixo" | "variavel" | "nao_aplicavel"

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
    | "contrato_ausente"
    | "comprovante_ausente"
    | "linha_nao_vinculada"
    | "nao_atribuivel_ao_imovel"
  quantidade: number
  mensagem: string
  detalhes: string[]
}

export interface IndicadoresOccupancy {
  ocupados: number
  alugadosApp: number
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
  statusConfianca: IndicadoresConfidenceStatus
  motivosConfianca: string[]
  /** @deprecated Compatibilidade temporária com consumidores v1. */
  qualidade: IndicadoresQuality
  naturezaBase: "fechamentos_e_snapshots"
  historicoRecomposto: boolean
}

export interface IndicadoresCoverage {
  fechamentos: {
    esperados: number
    processados: number
    aprovados: number
    pendentes: number
    rascunhos: number
    emAtualizacao: number
    ausentes: number
    percentual: number | null
  }
  /** @deprecated Use `fechamentos`. */
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
  contratos: {
    conhecidos: number
    naoAplicaveis: number
    ausentes: number
  }
  comprovantes: {
    esperados: number
    presentes: number
    ausentes: number
    percentual: number | null
  }
  linhasNaoVinculadas: number
  lacunas: IndicadoresCoverageGap[]
}

export interface IndicadoresSummary {
  receitasEconomicas: number | null
  aluguelRecebidoCompetencia: number | null
  atrasosRecuperados: number | null
  outrosRecebimentos: number | null
  entradasPassagem: number | null
  saidasPassagem: number | null
  tarifas: number | null
  repasseCalculado: number | null
  repasseDeclarado: number | null
  repasseConfirmadoBanco: number | null
  repasseCalculadoComprovado: number | null
  coberturaComprovantesPercentual: number | null
  /** @deprecated Campos v1 mantidos durante o rollout. */
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
  receitasEconomicas: number | null
  entradasPassagem: number | null
  comissoes: number | null
  despesas: number | null
  tarifas: number | null
  saidasPassagem: number | null
  repasseCalculado: number | null
  repasseDeclarado: number | null
  diferencaNaoExplicada: number | null
  /** @deprecated Campos v1 mantidos durante o rollout. */
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
  /**
   * CA-IND23: valor monetário da vacância pela cobrança esperada (aluguel +
   * garagem contratada quando houver vigência). Difere de `vacancia`, que
   * permanece na base do aluguel para reconciliar com `contratado`.
   */
  vacanciaFinanceira: number | null
  inadimplenciaMes: number | null
  descontos: number | null
  ajustesClassificados: number | null
  valoresSemClassificacao: number | null
  recebidoCompetencia: number | null
  atrasosRecuperados: number | null
  alugueisRecebidosMes: number | null
  /** @deprecated Campos v1 mantidos durante o rollout. */
  outrosAjustes: number | null
  outrosAjustesPercentualContratado: number | null
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
  // Saldo reatribuido por competencia original (positivo = recebeu valores de
  // outros meses; negativo = cedeu valores recebidos aqui a meses anteriores).
  // O repasse e a ponte financeira permanecem por caixa e nao sao ajustados.
  competenciaAjusteReceita: number
  competenciaAjusteAluguel: number
  statusConfianca: IndicadoresConfidenceStatus
}

export interface IndicadoresAttentionItem {
  imovelId: string
  unidade: string
  inquilinoNome: string | null
  empreendimentoId: string
  empreendimentoNome: string
  esperado: number | null
  modeloReceita: IndicadoresRevenueModel
  recebido: number | null
  gapValor: number | null
  statusOcupacao: OccupancyStatus
}

export interface IndicadoresHeatCell {
  competencia: string
  inquilinoNome: string | null
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
  modeloReceita: IndicadoresRevenueModel
  aluguelRecebido: number | null
  aluguelRecebidoCompetencia: number | null
  atrasosRecuperados: number | null
  outrosRecebimentos: number | null
  receitaTotal: number | null
  desconto: number | null
  comissaoAdministracao: number | null
  repasseApurado: number | null
  vencimentoReferencia: string | null
  competenciaAluguel: string | null
  competenciaRecebimento: string | null
  vencimentoDia: number | null
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
