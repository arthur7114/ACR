import assert from "node:assert/strict"
import test from "node:test"
import { prestacaoJsonSchema } from "./analyze-prestacao.ts"

test("schema estrito exige todas as propriedades declaradas", () => {
  assert.ok(prestacaoJsonSchema && typeof prestacaoJsonSchema === "object")
  assertStrictObjectSchema(prestacaoJsonSchema)
})

function assertStrictObjectSchema(value: unknown): void {
  if (!value || typeof value !== "object") return
  const schema = value as {
    type?: unknown
    properties?: Record<string, unknown>
    required?: unknown
    items?: unknown
  }

  if (schema.type === "object" && schema.properties) {
    assert.deepEqual(
      [...(Array.isArray(schema.required) ? schema.required : [])].sort(),
      Object.keys(schema.properties).sort(),
    )
    Object.values(schema.properties).forEach(assertStrictObjectSchema)
  }
  if (schema.items) assertStrictObjectSchema(schema.items)
}
