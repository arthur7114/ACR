import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  buildIndicadoresSnapshotRows,
  mapIndicadoresProperties,
} from "../../lib/server/indicadores-snapshots"

// Replay determinístico da metade "lógica" do pipeline.
//
// A extração por LLM não é determinística — não há `temperature` nem `seed`
// fixados —, então reprocessar os PDFs mistura variação do modelo com
// mudança de código e torna qualquer divergência inatribuível. Aqui a
// `analise_completa` já vem congelada: a única pergunta é se, dado o mesmo
// documento lido, o builder produz os mesmos snapshots.
//
// `snapshotsNoBancoEm` é detecção de MUDANÇA, não gabarito de correção. Uma
// divergência aqui significa "o comportamento mudou, explique por quê" — e
// não "está errado". Correção quem decide é a conferência manual do cliente.

const RAIZ = join(process.cwd(), "tests", "fixtures", "fechamentos")
const TOLERANCIA = 0.005

interface Fixture {
  competencia: string
  imobiliaria: { id: string; nome: string | null }
  empreendimento: { id: string; nome: string | null }
  imoveis: Array<Record<string, unknown>>
  vigencias: Array<Record<string, unknown>>
  analiseCompleta: unknown
  snapshotsNoBancoEm: Array<Record<string, unknown>>
  fechamento: { id: string }
}

function competenciasDisponiveis() {
  if (!existsSync(RAIZ)) return []
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
}

function fixturesDe(competencia: string) {
  const pasta = join(RAIZ, competencia)
  return readdirSync(pasta)
    .filter((nome) => nome.endsWith(".json") && nome !== "index.json")
    .sort()
    .map((nome) => ({
      nome,
      dados: JSON.parse(readFileSync(join(pasta, nome), "utf-8")) as Fixture,
    }))
}

// Reproduz a seleção que a consulta faz: havendo vigências, valem os imóveis
// delas; sem vigências, os ativos.
function imoveisDoEscopo(fixture: Fixture) {
  const comVigencia = new Set(fixture.vigencias.map((vigencia) => vigencia.imovel_id as string))
  const selecionados =
    comVigencia.size > 0
      ? fixture.imoveis.filter((imovel) => comVigencia.has(imovel.id as string))
      : fixture.imoveis.filter((imovel) => imovel.ativo === true)
  return [...selecionados].sort((esquerda, direita) =>
    String(esquerda.id).localeCompare(String(direita.id)),
  )
}

function iguais(esperado: unknown, obtido: unknown) {
  if (esperado === null || esperado === undefined) {
    return obtido === null || obtido === undefined
  }
  const numeroEsperado = typeof esperado === "string" ? Number(esperado) : esperado
  if (typeof numeroEsperado === "number" && typeof obtido === "number") {
    return Math.abs(numeroEsperado - obtido) <= TOLERANCIA
  }
  if (typeof esperado === "object" || typeof obtido === "object") {
    return JSON.stringify(esperado) === JSON.stringify(obtido)
  }
  return String(esperado) === String(obtido)
}

const competencias = competenciasDisponiveis()

// As fixtures ficam fora do git: carregam nome de inquilino e valor por
// unidade, e o repositorio e publico. Sem elas o replay nao tem o que
// comparar — pula em vez de falhar, para que um clone limpo continue verde.
test("fixtures congeladas disponiveis", { skip: competencias.length === 0 && "sem fixtures locais — rode: pnpm fixtures:exportar 2026-07-01" }, () => {
  assert.ok(competencias.length > 0)
})

for (const competencia of competencias) {
  for (const { nome, dados } of fixturesDe(competencia)) {
    test(`${competencia} · ${nome} reproduz os snapshots congelados`, () => {
      const propriedades = mapIndicadoresProperties({
        propertyRows: imoveisDoEscopo(dados),
        vigencies: dados.vigencias as never,
      })
      const { rows, unlinkedLineCount } = buildIndicadoresSnapshotRows({
        properties: propriedades,
        fechamentoId: dados.fechamento.id,
        competencia: dados.competencia,
        analysis: dados.analiseCompleta as never,
      })

      assert.equal(unlinkedLineCount, 0, "linha da prestação sem vínculo de imóvel")
      assert.equal(
        rows.length,
        dados.snapshotsNoBancoEm.length,
        "quantidade de snapshots mudou",
      )

      const porImovel = new Map(rows.map((linha) => [linha.imovel_id, linha]))
      const divergencias: string[] = []
      for (const congelado of dados.snapshotsNoBancoEm) {
        const obtido = porImovel.get(congelado.imovel_id as string) as
          | Record<string, unknown>
          | undefined
        if (!obtido) {
          divergencias.push(`${congelado.imovel_id}: sem snapshot no replay`)
          continue
        }
        for (const [campo, valor] of Object.entries(congelado)) {
          if (campo === "competencia") continue
          if (!iguais(valor, obtido[campo])) {
            divergencias.push(
              `${congelado.imovel_id}.${campo}: congelado=${JSON.stringify(valor)} replay=${JSON.stringify(obtido[campo])}`,
            )
          }
        }
      }
      assert.deepEqual(divergencias, [], divergencias.join("\n"))
    })
  }
}
