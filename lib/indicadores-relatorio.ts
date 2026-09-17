// Modelo do relatorio em PDF dos Indicadores (Anexo I do contrato, item 5b:
// "possibilidade de exportacao de relatorio em PDF").
//
// Este modulo e PURO: transforma `IndicadoresData` — o mesmo objeto que a tela
// recebe de `/api/indicadores` — em secoes, linhas e textos ja formatados. O
// componente react-pdf so desenha. Assim o relatorio mostra exatamente o que a
// tela mostra, com os mesmos rotulos e as mesmas regras de ausencia ("—" para
// desconhecido, nunca zero), e o conteudo e testavel sem renderizar PDF.
import {
  describeConference,
  formatCurrency,
  formatDateTime,
  formatPercent,
  getConfidenceStatus,
  occupancyLabel,
  resolveMetricValue,
  sumKnownValues,
} from "@/components/acr/indicadores/lib/presentation"
import type { IndicadoresData } from "./indicadores-types"

export type TomRelatorio = "neutro" | "positivo" | "alerta" | "perigo"

export interface KpiRelatorio {
  rotulo: string
  valor: string
  nota?: string | null
  tom?: TomRelatorio
}

export interface LinhaTabelaRelatorio {
  celulas: string[]
  destaque?: boolean
  tom?: TomRelatorio
}

export interface TabelaRelatorio {
  titulo: string
  subtitulo?: string | null
  cabecalho: string[]
  // Indices das colunas alinhadas a direita (valores).
  colunasNumericas: number[]
  linhas: LinhaTabelaRelatorio[]
  // Largura relativa de cada coluna; soma livre.
  larguras?: number[]
}

export interface RelatorioIndicadores {
  titulo: string
  competenciaLabel: string
  escopo: string[]
  geradoEm: string
  atualizadoEm: string
  confianca: { rotulo: string; tom: TomRelatorio }
  kpis: KpiRelatorio[]
  ocupacao: { rotulo: string; quantidade: number }[]
  receitasAoRepasse: TabelaRelatorio
  contratoAoRecebido: TabelaRelatorio
  acordosRescisoes: TabelaRelatorio | null
  despesaDetalhada: TabelaRelatorio
  evolucaoMensal: TabelaRelatorio
  atencao: TabelaRelatorio | null
  detalhamento: TabelaRelatorio
  nomeArquivo: string
}

const TOM_POR_VEREDITO: Record<"positive" | "warning" | "danger" | "neutral", TomRelatorio> = {
  positive: "positivo",
  warning: "alerta",
  danger: "perigo",
  neutral: "neutro",
}

function contagem(valor: number) {
  return valor.toLocaleString("pt-BR")
}

function percentualDe(parte: number | null, total: number | null): string | null {
  if (parte === null || total === null || total === 0) return null
  return formatPercent((parte / total) * 100)
}

function rotuloSelecionado(
  opcoes: Array<{ value: string; label: string }>,
  selecionado: string | null,
  todos: string,
) {
  if (!selecionado) return todos
  return opcoes.find((opcao) => opcao.value === selecionado)?.label ?? selecionado
}

