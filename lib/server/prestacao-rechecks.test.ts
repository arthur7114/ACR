import assert from "node:assert/strict"
import test from "node:test"

import type { PrestacaoAnalysis, TotalSecao } from "@/lib/prestacao-types"

import { applyDeterministicRechecks, conferirTotaisDeSecao } from "./prestacao-rechecks"

// Numeros reais: PDF "1. PRESTACAO DE CONTAS LOCACAO AGOSTO 20" (GRAND
// MESSEJANA II), secao INTERMEDIACOES DE JULHO 2026 — as tres linhas e a linha
// TOTAL impressa ao pe delas.
function intermediacao(apto: string, garagem: number, total: number, comissao: number, repasse: number) {
  return {
    tipo: "intermediacao" as const,
    apto,
    inquilino: "LOCATARIO",
    valor: 700,
    aluguel: 700,
    desconto: null,
    aluguel_com_desconto: 700,
    garagem,
    agua: 67.7,
    iptu: 1.43,
    seguro_incendio: null,
    total_recebido: total,
    comissao,
    repasse,
    percentual: 60,
    competencia_original: "2026-07",
    competencia_recebimento: "2026-08",
    observacao: null,
    confianca: 0.95,
  }
}

function totalImpresso(overrides: Partial<TotalSecao> = {}): TotalSecao {
  // O documento imprime IPTU 4,30 (1,43 x 3 = 4,29) e TOTAL 2.357,40: ele
  // arredonda cada coluna por conta propria.
  return {
    secao: "intermediacao",
    rotulo: "INTERMEDIAÇÕES DE JULHO 2026",
    aluguel: 2100,
    desconto: null,
    aluguel_com_desconto: 2100,
    garagem: 50,
    agua: 203.1,
    iptu: 4.3,
    lixo: null,
    seguro_incendio: null,
    encargos: null,
    total: 2357.4,
    comissao: 1290,
    repasse: 1067.4,
    confianca: 0.95,
    ...overrides,
  }
}

function analise(overrides: Partial<PrestacaoAnalysis> = {}): PrestacaoAnalysis {
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Alive Imoveis",
    empreendimento: "Grand Messejana II",
    competencia: "2026-08",
    plano_extracao: {
      documento_lido_integralmente: true,
      secoes_identificadas: [],
      estrategia: [],
      alertas: [],
    },
    receitas_por_imovel: [],
    acordos_rescisoes_recebidos: [
      intermediacao("3", 25, 794.13, 435, 359.13),
      intermediacao("8", 25, 794.13, 435, 359.13),
      intermediacao("23", 0, 769.13, 420, 349.13),
    ],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: null,
      total_linhas_comissoes: null,
      total_linhas_repasse: null,
      comissao_administracao: null,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: null,
      total_comissao_despesas: null,
      recebidos_em_nome_locador: null,
      total_a_repassar: null,
      repasse_embutido: true,
      confianca: 1,
    },
    totais: { total_receitas: 0, total_comissoes: 0, total_repassar: 0 },
    totais_secoes: [totalImpresso()],
    campos_ausentes: [],
    observacoes: [],
    confianca_geral: 1,
    ...overrides,
  }
}

test("GM II ago/2026: a soma das linhas bate com o TOTAL impresso da secao", () => {
  const [recheck] = conferirTotaisDeSecao(analise())
  assert.equal(recheck.status, "passed")
  assert.match(recheck.message, /3 linhas/)
})

