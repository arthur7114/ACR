import type { AcordoRescisaoRecebido } from "./prestacao-types"

// Módulo canônico de recebimentos extraordinários (CA27). Único lugar do
// sistema autorizado a resolver base comissionável, total recebido, comissão e
// repasse de acordos, rescisões, atrasos e intermediações. Consumidores
// (revisão, resumo, snapshots, indicadores, payload eGestor) recebem
// `ResolucaoFinanceira` e nunca recalculam por conta própria.

export interface EvidenciaExtracao {
  documentoId: string | null
  secao: string | null
  linhaOuTrecho: string | null
  confianca: number
}

interface BaseRecebimento {
  imovelId: string | null
  apto: string | null
  inquilino: string | null
  competenciaOrigem: string | null
  competenciaRecebimento: string | null
  // Valores autoritativos do documento — preservados, nunca recalculados.
  totalRecebidoInformado: number | null
  comissaoInformada: number | null
  repasseInformado: number | null
  evidencia: EvidenciaExtracao
}

export interface ComponentesIntermediacao {
  /** Coluna ALUGUEL do documento — valor cheio, antes do desconto. */
  aluguel: number | null
  desconto: number | null
  /**
   * Coluna ALUGUEL C/ DESCONTO. E ela, nao o aluguel cheio, que soma no TOTAL
   * impresso e sobre a qual a comissao incide.
   */
  aluguelComDesconto: number | null
  garagem: number | null
  iptu: number | null
  seguro: number | null
  /** Coluna AGUA. Mantem o nome legado por compatibilidade de dados. */
  outrosEncargos: number | null
  /** Coluna LIXO — Grand Castelao ate dez/2024. */
  lixo: number | null
  /**
   * Coluna ENCARGOS do Grand Maracanau: um balde residual impresso que soma no
   * TOTAL da linha. Nao confundir com `ComponentesRecebimento.encargos`, que e
   * derivado (tudo alem de principal e garagem); este e o valor impresso.
   */
  encargosImpressos: number | null
}

export interface ComponentesRecebimento {
  garagem: number | null
  encargos: number | null
}

export type RecebimentoExtraordinario = BaseRecebimento &
  (
    | { tipo: "intermediacao"; componentes: ComponentesIntermediacao; percentualInformado: number | null }
    | { tipo: "rescisao"; principal: number | null; ajuste: number | null; componentes: ComponentesRecebimento }
    | { tipo: "acordo" | "atraso"; principal: number | null; ajuste: number | null; componentes: ComponentesRecebimento }
    | { tipo: "outro"; valorInformado: number | null }
  )

export interface DivergenciaFinanceira {
  campo: "total_recebido" | "comissao" | "repasse"
  informado: number
  calculado: number
}

export type MotivoPendencia = "evidencia_insuficiente" | "equacao_inconsistente" | "vinculo_ausente"

export interface PendenciaRevisao {
  motivo: MotivoPendencia
  descricao: string
}

export type ResolucaoFinanceira =
  | {
      status: "resolvido"
      baseComissionavel: number | null
      totalRecebido: number
      comissao: number
      repasse: number
      percentualRealizado: number | null
      reconciliado: boolean
      divergencias: DivergenciaFinanceira[]
    }
  | { status: "pendente"; motivo: MotivoPendencia; pendencia: PendenciaRevisao }

// Confiança mínima para um item extraído produzir efeito financeiro. Abaixo
// disso o item vira pendência de revisão (CA27.2), nunca soma confirmada.
export const CONFIANCA_MINIMA_FINANCEIRA = 0.7

// Tolerância da equação recebido − comissão = repasse (CA14.2 revisado).
const TOLERANCIA_EQUACAO = 0.01

