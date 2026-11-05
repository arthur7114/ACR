import type { SituacaoPrazo } from "@/lib/contrato-prazo"

export function seloPrazo(situacao: SituacaoPrazo): { label: string; className: string } | null {
  const dias = situacao.diasParaTermino
  switch (situacao.estado) {
    case "vencido":
      // Inquilino na unidade com prazo vencido costuma ser prorrogacao tacita.
      return { label: `Vencido há ${Math.abs(dias ?? 0)} dias`, className: "bg-[#FEF2F2] text-[#B91C1C]" }
    case "vence_em_breve":
      return { label: dias === 0 ? "Vence hoje" : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`, className: "bg-[#FFFBEB] text-[#B45309]" }
    case "a_iniciar":
      return { label: "A iniciar", className: "bg-[#EFF6FF] text-[#1D4ED8]" }
    case "outro_inquilino":
      return { label: "De outro inquilino", className: "bg-[#F3F4F6] text-[#6B7280]" }
    default:
      return null
  }
}
