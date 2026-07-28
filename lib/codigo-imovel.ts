// Normalizacao dedicada de CODIGO de imovel (unidade/apartamento).
//
// Diferente de normalizeCadastroKey (que tambem serve para nomes de
// imobiliaria/empreendimento), aqui removemos zeros a esquerda de cada
// sequencia de digitos para que o codigo extraido do documento ("0002520")
// case com o cadastro salvo sem os zeros ("2520"). Nao alterar
// normalizeCadastroKey para isso: ela normaliza tambem nomes, onde
// stripping de zeros seria incorreto.
export function normalizeCodigoImovel(value: string | null | undefined): string {
  const base = (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
  // "0002520" -> "2520"; "apto 007" -> "apto 7"; "100" e "2520" ficam iguais.
  return base.replace(/\b0+(\d)/g, "$1")
}
