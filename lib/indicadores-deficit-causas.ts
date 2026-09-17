// Causas NOMEADAS do desvio entre o aluguel contratado e o recebido da
// competencia, na cascata "Do contrato ao recebido".
//
// Duas delas nao sao perda, e chama-las de perda foi o erro que o cliente
// apontou em GM II ago/2026 (feedback de 2026-09-17):
//
//   1. **Cobrado como intermediacao.** A unidade intermediada tem a linha da
//      vigencia ZERADA porque o mes dela foi cobrado na secao de
//      intermediacoes. O dinheiro entrou (GM II ago/2026: R$ 2.357,39 nos
//      aptos 3, 8 e 23), mas entra pela secao, nao pela coluna de aluguel do
//      mes. A cascata lia os tres como "inquilino nomeado que nao pagou o mes"
//      e somava R$ 2.100,00 de perda inexistente.
//
//   2. **Contrato novo com mes proporcional.** A linha declara o periodo
//      ("PROPORCIONAL DE 21 DIAS (11/08 A 31/08)") e o inquilino pagou o
//      proporcional certo; o mes cheio nunca foi devido. A cascata comparava o
//      recebido contra o aluguel contratado inteiro e chamava a diferenca de
//      recebimento parcial (GM II ago/2026: R$ 863,23 — Samuel, 21 dias, e
//      Francisco, 1 dia; 700/31 = 22,58, exatamente o que ele pagou).
//
// As duas saem de dentro das linhas antigas: a aritmetica da cascata nao muda,
// so para de chamar de perda o que nao e.

const PROPORCIONAL = /\bPROPORCIONAL\s+DE\s+(\d{1,2})\s+DIAS?\b/i

function normalizarTexto(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function roundMoney(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export interface LinhaDeficit {
  imovelId: string
  inquilinoNome?: string | null
  observacao?: string | null
  aluguelEsperado: number | null
}

export interface ItemIntermediacao {
  tipo: string
  apto?: string | null
  inquilino?: string | null
}

// Imoveis cuja competencia foi cobrada na secao de intermediacoes do
// fechamento. Casa por inquilino (o nome vem igual nas duas fontes) e, como
// segunda via, pelo numero da unidade — a secao traz `apto`, nao `imovel_id`.
export function imoveisCobradosComoIntermediacao(
  linhas: LinhaDeficit[],
  intermediacoes: ItemIntermediacao[],
  unidadePorImovel: Map<string, string> = new Map(),
): Set<string> {
  const itens = intermediacoes.filter((item) => item.tipo === "intermediacao")
  if (itens.length === 0) return new Set()

  const inquilinos = new Set(itens.map((item) => normalizarTexto(item.inquilino)).filter(Boolean))
  const aptos = new Set(itens.map((item) => normalizarTexto(item.apto)).filter(Boolean))

  const encontrados = new Set<string>()
  for (const linha of linhas) {
    const nome = normalizarTexto(linha.inquilinoNome)
    const unidade = normalizarTexto(unidadePorImovel.get(linha.imovelId))
    if ((nome !== "" && inquilinos.has(nome)) || (unidade !== "" && aptos.has(unidade))) {
      encontrados.add(linha.imovelId)
    }
  }
  return encontrados
}

// Dias declarados na propria linha ("PROPORCIONAL DE 21 DIAS"). Sem a
// declaracao no documento nao ha proporcional: o periodo nunca e inferido por
// comparacao de valores.
export function diasProporcionaisDeclarados(observacao: string | null | undefined): number | null {
  const match = normalizarTexto(observacao).match(PROPORCIONAL)
  if (!match) return null
  const dias = Number(match[1])
  return Number.isFinite(dias) && dias > 0 ? dias : null
}

export function diasDaCompetencia(competencia: string): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(competencia)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]), 0).getDate()
}

// Cobranca esperada DO MES para a linha: o aluguel contratado, ou a fracao dele
// quando o documento declara o periodo proporcional. Devolve `null` quando o
// esperado e desconhecido — nunca zero.
export function esperadoDoMes(
  aluguelEsperado: number | null,
  observacao: string | null | undefined,
  competencia: string,
): number | null {
  if (aluguelEsperado === null) return null
  const dias = diasProporcionaisDeclarados(observacao)
  const diasNoMes = diasDaCompetencia(competencia)
  if (dias === null || diasNoMes === null || dias >= diasNoMes) return aluguelEsperado
  return roundMoney((aluguelEsperado * dias) / diasNoMes)
}
