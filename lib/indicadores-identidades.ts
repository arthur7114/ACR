// Identidades canônicas dos indicadores: as igualdades que precisam valer entre
// os campos de `IndicadoresData`, declaradas uma vez e verificáveis em lote.
//
// Nasceu da auditoria de KPIs de 2026-09-02. Cada bloco do dashboard (ponte
// financeira, realização do aluguel, ocupação, série mensal) fecha uma conta, e
// os campos v1 depreciados precisam continuar concordando com os v2 enquanto o
// rollout durar. Nada disso era verificado de ponta a ponta: os testes cobriam
// os agregadores isoladamente, com entradas sintéticas.
//
// A abstração é declarativa de propósito. Uma identidade nova é uma entrada
// nesta lista, não um script novo — foi o pedido explícito de não multiplicar
// verificadores por indicador.
//
// Cuidado ao adicionar: uma identidade só entra aqui quando os dois lados
// medem a MESMA grandeza. Durante a auditoria, três "violações" eram na verdade
// comparações entre campos de significados diferentes:
//   · `ponte.comissoes` (administração + intermediação) contra
//     `ponte.comissaoAdministracao` (só administração);
//   · a soma dos baldes de ocupação contra `denominador`, que exclui os
//     desconhecidos de propósito (eles têm `coberturaPercentual` próprio);
//   · `resumo.aluguelRecebido` (com atrasos) contra `serie.aluguelRecebido`
//     (só a competência).
// Nenhuma das três era defeito. Identidade errada gera alarme falso, e alarme
// falso gasta a atenção reservada à divergência real.
import type { IndicadoresData } from "./indicadores-types"

export interface IdentidadeAvaliada {
  esperado: number | null
  obtido: number | null
}

export interface IdentidadeKpi {
  id: string
  descricao: string
  avaliar: (data: IndicadoresData) => IdentidadeAvaliada | null
}

