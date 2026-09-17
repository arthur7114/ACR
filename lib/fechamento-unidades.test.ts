import assert from "node:assert/strict"
import test from "node:test"

import {
  contarUnidadesIntermediadas,
  criarClassificadorUnidades,
  intermediacoesPorApto,
  type LinhaUnidade,
} from "./fechamento-unidades"

function linha(partial: Partial<LinhaUnidade> & { apto: string }): LinhaUnidade {
  return {
    inquilino: null,
    aluguel: null,
    total: 0,
    observacao: null,
    ...partial,
  }
}

// Canário GM II ago/2026 (feedback do cliente em 2026-09-17, vídeo + apto 23):
// a seção "INTERMEDIAÇÕES DE JULHO 2026" lista os aptos 3, 8 e 23, mas só as
// linhas 3 e 8 repetem "INTERMEDIAÇÃO" na observação. O apto 23 vinha zerado e
// com "IPTU (8/12). SEGURO QUITADO.", e a tela o exibia como inadimplente —
// mostrando 2 intermediações e 3 inadimplentes onde o documento tem 3 e 2.
const INTERMEDIACOES_GM2_AGOSTO = [
  { tipo: "intermediacao" as const, apto: "3", inquilino: "VITOR SOUSA PINTO" },
  { tipo: "intermediacao" as const, apto: "8", inquilino: "PAULO WENDEL COSMO DE LIMA" },
  { tipo: "intermediacao" as const, apto: "23", inquilino: "JAMILLE RODRIGUES DA PRATA" },
]

const LINHAS_GM2_AGOSTO: LinhaUnidade[] = [
  linha({ apto: "3", inquilino: "VITOR SOUSA PINTO", aluguel: 0, observacao: "INTERMEDIAÇÃO" }),
  linha({ apto: "6", inquilino: "", aluguel: 0, observacao: "DESOCUPADO" }),
  linha({ apto: "7", inquilino: "LUANA ALINE BATISTA", aluguel: 0, observacao: "INADIMPLÊNCIA" }),
  linha({ apto: "8", inquilino: "PAULO WENDEL COSMO DE LIMA", aluguel: 0, observacao: "INTERMEDIAÇÃO" }),
  linha({
    apto: "23",
    inquilino: "JAMILLE RODRIGUES DA PRATA",
    aluguel: 0,
    observacao: "IPTU (8/12). SEGURO QUITADO.",
  }),
  linha({ apto: "25", inquilino: "GEISA SILVA MOURA", aluguel: 0, observacao: "INADIMPLÊNCIA" }),
  linha({
    apto: "27",
    inquilino: "FABIANA PEREIRA DE ARAÚJO",
    aluguel: 633.15,
    total: 702.28,
    observacao: "IPTU (8/12). SEGURO QUITADO.",
  }),
]

test("GM II ago/2026: apto listado na tabela de intermediações é intermediação, não inadimplente", () => {
  const unidades = criarClassificadorUnidades(intermediacoesPorApto(INTERMEDIACOES_GM2_AGOSTO))
  const apto23 = LINHAS_GM2_AGOSTO.find((row) => row.apto === "23")!

  assert.equal(unidades.isIntermediacaoRow(apto23), true)
  assert.equal(unidades.isDelinquentRow(apto23), false)
  assert.equal(unidades.isVacantRow(apto23), false)
  // Intermediação continua dentro de "alugadas": a unidade tem locatário no mês.
  assert.equal(unidades.isOccupiedRow(apto23), true)
})

test("GM II ago/2026: tiles contam 3 intermediações e 2 inadimplentes", () => {
  const unidades = criarClassificadorUnidades(intermediacoesPorApto(INTERMEDIACOES_GM2_AGOSTO))

  assert.equal(contarUnidadesIntermediadas(LINHAS_GM2_AGOSTO, INTERMEDIACOES_GM2_AGOSTO), 3)
  assert.equal(LINHAS_GM2_AGOSTO.filter(unidades.isDelinquentRow).length, 2)
})

test("sem tabela de intermediações, a observação da linha continua decidindo", () => {
  const unidades = criarClassificadorUnidades()

  assert.equal(LINHAS_GM2_AGOSTO.filter(unidades.isIntermediacaoRow).length, 2)
  // E o apto 23, zerado e sem marca, volta a ser lido como inadimplente.
  assert.equal(LINHAS_GM2_AGOSTO.filter(unidades.isDelinquentRow).length, 3)
})

test("intermediação sem linha na vigência ainda é contada uma vez", () => {
  const intermediacoes = [{ tipo: "intermediacao" as const, apto: "204", inquilino: "NOVO" }]
  const linhas = [linha({ apto: "101", inquilino: "LOCATÁRIO", aluguel: 700, total: 700 })]

  assert.equal(contarUnidadesIntermediadas(linhas, intermediacoes), 1)
})

test("intermediação sem apto informado não some da contagem", () => {
  const intermediacoes = [{ tipo: "intermediacao" as const, apto: null, inquilino: "SEM APTO" }]
  const linhas = [linha({ apto: "101", inquilino: "LOCATÁRIO", aluguel: 700, total: 700 })]

  assert.equal(contarUnidadesIntermediadas(linhas, intermediacoes), 1)
})

test("apto vago não vira intermediação por coincidência de número vazio", () => {
  const intermediacoes = [{ tipo: "intermediacao" as const, apto: null, inquilino: null }]
  const vago = linha({ apto: "", inquilino: "", aluguel: 0, observacao: "DESOCUPADO" })
  const unidades = criarClassificadorUnidades(intermediacoesPorApto(intermediacoes))

  assert.equal(unidades.isIntermediacaoRow(vago), false)
  assert.equal(unidades.isVacantRow(vago), true)
})

// Guarda derivada da varredura dos 31 fechamentos: seção e linha podem falar de
// inquilinos diferentes no mesmo apto. Grand Castelão I mai/2026 tem rescisão do
// inquilino que saiu (apto 2, Felipe) enquanto a linha da vigência já é do novo
// (Lucas), pagando aluguel cheio.
test("apto reocupado por outro inquilino pagante mantém a etiqueta dele", () => {
  const intermediacoes = [
    { tipo: "intermediacao" as const, apto: "2", inquilino: "FELIPE DE LIMA LOPES BRÁS" },
  ]
  const unidades = criarClassificadorUnidades(intermediacoesPorApto(intermediacoes))
  const novoInquilino = linha({
    apto: "2",
    inquilino: "LUCAS RAFAEL DE SOUSA SERIDÓ",
    aluguel: 690,
    total: 767.19,
    observacao: "IPTU (5/12). SEGURO QUITADO.",
  })

  assert.equal(unidades.isIntermediacaoRow(novoInquilino), false)
  assert.equal(unidades.isOccupiedRow(novoInquilino), true)
  // O evento de intermediação continua contado no tile, mesmo sem etiquetar a linha.
  assert.equal(contarUnidadesIntermediadas([novoInquilino], intermediacoes), 1)
})

test("mesmo inquilino da seção, com recebimento na linha, segue intermediação", () => {
  const intermediacoes = [
    { tipo: "intermediacao" as const, apto: "5", inquilino: "MARIA DA SILVA" },
  ]
  const unidades = criarClassificadorUnidades(intermediacoesPorApto(intermediacoes))
  const mesmaPessoa = linha({ apto: "5", inquilino: "MARIA DA SILVA", aluguel: 300, total: 300 })

  assert.equal(unidades.isIntermediacaoRow(mesmaPessoa), true)
})
