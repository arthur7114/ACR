/**
 * Calcula SHA-256 dos documentos já armazenados e materializa as fontes
 * reutilizáveis. Dry-run é o padrão; use --commit somente após revisar o plano.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-document-hashes.ts
 *   node --env-file=.env.local --import tsx scripts/backfill-document-hashes.ts --commit
 */
import { createHash } from "node:crypto"
import { createSupabaseAdmin } from "../lib/server/supabase"

const BUCKET = "fechamento-documentos"

interface DocumentRow {
  id: string
  fechamento_id: string
  arquivo_url: string
  nome_arquivo: string
  mime_type: string
  tamanho_bytes: number
  criado_em: string
}

export interface HashedDocument extends DocumentRow {
  sha256: string
  tamanho_real: number
}

export interface DocumentHashPlanItem extends HashedDocument {
  fonte_arquivo_url: string
  duplicado_de_id: string | null
}

export function buildDocumentHashPlan(
  documents: HashedDocument[],
): DocumentHashPlanItem[] {
  const byHash = groupBy(documents, (document) => document.sha256)
  const plan: DocumentHashPlanItem[] = []

  for (const group of byHash.values()) {
    const ordered = [...group].sort(compareDocumentAge)
    const sourcePath = ordered[0].arquivo_url
    const byClosing = groupBy(
      ordered,
      (document) => document.fechamento_id,
    )

    for (const closingDocuments of byClosing.values()) {
      const [canonical, ...duplicates] = closingDocuments.sort(compareDocumentAge)
      plan.push({
        ...canonical,
        fonte_arquivo_url: sourcePath,
        duplicado_de_id: null,
      })
      plan.push(
        ...duplicates.map((document) => ({
          ...document,
          fonte_arquivo_url: sourcePath,
          duplicado_de_id: canonical.id,
        })),
      )
    }
  }

  return plan.sort(compareDocumentAge)
}

async function main() {
  const shouldCommit = process.argv.includes("--commit")
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("documentos_fechamento")
    .select(
      "id,fechamento_id,arquivo_url,nome_arquivo,mime_type,tamanho_bytes,criado_em",
    )
    .order("criado_em", { ascending: true })
    .order("id", { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as DocumentRow[]
  const downloadCache = new Map<string, Buffer>()
  const failures: Array<{ id: string; arquivo: string; erro: string }> = []
  const hashed: HashedDocument[] = []

  for (const row of rows) {
    try {
      const buffer = await downloadDocument(
        supabase,
        row.arquivo_url,
        downloadCache,
      )
      hashed.push({
        ...row,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        tamanho_real: buffer.byteLength,
      })
    } catch (caught) {
      failures.push({
        id: row.id,
        arquivo: row.nome_arquivo,
        erro: caught instanceof Error ? caught.message : String(caught),
      })
    }
  }

  const plan = buildDocumentHashPlan(hashed)
  const duplicateCount = plan.filter(
    (document) => document.duplicado_de_id !== null,
  ).length
  const sourceCount = new Set(plan.map((document) => document.sha256)).size

  console.log(
    JSON.stringify(
      {
        modo: shouldCommit ? "commit" : "dry-run",
        documentos_encontrados: rows.length,
        documentos_hash_calculado: hashed.length,
        fontes_unicas: sourceCount,
        redundancias_no_mesmo_fechamento: duplicateCount,
        falhas: failures,
        alteracoes: plan.map((document) => ({
          documento_id: document.id,
          fechamento_id: document.fechamento_id,
          sha256: document.sha256,
          fonte: document.fonte_arquivo_url,
          duplicado_de_id: document.duplicado_de_id,
        })),
      },
      null,
      2,
    ),
  )

  if (!shouldCommit) return
  if (failures.length > 0) {
    throw new Error(
      "Commit bloqueado: nem todos os documentos puderam ser verificados.",
    )
  }

  await applyDocumentHashPlan(supabase, plan)
  console.log(
    `Backfill concluído: ${plan.length} documentos, ${sourceCount} fontes e ${duplicateCount} redundâncias preservadas.`,
  )
}

async function downloadDocument(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  storagePath: string,
  cache: Map<string, Buffer>,
) {
  const cached = cache.get(storagePath)
  if (cached) return cached

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)
  if (error) throw error

  const buffer = Buffer.from(await data.arrayBuffer())
  cache.set(storagePath, buffer)
  return buffer
}

async function applyDocumentHashPlan(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  plan: DocumentHashPlanItem[],
) {
  const sourceIds = new Map<string, string>()
  for (const group of groupBy(plan, (item) => item.sha256).values()) {
    const sourceDocument = group[0]
    const { data, error } = await supabase
      .from("documento_fontes")
      .upsert(
        {
          sha256: sourceDocument.sha256,
          arquivo_url: sourceDocument.fonte_arquivo_url,
          mime_type: sourceDocument.mime_type,
          tamanho_bytes: sourceDocument.tamanho_real,
        },
        { onConflict: "sha256" },
      )
      .select("id")
      .single()

    if (error) throw error
    sourceIds.set(sourceDocument.sha256, data.id as string)
  }

  const duplicatesFirst = [...plan].sort(
    (left, right) =>
      Number(right.duplicado_de_id !== null)
      - Number(left.duplicado_de_id !== null),
  )

  for (const document of duplicatesFirst) {
    const { error } = await supabase
      .from("documentos_fechamento")
      .update({
        sha256: document.sha256,
        fonte_id: sourceIds.get(document.sha256),
        duplicado_de_id: document.duplicado_de_id,
      })
      .eq("id", document.id)

    if (error) throw error
  }
}

function compareDocumentAge(left: DocumentRow, right: DocumentRow) {
  return (
    left.criado_em.localeCompare(right.criado_em)
    || left.id.localeCompare(right.id)
  )
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
) {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const key = getKey(value)
    const group = groups.get(key)
    if (group) group.push(value)
    else groups.set(key, [value])
  }
  return groups
}

if (process.argv[1]?.endsWith("backfill-document-hashes.ts")) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
