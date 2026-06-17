// Conta vagas de garagem a partir de texto livre (observacao).
// Regra: numero inteiro explicito acompanhado de "vaga(s)" tem prioridade;
// senao conta 1 vaga por veiculo citado (carro e/ou moto); "vaga" sem veiculo = 1.
// Retorna null quando o texto nao menciona vaga/garagem/veiculo.
export function contarVagasDeTexto(observacao: string | null | undefined): number | null {
  if (!observacao) return null
  const obsLower = observacao.toLowerCase()
  const match = obsLower.match(/(\d+)\s*vagas?/)
  if (match) {
    return parseInt(match[1], 10)
  }
  if (obsLower.includes("vaga") || obsLower.includes("garagem")) {
    const veiculos = (obsLower.includes("carro") ? 1 : 0) + (obsLower.includes("moto") ? 1 : 0)
    if (veiculos > 0) return veiculos
    return obsLower.includes("vaga") ? 1 : null
  }
  return null
}
