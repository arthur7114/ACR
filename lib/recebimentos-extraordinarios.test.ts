import assert from "node:assert/strict"
import test from "node:test"

import {
  aguaDeclarada,
  normalizarItemLegado,
  resolverRecebimento,
  resolverRecebimentoLegado,
  resolverRecebimentosLegados,
  totalizarRecebimentos,
  componentesLinhaIntermediacao,
  type RecebimentoExtraordinario,
} from "./recebimentos-extraordinarios"

const evidenciaOk = { documentoId: null, secao: "ACORDOS", linhaOuTrecho: "linha 3", confianca: 0.95 }

function intermediacao(overrides: Partial<Extract<RecebimentoExtraordinario, { tipo: "intermediacao" }>> = {}) {
  return {
    tipo: "intermediacao" as const,
    imovelId: null,
    apto: "204",
    inquilino: "LOCATÁRIO",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    componentes: { aluguel: 650, garagem: 25, iptu: 51.44, seguro: null, outrosEncargos: null },
    percentualInformado: null,
    totalRecebidoInformado: null,
    comissaoInformada: null,
    repasseInformado: null,
    evidencia: evidenciaOk,
    ...overrides,
  }
}

function rescisao(overrides: Partial<Extract<RecebimentoExtraordinario, { tipo: "rescisao" }>> = {}) {
  return {
    tipo: "rescisao" as const,
    imovelId: null,
    apto: "12",
    inquilino: "EX-LOCATÁRIO",
    competenciaOrigem: null,
    competenciaRecebimento: "2026-07",
    principal: 1890,
    ajuste: -226.44,
    componentes: { garagem: null, encargos: null },
    totalRecebidoInformado: 1663.56,
    comissaoInformada: 116.45,
    repasseInformado: 1547.11,
    evidencia: evidenciaOk,
    ...overrides,
  }
}

test("intermediação: base comissionável soma aluguel e garagem, encargos ficam fora", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.baseComissionavel, 675)
  assert.equal(r.percentualRealizado, 60)
})

test("intermediação sem total informado deriva total = base + encargos", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 726.44)
  assert.equal(r.repasse, 321.44)
})

test("intermediação sem garagem usa só o aluguel como base", () => {
  const r = resolverRecebimento(
    intermediacao({
      componentes: { aluguel: 700, garagem: null, iptu: null, seguro: null, outrosEncargos: null },
      comissaoInformada: 350,
    }),
  )
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.baseComissionavel, 700)
  assert.equal(r.percentualRealizado, 50)
})

test("valores explícitos do documento são preservados e reconciliados", () => {
  const r = resolverRecebimento(rescisao())
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.comissao, 116.45)
  assert.equal(r.repasse, 1547.11)
  assert.equal(r.reconciliado, true)
  assert.equal(r.divergencias.length, 0)
})