export function resolverRecebimento(item: RecebimentoExtraordinario): ResolucaoFinanceira {
  if (item.imovelId === null && item.apto === null && item.inquilino === null) {
    return pendente("vinculo_ausente", "Recebimento sem vínculo por imóvel, unidade ou inquilino.")
  }
  if (item.evidencia.confianca < CONFIANCA_MINIMA_FINANCEIRA) {
    return pendente(
      "evidencia_insuficiente",
      `Confiança ${item.evidencia.confianca.toFixed(2)} abaixo do mínimo ${CONFIANCA_MINIMA_FINANCEIRA}.`,
    )
  }

  const baseIntermediacao = resolverBase(item)
  const totalDerivado = derivarTotal(item, baseIntermediacao)
  const totalRecebido = item.totalRecebidoInformado ?? totalDerivado
  if (totalRecebido === null || totalRecebido === 0) {
    return pendente(
      "evidencia_insuficiente",
      "Recebimento sem valor monetário próprio; nada é somado até revisão.",
    )
  }

  const comissao = resolverComissao(item, totalRecebido, baseIntermediacao)
  const repasse = item.repasseInformado ?? roundMoney(totalRecebido - comissao)
  // Na intermediacao a comissao incide sobre os componentes comissionaveis
  // (aluguel + garagem). Em acordo/rescisao/atraso quem incide e a taxa de
  // administracao, aplicada sobre o TOTAL pago pelo inquilino (mesma regra da
  // comissao administrativa das linhas regulares). Usar a base menor inflava o
  // percentual exibido — queixa da cliente confirmada nos documentos de julho.
  const baseComissionavel =
    item.tipo === "intermediacao" ? baseIntermediacao : roundMoney(totalRecebido)

  const divergencias = validarEquacao(totalRecebido, comissao, repasse)
  if (divergencias.length > 0) {
    const [d] = divergencias
    return pendente(
      "equacao_inconsistente",
      `Equação recebido − comissão = repasse não fecha: informado ${d.informado.toFixed(2)}, calculado ${d.calculado.toFixed(2)}.`,
    )
  }

  return {
    status: "resolvido",
    baseComissionavel,
    totalRecebido: roundMoney(totalRecebido),
    comissao: roundMoney(comissao),
    repasse: roundMoney(repasse),
    percentualRealizado: resolverPercentual(item, baseComissionavel, comissao),
    reconciliado: true,
    divergencias: [],
  }
}

// Consumidores de análises persistidas (agregação, snapshots) declaram tipos
// estruturais mais estreitos que o schema; o adaptador aceita qualquer
// subconjunto e coage ausência para null/zero — nada escapa dos guards.
export type RecebimentoLegado = { tipo: AcordoRescisaoRecebido["tipo"] } & {
  [K in keyof Omit<AcordoRescisaoRecebido, "tipo">]?: AcordoRescisaoRecebido[K] | null
}

// Agua do acordo/rescisao como o documento a imprime. O campo estruturado tem
// precedencia; na falta dele, o valor marcado na observacao ("AGUA: R$ 74,70").
//
// Ate 2026-09-17 o schema enviado ao modelo nao tinha `agua` nos itens da
// secao de acordos/rescisoes, embora o prompt pedisse o campo: o modelo so
// podia registrar o valor no texto da observacao, e a Revisao exibia "-" na
// coluna AGUA (GM II ago/2026: apto 7, R$ 74,70, e os tres intermediados com
// R$ 67,70). Os fechamentos ja persistidos continuam nesse formato — por isso a
// leitura da observacao fica como fallback permanente, nao como migracao.
export function aguaDeclarada(item: Pick<RecebimentoLegado, "agua" | "observacao">): number | null {
  if (typeof item.agua === "number") return item.agua
  return parseTaggedMoney(item.observacao ?? "", "agua")
}

// Soma de componentes opcionais: null so quando NENHUM foi informado, para nao
// transformar ausencia em zero.
function somarInformados(...valores: Array<number | null | undefined>): number | null {
  const informados = valores.filter((valor): valor is number => typeof valor === "number")
  if (informados.length === 0) return null
  return roundMoney(informados.reduce((total, valor) => total + valor, 0))
}

