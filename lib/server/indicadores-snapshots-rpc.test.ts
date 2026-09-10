import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { buildIndicadoresSnapshotRows } from "./indicadores-snapshots.ts"

// Guarda estrutural das duas vias de gravacao do snapshot mensal.
//
// O builder e o SQL evoluem em arquivos distintos, e o `on conflict do update`
// esconde a diferenca: linha ja existente conserva o valor antigo da coluna
// esquecida, entao a perda so aparece no INSERT de uma competencia inedita —
// meses depois, sem erro. Foi assim que `garagem_recebida` sumiu da via de
// processamento (202609020001) e `observacao` nunca chegou a via de reparo.
//
// Aqui a lista de colunas nao e escrita a mao: sai das chaves que o proprio
// builder produz. Campo novo no builder quebra este teste ate que as duas
// RPCs o gravem.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")
const RPCS = ["persistir_pacote_fechamento_v1", "aplicar_reparo_indicadores_v4"] as const

// `fechamento_id` vem do argumento da funcao (`p_fechamento_id`), nunca do
// item JSON, e por isso nao aparece na lista de valores.
const DO_ARGUMENTO = new Set(["fechamento_id"])

function ultimaDefinicao(rpc: string) {
  const arquivos = readdirSync(MIGRATIONS).filter((nome) => nome.endsWith(".sql")).sort()
  let encontrada: string | null = null
  for (const nome of arquivos) {
    const sql = readFileSync(join(MIGRATIONS, nome), "utf-8")
    const inicio = sql.indexOf(`create or replace function public.${rpc}(`)
    if (inicio < 0) continue
    encontrada = sql.slice(inicio, sql.indexOf("\n$$;", inicio))
  }
  assert.ok(encontrada, `nenhuma migration define ${rpc}`)
  return encontrada as string
}

function blocoDeInsercao(corpo: string) {
  const abertura = corpo.indexOf("insert into public.imovel_competencias (")
  assert.ok(abertura >= 0, "insert em imovel_competencias nao encontrado")
  const conflito = corpo.indexOf("on conflict", abertura)
  assert.ok(conflito > abertura, "on conflict do insert nao encontrado")

  const listaInicio = corpo.indexOf("(", abertura)
  const listaFim = corpo.indexOf(") values (", listaInicio)
  assert.ok(listaFim > listaInicio, "lista de colunas nao encontrada")
  const colunas = corpo
    .slice(listaInicio + 1, listaFim)
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)

  const valoresInicio = listaFim + ") values (".length
  const valoresFim = corpo.lastIndexOf(")", conflito)
  assert.ok(valoresFim > valoresInicio, "lista de valores nao encontrada")
  const valoresBruto = corpo.slice(valoresInicio, valoresFim)

  const atualizadas = new Set(
    [...corpo.slice(conflito).matchAll(/(\w+)\s*=\s*excluded\./g)].map((achado) => achado[1]),
  )

  return { colunas, valoresBruto, atualizadas }
}

// Divide a lista de valores no nivel zero de parenteses: `coalesce(a, b)` e um
// valor so, nao dois.
function contarValores(texto: string) {
  let profundidade = 0
  let total = 1
  let viuConteudo = false
  for (const caractere of texto) {
    if (caractere === "(") profundidade++
    else if (caractere === ")") profundidade--
    else if (caractere === "," && profundidade === 0) total++
    if (!/\s/.test(caractere)) viuConteudo = true
  }
  return viuConteudo ? total : 0
}

function colunasDoBuilder() {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          imovel: "Apto 101",
          inquilino: "Fulano",
          aluguel: 1_000,
          total: 1_000,
          desconto: 0,
          comissao: 100,
          repasse: 900,
          garagem: 50,
          observacao: "Linha com garagem e observacao.",
        },
      ],
      inadimplencias_acumuladas: [],
      acordos_rescisoes_recebidos: [],
    },
  } as unknown as PackageAnalysis

  const { rows } = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-101",
        unit: "Apto 101",
        expectedRent: 1_000,
        garagemContratada: 50,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })
  assert.equal(rows.length, 1, "fixture deveria produzir exatamente uma linha")
  return Object.keys(rows[0])
}

test("a fixture do builder cobre as colunas opcionais que ja sumiram uma vez", () => {
  const colunas = colunasDoBuilder()
  for (const critica of ["garagem_recebida", "observacao", "cobranca_esperada", "eventos"]) {
    assert.ok(
      colunas.includes(critica),
      `a fixture precisa exercitar ${critica}, senao o teste para de proteger a coluna`,
    )
  }
})

for (const rpc of RPCS) {
  test(`${rpc} grava toda coluna que o builder produz`, () => {
    const { colunas } = blocoDeInsercao(ultimaDefinicao(rpc))
    const faltando = colunasDoBuilder().filter(
      (coluna) => !DO_ARGUMENTO.has(coluna) && !colunas.includes(coluna),
    )
    assert.deepEqual(
      faltando,
      [],
      `${rpc} nao grava ${faltando.join(", ")} — o INSERT de uma competencia inedita gravaria nulo`,
    )
  })

  test(`${rpc} reaplica toda coluna no on conflict`, () => {
    const { atualizadas } = blocoDeInsercao(ultimaDefinicao(rpc))
    const faltando = colunasDoBuilder().filter(
      (coluna) =>
        !DO_ARGUMENTO.has(coluna) &&
        coluna !== "imovel_id" &&
        coluna !== "competencia" &&
        !atualizadas.has(coluna),
    )
    assert.deepEqual(
      faltando,
      [],
      `${rpc} deixa ${faltando.join(", ")} com o valor antigo no reprocessamento`,
    )
  })

  test(`${rpc} tem a mesma aridade entre colunas e valores`, () => {
    const { colunas, valoresBruto } = blocoDeInsercao(ultimaDefinicao(rpc))
    assert.equal(
      contarValores(valoresBruto),
      colunas.length,
      `${rpc}: ${colunas.length} colunas para ${contarValores(valoresBruto)} valores`,
    )
  })
}