test("rescisão sem total informado deriva total = principal + ajuste", () => {
  const r = resolverRecebimento(rescisao({ totalRecebidoInformado: null, repasseInformado: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.repasse, 1547.11)
})

test("equação inconsistente vira pendência, nunca recálculo silencioso", () => {
  const r = resolverRecebimento(rescisao({ repasseInformado: 1500 }))
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "equacao_inconsistente")
})

test("diferença de até um centavo na equação é tolerada", () => {
  const r = resolverRecebimento(rescisao({ repasseInformado: 1547.12 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.repasse, 1547.12)
  assert.equal(r.reconciliado, true)
})

test("comissão ausente é derivada de total − repasse quando ambos são informados", () => {
  const r = resolverRecebimento(rescisao({ comissaoInformada: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.comissao, 116.45)
})

test("comissão ausente e não derivável é zero documental, repasse = total", () => {
  const r = resolverRecebimento(rescisao({ comissaoInformada: null, repasseInformado: null }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.comissao, 0)
  assert.equal(r.repasse, 1663.56)
})

test("percentual informado tem precedência sobre o calculado", () => {
  const r = resolverRecebimento(intermediacao({ comissaoInformada: 405, percentualInformado: 59.5 }))
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.percentualRealizado, 59.5)
})

test("item sem vínculo por unidade, inquilino ou imóvel fica pendente", () => {
  const r = resolverRecebimento(intermediacao({ apto: null, inquilino: null, comissaoInformada: 405 }))
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "vinculo_ausente")
})

test("confiança abaixo do mínimo fica pendente sem efeito financeiro", () => {
  const r = resolverRecebimento(
    intermediacao({ comissaoInformada: 405, evidencia: { ...evidenciaOk, confianca: 0.55 } }),
  )
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "evidencia_insuficiente")
})

test("item sem nenhum valor monetário fica pendente, nunca zero confirmado", () => {
  const r = resolverRecebimento(
    intermediacao({
      componentes: { aluguel: null, garagem: null, iptu: null, seguro: null, outrosEncargos: null },
    }),
  )
  assert.equal(r.status, "pendente")
  if (r.status !== "pendente") return
  assert.equal(r.motivo, "evidencia_insuficiente")
})

test("adaptador legado: intermediação mapeia valor para o componente aluguel", () => {
  const canonico = normalizarItemLegado({
    tipo: "intermediacao",
    apto: "204",
    inquilino: "LOCATÁRIO",
    valor: 650,
    garagem: 25,
    iptu: 51.44,
    total_recebido: 726.44,
    comissao: 405,
    repasse: 321.44,
    percentual: 60,
    competencia_original: "2026-06",
    competencia_recebimento: "2026-07",
    observacao: "IPTU (7/12)",
    confianca: 0.95,
  })
  assert.equal(canonico.tipo, "intermediacao")
  if (canonico.tipo !== "intermediacao") return
  assert.equal(canonico.componentes.aluguel, 650)
  assert.equal(canonico.componentes.garagem, 25)
  assert.equal(canonico.totalRecebidoInformado, 726.44)
})

test("adaptador legado: rescisão mapeia valor para principal", () => {
  const canonico = normalizarItemLegado({
    tipo: "rescisao",
    apto: null,
    inquilino: "EX-LOCATÁRIO",
    valor: 1890,
    ajuste: -226.44,
    total_recebido: 1663.56,
    comissao: 116.45,
    repasse: 1547.11,
    competencia_original: null,
    competencia_recebimento: "2026-07",
    observacao: null,
    confianca: 0.9,
  })
  assert.equal(canonico.tipo, "rescisao")
  if (canonico.tipo !== "rescisao") return
  assert.equal(canonico.principal, 1890)
  assert.equal(canonico.ajuste, -226.44)
})

test("resolvedor legado resolve rescisão LOCMAIS ponta a ponta", () => {
  const r = resolverRecebimentoLegado({
    tipo: "rescisao",
    apto: null,
    inquilino: "EX-LOCATÁRIO",
    valor: 1890,
    total_recebido: 1663.56,
    comissao: 116.45,
    repasse: 1547.11,
    competencia_original: null,
    competencia_recebimento: "2026-07",
    observacao: null,
    confianca: 0.9,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 1663.56)
  assert.equal(r.comissao, 116.45)
  assert.equal(r.repasse, 1547.11)
})

test("adaptador legado trata campos ausentes como nulos e confiança ausente como zero", () => {
  const r = resolverRecebimentoLegado({
    tipo: "rescisao",
    valor: 1890,
    total_recebido: 1663.56,
  } as never)
  assert.equal(r.status, "pendente")
})

test("intermediação legada com valores apenas na observação usa o fallback marcado", () => {
  // Análises antigas carregavam total/IPTU/repasse só no texto da observação
  // (comportamento absorvido de lib/intermediacao.ts). Estruturado tem precedência.
  const r = resolverRecebimentoLegado({
    tipo: "intermediacao",
    apto: "204",
    inquilino: "LOCATÁRIO",
    valor: 650,
    competencia_original: "2026-06",
    competencia_recebimento: "2026-07",
    observacao: "Total recebido R$ 726,44; IPTU R$ 76,44; repasse R$ 321,44.",
    confianca: 0.95,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 726.44)
  assert.equal(r.repasse, 321.44)
})

test("valores estruturados têm precedência sobre a observação legada", () => {
  const r = resolverRecebimentoLegado({
    tipo: "intermediacao",
    apto: "204",
    inquilino: "LOCATÁRIO",
    valor: 650,
    total_recebido: 700,
    repasse: 650,
    comissao: 50,
    competencia_original: null,
    competencia_recebimento: "2026-07",
    observacao: "Total recebido R$ 726,44; repasse R$ 321,44.",
    confianca: 0.95,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 700)
  assert.equal(r.repasse, 650)
})

test("resolverRecebimentosLegados devolve apenas os itens resolvidos, pareados com o financeiro", () => {
  const resolvidos = resolverRecebimentosLegados([
    { tipo: "atraso", apto: "204", valor: 414.86, garagem: 52.07, total_recebido: 466.93, confianca: 0.95 },
    { tipo: "atraso", valor: 999, confianca: 0.4 },
  ])
  assert.equal(resolvidos.length, 1)
  assert.equal(resolvidos[0]?.item.apto, "204")
  assert.equal(resolvidos[0]?.financeiro.totalRecebido, 466.93)
})

test("tipo outro usa o valor informado como total recebido", () => {
  const r = resolverRecebimento({
    tipo: "outro",
    imovelId: null,
    apto: "07",
    inquilino: null,
    competenciaOrigem: null,
    competenciaRecebimento: "2026-07",
    valorInformado: 320.5,
    totalRecebidoInformado: null,
    comissaoInformada: null,
    repasseInformado: null,
    evidencia: evidenciaOk,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 320.5)
  assert.equal(r.repasse, 320.5)
})

test("em acordo/rescisão a base comissionável é o total pago pelo inquilino", () => {
  // Confirmado nos documentos de julho: a comissão do acordo é a taxa de
  // administração aplicada sobre o TOTAL recebido (aluguel + garagem + água +
  // IPTU), não sobre aluguel + garagem. Usar a base menor inflava o percentual
  // exibido (7,51% em vez de 7,00%) — queixa registrada na reunião de 27/08.
  const r = resolverRecebimento({
    tipo: "acordo",
    imovelId: null,
    apto: "1",
    inquilino: "LOCATARIO",
    competenciaOrigem: "2026-06",
    competenciaRecebimento: "2026-07",
    principal: 763.14,
    ajuste: null,
    componentes: { garagem: 27.65, encargos: 57.73 },
    totalRecebidoInformado: 848.52,
    comissaoInformada: 59.4,
    repasseInformado: 789.12,
    evidencia: { documentoId: null, secao: "ACORDOS", linhaOuTrecho: "1", confianca: 0.95 },
  })

  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.baseComissionavel, 848.52)
  assert.equal(r.percentualRealizado, 7)
})

// Canário GM II ago/2026 (feedback do cliente em 2026-09-17, ponto #12): o
// schema do modelo não tinha `agua` nos acordos, então o valor foi parar na
// observação e a coluna ÁGUA da Revisão mostrava "-" onde o documento imprime
// R$ 74,70 (apto 7, Luana) e R$ 67,70 (aptos 3, 8 e 23, intermediados).
const LUANA_GM2_AGOSTO = {
  tipo: "atraso" as const,
  apto: "7",
  inquilino: "LUANA ALINE BATISTA",
  valor: 790.33,
  aluguel: 790.33,
  garagem: 27.58,
  iptu: 1.57,
  seguro_incendio: 0,
  comissao: 62.59,
  repasse: 831.59,
  competencia_original: "07/2026",
  competencia_recebimento: "08/2026",
  observacao: "VIGÊNCIA DE JULHO DE 2026. IPTU (7/12). SEGURO QUITADO. VAGA DE GARAGEM PARA MOTO. ÁGUA: R$ 74,70.",
  confianca: 0.96,
}

test("GM II ago/2026: água marcada na observação é lida quando o campo não veio", () => {
  assert.equal(aguaDeclarada(LUANA_GM2_AGOSTO), 74.7)
  // Campo estruturado tem precedência sobre o texto.
  assert.equal(aguaDeclarada({ ...LUANA_GM2_AGOSTO, agua: 70 }), 70)
  // Sem marca no texto, continua desconhecida — nunca zero.
  assert.equal(aguaDeclarada({ agua: null, observacao: "IPTU (7/12). SEGURO QUITADO." }), null)
  assert.equal(aguaDeclarada({ agua: null, observacao: null }), null)
})

test("GM II ago/2026: sem total_recebido, o atraso deriva o TOTAL do documento com a água", () => {
  const r = resolverRecebimentoLegado({ ...LUANA_GM2_AGOSTO, total_recebido: null })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  // 790,33 + 27,58 + 74,70 + 1,57 — exatamente o TOTAL impresso.
  assert.equal(r.totalRecebido, 894.18)
  assert.equal(r.repasse, 831.59)
})

test("GM II ago/2026: intermediação deriva o total da linha incluindo a água da observação", () => {
  const r = resolverRecebimentoLegado({
    tipo: "intermediacao",
    apto: "3",
    inquilino: "VITOR SOUSA PINTO",
    valor: 700,
    aluguel: 700,
    garagem: 25,
    iptu: 1.43,
    comissao: 435,
    percentual: 60,
    competencia_original: "07/2026",
    competencia_recebimento: "08/2026",
    observacao: "INTERMEDIAÇÕES DE JULHO 2026. IPTU (8/12). SEGURO QUITADO. VAGA DE GARAGEM PARA MOTO. ÁGUA: R$ 67,70.",
    confianca: 0.96,
  })
  assert.equal(r.status, "resolvido")
  if (r.status !== "resolvido") return
  assert.equal(r.totalRecebido, 794.13)
  // A água entra no total e no repasse, mas não na base percentual (60% de 725).
  assert.equal(r.baseComissionavel, 725)
  assert.equal(r.repasse, 359.13)
})


// --- Totais da tabela de intermediacao (pedido da cliente, set/2026) --------

const INTERM_OK = {
  tipo: "intermediacao" as const,
  apto: "204",
  inquilino: "LOCATÁRIO",
  confianca: 0.95,
}

test("totaliza so as linhas resolvidas e diz quantas ficaram de fora", () => {
  // Linha pendente nao tem efeito financeiro (CA27.2): nao entra em soma
  // nenhuma. Mas some do rodape em silencio seria pior que o rodape ausente —
  // o total tem de declarar quantas ignorou.
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, iptu: 30, total_recebido: 780, comissao: 375, repasse: 405 },
    // confianca abaixo do minimo: pendente
    { ...INTERM_OK, apto: "205", aluguel: 600, total_recebido: 600, comissao: 300, repasse: 300, confianca: 0.2 },
  ])
  assert.equal(totais.linhas, 1)
  assert.equal(totais.pendentes, 1)
  assert.equal(totais.totalRecebido, 780)
  assert.equal(totais.comissao, 375)
  assert.equal(totais.repasse, 405)
  assert.equal(totais.baseComissionavel, 750)
  assert.equal(totais.encargos, 30)
})

test("encargos do rodape sao o resto do total sobre a base, linha a linha", () => {
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, iptu: 30, total_recebido: 780, comissao: 375, repasse: 405 },
    { ...INTERM_OK, apto: "205", aluguel: 400, iptu: 20, agua: 10, total_recebido: 430, comissao: 200, repasse: 230 },
  ])
  assert.equal(totais.baseComissionavel, 1150)
  assert.equal(totais.totalRecebido, 1210)
  assert.equal(totais.encargos, 60)
  // Fecha a identidade que a tabela promete: base + encargos = total.
  assert.equal(totais.baseComissionavel! + totais.encargos!, totais.totalRecebido)
})