export function normalizarItemLegado(item: RecebimentoLegado): RecebimentoExtraordinario {
  const valorLegado = item.valor ?? 0
  const base: BaseRecebimento = {
    imovelId: null,
    apto: item.apto ?? null,
    inquilino: item.inquilino ?? null,
    competenciaOrigem: item.competencia_original ?? null,
    competenciaRecebimento: item.competencia_recebimento ?? null,
    totalRecebidoInformado: item.total_recebido ?? null,
    comissaoInformada: item.comissao ?? null,
    repasseInformado: item.repasse ?? null,
    evidencia: {
      documentoId: null,
      secao: null,
      linhaOuTrecho: item.observacao ?? null,
      confianca: item.confianca ?? 0,
    },
  }

  if (item.tipo === "intermediacao") {
    // Fallback legado (absorvido de lib/intermediacao.ts): análises antigas
    // traziam total/IPTU/repasse apenas no texto da observação. Campos
    // estruturados sempre têm precedência.
    const observacao = item.observacao ?? ""
    const aluguelBruto = item.aluguel ?? (valorLegado !== 0 ? valorLegado : null)
    return {
      ...base,
      tipo: "intermediacao",
      totalRecebidoInformado: base.totalRecebidoInformado ?? parseTaggedMoney(observacao, "total"),
      repasseInformado: base.repasseInformado ?? parseTaggedMoney(observacao, "repasse"),
      componentes: {
        aluguel: aluguelBruto,
        desconto: item.desconto ?? null,
        // Precedencia: coluna impressa > aluguel menos desconto > aluguel cheio.
        // Nunca zero: sem aluguel nenhum a base fica desconhecida, e o item vai
        // para pendencia em vez de produzir comissao sobre base inventada.
        aluguelComDesconto:
          item.aluguel_com_desconto
          ?? (aluguelBruto !== null && typeof item.desconto === "number"
            ? roundMoney(aluguelBruto - item.desconto)
            : aluguelBruto),
        garagem: item.garagem ?? null,
        iptu: item.iptu ?? parseTaggedMoney(observacao, "iptu"),
        seguro: item.seguro_incendio ?? null,
        outrosEncargos: aguaDeclarada(item),
        lixo: item.lixo ?? null,
        encargosImpressos: item.encargos ?? null,
      },
      percentualInformado: item.percentual ?? null,
    }
  }
  if (item.tipo === "outro") {
    return { ...base, tipo: "outro", valorInformado: valorLegado !== 0 ? valorLegado : null }
  }
  return {
    ...base,
    tipo: item.tipo,
    principal: valorLegado !== 0 ? valorLegado : null,
    ajuste: item.ajuste ?? null,
    // Encargos = tudo que o TOTAL impresso soma alem de principal e garagem:
    // IPTU, agua e seguro. Antes so o IPTU entrava, e um atraso sem
    // total_recebido derivava um total menor que o do documento (GM II
    // ago/2026, apto 7: 790,33 + 27,58 + 74,70 + 1,57 = 894,18).
    componentes: {
      garagem: item.garagem ?? null,
      encargos: somarInformados(
        item.iptu,
        aguaDeclarada(item),
        item.seguro_incendio,
        item.lixo,
        item.encargos,
      ),
    },
  }
}

export function resolverRecebimentoLegado(item: RecebimentoLegado): ResolucaoFinanceira {
  return resolverRecebimento(normalizarItemLegado(item))
}

export type FinanceiroResolvido = Extract<ResolucaoFinanceira, { status: "resolvido" }>

export interface RecebimentoResolvido<T extends RecebimentoLegado> {
  item: T
  financeiro: FinanceiroResolvido
}

