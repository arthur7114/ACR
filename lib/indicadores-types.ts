// Tipos compartilhados (cliente + servidor) da tela de Indicadores.
// A agregação vive em lib/server/indicadores.ts e é exposta por /api/indicadores.

export interface IndicadoresFiltroOption {
  id: string
  label: string
}

export interface OfensorReceita {
  key: "vacancia" | "inadimplencia" | "descontos"
  label: string
  valor: number
  pct: number
  pending?: boolean
}

export interface RegistroPagamento {
  competencia: string
  competenciaLabel: string
  empreendimento: string
  apto: string
  inquilino: string
  aluguel: number | null
  desconto: number | null
  total: number
  repasse: number | null
  vencimento: string | null
}

export interface RealizacaoImovel {
  apto: string
  inquilino: string
  empreendimento: string
  esperado: number
  realizado: number
  pct: number
}

export interface HeatRow {
  empreendimento: string
  valores: (number | null)[]
  media: number | null
}

export interface SerieMensalPonto {
  competencia: string
  label: string
  receita: number
  ocupacaoPct: number | null
}

export interface IndicadoresData {
  competencia: string
  competenciaLabel: string
  competenciasDisponiveis: { value: string; label: string }[]
  empresas: IndicadoresFiltroOption[]
  empreendimentos: IndicadoresFiltroOption[]
  imoveis: IndicadoresFiltroOption[]
  filtros: { empresaId: string | null; empreendimentoId: string | null; imovel: string | null }

  // KPIs principais (ordem: ocupação, receita, despesa, repasse, taxa total)
  ocupacao: {
    pct: number
    ocupados: number
    vagos: number
    total: number
    vacanciaValor: number
  }
  receita: number
  despesaOperacional: number
  totalRepassar: number
  taxaTotal: number

  movimentacoes: {
    acordos: { count: number; valor: number }
    rescisoes: { count: number; valor: number }
    reajustes: { count: number; pending: boolean }
    descontos: number
    despesaPorCategoria: { agua: number; iptu: number; seguro: number }
  }

  percentuais: {
    administracaoPct: number | null
    intermediacaoPct: number | null
    ocupacaoPct: number
    despesaOperacionalPct: number
  }

  despesas: {
    operacional: number
    venda: number | null
    vendaPct: number | null
  }

  cascata: {
    potencial: number
    potencialContratado: number
    inadimplenciaAcumulada: number
    realizado: number
    realizadoPct: number
    ofensores: OfensorReceita[]
  }

  serieMensal: SerieMensalPonto[]
  ranking: RealizacaoImovel[]

  heat: {
    meses: { value: string; label: string }[]
    // Agrupado por empreendimento
    inad: HeatRow[]
    vac: HeatRow[]
    // Agrupado por apartamento (detalhamento; toggle na view)
    inadApto: HeatRow[]
    vacApto: HeatRow[]
    // Teto fixo da escala (mesma % = mesma cor sempre)
    inadMax: number
    vacMax: number
    inadMediaCarteira: (number | null)[]
    vacMediaCarteira: (number | null)[]
    inadAptoMediaCarteira: (number | null)[]
    vacAptoMediaCarteira: (number | null)[]
  }

  registro: RegistroPagamento[]

  pendencias: string[]
}