test("base desconhecida em alguma linha nao vira zero no rodape", () => {
  // Sem aluguel nem garagem a base e desconhecida ("-" na celula). Somar como
  // zero faria o rodape afirmar uma base menor que a real e um percentual maior.
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, iptu: 30, total_recebido: 780, comissao: 375, repasse: 405 },
    { ...INTERM_OK, apto: "205", total_recebido: 500, comissao: 250, repasse: 250 },
  ])
  assert.equal(totais.linhas, 2)
  assert.equal(totais.basesDesconhecidas, 1)
  assert.equal(totais.baseComissionavel, 750)
  assert.equal(totais.totalRecebido, 1280)
  // Percentual fica desconhecido: a comissao soma as duas linhas e a base, uma.
  assert.equal(totais.percentual, null)
})

test("percentual do rodape so existe quando toda linha tem base", () => {
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, iptu: 30, total_recebido: 780, comissao: 375, repasse: 405 },
    { ...INTERM_OK, apto: "205", aluguel: 250, total_recebido: 250, comissao: 125, repasse: 125 },
  ])
  assert.equal(totais.basesDesconhecidas, 0)
  assert.equal(totais.baseComissionavel, 1000)
  assert.equal(totais.comissao, 500)
  assert.equal(totais.percentual, 50)
})

