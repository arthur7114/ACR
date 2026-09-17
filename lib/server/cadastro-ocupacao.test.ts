import assert from "node:assert/strict"
import test from "node:test"

import { planejarCadastroOcupacao, type SnapshotParaCadastro } from "./cadastro-ocupacao"

// Canário ago/2026 (pedido do cliente em 2026-09-17): o card "Hoje" dos
// Indicadores lia o cadastro, que ninguém atualizava depois da aprovação.
// LOCMAIS Galpão 02 constava "vago" com a J Mais dentro desde 13/08; GM I 15 e
// 21 constavam "inadimplente" com o documento dizendo DESOCUPADO.
const IMOVEIS = [
  { id: "g02", unidade: "GALPÃO 02", status: "vago", inquilino_nome: null },
  { id: "gm1-15", unidade: "15", status: "inadimplente", inquilino_nome: "ARTHUR" },
  { id: "gm1-16", unidade: "16", status: "ocupado", inquilino_nome: "ANTÔNIA FABIANA" },
  { id: "gm1-17", unidade: "17", status: "ocupado", inquilino_nome: "BRUNO DA COSTA" },
  { id: "gm1-18", unidade: "18", status: "ocupado", inquilino_nome: "FRANCISCO DACIO" },
  { id: "sem-linha", unidade: "99", status: "ocupado", inquilino_nome: "ALGUÉM" },
  { id: "manual", unidade: "50", status: "em_negociacao", inquilino_nome: null },
]

const snapshot = (overrides: Partial<SnapshotParaCadastro> & { imovel_id: string }): SnapshotParaCadastro => ({
  status_ocupacao: "ocupado",
  inquilino_nome: null,
  modelo_receita: "fixo",
  ...overrides,
})

const SNAPSHOTS: SnapshotParaCadastro[] = [
  snapshot({ imovel_id: "g02", status_ocupacao: "ocupado", inquilino_nome: "J MAIS DISTRIBUIDORA DE ALIMENTOS LTDA" }),
  snapshot({ imovel_id: "gm1-15", status_ocupacao: "vago" }),
  snapshot({ imovel_id: "gm1-16", status_ocupacao: "inadimplente", inquilino_nome: "ANTÔNIA FABIANA" }),
  // Rescisão no meio do mês: o snapshot ainda nomeia quem saiu; o cadastro fica vago e sem inquilino.
  snapshot({ imovel_id: "gm1-17", status_ocupacao: "vago", inquilino_nome: "BRUNO DA COSTA" }),
  snapshot({ imovel_id: "gm1-18", status_ocupacao: "ocupado", inquilino_nome: "FRANCISCO DACIO" }),
  snapshot({ imovel_id: "sem-linha", status_ocupacao: "desconhecido" }),
  snapshot({ imovel_id: "manual", status_ocupacao: "vago" }),
]

test("cadastro passa a dizer o que o fechamento mais recente disse; sem mudança, nada", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-08-01",
    ultimaCompetenciaAprovada: "2026-07-01",
    snapshots: SNAPSHOTS,
    imoveis: IMOVEIS,
  })
  assert.deepEqual(
    plano.map((p) => `${p.unidade}: ${p.statusAnterior}/${p.inquilinoAnterior ?? "-"} -> ${p.statusNovo}/${p.inquilinoNovo ?? "-"}`),
    [
      "GALPÃO 02: vago/- -> ocupado/J MAIS DISTRIBUIDORA DE ALIMENTOS LTDA",
      "15: inadimplente/ARTHUR -> vago/-",
      "16: ocupado/ANTÔNIA FABIANA -> inadimplente/ANTÔNIA FABIANA",
      "17: ocupado/BRUNO DA COSTA -> vago/-",
      "50: em_negociacao/- -> vago/-",
    ],
  )
})

test("snapshot desconhecido não mexe no cadastro", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-08-01",
    ultimaCompetenciaAprovada: null,
    snapshots: [snapshot({ imovel_id: "sem-linha", status_ocupacao: "desconhecido" })],
    imoveis: IMOVEIS,
  })
  assert.deepEqual(plano, [])
})

test("fechamento mais antigo que o último aprovado não regride o cadastro", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-07-01",
    ultimaCompetenciaAprovada: "2026-08-01",
    snapshots: SNAPSHOTS,
    imoveis: IMOVEIS,
  })
  assert.deepEqual(plano, [])
})

test("mesma competência do último aprovado (reaprovação) aplica normalmente", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-08-01",
    ultimaCompetenciaAprovada: "2026-08-01",
    snapshots: [snapshot({ imovel_id: "gm1-15", status_ocupacao: "vago" })],
    imoveis: IMOVEIS,
  })
  assert.equal(plano.length, 1)
  assert.equal(plano[0].statusNovo, "vago")
})

test("inativo é decisão de gente: o fechamento não reativa nem desativa", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-08-01",
    ultimaCompetenciaAprovada: null,
    snapshots: [snapshot({ imovel_id: "x", status_ocupacao: "ocupado", inquilino_nome: "NOVO" })],
    imoveis: [{ id: "x", unidade: "1", status: "inativo", inquilino_nome: null }],
  })
  assert.deepEqual(plano, [])
})

// Galpão José Walter: o extrato não nomeia inquilino ("inquilino" está em
// campos_ausentes). Ocupado sem nome não apaga o nome que o cadastro já tem —
// trocar informação por vazio é regressão, não atualização.
test("ocupado sem inquilino no snapshot mantém o inquilino do cadastro", () => {
  const plano = planejarCadastroOcupacao({
    competencia: "2026-08-01",
    ultimaCompetenciaAprovada: null,
    snapshots: [snapshot({ imovel_id: "jw", status_ocupacao: "ocupado", inquilino_nome: null })],
    imoveis: [{ id: "jw", unidade: "GA0002", status: "ocupado", inquilino_nome: "GALPAO JOSE WALTER" }],
  })
  assert.deepEqual(plano, [])
})
