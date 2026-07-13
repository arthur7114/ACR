import assert from "node:assert/strict"
import test from "node:test"
import { verifyIndicadoresSnapshots } from "./verify-indicadores-snapshots.ts"

const EXPECTED_PROPERTIES = [
  { propertyId: "property-a", competence: "2026-03-01" },
  { propertyId: "property-b", competence: "2026-03-01" },
  { propertyId: "property-c", competence: "2026-03-01" },
]

function snapshot(input: {
  id: string
  propertyId: string
  checksum?: string
  expectedChecksum?: string
}) {
  return {
    id: input.id,
    propertyId: input.propertyId,
    competence: "2026-03-01",
    checksum: input.checksum ?? `checksum-${input.propertyId}`,
    expectedChecksum: input.expectedChecksum ?? `checksum-${input.propertyId}`,
  }
}

test("confirma cobertura, unicidade, checksums, reconciliacao e fontes intactas", () => {
  const report = verifyIndicadoresSnapshots({
    expectedProperties: EXPECTED_PROPERTIES,
    snapshots: [
      snapshot({ id: "snapshot-a", propertyId: "property-a" }),
      snapshot({ id: "snapshot-b", propertyId: "property-b" }),
      snapshot({ id: "snapshot-c", propertyId: "property-c" }),
    ],
    reconciliations: [
      {
        closureId: "closure-a",
        totalRevenue: 1_000,
        administrationCommission: 70,
        retainedExpenses: 20,
        intermediationCommission: 10,
        assessedTransfer: 900,
      },
      {
        closureId: "closure-tolerance",
        totalRevenue: 1_000,
        administrationCommission: 70,
        retainedExpenses: 20,
        intermediationCommission: 10,
        assessedTransfer: 899.99,
      },
    ],
    sourceFingerprints: {
      before: {
        fechamentos: { count: 2, checksum: "source-closures" },
        imoveis: { count: 3, checksum: "source-properties" },
      },
      after: {
        fechamentos: { count: 2, checksum: "source-closures" },
        imoveis: { count: 3, checksum: "source-properties" },
      },
    },
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.coverage, {
    expected: 3,
    available: 3,
    percentage: 100,
    missingKeys: [],
  })
  assert.deepEqual(report.duplicates, { count: 0, keys: [] })
  assert.deepEqual(report.checksums, { checked: 3, invalidKeys: [] })
  assert.deepEqual(report.reconciliation, { checked: 2, failures: [] })
  assert.deepEqual(report.sources, { unchanged: true, differences: [] })
})

test("relata duplicidade e cobertura usando a chave imovel mais competencia", () => {
  const report = verifyIndicadoresSnapshots({
    expectedProperties: EXPECTED_PROPERTIES,
    snapshots: [
      snapshot({ id: "snapshot-a-1", propertyId: "property-a" }),
      snapshot({ id: "snapshot-a-2", propertyId: "property-a" }),
      snapshot({ id: "snapshot-b", propertyId: "property-b" }),
    ],
    reconciliations: [],
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.coverage, {
    expected: 3,
    available: 2,
    percentage: 66.67,
    missingKeys: ["property-c|2026-03-01"],
  })
  assert.deepEqual(report.duplicates, {
    count: 1,
    keys: ["property-a|2026-03-01"],
  })
})

test("relata checksum divergente sem tratar ausencia como checksum valido", () => {
  const report = verifyIndicadoresSnapshots({
    expectedProperties: EXPECTED_PROPERTIES.slice(0, 2),
    snapshots: [
      snapshot({ id: "snapshot-a", propertyId: "property-a" }),
      snapshot({
        id: "snapshot-b",
        propertyId: "property-b",
        checksum: "checksum-stale",
        expectedChecksum: "checksum-recomputed",
      }),
    ],
    reconciliations: [],
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.checksums, {
    checked: 2,
    invalidKeys: ["property-b|2026-03-01"],
  })
})

test("aceita residuo de ate um centavo e bloqueia diferenca maior", () => {
  const report = verifyIndicadoresSnapshots({
    expectedProperties: [],
    snapshots: [],
    reconciliations: [
      {
        closureId: "within-tolerance",
        totalRevenue: 100,
        administrationCommission: 10,
        retainedExpenses: 10,
        intermediationCommission: 10,
        assessedTransfer: 69.99,
      },
      {
        closureId: "outside-tolerance",
        totalRevenue: 100,
        administrationCommission: 10,
        retainedExpenses: 10,
        intermediationCommission: 10,
        assessedTransfer: 69.98,
      },
    ],
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.reconciliation, {
    checked: 2,
    failures: [{ closureId: "outside-tolerance", residual: 0.02 }],
  })
})

test("detecta qualquer alteracao de contagem ou checksum nas tabelas-fonte", () => {
  const report = verifyIndicadoresSnapshots({
    expectedProperties: [],
    snapshots: [],
    reconciliations: [],
    sourceFingerprints: {
      before: {
        fechamentos: { count: 2, checksum: "closures-before" },
        imoveis: { count: 3, checksum: "properties" },
      },
      after: {
        fechamentos: { count: 3, checksum: "closures-after" },
        imoveis: { count: 3, checksum: "properties" },
      },
    },
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.sources, {
    unchanged: false,
    differences: ["fechamentos"],
  })
})
