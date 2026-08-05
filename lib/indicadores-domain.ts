export type OccupancyStatus =
  | "ocupado"
  | "alugado_app"
  | "inadimplente"
  | "vago"
  | "em_rescisao"
  | "desconhecido"

interface PropertyKeyInput {
  realEstateAgency: string
  development: string
  unit: string
}

interface OccupancyEvidence {
  tenantName: string | null
  observation: string | null
  rentReceived: number | null
  hasTermination: boolean
  hasDelinquency: boolean
  hasVacancy: boolean
  // Receita variável (Airbnb) é operação de temporada conhecida pelo cadastro.
  // Um mês sem linha na prestação não a torna desconhecida.
  isVariableRevenue?: boolean
}

export interface SnapshotLineAmounts {
  rent: number | null | undefined
  discountedRent: number | null | undefined
  revenueTotal: number | null | undefined
  discount: number | null | undefined
  administrationCommission: number | null | undefined
  assessedTransfer: number | null | undefined
}

export function roundMoney(value: number) {
  const rounded =
    (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export function normalizePropertyKeyPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ")
}

// Airbnb detectado por imoveis.tipo OU imoveis.inquilino_nome (mesmo critério
// já usado em 202607280004_airbnb_receita_variavel.sql). Nos dados reais,
// `tipo` está nulo nas unidades Airbnb conhecidas — a marcação vive em
// `inquilino_nome = 'AIRBNB'`. Checar apenas `tipo` detecta zero unidades;
// checar os dois é o que reproduz o comportamento já estabelecido no schema.
export function isImovelAirbnb(
  tipo: string | null | undefined,
  inquilinoNome: string | null | undefined,
) {
  return (
    normalizePropertyKeyPart(tipo ?? "") === "airbnb" ||
    normalizePropertyKeyPart(inquilinoNome ?? "") === "airbnb"
  )
}

export function buildPropertyKey(input: PropertyKeyInput) {
  return [input.realEstateAgency, input.development, input.unit]
    .map(normalizePropertyKeyPart)
    .join("::")
}

export function classifyOccupancy(evidence: OccupancyEvidence): OccupancyStatus {
  if (evidence.hasTermination) return "em_rescisao"
  // A inadimplência explícita descreve a competência corrente. Um valor positivo
  // pode ser recuperação de mês anterior e, por isso, não pode apagá-la.
  if (evidence.hasDelinquency) return "inadimplente"

  const context = normalizePropertyKeyPart(
    [evidence.tenantName, evidence.observation].filter(Boolean).join(" "),
  )
  if (context.includes("airbnb") || (evidence.rentReceived ?? 0) > 0) return "ocupado"
  if (evidence.hasVacancy) return "vago"
  // Sem evidência na prestação, a receita variável recorre ao cadastro: é
  // operação ativa, não dado ausente.
  if (evidence.isVariableRevenue) return "ocupado"
  return "desconhecido"
}

export function aggregateSnapshotLines(lines: SnapshotLineAmounts[]) {
  return {
    rentReceived: sumKnown(lines.map((line) => line.discountedRent ?? line.rent)),
    revenueTotal: sumKnown(lines.map((line) => line.revenueTotal)),
    discount: sumKnown(lines.map((line) => line.discount)),
    administrationCommission: sumKnown(lines.map((line) => line.administrationCommission)),
    assessedTransfer: sumKnown(lines.map((line) => line.assessedTransfer)),
  }
}

export function calculateOccupancy(statuses: OccupancyStatus[]) {
  const occupied = countStatus(statuses, "ocupado")
  const delinquent = countStatus(statuses, "inadimplente")
  const inTermination = countStatus(statuses, "em_rescisao")
  const vacant = countStatus(statuses, "vago")
  const unknown = countStatus(statuses, "desconhecido")
  const numerator = occupied + delinquent + inTermination
  const denominator = numerator + vacant

  return {
    occupied,
    delinquent,
    inTermination,
    vacant,
    unknown,
    numerator,
    denominator,
    percentage: denominator === 0 ? null : roundMoney((numerator / denominator) * 100),
  }
}

export function reconcileFinancialBridge(input: {
  revenueTotal: number
  passageEntries?: number
  administrationCommission: number
  retainedExpenses: number
  bankingFees?: number
  brokerageCommission: number
  passageExits?: number
  assessedTransfer: number
}) {
  const calculatedTransfer = roundMoney(
    input.revenueTotal +
      (input.passageEntries ?? 0) -
      input.administrationCommission -
      input.retainedExpenses -
      (input.bankingFees ?? 0) -
      input.brokerageCommission -
      (input.passageExits ?? 0),
  )
  const residual = roundMoney(calculatedTransfer - input.assessedTransfer)
  const isReconciled = Math.abs(residual) <= 0.01

  return {
    calculatedTransfer,
    residual,
    isReconciled,
    hasAlert: !isReconciled,
  }
}

export function calculateRentRealization(input: {
  contractedRent: number
  vacancy: number
  currentDelinquency: number
  discounts: number
  classifiedAdjustments?: number
  receivedRent: number
  recoveredLateRent?: number
}) {
  const classifiedReceived = roundMoney(
    input.contractedRent -
      input.vacancy -
      input.currentDelinquency -
      input.discounts +
      (input.classifiedAdjustments ?? 0),
  )
  const otherAdjustments = roundMoney(input.receivedRent - classifiedReceived)
  const reconciledReceived = roundMoney(classifiedReceived + otherAdjustments)
  const rentsReceivedInMonth = roundMoney(
    input.receivedRent + (input.recoveredLateRent ?? 0),
  )

  return {
    otherAdjustments,
    reconciledReceived,
    rentsReceivedInMonth,
    isReconciled: Math.abs(roundMoney(input.receivedRent - reconciledReceived)) <= 0.01,
  }
}

function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number")
  return known.length === 0 ? null : roundMoney(known.reduce((sum, value) => sum + value, 0))
}

function countStatus(statuses: OccupancyStatus[], expected: OccupancyStatus) {
  return statuses.filter((status) => status === expected).length
}