test("lista vazia devolve zeros, nao desconhecido", () => {
  const totais = totalizarRecebimentos([])
  assert.equal(totais.linhas, 0)
  assert.equal(totais.pendentes, 0)
  assert.equal(totais.totalRecebido, 0)
  assert.equal(totais.baseComissionavel, null)
  assert.equal(totais.encargos, null)
  assert.equal(totais.percentual, null)
})

// --------------------------------------------------------------------------
// Colunas do documento de repasse (paridade pedida pela cliente, set/2026).

test("componentes da linha reproduzem as colunas do documento", () => {
  // GM II ago/2026, apto 8: a agua vem so no texto, e `aguaDeclarada` a resgata.
  const componentes = componentesLinhaIntermediacao(
    {
      ...INTERM_OK,
      aluguel: 700,
      garagem: 25,
      iptu: 1.43,
      seguro_incendio: 0,
      observacao: "INTERMEDIAÇÕES DE JULHO 2026. IPTU (8/12). ÁGUA: R$ 67,70",
    },
    794.13,
  )
  assert.equal(componentes.aluguel, 700)
  assert.equal(componentes.garagem, 25)
  assert.equal(componentes.agua, 67.7)
  assert.equal(componentes.iptu, 1.43)
  assert.equal(componentes.seguro, 0)
  // Colunas fecham com o total impresso.
  assert.equal(componentes.naoDetalhado, 0)
})

