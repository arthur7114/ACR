import assert from "node:assert/strict"
import test from "node:test"
import { formatReference } from "./presentation.ts"

test("apresenta referência financeira mensal e dia isolado sem ambiguidade", () => {
  assert.equal(formatReference("2026-05"), "05/2026")
  assert.equal(formatReference("2026-05-10"), "05/2026")
  assert.equal(formatReference("10"), "Dia 10")
  assert.equal(formatReference("dia 08"), "Dia 8")
  assert.equal(formatReference(null), "—")
})
