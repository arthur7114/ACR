import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { COLUNAS_QUITACAO } from "@/lib/inadimplencia-mes"
import { buildIndicadoresSnapshotRows } from "./indicadores-snapshots.ts"

// Guarda dos LEITORES do snapshot mensal (a dos escritores e
// indicadores-snapshots-rpc.test.ts).
//
// A gravacao le as colunas do catalogo e nao esquece nenhuma. Quem le o
// snapshot ainda tem listas escritas a mao: o select, o schema zod (que descarta
// em silencio a chave que nao conhece) e o mapeamento. Coluna nova que falta em
// qualquer uma das tres fica gravada no banco e some da tela sem erro nenhum.
// Foi o que quase aconteceu com `atrasos_origens` (out/2026): o dado certo no
// banco, e o mapa mostrando julho em aberto. No verificador do backfill a falta
// virou checksum "invalido" em linha correta.
//
// A lista de colunas sai do proprio builder. Coluna nova quebra este teste ate
// ser lida, ou ate entrar em IGNORADAS com o motivo.

function colunasDoBuilder() {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária X",
      empreendimento: "Residencial X",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        { apto: "10", inquilino: "Fulano", aluguel: 1_000, total: 1_000, desconto: 0, comissao: 100, repasse: 900, garagem: 50, observacao: "Linha com observacao." },
      ],
      inadimplencias_acumuladas: [],
      // Dois meses de origem: e o unico caminho que produz `atrasos_origens`.
      acordos_rescisoes_recebidos: [
        { tipo: "atraso", apto: "10", inquilino: null, valor: 300, competencia_original: "04/2026", competencia_recebimento: null, observacao: null, confianca: 0.95 },
        { tipo: "atraso", apto: "10", inquilino: null, valor: 200, competencia_original: "05/2026", competencia_recebimento: null, observacao: null, confianca: 0.95 },
      ],
    },
  } as unknown as PackageAnalysis

  const { rows } = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "x-10",
        unit: "10",
        expectedRent: 1_000,
        garagemContratada: 50,
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária X",
        developmentName: "Residencial X",
      },
    ],
    fechamentoId: "x-junho",
    competencia: "2026-06",
    analysis,
  })
  assert.equal(rows.length, 1, "fixture deveria produzir exatamente uma linha")
  return Object.keys(rows[0])
}

const COLUNAS = colunasDoBuilder()

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf-8")
}

// Trecho de `texto` que comeca em `inicio` e termina no primeiro `fim` depois dele.
function trecho(texto: string, inicio: string, fim: string) {
  const a = texto.indexOf(inicio)
  assert.ok(a >= 0, `trecho nao encontrado: ${inicio}`)
  const b = texto.indexOf(fim, a + inicio.length)
  assert.ok(b > a, `fim do trecho nao encontrado: ${fim}`)
  return texto.slice(a, b)
}

function cita(texto: string, coluna: string) {
  return new RegExp(`\\b${coluna}\\b`).test(texto)
}

function faltando(texto: string, ignoradas: Record<string, string> = {}) {
  return COLUNAS.filter((coluna) => !(coluna in ignoradas) && !cita(texto, coluna))
}

test("a fixture exercita as colunas opcionais, senao o teste para de proteger", () => {
  for (const critica of ["atrasos_origens", "atrasos_competencia_origem", "observacao", "garagem_recebida", "cobranca_esperada"]) {
    assert.ok(COLUNAS.includes(critica), `a fixture precisa produzir ${critica}`)
  }
})

// Metadados do proprio snapshot. Nenhuma metrica dos indicadores os usa.
const IGNORADAS_PELOS_INDICADORES: Record<string, string> = {
  aluguel_esperado_origem: "procedencia do aluguel (cadastro/vigencia); auditoria, nao metrica",
  quantidade_linhas: "contagem de linhas da prestacao; auditoria, nao metrica",
  calculo_versao: "versao do calculo; a tela usa a constante do codigo",
  checksum: "integridade; quem confere e o verificador",
}

test("indicadores: toda coluna do snapshot e selecionada, validada e mapeada", () => {
  const codigo = fonte("lib/server/indicadores.ts")
  const select = trecho(codigo, '.from("imovel_competencias")', "`)")
  const schema = trecho(codigo, "const snapshotRowsSchema = z.array(", "const vigencyRowsSchema")
  const mapa = trecho(codigo, "function mapSnapshot(", "\n}\n")
  assert.deepEqual(faltando(select, IGNORADAS_PELOS_INDICADORES), [], "fora do select de imovel_competencias")
  assert.deepEqual(faltando(schema, IGNORADAS_PELOS_INDICADORES), [], "fora do snapshotRowsSchema (o zod descarta em silencio)")
  assert.deepEqual(faltando(mapa, IGNORADAS_PELOS_INDICADORES), [], "lida mas nunca mapeada em mapSnapshot")
})

test("verificador do backfill: toda coluna entra no select, no tipo e no checksum recalculado", () => {
  const codigo = fonte("scripts/backfill-indicadores-snapshots.ts")
  const select = trecho(codigo, ".from(SNAPSHOT_TABLE)", "`,")
  const tipo = trecho(codigo, "interface DatabaseSnapshotRow {", "\n}\n")
  const checksum = trecho(codigo, "function calculatePersistedSnapshotChecksum(", "\n}\n")
  assert.deepEqual(faltando(select), [], "fora do select do verificador")
  assert.deepEqual(faltando(tipo), [], "fora de DatabaseSnapshotRow")
  // O checksum e a saida, nao entra no proprio calculo.
  assert.deepEqual(faltando(checksum, { checksum: "e o resultado do calculo" }), [], "fora do checksum recalculado: o verificador acusaria linha correta")
})

test("historico do imovel: toda coluna de atraso entra na quitacao", () => {
  // O historico le so o que a quitacao precisa, de proposito. O risco e coluna
  // NOVA de atraso que a quitacao deveria considerar e ninguem lembra.
  const deAtraso = COLUNAS.filter((coluna) => coluna.startsWith("atrasos_"))
  assert.deepEqual(
    deAtraso.filter((coluna) => !(COLUNAS_QUITACAO as readonly string[]).includes(coluna)),
    [],
    "coluna de atraso fora de COLUNAS_QUITACAO (lib/inadimplencia-mes.ts)",
  )
  const codigo = fonte("lib/server/imovel-historico.ts")
  const select = trecho(codigo, '.from("imovel_competencias")', ")\n")
  assert.deepEqual(
    COLUNAS_QUITACAO.filter((coluna) => !cita(select, coluna)),
    [],
    "o historico nao seleciona toda coluna de que a quitacao depende",
  )
})
