import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBackfillPlan,
  parseBackfillArgs,
} from "./backfill-indicadores-snapshots.ts"

const DEVELOPMENT_A = "11111111-1111-4111-8111-111111111111"
const DEVELOPMENT_B = "22222222-2222-4222-8222-222222222222"

function closure(input: {
  id: string
  status?: string
  archived?: boolean
  analysisComplete?: unknown | null
  competence?: string
  developmentId?: string
  snapshots?: Array<{
    propertyId: string
    checksum: string
    competence?: string
  }>
}) {
  const competence = input.competence ?? "2026-03-01"

  return {
    id: input.id,
    status: input.status ?? "processado_com_sucesso",
    archived: input.archived ?? false,
    analysisComplete:
      input.analysisComplete === undefined ? { prestacao: {} } : input.analysisComplete,
    competence,
    developmentId: input.developmentId ?? DEVELOPMENT_A,
    snapshots: (input.snapshots ?? [
      { propertyId: `property-${input.id}`, checksum: `checksum-${input.id}` },
    ]).map((snapshot) => ({
      propertyId: snapshot.propertyId,
      competence: snapshot.competence ?? competence,
      checksum: snapshot.checksum,
    })),
  }
}

test("usa dry-run como modo padrao e nao exige filtros", () => {
  assert.deepEqual(parseBackfillArgs([]), {
    mode: "dry-run",
    competence: null,
    developmentId: null,
  })
})

test("habilita escrita somente com --commit explicito e normaliza os filtros", () => {
  assert.deepEqual(
    parseBackfillArgs([
      "--commit",
      "--competencia",
      "2026-03",
      "--empreendimento",
      DEVELOPMENT_A,
    ]),
    {
      mode: "commit",
      competence: "2026-03-01",
      developmentId: DEVELOPMENT_A,
    },
  )
})

test("rejeita argumento desconhecido, ausente, duplicado ou malformado", () => {
  const invalidArguments = [
    ["--dry-run"],
    ["--desconhecido"],
    ["--competencia"],
    ["--competencia", "2026-13"],
    ["--competencia", "2026-03", "--competencia", "2026-04"],
    ["--empreendimento"],
    ["--empreendimento", "nao-e-uuid"],
    ["--commit", "--commit"],
  ]

  for (const argv of invalidArguments) {
    assert.throws(() => parseBackfillArgs(argv), { name: "Error" }, argv.join(" "))
  }
})

test("seleciona apenas fechamentos elegiveis com analise, respeita filtros e ordena", () => {
  const options = parseBackfillArgs([
    "--competencia",
    "2026-03",
    "--empreendimento",
    DEVELOPMENT_A,
  ])
  const plan = buildBackfillPlan({
    options,
    closures: [
      closure({ id: "g-erro-egestor", status: "erro_egestor" }),
      closure({ id: "f-lancado", status: "lancado_egestor" }),
      closure({ id: "e-preparado", status: "preparado_egestor" }),
      closure({ id: "d-aprovado", status: "aprovado" }),
      closure({ id: "c-alertas", status: "processado_com_alertas" }),
      closure({ id: "b-sucesso", status: "processado_com_sucesso" }),
      closure({ id: "draft", status: "rascunho" }),
      closure({ id: "uploaded", status: "arquivos_enviados" }),
      closure({ id: "error", status: "erro" }),
      closure({ id: "cancelled", status: "cancelado" }),
      closure({ id: "without-analysis", analysisComplete: null }),
      closure({ id: "archived", archived: true }),
      closure({ id: "wrong-month", competence: "2026-04-01" }),
      closure({ id: "wrong-development", developmentId: DEVELOPMENT_B }),
      closure({ id: "a-updating", status: "pendente_revisao" }),
    ],
    existingSnapshots: [],
  })

  assert.deepEqual(plan.selectedClosureIds, [
    "a-updating",
    "b-sucesso",
    "c-alertas",
    "d-aprovado",
    "e-preparado",
    "f-lancado",
    "g-erro-egestor",
  ])
})

test("dry-run descreve as mudancas sem produzir nenhuma escrita executavel", () => {
  const plan = buildBackfillPlan({
    options: parseBackfillArgs([]),
    closures: [closure({ id: "eligible" })],
    existingSnapshots: [],
  })

  assert.equal(plan.operations[0].kind, "insert")
  assert.deepEqual(plan.executableWrites, [])
  assert.deepEqual(plan.touchedTables, [])
  assert.deepEqual(plan.sourceTablesTouched, [])
})

