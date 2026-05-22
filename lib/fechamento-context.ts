import type { PackageAnalysis } from "@/lib/prestacao-types"

export type FechamentoContext = {
  id: string
  imobiliariaId: string
  imobiliariaNome: string
  empreendimentoId: string
  empreendimentoNome: string
  competencia: string
}

export function formatCompetenciaLong(value: string | null | undefined) {
  if (!value) return "Competencia nao informada"

  const [year, month] = value.split("-")
  const monthIndex = Number(month) - 1
  const months = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]

  if (!year || monthIndex < 0 || monthIndex > 11) return value
  return `${months[monthIndex]}/${year}`
}

export function getFechamentoLabel(
  context: FechamentoContext | null,
  analysisResult?: PackageAnalysis | null,
) {
  const imobiliaria = analysisResult?.prestacao?.imobiliaria ?? context?.imobiliariaNome
  const empreendimento = analysisResult?.prestacao?.empreendimento ?? context?.empreendimentoNome
  const competencia = analysisResult?.prestacao?.competencia ?? formatCompetenciaLong(context?.competencia)

  if (!imobiliaria && !empreendimento) return "Fechamento nao selecionado"

  return [imobiliaria, empreendimento, competencia].filter(Boolean).join(" · ")
}
