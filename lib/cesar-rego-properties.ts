import { normalizeCodigoImovel } from "./codigo-imovel"

export interface CesarRegoDevelopment {
  canonicalName: string
  nameKey: string
  codes: readonly string[]
}

export const CESAR_REGO_DEVELOPMENTS: readonly CesarRegoDevelopment[] = [
  {
    canonicalName: "João Cordeiro",
    nameKey: "joao cordeiro",
    codes: ["0002520", "0002521"],
  },
  {
    canonicalName: "Galpão Pompílio Gomes",
    nameKey: "pompilio gomes",
    codes: ["0002526", "0002527"],
  },
]

export function getCesarRegoDevelopmentByName(name: string) {
  const key = normalizeText(name)
  return CESAR_REGO_DEVELOPMENTS.find((item) => key.includes(item.nameKey)) ?? null
}

export function getCesarRegoDevelopmentByPropertyCode(code: string) {
  const key = normalizeCodigoImovel(code)
  return (
    CESAR_REGO_DEVELOPMENTS.find((item) =>
      item.codes.some((candidate) => normalizeCodigoImovel(candidate) === key),
    )?.canonicalName ?? null
  )
}

export function findCesarRegoPropertyScopeConflict(input: {
  agencyName: string
  developmentName: string
  propertyCode: string
}) {
  if (!normalizeText(input.agencyName).includes("cesar rego")) return null
  const expectedDevelopment = getCesarRegoDevelopmentByPropertyCode(input.propertyCode)
  if (!expectedDevelopment) return null
  const currentDevelopment = getCesarRegoDevelopmentByName(input.developmentName)
  if (currentDevelopment?.canonicalName === expectedDevelopment) return null
  return {
    propertyCode: input.propertyCode,
    expectedDevelopment,
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}
