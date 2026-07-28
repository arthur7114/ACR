import assert from "node:assert/strict"
import test from "node:test"
import type { ClassifiedDocument } from "@/lib/prestacao-types"
import {
  buildDocumentStoragePath,
  calculateDocumentSha256,
  persistDocuments,
  type PackageFileForPersistence,
} from "./persist-package.ts"
import type { createSupabaseAdmin } from "./supabase.ts"

interface StoredDocument {
  id: string
  fechamento_id: string
  arquivo_url: string
  sha256?: string
  duplicado_de_id?: string | null
}

interface StoredSource {
  id: string
  sha256: string
  arquivo_url: string
}

function createFakeSupabase() {
  const documents: StoredDocument[] = []
  const sources: StoredSource[] = []
  const uploadedPaths = new Set<string>()
  let documentSequence = 0
  let sourceSequence = 0

  function selectRows(table: string, filters: Record<string, unknown>) {
    const rows = table === "documentos_fechamento" ? documents : sources
    return rows.filter((row) =>
      Object.entries(filters).every(
        ([key, value]) => row[key as keyof typeof row] === value,
      ),
    )
  }

  function createSelectBuilder(table: string) {
    const filters: Record<string, unknown> = {}
    const builder = {
      eq(key: string, value: unknown) {
        filters[key] = value
        return builder
      },
      is(key: string, value: unknown) {
        filters[key] = value
        return builder
      },
      limit() {
        return builder
      },
      async maybeSingle() {
        return {
          data: selectRows(table, filters)[0] ?? null,
          error: null,
        }
      },
    }
    return builder
  }

  const client = {
    from(table: string) {
      return {
        select() {
          return createSelectBuilder(table)
        },
        insert(input: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  if (table === "documento_fontes") {
                    const existing = sources.find(
                      (source) => source.sha256 === input.sha256,
                    )
                    if (existing) {
                      return {
                        data: null,
                        error: { code: "23505", message: "duplicate source" },
                      }
                    }
                    const source = {
                      ...input,
                      id: `source-${++sourceSequence}`,
                    } as unknown as StoredSource
                    sources.push(source)
                    return { data: source, error: null }
                  }

                  const existing = documents.find(
                    (document) =>
                      document.fechamento_id === input.fechamento_id
                      && document.sha256 === input.sha256
                      && document.duplicado_de_id === null,
                  )
                  if (existing) {
                    return {
                      data: null,
                      error: { code: "23505", message: "duplicate document" },
                    }
                  }
                  const document = {
                    ...input,
                    id: `document-${++documentSequence}`,
                  } as unknown as StoredDocument
                  documents.push(document)
                  return { data: document, error: null }
                },
              }
            },
          }
        },
      }
    },
    storage: {
      from() {
        return {
          async upload(path: string) {
            if (uploadedPaths.has(path)) {
              return {
                data: null,
                error: { statusCode: 409, message: "already exists" },
              }
            }
            uploadedPaths.add(path)
            return { data: { path }, error: null }
          },
        }
      },
    },
  }

  return {
    client: client as unknown as ReturnType<typeof createSupabaseAdmin>,
    documents,
    sources,
    uploadedPaths,
  }
}

function packageFile(contents = "mesmo-pdf"): PackageFileForPersistence {
  const fileBuffer = Buffer.from(contents)
  return {
    fileName: "fechamento.pdf",
    fileType: "application/pdf",
    fileSize: fileBuffer.byteLength,
    fileBuffer,
    classification: {
      fileName: "fechamento.pdf",
      documentType: "prestacao_contas",
      confidence: 1,
      reason: "Assinatura PDF válida.",
      storagePath: null,
      documentoId: null,
    } as ClassifiedDocument,
  }
}

test("hash e caminho documental são determinísticos e não dependem do nome", () => {
  const sha256 = calculateDocumentSha256(Buffer.from("conteudo"))

  assert.match(sha256, /^[0-9a-f]{64}$/)
  assert.equal(
    buildDocumentStoragePath(sha256),
    `fontes/sha256/${sha256.slice(0, 2)}/${sha256}`,
  )
})

test("upload repetido no mesmo fechamento é idempotente", async () => {
  const database = createFakeSupabase()
  const file = packageFile()
  const persisted = await persistDocuments({
    supabase: database.client,
    fechamentoId: "fechamento-1",
    files: [file, file],
  })

  assert.equal(database.sources.length, 1)
  assert.equal(database.documents.length, 1)
  assert.equal(database.uploadedPaths.size, 1)
  assert.equal(persisted[0].documentoId, persisted[1].documentoId)
})

test("mesma fonte é reutilizada sem compartilhar o documento do fechamento", async () => {
  const database = createFakeSupabase()
  const file = packageFile()

  const [first] = await persistDocuments({
    supabase: database.client,
    fechamentoId: "fechamento-1",
    files: [file],
  })
  const [second] = await persistDocuments({
    supabase: database.client,
    fechamentoId: "fechamento-2",
    files: [file],
  })

  assert.equal(database.sources.length, 1)
  assert.equal(database.documents.length, 2)
  assert.equal(database.uploadedPaths.size, 1)
  assert.notEqual(first.documentoId, second.documentoId)
  assert.equal(first.storagePath, second.storagePath)
  assert.deepEqual(
    database.documents.map((document) => document.fechamento_id),
    ["fechamento-1", "fechamento-2"],
  )
})