test("arredondamento acumulado do documento nao vira divergencia", () => {
  // A planilha guarda precisao cheia (a aba do Grand Castelao traz IPTU
  // 3.676834725940346) e IMPRIME cada celula arredondada. O TOTAL impresso e a
  // soma dos valores cheios; nos so enxergamos os impressos. Em 21 linhas a
  // deriva chega a 7 centavos — tolerancia fixa de um centavo acusaria
  // divergencia num documento perfeitamente correto.
  const iptuImpresso = 3.68 // 3.676834725940346 arredondado
  const linhas = Array.from({ length: 21 }, (_, indice) => ({
    apto: String(indice + 1),
    inquilino: "LOCATARIO",
    aluguel: 650,
    desconto: null,
    aluguel_com_desconto: 650,
    garagem: null,
    vagas_garagem: null,
    agua: null,
    iptu: iptuImpresso,
    seguro_incendio: null,
    vencimento: "08/2026",
    total: 653.68,
    comissao: null,
    repasse: null,
    observacao: null,
    confianca: 0.95,
  }))
  const comDeriva = analise({
    receitas_por_imovel: linhas,
    acordos_rescisoes_recebidos: [],
    totais_secoes: [
      totalImpresso({
        secao: "vigencia",
        rotulo: "VIGÊNCIA DE AGOSTO DE 2026",
        aluguel: 13650,
        aluguel_com_desconto: 13650,
        garagem: null,
        agua: null,
        // Soma dos valores CHEIOS: 77,21. A soma dos impressos da 77,28.
        iptu: 77.21,
        total: 13727.21,
        comissao: null,
        repasse: null,
      }),
    ],
  })
  const [recheck] = conferirTotaisDeSecao(comDeriva)
  assert.equal(recheck.status, "passed")
})

test("coluna inteira perdida na extracao e denunciada pelo total impresso", () => {
  // Grand Castelao I ago/2026: a AGUA nao foi extraida de nenhuma linha. A soma
  // das linhas erradas era coerente consigo mesma, e o fechamento passou. Com o
  // total impresso em maos, a falha se denuncia.
  const semAgua = analise({
    acordos_rescisoes_recebidos: analise().acordos_rescisoes_recebidos.map((item) => ({
      ...item,
      agua: null,
    })),
  })
  const [recheck] = conferirTotaisDeSecao(semAgua)
  assert.equal(recheck.status, "failed")
  assert.match(recheck.message, /água \(documento R\$ 203,10, linhas R\$ 0,00\)/)
  assert.equal(recheck.difference, 203.1)
})

test("divergencia so no TOTAL tambem aparece, coluna a coluna", () => {
  const totalErrado = analise({ totais_secoes: [totalImpresso({ total: 2500 })] })
  const [recheck] = conferirTotaisDeSecao(totalErrado)
  assert.equal(recheck.status, "failed")
  assert.match(recheck.message, /total \(documento R\$ 2500,00, linhas R\$ 2357,39\)/)
})

test("coluna que a secao nao imprime nao e conferida", () => {
  // Grand Maracanau nao tem coluna AGUA. `null` e "esta secao nao tem essa
  // coluna" — conferir contra zero acusaria divergencia em documento correto.
  const semColunaAgua = analise({
    totais_secoes: [totalImpresso({ agua: null, total: 2154.29, repasse: 864.29 })],
    acordos_rescisoes_recebidos: analise().acordos_rescisoes_recebidos.map((item, indice) => ({
      ...item,
      agua: null,
      total_recebido: [726.43, 726.43, 701.43][indice],
      repasse: [291.43, 291.43, 281.43][indice],
    })),
  })
  const [recheck] = conferirTotaisDeSecao(semColunaAgua)
  assert.equal(recheck.status, "passed")
})

test("sem total impresso nao ha recheck — ausencia nao e aprovacao", () => {
  // Layouts B e C nao imprimem TOTAL por secao, e analises persistidas antes
  // deste campo tambem nao o tem. Emitir "passed" aqui afirmaria uma
  // conferencia que nunca aconteceu.
  assert.deepEqual(conferirTotaisDeSecao(analise({ totais_secoes: undefined })), [])
  assert.deepEqual(conferirTotaisDeSecao(analise({ totais_secoes: [] })), [])
})

test("divergencia de secao bloqueia o parecer tecnico", () => {
  const semAgua = analise({
    acordos_rescisoes_recebidos: analise().acordos_rescisoes_recebidos.map((item) => ({
      ...item,
      agua: null,
    })),
  })
  const { parecer, rechecks } = applyDeterministicRechecks(semAgua)
  assert.equal(parecer.status, "bloqueado")
  assert.equal(parecer.requer_revisao_humana, true)
  assert.ok(rechecks.some((check) => check.id === "total_secao_intermediacao" && check.status === "failed"))
})
