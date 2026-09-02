import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

// Teste de contrato (CA27, camada 3): nenhum arquivo novo pode consumir
// `acordos_rescisoes_recebidos` sem passar pelo módulo canônico. Quem entrar
// na allowlist precisa consumir via resolverRecebimento*/normalizarItemLegado
// ou ser produtor/definidor de schema — nunca reimplementar fórmula financeira.
const ALLOWLIST = new Set([
  // Módulo canônico e definição de schema
  "lib/prestacao-types.ts",
  // Produtores (extração/prompt/schema de saída)
  "lib/server/excel-parser.ts",
  "lib/server/cesar-rego-parser.ts",
  "lib/server/analyze-prestacao.ts",
  "lib/server/ai-agents/prestacao-alive-agent.ts",
  "lib/server/prestacao-workflow.ts",
  "lib/server/indicadores.ts",
  // Consumidores migrados para o resolvedor canônico
  "lib/fechamento-operacional.ts",
  "lib/indicadores-aggregation.ts",
  "lib/server/indicadores-snapshots.ts",
  "lib/server/package-rechecks.ts",
  "lib/server/persist-package.ts",
  "lib/server/imovel-historico.ts",
  "components/acr/views/revisao-view.tsx",
  // Reconciliação de despesas: lê comissão de intermediação de itens já
  // filtrados pelo gate fail-closed do validatePackage (roda pós-partição).
  "lib/despesas-locador.ts",
  // Verificador read-only da equação do repasse sobre o estado persistido:
  // lê os itens do JSON e resolve a comissão por resolverRecebimentosLegados.
  "scripts/verify-reconciliacao-repasse.ts",
  // Usos não financeiros (eventos de rescisão, dedup, chaves, sincronização)
  "lib/server/acordos.ts",
  "lib/server/sync-imoveis.ts",
  // Scripts de reparo/backfill (auditados por ciclo próprio, dry-run por padrão)
  "scripts/backfill-alive-consolidado.ts",
  "scripts/backfill-historico.ts",
  "scripts/repair-indicadores-confiabilidade.ts",
  "scripts/verify-indicadores-snapshots.ts",
  // Verificador de consistencia entre telas: consome via resolverRecebimentosLegados
  // justamente para comparar os dois caminhos com a mesma resolucao.
  "scripts/verify-consistencia-telas.ts",
  // Reprocessamento por planilha: usa o resolvedor para o relatorio antes/depois.
  "scripts/reprocessar-planilha.ts",
])

function grepFiles(pattern: string): string[] {
  try {
    const output = execFileSync(
      "grep",
      ["-rl", pattern, "--include=*.ts", "--include=*.tsx", "lib", "components", "app", "scripts"],
      { encoding: "utf8" },
    )
    return output.split("\n").filter(Boolean)
  } catch (error) {
    const failure = error as { status?: number; stdout?: string }
    if (failure.status === 1) return []
    throw error
  }
}

test("acordos_rescisoes_recebidos so e consumido por arquivos da allowlist", () => {
  const files = grepFiles("acordos_rescisoes_recebidos").filter(
    (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
  )
  const foraDaAllowlist = files.filter((file) => !ALLOWLIST.has(file))
  assert.deepEqual(
    foraDaAllowlist,
    [],
    `Arquivo novo consumindo acordos_rescisoes_recebidos fora da allowlist. ` +
      `Use lib/recebimentos-extraordinarios.ts (resolverRecebimento*) e adicione o arquivo aqui com justificativa.`,
  )
})

test("o resolvedor legado de intermediacao nao voltou a existir fora do modulo canonico", () => {
  const files = grepFiles("calcularIntermediacao").filter((file) => !file.endsWith(".test.ts"))
  assert.deepEqual(files, [])
})