function slug(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function montarRelatorioIndicadores(data: IndicadoresData, agora: Date = new Date()): RelatorioIndicadores {
  const { resumo, ponteFinanceira: ponte, realizacaoAluguel: realizacao, filtros } = data
  const sel = filtros.selecionados

  const escopo = [
    rotuloSelecionado(filtros.empresas, sel.empresaId, "Todas as empresas"),
    rotuloSelecionado(filtros.empreendimentos, sel.empreendimentoId, "Todos os empreendimentos"),
    ...(sel.imovelId ? [rotuloSelecionado(filtros.imoveis, sel.imovelId, sel.imovelId)] : []),
  ]

  const veredito = describeConference({
    comprovado: resumo.repasseCalculadoComprovado,
    banco: resumo.repasseConfirmadoBanco,
    comprovantes: data.cobertura.comprovantes,
    status: getConfidenceStatus(data),
  })

  const resultado = resolveMetricValue(resumo.repasseCalculado, resumo.repasseApurado)
  const comissoes = resolveMetricValue(
    ponte.comissoes,
    sumKnownValues([resumo.comissaoAdministracao, resumo.comissaoIntermediacao]),
  )
  const despesas = resolveMetricValue(ponte.despesas, resumo.despesasRetidas)
  const tarifas = resolveMetricValue(ponte.tarifas, resumo.tarifas)
  const ocupacao = resumo.ocupacaoCompetencia
  const vagasParciais = resumo.receitaLocacao.vagasCobertura.conhecidas < resumo.receitaLocacao.vagasCobertura.total

  const kpis: KpiRelatorio[] = [
    { rotulo: "Resultado do mês", valor: formatCurrency(resultado), nota: veredito.label, tom: TOM_POR_VEREDITO[veredito.tone] },
    {
      rotulo: "Inadimplência do mês",
      valor: formatCurrency(realizacao.inadimplenciaMes),
      nota: `${contagem(ocupacao.inadimplentes)} de ${contagem(ocupacao.denominador)} imóveis`,
      tom: "perigo",
    },
    { rotulo: "Inadimplência acumulada", valor: formatCurrency(resumo.inadimplenciaAcumulada), nota: "dívida de meses anteriores", tom: "perigo" },
    {
      rotulo: "Vacância",
      valor: formatCurrency(realizacao.vacancia),
      nota: percentualDe(realizacao.vacancia, realizacao.contratado) ? `${percentualDe(realizacao.vacancia, realizacao.contratado)} do contratado` : null,
      tom: "alerta",
    },
    {
      rotulo: "Ocupação",
      valor: formatPercent(ocupacao.percentual),
      nota: [
        `${contagem(ocupacao.numerador)} de ${contagem(ocupacao.denominador)} imóveis`,
        resumo.ocupacaoAcumulada && resumo.ocupacaoAcumulada.janela.meses > 1
          ? `acumulado: ${formatPercent(resumo.ocupacaoAcumulada.percentual)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      tom: ocupacao.desconhecidos > 0 ? "alerta" : "neutro",
    },
    {
      rotulo: "Aluguel contratado",
      valor: formatCurrency(resumo.aluguelContratado),
      nota:
        data.cobertura.contratos.ausentes > 0
          ? `${contagem(data.cobertura.contratos.ausentes)} imóvel(is) sem aluguel contratado`
          : null,
      tom: data.cobertura.contratos.ausentes > 0 ? "alerta" : "neutro",
    },
    { rotulo: "Aluguel recebido", valor: formatCurrency(resumo.aluguelRecebidoCompetencia), nota: "da competência" },
    {
      rotulo: "Receita de locação",
      valor: formatCurrency(sumKnownValues([resumo.receitaLocacao.aluguel, resumo.receitaLocacao.vagas])),
      nota: `aluguel ${formatCurrency(resumo.receitaLocacao.aluguel)} · vagas ${formatCurrency(resumo.receitaLocacao.vagas)}${
        vagasParciais
          ? ` (${contagem(resumo.receitaLocacao.vagasCobertura.conhecidas)} de ${contagem(resumo.receitaLocacao.vagasCobertura.total)} observadas)`
          : ""
      }`,
      tom: vagasParciais ? "alerta" : "neutro",
    },
    {
      rotulo: "Comissões",
      valor: formatCurrency(comissoes),
      nota: [
        `adm. ${formatCurrency(resumo.comissaoAdministracao)}${resumo.taxas.administracao.efetivo !== null ? ` (${formatPercent(resumo.taxas.administracao.efetivo)})` : ""}`,
        `interm. ${formatCurrency(resumo.comissaoIntermediacao)}${resumo.taxas.intermediacao.efetivo !== null ? ` (${formatPercent(resumo.taxas.intermediacao.efetivo)})` : ""}`,
      ].join(" · "),
    },
    { rotulo: "Despesas", valor: formatCurrency(despesas), nota: "descontadas do repasse" },
    { rotulo: "Tarifas", valor: formatCurrency(tarifas), nota: "bancárias e de cobrança" },
    { rotulo: "Rentabilidade", valor: "—", nota: "sem valor do imóvel cadastrado", tom: "alerta" },
  ]

  const distribuicao = [
    { rotulo: "Ocupado", quantidade: ocupacao.ocupados },
    { rotulo: "Alugado por app", quantidade: ocupacao.alugadosApp },
    { rotulo: "Inadimplente", quantidade: ocupacao.inadimplentes },
    { rotulo: "Em rescisão", quantidade: ocupacao.emRescisao },
    { rotulo: "Vago", quantidade: ocupacao.vagos },
    { rotulo: "Desconhecido", quantidade: ocupacao.desconhecidos },
  ].filter((item) => item.quantidade > 0)

  const receitasAoRepasse: TabelaRelatorio = {
    titulo: "Das receitas ao repasse",
    subtitulo: ponte.reconciliada === true ? "Fecha" : ponte.reconciliada === false ? "Não fecha" : null,
    cabecalho: ["", "Linha", "Valor"],
    colunasNumericas: [2],
    larguras: [0.4, 5, 2],
    linhas: [
      { celulas: ["=", "Receitas do fechamento", formatCurrency(ponte.receitasEconomicas)], destaque: true },
      { celulas: ["+", "IPTU recebido", formatCurrency(ponte.entradasPassagem)] },
      { celulas: ["−", "Comissões", formatCurrency(ponte.comissoes)] },
      { celulas: ["−", "Despesas", formatCurrency(ponte.despesas)] },
      { celulas: ["−", "Tarifas", formatCurrency(ponte.tarifas)] },
      { celulas: ["−", "IPTU pago", formatCurrency(ponte.saidasPassagem)] },
      { celulas: ["=", "Repasse calculado", formatCurrency(ponte.repasseCalculado)], destaque: true },
      { celulas: ["", "Declarado pela imobiliária", formatCurrency(ponte.repasseDeclarado)] },
      {
        celulas: ["Δ", "Diferença", formatCurrency(ponte.diferencaNaoExplicada)],
        tom: ponte.alerta ? "perigo" : "positivo",
      },
    ],
  }

  const foraDoPrevisto = sumKnownValues([
    realizacao.vacancia,
    realizacao.inadimplenciaMes,
    realizacao.ocupadoSemRecebimento,
    realizacao.ocupadoRecebimentoParcial,
  ])

  const contratoAoRecebido: TabelaRelatorio = {
    titulo: "Do contrato ao recebido",
    subtitulo: foraDoPrevisto !== null ? `${formatCurrency(foraDoPrevisto)} fora do previsto` : null,
    cabecalho: ["", "Linha", "Valor"],
    colunasNumericas: [2],
    larguras: [0.4, 5, 2],
    linhas: [
      { celulas: ["=", "Aluguel contratado", formatCurrency(realizacao.contratado)], destaque: true },
      { celulas: ["−", "Vacância", formatCurrency(realizacao.vacancia)] },
      { celulas: ["−", "Inadimplência do mês", formatCurrency(realizacao.inadimplenciaMes)] },
      { celulas: ["−", "Descontos documentados", formatCurrency(realizacao.descontos)] },
      { celulas: ["±", "Ajustes documentados", formatCurrency(realizacao.ajustesClassificados)] },
      { celulas: ["−", "Cobrado como intermediação", formatCurrency(realizacao.cobradoComoIntermediacao)] },
      { celulas: ["−", "Contrato novo · mês proporcional", formatCurrency(realizacao.mesProporcionalContratoNovo)] },
      { celulas: ["−", "Ocupado sem recebimento", formatCurrency(realizacao.ocupadoSemRecebimento)] },
      { celulas: ["−", "Ocupado com recebimento parcial", formatCurrency(realizacao.ocupadoRecebimentoParcial)] },
      { celulas: ["+", "Recebido em imóvel vago", formatCurrency(realizacao.recebidoEmVago)] },
      { celulas: ["=", "Recebido da competência", formatCurrency(realizacao.recebidoCompetencia)], destaque: true },
      { celulas: ["+", "Atrasos recuperados", formatCurrency(realizacao.atrasosRecuperados)] },
      { celulas: ["=", "Recebido no mês", formatCurrency(realizacao.alugueisRecebidosMes)], destaque: true },
      {
        celulas: ["Δ", "Sem explicação", formatCurrency(realizacao.restoNaoExplicado)],
        tom: (realizacao.restoNaoExplicado ?? 0) > 0.01 ? "perigo" : "positivo",
      },
    ],
  }

  const ar = resumo.acordosRescisoes
  const acordosRescisoes: TabelaRelatorio | null = ar
    ? {
        titulo: "Acordos e rescisões",
        cabecalho: ["Tipo", "Quantidade", "Valor recebido"],
        colunasNumericas: [1, 2],
        larguras: [4, 2, 2.5],
        linhas: [
          { celulas: ["Acordos recebidos", contagem(ar.acordos.quantidade), formatCurrency(ar.acordos.valor)] },
          { celulas: ["Rescisões", contagem(ar.rescisoes.quantidade), formatCurrency(ar.rescisoes.valor)] },
          {
            celulas: [
              `Intermediações (comissão ${formatCurrency(ar.intermediacoes.comissao)})`,
              contagem(ar.intermediacoes.quantidade),
              formatCurrency(ar.intermediacoes.valor),
            ],
          },
          { celulas: ["Atrasos pagos", contagem(ar.atrasos.quantidade), formatCurrency(ar.atrasos.valor)] },
          ...(ar.semOrigem.quantidade > 0
            ? [{ celulas: ["Sem competência de origem", contagem(ar.semOrigem.quantidade), formatCurrency(ar.semOrigem.valor)], tom: "alerta" as TomRelatorio }]
            : []),
        ],
      }
    : null

  const dd = resumo.despesaOperacionalDetalhada
  const despesaDetalhada: TabelaRelatorio = {
    titulo: "Despesa detalhada",
    subtitulo: "o que foi pago, pelo documento de despesas",
    cabecalho: ["Categoria", "Pago", "Reembolsado pelos inquilinos"],
    colunasNumericas: [1, 2],
    larguras: [3, 2, 3],
    linhas: [
      { celulas: ["Água", formatCurrency(dd.agua), formatCurrency(dd.reembolsado.agua)] },
      { celulas: ["IPTU", formatCurrency(dd.iptu), formatCurrency(dd.reembolsado.iptu)] },
      { celulas: ["Seguro", formatCurrency(dd.seguro), formatCurrency(dd.reembolsado.seguro)] },
      { celulas: ["Total do recorte", formatCurrency(dd.total), ""], destaque: true },
    ],
  }

  const evolucaoMensal: TabelaRelatorio = {
    titulo: "Evolução mensal",
    subtitulo: `${data.serieMensal.length} competência(s) processadas`,
    cabecalho: ["Competência", "Contratado", "Recebido", "Receitas", "Repasse", "Ocupação", "Inadimplência"],
    colunasNumericas: [1, 2, 3, 4, 5, 6],
    larguras: [2.2, 2, 2, 2, 2, 1.5, 1.8],
    linhas: data.serieMensal.map((ponto) => ({
      celulas: [
        ponto.label,
        formatCurrency(ponto.aluguelContratado),
        formatCurrency(ponto.aluguelRecebido),
        formatCurrency(ponto.receitaTotal),
        formatCurrency(ponto.repasseApurado),
        formatPercent(ponto.ocupacaoPercentual),
        formatPercent(ponto.inadimplenciaPercentual),
      ],
      destaque: ponto.competencia === data.meta.competencia,
    })),
  }

  const atencao: TabelaRelatorio | null =
    data.rankingAtencao.length > 0
      ? {
          titulo: "Imóveis que pedem atenção",
          subtitulo: `${data.rankingAtencao.length} imóvel(is) com diferença entre esperado e recebido`,
          cabecalho: ["Imóvel", "Inquilino", "Situação", "Esperado", "Recebido", "Não recebido"],
          colunasNumericas: [3, 4, 5],
          larguras: [3, 4, 2, 2, 2, 2],
          linhas: data.rankingAtencao.map((item) => ({
            celulas: [
              `${item.empreendimentoNome} · ${item.unidade}`,
              item.inquilinoNome ?? "—",
              occupancyLabel(item.statusOcupacao),
              formatCurrency(item.esperado),
              formatCurrency(item.recebido),
              formatCurrency(item.gapValor),
            ],
            tom: item.statusOcupacao === "inadimplente" ? "perigo" : "neutro",
          })),
        }
      : null

  const detalhamento: TabelaRelatorio = {
    titulo: "Detalhamento por imóvel",
    subtitulo: `${data.receitasPorImovel.length} imóvel(is) na competência ${data.meta.competenciaLabel}`,
    cabecalho: [
      "Imóvel",
      "Inquilino",
      "Situação",
      "Contratado",
      "Reajuste",
      "Recebido",
      "Atrasos",
      "Outros",
      "Receitas",
      "Desconto",
      "Comissão",
      "Repasse",
    ],
    colunasNumericas: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    larguras: [2.6, 3.4, 1.8, 1.7, 1.3, 1.7, 1.5, 1.5, 1.7, 1.4, 1.5, 1.7],
    linhas: data.receitasPorImovel.map((row) => ({
      celulas: [
        `${row.empreendimentoNome} · ${row.unidade}`,
        row.inquilinoNome ?? "—",
        occupancyLabel(row.statusOcupacao),
        row.modeloReceita === "variavel" ? "variável" : formatCurrency(row.aluguelEsperado),
        row.reajuste
          ? row.reajuste.inquilinoMudou
            ? "novo contrato"
            : `${row.reajuste.percentual >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(row.reajuste.percentual))}`
          : "—",
        formatCurrency(row.aluguelRecebidoCompetencia),
        formatCurrency(row.atrasosRecuperados),
        formatCurrency(row.outrosRecebimentos),
        formatCurrency(row.receitaTotal),
        formatCurrency(row.desconto),
        formatCurrency(row.comissaoAdministracao),
        formatCurrency(row.repasseApurado),
      ],
      tom: row.statusOcupacao === "inadimplente" ? "perigo" : row.statusOcupacao === "vago" ? "alerta" : "neutro",
    })),
  }

  const escopoArquivo = sel.imovelId
    ? escopo[2]
    : sel.empreendimentoId
      ? escopo[1]
      : sel.empresaId
        ? escopo[0]
        : "carteira"

  return {
    titulo: "Indicadores da carteira",
    competenciaLabel: data.meta.competenciaLabel,
    escopo,
    geradoEm: formatDateTime(agora.toISOString()),
    atualizadoEm: formatDateTime(data.meta.atualizadoEm),
    confianca: { rotulo: veredito.label, tom: TOM_POR_VEREDITO[veredito.tone] },
    kpis,
    ocupacao: distribuicao,
    receitasAoRepasse,
    contratoAoRecebido,
    acordosRescisoes,
    despesaDetalhada,
    evolucaoMensal,
    atencao,
    detalhamento,
    nomeArquivo: `indicadores-${data.meta.competencia.slice(0, 7)}-${slug(escopoArquivo)}.pdf`,
  }
}
