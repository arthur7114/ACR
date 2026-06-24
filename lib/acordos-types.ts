// Tipos do Nivel 2 do historico: acordos parcelados + baixa de parcelas.

export interface AcordoParcela {
  id: string
  numero: number
  valor: number | null
  status: "pendente" | "pago"
  competenciaPagamento: string | null
  origem: "derivado" | "manual"
}

export interface Acordo {
  id: string
  unidade: string
  inquilino: string | null
  tipo: "acordo" | "rescisao"
  descricao: string | null
  valorTotal: number | null
  valorParcela: number | null
  totalParcelas: number | null
  status: "aberto" | "quitado" | "cancelado"
  primeiraCompetencia: string | null
  parcelasPagas: number
  valorPago: number
  parcelas: AcordoParcela[]
}

export interface AcordosResponse {
  acordos: Acordo[]
  // true quando as tabelas ainda nao existem (migration nao aplicada).
  pendenteMigration?: boolean
}