// Resolve uma lista legada e devolve só os itens elegíveis, cada um pareado
// com sua resolução. Itens pendentes ficam de fora de qualquer soma (CA27.2).
export function resolverRecebimentosLegados<T extends RecebimentoLegado>(
  itens: T[],
): Array<RecebimentoResolvido<T>> {
  const resolvidos: Array<RecebimentoResolvido<T>> = []
  for (const item of itens) {
    const resolucao = resolverRecebimentoLegado(item)
    if (resolucao.status === "resolvido") resolvidos.push({ item, financeiro: resolucao })
  }
  return resolvidos
}

// ---------------------------------------------------------------------------
// Colunas do documento de repasse.
//
// A cliente pediu (set/2026) que a tabela de intermediacao replique as colunas
// do documento de repasse da imobiliaria, como as tabelas de receitas e de
// acordos ja fazem. O documento imprime, por linha: ALUGUEL, GARAGEM, AGUA,
// IPTU, SEGURO INCENDIO, TOTAL, COMISSAO, REPASSE.
//
// Base comissionavel e encargos NAO sao colunas do documento — sao derivacoes
// nossas. Por isso saem da tabela e vao para a tooltip do rodape.

export interface ComponentesLinhaIntermediacao {
  aluguel: number | null
  desconto: number | null
  aluguelComDesconto: number | null
  garagem: number | null
  agua: number | null
  iptu: number | null
  seguro: number | null
  lixo: number | null
  encargos: number | null
  /**
   * Parte do total recebido que nenhuma coluna explica. Acontece quando a agua
   * nao veio estruturada nem com o rotulo "AGUA: R$ ..." na observacao: as
   * colunas somam menos que o total impresso (Grand Castelao I ago/2026, apto
   * 3: 690 + 4,59 = 694,59 contra um total de 742,19).
   *
   * Nao vira coluna, porque o documento nao tem uma — vira aviso no rodape. Uma
   * tabela que nao fecha em silencio e pior que uma sobra declarada.
   */
  naoDetalhado: number
}

export function componentesLinhaIntermediacao(
  item: RecebimentoLegado,
  totalRecebido: number,
): ComponentesLinhaIntermediacao {
  const normalizado = normalizarItemLegado(item)
  if (normalizado.tipo !== "intermediacao") {
    return {
      aluguel: null,
      desconto: null,
      aluguelComDesconto: null,
      garagem: null,
      agua: null,
      iptu: null,
      seguro: null,
      lixo: null,
      encargos: null,
      naoDetalhado: 0,
    }
  }
  // `outrosEncargos` e a agua — `normalizarItemLegado` ja aplica o fallback de
  // leitura da observacao. Aqui so se renomeia para o nome da coluna impressa.
  const {
    aluguel,
    desconto,
    aluguelComDesconto,
    garagem,
    iptu,
    seguro,
    outrosEncargos,
    lixo,
    encargosImpressos,
  } = normalizado.componentes
  // Quem soma no total e o aluguel COM desconto, nao o cheio.
  const conhecidos =
    (aluguelComDesconto ?? 0)
    + (garagem ?? 0)
    + (iptu ?? 0)
    + (seguro ?? 0)
    + (outrosEncargos ?? 0)
    + (lixo ?? 0)
    + (encargosImpressos ?? 0)
  return {
    aluguel,
    desconto,
    aluguelComDesconto,
    garagem,
    agua: outrosEncargos,
    iptu,
    seguro,
    lixo,
    encargos: encargosImpressos,
    naoDetalhado: roundMoney(totalRecebido - conhecidos),
  }
}

// Soma de uma coluna: `null` so quando NENHUMA linha informou o componente.
// Uma linha sem agua nao pode zerar a coluna de agua das outras.
function somarColuna(valores: Array<number | null>): number | null {
  const informados = valores.filter((valor): valor is number => valor !== null)
  if (informados.length === 0) return null
  return roundMoney(informados.reduce((total, valor) => total + valor, 0))
}