test("componente ausente nao vira zero e a sobra fica declarada", () => {
  // Grand Castelao I ago/2026, apto 3: a agua nao veio estruturada nem com o
  // rotulo na observacao. As colunas somam 694,59 contra um total de 742,19 —
  // a diferenca tem de aparecer, nao ser absorvida por uma coluna qualquer.
  const componentes = componentesLinhaIntermediacao(
    { ...INTERM_OK, aluguel: 690, garagem: 0, iptu: 4.59, seguro_incendio: 0, observacao: "IPTU (8/12). SEGURO QUITADO." },
    742.19,
  )
  assert.equal(componentes.agua, null)
  assert.equal(componentes.naoDetalhado, 47.6)
})

test("rodape soma cada coluna do documento", () => {
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, agua: 20, iptu: 30, seguro_incendio: 5, total_recebido: 805, comissao: 375, repasse: 430 },
    { ...INTERM_OK, apto: "205", aluguel: 400, garagem: 0, iptu: 20, seguro_incendio: 0, total_recebido: 420, comissao: 200, repasse: 220 },
  ])
  assert.equal(totais.componentes.aluguel, 1100)
  assert.equal(totais.componentes.garagem, 50)
  assert.equal(totais.componentes.iptu, 50)
  assert.equal(totais.componentes.seguro, 5)
  // Uma linha sem agua nao pode zerar a coluna de agua da outra.
  assert.equal(totais.componentes.agua, 20)
  assert.equal(totais.componentes.naoDetalhado, 0)
  // A identidade que a tabela promete: as colunas somam o total recebido.
  const soma = 1100 + 50 + 20 + 50 + 5
  assert.equal(soma, totais.totalRecebido)
})

test("coluna sem nenhuma linha informada fica desconhecida, nao zero", () => {
  const totais = totalizarRecebimentos([
    { ...INTERM_OK, aluguel: 700, garagem: 50, iptu: 30, total_recebido: 780, comissao: 375, repasse: 405 },
  ])
  assert.equal(totais.componentes.seguro, null)
  assert.equal(totais.componentes.agua, null)
})