test("retoma por imovel, competencia e checksum sem repetir snapshots concluidos", () => {
  const plan = buildBackfillPlan({
    options: parseBackfillArgs(["--commit"]),
    closures: [
      closure({
        id: "eligible",
        snapshots: [
          { propertyId: "property-c", checksum: "checksum-c" },
          { propertyId: "property-a", checksum: "checksum-a" },
          { propertyId: "property-b", checksum: "checksum-b-new" },
        ],
      }),
    ],
    existingSnapshots: [
      {
        propertyId: "property-a",
        competence: "2026-03-01",
        checksum: "checksum-a",
      },
      {
        propertyId: "property-b",
        competence: "2026-03-01",
        checksum: "checksum-b-old",
      },
    ],
  })

  assert.deepEqual(
    plan.operations.map(({ key, kind, checksum }) => ({ key, kind, checksum })),
    [
      {
        key: "property-a|2026-03-01",
        kind: "skip",
        checksum: "checksum-a",
      },
      {
        key: "property-b|2026-03-01",
        kind: "update",
        checksum: "checksum-b-new",
      },
      {
        key: "property-c|2026-03-01",
        kind: "insert",
        checksum: "checksum-c",
      },
    ],
  )
  assert.deepEqual(
    plan.executableWrites.map(({ table, kind, key }) => ({ table, kind, key })),
    [
      {
        table: "imovel_competencias",
        kind: "update",
        key: "property-b|2026-03-01",
      },
      {
        table: "imovel_competencias",
        kind: "insert",
        key: "property-c|2026-03-01",
      },
    ],
  )
  assert.deepEqual(plan.touchedTables, ["imovel_competencias"])
  assert.deepEqual(plan.sourceTablesTouched, [])
})

test("segunda execucao mantem checksums e nao cria escritas ou chaves duplicadas", () => {
  const candidates = [
    closure({
      id: "eligible",
      snapshots: [
        { propertyId: "property-b", checksum: "checksum-b" },
        { propertyId: "property-a", checksum: "checksum-a" },
      ],
    }),
  ]
  const existingSnapshots = [
    {
      propertyId: "property-a",
      competence: "2026-03-01",
      checksum: "checksum-a",
    },
    {
      propertyId: "property-b",
      competence: "2026-03-01",
      checksum: "checksum-b",
    },
  ]
  const plan = buildBackfillPlan({
    options: parseBackfillArgs(["--commit"]),
    closures: candidates,
    existingSnapshots,
  })

  assert.deepEqual(plan.operations.map((operation) => operation.kind), ["skip", "skip"])
  assert.deepEqual(plan.operations.map((operation) => operation.checksum), [
    "checksum-a",
    "checksum-b",
  ])
  assert.equal(new Set(plan.operations.map((operation) => operation.key)).size, 2)
  assert.deepEqual(plan.executableWrites, [])
  assert.deepEqual(plan.touchedTables, [])
})

test("preserva snapshot nativo de processamento em vez de substitui-lo por backfill", () => {
  const plan = buildBackfillPlan({
    options: parseBackfillArgs(["--commit"]),
    closures: [
      closure({
        id: "eligible",
        snapshots: [{ propertyId: "property-a", checksum: "checksum-backfill" }],
      }),
    ],
    existingSnapshots: [
      {
        propertyId: "property-a",
        competence: "2026-03-01",
        checksum: "checksum-processamento",
        origin: "processamento",
      },
    ],
  })

  assert.deepEqual(
    plan.operations.map(({ kind, checksum }) => ({ kind, checksum })),
    [{ kind: "skip", checksum: "checksum-processamento" }],
  )
  assert.deepEqual(plan.executableWrites, [])
})

test("rejeita duas propostas para a mesma chave mensal", () => {
  const duplicate = closure({
    id: "duplicate",
    snapshots: [
      { propertyId: "property-a", checksum: "checksum-first" },
      { propertyId: "property-a", checksum: "checksum-second" },
    ],
  })

  assert.throws(
    () =>
      buildBackfillPlan({
        options: parseBackfillArgs([]),
        closures: [duplicate],
        existingSnapshots: [],
      }),
    /duplicad/i,
  )
})