export interface TotaisRecebimentos {
  /** Linhas com efeito financeiro — as unicas somadas. */
  linhas: number
  /** Linhas pendentes, fora de toda soma (CA27.2). O rodape declara quantas. */
  pendentes: number
  /** Linhas resolvidas cuja base comissionavel o documento nao permite apurar. */
  basesDesconhecidas: number
  baseComissionavel: number | null
  /** Resto do total sobre a base, linha a linha: IPTU, agua, seguro e afins. */
  encargos: number | null
  totalRecebido: number
  comissao: number
  repasse: number
  /** Comissao sobre base. `null` quando alguma linha nao tem base. */
  percentual: number | null
  /** Soma de cada coluna do documento, para o rodape da tabela. */
  componentes: ComponentesLinhaIntermediacao
}

/**
 * Totais de uma lista de recebimentos, para o rodape da tabela.
 *
 * Soma UMA vez, do mesmo lugar em que a linha foi resolvida — a tela nunca
 * recalcula por fora (CA27). Tres regras que o rodape tem de respeitar:
 *
 * 1. Pendente nao soma. Mas sumir com ela em silencio seria pior que nao ter
 *    rodape: `pendentes` existe para o rodape dizer quantas ignorou.
 * 2. Base desconhecida nao vira zero. A celula mostra "-", e uma base menor que
 *    a real inflaria o percentual — o mesmo erro que o efetivo de administracao
 *    tinha nos indicadores.
 * 3. Percentual so existe quando TODA linha tem base. Com uma base faltando, a
 *    comissao soma N linhas e a base soma N-1: a divisao mente para cima.
 */
export function totalizarRecebimentos(itens: RecebimentoLegado[]): TotaisRecebimentos {
  const resolvidos = resolverRecebimentosLegados(itens)
  const bases = resolvidos.map(({ financeiro }) => financeiro.baseComissionavel)
  const conhecidas = bases.filter((base): base is number => base !== null)
  const soma = (pick: (financeiro: FinanceiroResolvido) => number) =>
    roundMoney(resolvidos.reduce((total, { financeiro }) => total + pick(financeiro), 0))

  const baseComissionavel = conhecidas.length === 0 ? null : roundMoney(conhecidas.reduce((a, b) => a + b, 0))
  const totalRecebido = soma((financeiro) => financeiro.totalRecebido)
  const comissao = soma((financeiro) => financeiro.comissao)
  // Encargos so das linhas com base: sem base nao ha de que subtrair o total.
  const encargos =
    conhecidas.length === 0
      ? null
      : roundMoney(
          resolvidos
            .filter(({ financeiro }) => financeiro.baseComissionavel !== null)
            .reduce(
              (total, { financeiro }) => total + financeiro.totalRecebido - (financeiro.baseComissionavel as number),
              0,
            ),
        )
  const todasComBase = conhecidas.length === resolvidos.length && resolvidos.length > 0

  const porLinha = resolvidos.map(({ item, financeiro }) =>
    componentesLinhaIntermediacao(item, financeiro.totalRecebido),
  )

  return {
    componentes: {
      aluguel: somarColuna(porLinha.map((c) => c.aluguel)),
      desconto: somarColuna(porLinha.map((c) => c.desconto)),
      aluguelComDesconto: somarColuna(porLinha.map((c) => c.aluguelComDesconto)),
      garagem: somarColuna(porLinha.map((c) => c.garagem)),
      agua: somarColuna(porLinha.map((c) => c.agua)),
      iptu: somarColuna(porLinha.map((c) => c.iptu)),
      seguro: somarColuna(porLinha.map((c) => c.seguro)),
      lixo: somarColuna(porLinha.map((c) => c.lixo)),
      encargos: somarColuna(porLinha.map((c) => c.encargos)),
      naoDetalhado: roundMoney(porLinha.reduce((total, c) => total + c.naoDetalhado, 0)),
    },
    linhas: resolvidos.length,
    pendentes: itens.length - resolvidos.length,
    basesDesconhecidas: bases.length - conhecidas.length,
    baseComissionavel,
    encargos,
    totalRecebido,
    comissao,
    repasse: soma((financeiro) => financeiro.repasse),
    percentual:
      todasComBase && baseComissionavel !== null && baseComissionavel > 0
        ? Math.round((comissao / baseComissionavel) * 10_000) / 100
        : null,
  }
}