export interface DivergenciaIdentidade {
  id: string
  descricao: string
  esperado: number | null
  obtido: number | null
  diferenca: number | null
  motivo: "valor_divergente" | "lado_ausente"
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100

/** Soma que devolve null se qualquer parcela for desconhecida. */
function somaEstrita(valores: Array<number | null | undefined>): number | null {
  let total = 0
  for (const valor of valores) {
    if (valor === null || valor === undefined) return null
    total += valor
  }
  return arredondar(total)
}

export const IDENTIDADES_INDICADORES: IdentidadeKpi[] = [
  {
    id: "ponte_repasse_calculado",
    descricao:
      "ponte: receitas + entradas de passagem − comissões − despesas − tarifas − saídas de passagem = repasse calculado",
    avaliar: ({ ponteFinanceira: p }) => ({
      esperado: somaEstrita([
        p.receitasEconomicas,
        p.entradasPassagem,
        p.comissoes === null ? null : -p.comissoes,
        p.despesas === null ? null : -p.despesas,
        p.tarifas === null ? null : -p.tarifas,
        p.saidasPassagem === null ? null : -p.saidasPassagem,
      ]),
      obtido: p.repasseCalculado,
    }),
  },
  {
    id: "ponte_diferenca_nao_explicada",
    descricao: "ponte: repasse calculado − repasse declarado = diferença não explicada",
    avaliar: ({ ponteFinanceira: p }) => ({
      esperado: somaEstrita([p.repasseCalculado, p.repasseDeclarado === null ? null : -p.repasseDeclarado]),
      obtido: p.diferencaNaoExplicada,
    }),
  },
  {
    id: "ponte_comissoes_agregam_intermediacao",
    descricao: "ponte: comissões = comissão de administração + comissão de intermediação",
    avaliar: ({ ponteFinanceira: p }) => ({
      esperado: somaEstrita([p.comissaoAdministracao, p.comissaoIntermediacao]),
      obtido: p.comissoes,
    }),
  },
  {
    id: "realizacao_identidade",
    descricao:
      "realização: contratado − vacância − inadimplência − descontos + ajustes classificados + valores sem classificação = recebido da competência",
    avaliar: ({ realizacaoAluguel: r }) => ({
      esperado: somaEstrita([
        r.contratado,
        r.vacancia === null ? null : -r.vacancia,
        r.inadimplenciaMes === null ? null : -r.inadimplenciaMes,
        r.descontos === null ? null : -r.descontos,
        r.ajustesClassificados,
        r.valoresSemClassificacao,
      ]),
      obtido: r.recebidoCompetencia,
    }),
  },
  {
    id: "realizacao_alugueis_do_mes",
    descricao: "realização: recebido da competência + atrasos recuperados = aluguéis recebidos no mês",
    avaliar: ({ realizacaoAluguel: r }) => ({
      esperado: somaEstrita([r.recebidoCompetencia, r.atrasosRecuperados]),
      obtido: r.alugueisRecebidosMes,
    }),
  },
  {
    id: "resumo_aluguel_recebido",
    descricao: "resumo: aluguel recebido da competência + atrasos recuperados = aluguel recebido (v1)",
    avaliar: ({ resumo: s }) => ({
      esperado: somaEstrita([s.aluguelRecebidoCompetencia, s.atrasosRecuperados]),
      obtido: s.aluguelRecebido,
    }),
  },
  {
    id: "ocupacao_denominador",
    descricao:
      "ocupação: ocupados + app + inadimplentes + em rescisão + vagos = denominador (desconhecidos ficam fora, por cobertura)",
    avaliar: ({ resumo: { ocupacaoCompetencia: o } }) => ({
      esperado: o.ocupados + o.alugadosApp + o.inadimplentes + o.emRescisao + o.vagos,
      obtido: o.denominador,
    }),
  },
  {
    id: "v1_receita_total",
    descricao: "compatibilidade v1: receitaTotal = receitasEconomicas",
    avaliar: ({ resumo: s }) => ({ esperado: s.receitasEconomicas, obtido: s.receitaTotal }),
  },
  {
    id: "v1_repasse_apurado",
    descricao: "compatibilidade v1: repasseApurado = repasseCalculado",
    avaliar: ({ resumo: s }) => ({ esperado: s.repasseCalculado, obtido: s.repasseApurado }),
  },
  {
    id: "v1_outros_ajustes",
    descricao: "compatibilidade v1: outrosAjustes = valoresSemClassificacao",
    avaliar: ({ realizacaoAluguel: r }) => ({ esperado: r.valoresSemClassificacao, obtido: r.outrosAjustes }),
  },
  {
    id: "v1_recebido",
    descricao: "compatibilidade v1: recebido = recebidoCompetencia",
    avaliar: ({ realizacaoAluguel: r }) => ({ esperado: r.recebidoCompetencia, obtido: r.recebido }),
  },
  {
    id: "serie_ponto_da_competencia",
    descricao: "série mensal: o ponto da competência exibida repete a receita do resumo",
    avaliar: (data) => {
      const ponto = data.serieMensal.find((p) => p.competencia === data.meta.competencia)
      if (!ponto) return null
      return { esperado: data.resumo.receitasEconomicas, obtido: ponto.receitaTotal }
    },
  },
  {
    id: "serie_recebido_da_competencia",
    descricao:
      "série mensal: o recebido do ponto é o da competência (sem atrasos), igual ao da realização",
    avaliar: (data) => {
      const ponto = data.serieMensal.find((p) => p.competencia === data.meta.competencia)
      if (!ponto) return null
      return { esperado: data.realizacaoAluguel.recebidoCompetencia, obtido: ponto.aluguelRecebido }
    },
  },
  {
    id: "serie_realizacao_do_ponto",
    descricao:
      "série mensal: contratado − vacância − inadimplência − descontos + ajustes = recebido, no próprio ponto",
    avaliar: (data) => {
      const ponto = data.serieMensal.find((p) => p.competencia === data.meta.competencia)
      if (!ponto) return null
      return {
        esperado: somaEstrita([
          ponto.aluguelContratado,
          ponto.vacancia === null ? null : -ponto.vacancia,
          ponto.inadimplencia === null ? null : -ponto.inadimplencia,
          ponto.descontos === null ? null : -ponto.descontos,
          ponto.outrosAjustes,
        ]),
        obtido: ponto.aluguelRecebido,
      }
    },
  },
]

export function verificarIdentidades(
  data: IndicadoresData,
  identidades: IdentidadeKpi[] = IDENTIDADES_INDICADORES,
  tolerancia = 0.01,
): DivergenciaIdentidade[] {
  return identidades.flatMap((identidade): DivergenciaIdentidade[] => {
    const avaliacao = identidade.avaliar(data)
    // Identidade não aplicável ao escopo (por exemplo, série sem ponto para a
    // competência) não é divergência: é ausência de caso a comparar.
    if (avaliacao === null) return []
    const { esperado, obtido } = avaliacao
    if (esperado === null && obtido === null) return []
    if (esperado === null || obtido === null) {
      return [
        {
          id: identidade.id,
          descricao: identidade.descricao,
          esperado,
          obtido,
          diferenca: null,
          motivo: "lado_ausente",
        },
      ]
    }
    const diferenca = arredondar(Math.abs(esperado - obtido))
    if (diferenca <= tolerancia) return []
    return [
      {
        id: identidade.id,
        descricao: identidade.descricao,
        esperado,
        obtido,
        diferenca,
        motivo: "valor_divergente",
      },
    ]
  })
}

export interface ContribuicaoResiduo {
  imovelId: string
  unidade: string
  empreendimentoNome: string
  statusOcupacao: string
  aluguelEsperado: number | null
  recebidoCompetencia: number | null
  outrosRecebimentos: number | null
  desconto: number | null
  contribuicao: number
}

// Decompõe `valoresSemClassificacao` por unidade.
//
// O campo é um resíduo por construção — o que sobra da identidade da realização
// — e por isso chega à tela como um número opaco que impede `Confirmado`
// (CA-IND06) sem dizer de onde veio. Esta função devolve as unidades que o
// formam, para que a pergunta "quais R$ 3.945,36?" tenha resposta.
//
// Deliberadamente NÃO nomeia a causa. Batizar uma contribuição de
// "intermediação" ou "proporcional" seria inventar classificação que o domínio
// ainda não modelou nos indicadores; a decisão de criar esses baldes é do
// contador, não do verificador. Aqui só se expõe a aritmética.
export function decomporResiduoRealizacao(data: IndicadoresData): ContribuicaoResiduo[] {
  const competencia = data.meta.competencia
  return data.receitasPorImovel
    .filter((linha) => linha.competencia === competencia)
    .map((linha) => {
      const esperado = linha.aluguelEsperado ?? 0
      const recebido = linha.aluguelRecebidoCompetencia ?? 0
      const desconto = linha.desconto ?? 0
      // Espelha os baldes de buildRentRealization: vaga devolve o esperado
      // inteiro à vacância; inadimplente devolve o gap à inadimplência. O que
      // sobra em cada linha é a sua parcela do resíduo.
      const vacancia = linha.statusOcupacao === "vago" ? esperado : 0
      const inadimplencia =
        linha.statusOcupacao === "inadimplente" ? Math.max(0, arredondar(esperado - recebido)) : 0
      const contribuicao = arredondar(recebido - esperado + vacancia + inadimplencia + desconto)
      return {
        imovelId: linha.imovelId,
        unidade: linha.unidade,
        empreendimentoNome: linha.empreendimentoNome,
        statusOcupacao: linha.statusOcupacao,
        aluguelEsperado: linha.aluguelEsperado,
        recebidoCompetencia: linha.aluguelRecebidoCompetencia,
        outrosRecebimentos: linha.outrosRecebimentos,
        desconto: linha.desconto,
        contribuicao,
      }
    })
    .filter((item) => Math.abs(item.contribuicao) > 0.01)
    .sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao))
}
