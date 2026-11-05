import { canonicalizarCodigoImovel } from "@/lib/codigo-imovel"

// Chave de comparação de unidade: sem acento, caixa ou espaços, e sem zeros à
// esquerda quando for numérica (apto "08" == "8").
export function aptoKey(value: string | null | undefined): string {
  if (!value) return ""
  const base = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
  return /^\d+$/.test(base) ? String(Number(base)) : base
}

/**
 * Chave para achar o imóvel do cadastro a partir da unidade que a tela abre.
 * O código contratual da Plural (`GA0002/2`) é o imóvel canônico `GA0002`, o
 * mesmo casamento que o sync de imóveis faz; sem isso o detalhe aberto pela
 * Revisão não acha o imóvel cadastrado.
 */
export function chaveDoImovel(value: string | null | undefined): string {
  return aptoKey(canonicalizarCodigoImovel(value))
}