function resolverBase(item: RecebimentoExtraordinario): number | null {
  if (item.tipo !== "intermediacao") return null
  // Aluguel COM desconto: e o que o documento soma no TOTAL. Usar o cheio
  // inflaria a base e, com ela, a comissao derivada e o percentual exibido.
  const { aluguelComDesconto, garagem } = item.componentes
  if (aluguelComDesconto === null && garagem === null) return null
  return roundMoney((aluguelComDesconto ?? 0) + (garagem ?? 0))
}

function derivarTotal(item: RecebimentoExtraordinario, baseComissionavel: number | null): number | null {
  if (item.tipo === "intermediacao") {
    if (baseComissionavel === null) return null
    const { iptu, seguro, outrosEncargos, lixo, encargosImpressos } = item.componentes
    return roundMoney(
      baseComissionavel
        + (iptu ?? 0)
        + (seguro ?? 0)
        + (outrosEncargos ?? 0)
        + (lixo ?? 0)
        + (encargosImpressos ?? 0),
    )
  }
  if (item.tipo === "outro") return item.valorInformado
  if (item.principal === null) return null
  return roundMoney(item.principal + (item.ajuste ?? 0) + (item.componentes.garagem ?? 0) + (item.componentes.encargos ?? 0))
}

function resolverComissao(
  item: RecebimentoExtraordinario,
  totalRecebido: number,
  baseComissionavel: number | null,
): number {
  if (item.comissaoInformada !== null) return item.comissaoInformada
  if (item.repasseInformado !== null) return roundMoney(totalRecebido - item.repasseInformado)
  if (item.tipo === "intermediacao" && item.percentualInformado !== null && baseComissionavel !== null) {
    return roundMoney((baseComissionavel * item.percentualInformado) / 100)
  }
  // Linha documentada sem coluna de comissão preenchida: zero documental.
  return 0
}

function resolverPercentual(
  item: RecebimentoExtraordinario,
  baseComissionavel: number | null,
  comissao: number,
): number | null {
  if (item.tipo === "intermediacao" && item.percentualInformado !== null) return item.percentualInformado
  if (baseComissionavel === null || baseComissionavel <= 0) return null
  return Math.round((comissao / baseComissionavel) * 10_000) / 100
}

function validarEquacao(totalRecebido: number, comissao: number, repasse: number): DivergenciaFinanceira[] {
  const repasseCalculado = roundMoney(totalRecebido - comissao)
  if (Math.abs(repasseCalculado - repasse) <= TOLERANCIA_EQUACAO) return []
  return [{ campo: "repasse", informado: repasse, calculado: repasseCalculado }]
}

function parseTaggedMoney(text: string, label: string): number | null {
  // Sem acentos dos dois lados: o documento escreve "ÁGUA: R$ 74,70" e o
  // rotulo procurado e "agua".
  const semAcentos = text.normalize("NFD").replace(/[̀-ͯ]/g, "")
  const match = new RegExp(`${label}[^.;]{0,40}?R\\$\\s*([\\d.]+(?:,\\d{1,2})?)`, "i").exec(semAcentos)
  if (!match) return null
  const value = Number(match[1].replace(/\./g, "").replace(",", "."))
  return Number.isFinite(value) ? value : null
}

function pendente(motivo: MotivoPendencia, descricao: string): ResolucaoFinanceira {
  return { status: "pendente", motivo, pendencia: { motivo, descricao } }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
