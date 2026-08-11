import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  deriveContracts,
  fimParaBanco,
  type ContratoDerivado,
  type SnapshotMes,
} from "../lib/contratos-derive"
import { isImovelAirbnb } from "../lib/indicadores-domain"

const PAGE_SIZE = 1_000

export interface BackfillImovel {
  id: string
  tipo: string | null
  inquilino_nome?: string | null
}

export interface BackfillSnapshotRow {
  imovel_id: string
  competencia: string
  status_ocupacao: "ocupado" | "inadimplente" | "vago" | "em_rescisao" | "desconhecido"
  inquilino_nome: string | null
  aluguel_competencia: number | null
  aluguel_recebido: number | null
  atrasos_recuperados: number | null
  outros_recebimentos: number | null
  competencia_original: string | null
  /** Origem do atraso recuperado; ver migration 202608070002. */
  atrasos_competencia_origem?: string | null
  /** Aluguel contratado conhecido no cadastro (vigencia > imoveis). */
  aluguel_esperado?: number | null
}

export interface BackfillContratoRow {
  id: string
  imovel_id: string
  locatario_nome: string
  inicio: string
  fim: string | null
  origem: "backfill"
  ativo: true
}

export interface BackfillValorRow {
  contrato_id: string
  vigencia_inicio: string
  valor: number
  origem: "inferido"
}

export type BackfillRubrica = "aluguel" | "outros"

export interface BackfillLancamentoRow {
  imovel_id: string
  contrato_id: string | null
  fechamento_id: null
  rubrica: BackfillRubrica
  valor: number
  /** Nulo = mês de origem anterior não informado; nunca igual ao recebimento. */
  competencia_origem: string | null
  competencia_recebimento: string | null
  situacao: "recebido" | "em_aberto"
  descricao: string | null
  origem: "backfill"
}

export interface BackfillRows {
  contratos: BackfillContratoRow[]
  valores: BackfillValorRow[]
  lancamentos: BackfillLancamentoRow[]
}

type ContratoComId = ContratoDerivado & { id: string }

/**
 * Monta as linhas de `contratos_locacao`, `contrato_valores` e
 * `lancamentos_competencia` a partir do histórico de ocupação mensal.
 * Função pura: nenhuma chamada de I/O.
 *
 * Regras:
 * 1. Lê `imoveis` (com `tipo`) e `imovel_competencias` completo (feito pelo
 *    chamador em `main()`; esta função só recebe os dois arrays já carregados).
 * 2. Agrupa snapshots por `imovel_id`; Airbnb (`isImovelAirbnb`) sempre vira
 *    `alugado_app`, nunca gera contrato nem lançamento.
 * 3. `deriveContracts` roda por imóvel — nunca com snapshots de imóveis
 *    diferentes agrupados juntos.
 * 4. Cada snapshot pode gerar até 4 lançamentos: aluguel recebido no mês,
 *    aluguel em aberto (se inadimplente), atraso recuperado, e outros
 *    recebimentos — ver `supabase/migrations/202608050001_contratos_locacao.sql`
 *    para os campos de cada um.
 * 5. Todo lançamento é ligado (`contrato_id`) ao contrato cujo intervalo
 *    contém sua `competencia_origem` (D14) via `encontrarContrato`.
 */
export function buildBackfillRows(
  imoveis: BackfillImovel[],
  snapshots: BackfillSnapshotRow[],
): BackfillRows {
  const imovelPorId = new Map(imoveis.map((imovel) => [imovel.id, imovel]))
  const snapshotsPorImovel = new Map<string, BackfillSnapshotRow[]>()
  for (const snapshot of snapshots) {
    const lista = snapshotsPorImovel.get(snapshot.imovel_id) ?? []
    lista.push(snapshot)
    snapshotsPorImovel.set(snapshot.imovel_id, lista)
  }

  const contratos: BackfillContratoRow[] = []
  const valores: BackfillValorRow[] = []
  const lancamentos: BackfillLancamentoRow[] = []

  for (const [imovelId, imovelSnapshots] of snapshotsPorImovel) {
    const imovel = imovelPorId.get(imovelId)
    const isAirbnb = isImovelAirbnb(imovel?.tipo, imovel?.inquilino_nome)

    // Regra 2: statusOcupacao vem de status_ocupacao; Airbnb sempre vira alugado_app.
    const snapshotsMeses: SnapshotMes[] = imovelSnapshots.map((snapshot) => ({
      competencia: snapshot.competencia,
      statusOcupacao: isAirbnb ? "alugado_app" : snapshot.status_ocupacao,
      inquilinoNome: snapshot.inquilino_nome,
      aluguelCompetencia: snapshot.aluguel_competencia,
      aluguelRecebido: snapshot.aluguel_recebido,
    }))

    // Regra 3: deriveContracts por imóvel.
    const contratosDoImovel: ContratoComId[] = deriveContracts(snapshotsMeses).map(
      (contrato) => ({ ...contrato, id: randomUUID() }),
    )

    for (const contrato of contratosDoImovel) {
      contratos.push({
        id: contrato.id,
        imovel_id: imovelId,
        locatario_nome: contrato.locatarioNome,
        inicio: contrato.inicio,
        fim: fimParaBanco(contrato.fim),
        origem: "backfill",
        ativo: true,
      })
      for (const valor of contrato.valores) {
        valores.push({
          contrato_id: contrato.id,
          vigencia_inicio: valor.vigenciaInicio,
          valor: valor.valor,
          origem: "inferido",
        })
      }
    }

    // Regra 4: lançamentos por snapshot, ligados ao contrato vigente na
    // competência de origem (regra 5 / D14).
    for (let index = 0; index < imovelSnapshots.length; index += 1) {
      const raw = imovelSnapshots[index]
      const statusEfetivo = snapshotsMeses[index].statusOcupacao

      if ((raw.aluguel_competencia ?? 0) > 0) {
        lancamentos.push(
          criarLancamento({
            imovelId,
            contratos: contratosDoImovel,
            rubrica: "aluguel",
            valor: raw.aluguel_competencia as number,
            competenciaOrigem: raw.competencia,
            competenciaRecebimento: raw.competencia,
            situacao: "recebido",
          }),
        )
      }

      if (statusEfetivo === "inadimplente" && (raw.aluguel_competencia ?? 0) === 0) {
        const contrato = encontrarContrato(contratosDoImovel, raw.competencia)
        const valorVigenteContrato = contrato
          ? valorVigente(contrato, raw.competencia)
          : undefined
        // O aluguel esperado do cadastro tem prioridade sobre o valor inferido do
        // contrato: descreve quanto a unidade DEVERIA pagar, enquanto o valor
        // inferido pode vir do recebido (com garagem/encargos embutidos) para
        // quem paga sempre atrasado e nunca tem aluguel de competencia proprio.
        // So recorre ao contrato quando o cadastro nao traz o valor.
        const valorEmAberto =
          (raw.aluguel_esperado ?? 0) > 0
            ? (raw.aluguel_esperado as number)
            : valorVigenteContrato?.valor
        if (contrato && valorEmAberto) {
          lancamentos.push({
            imovel_id: imovelId,
            contrato_id: contrato.id,
            fechamento_id: null,
            rubrica: "aluguel",
            valor: valorEmAberto,
            competencia_origem: raw.competencia,
            competencia_recebimento: null,
            situacao: "em_aberto",
            descricao: null,
            origem: "backfill",
          })
        }
      }

      if ((raw.atrasos_recuperados ?? 0) > 0) {
        // A origem do atraso tem campo próprio: `atrasos_competencia_origem`
        // (vem do acordo ou da linha de competência anterior). `competencia_original`
        // descreve o ALUGUEL da linha, não o atraso — quando o atraso vem de um
        // acordo, esse campo traz a própria competência corrente, e reaproveitá-lo
        // fazia o atraso nascer com origem igual ao recebimento, virando aluguel
        // do mês e desaparecendo da recuperação de atrasados. Fica como último
        // recurso, e somente se for estritamente anterior.
        const competenciaOrigem =
          raw.atrasos_competencia_origem
          ?? (raw.competencia_original !== null && raw.competencia_original < raw.competencia
            ? raw.competencia_original
            : null)
        lancamentos.push(
          criarLancamento({
            imovelId,
            contratos: contratosDoImovel,
            rubrica: "aluguel",
            valor: raw.atrasos_recuperados as number,
            competenciaOrigem,
            competenciaRecebimento: raw.competencia,
            situacao: "recebido",
            descricao: "Atraso recuperado",
          }),
        )
      }

      if ((raw.outros_recebimentos ?? 0) > 0) {
        lancamentos.push(
          criarLancamento({
            imovelId,
            contratos: contratosDoImovel,
            rubrica: "outros",
            valor: raw.outros_recebimentos as number,
            competenciaOrigem: raw.competencia,
            competenciaRecebimento: raw.competencia,
            situacao: "recebido",
          }),
        )
      }
    }
  }

  return { contratos, valores, lancamentos }
}

function criarLancamento(input: {
  imovelId: string
  contratos: ContratoComId[]
  rubrica: BackfillRubrica
  /** Nulo = pertence a mês anterior não informado (atraso vindo de acordo). */
  competenciaOrigem: string | null
  valor: number
  competenciaRecebimento: string
  situacao: "recebido"
  descricao?: string
}): BackfillLancamentoRow {
  // Sem mês de origem, o contrato vinculado é o vigente quando o dinheiro
  // entrou — é o único vínculo que os dados sustentam.
  const contrato = encontrarContrato(
    input.contratos,
    input.competenciaOrigem ?? input.competenciaRecebimento,
  )
  return {
    imovel_id: input.imovelId,
    contrato_id: contrato?.id ?? null,
    fechamento_id: null,
    rubrica: input.rubrica,
    valor: input.valor,
    competencia_origem: input.competenciaOrigem,
    competencia_recebimento: input.competenciaRecebimento,
    situacao: input.situacao,
    descricao: input.descricao ?? null,
    origem: "backfill",
  }
}

// Regra 5 (D14): o contrato cujo intervalo [inicio, fim) contém a data.
function encontrarContrato(
  contratos: ContratoComId[],
  data: string,
): ContratoComId | undefined {
  return contratos.find(
    (contrato) => contrato.inicio <= data && (contrato.fim === null || data < contrato.fim),
  )
}

// Valor vigente do contrato na data: a última vigência com início <= data.
function valorVigente(
  contrato: ContratoComId,
  data: string,
): ContratoDerivado["valores"][number] | undefined {
  const conhecidos = contrato.valores.filter((valor) => valor.vigenciaInicio <= data)
  if (conhecidos.length === 0) return undefined
  return conhecidos.reduce((maisRecente, valor) =>
    valor.vigenciaInicio > maisRecente.vigenciaInicio ? valor : maisRecente,
  )
}

// --- I/O (Supabase) ---------------------------------------------------------

interface DatabaseImovelRow {
  id: string
  tipo: string | null
  inquilino_nome: string | null
  ativo: boolean
  empreendimento_id: string
  empreendimentos: { nome: string } | { nome: string }[] | null
}

interface DatabaseSnapshotRow {
  imovel_id: string
  competencia: string
  status_ocupacao: BackfillSnapshotRow["status_ocupacao"]
  inquilino_nome: string | null
  aluguel_competencia: number | string | null
  aluguel_recebido: number | string | null
  atrasos_recuperados: number | string | null
  outros_recebimentos: number | string | null
  competencia_original: string | null
  atrasos_competencia_origem: string | null
  aluguel_esperado: number | string | null
}

type SupabaseAdmin = ReturnType<typeof import("../lib/server/supabase")["createSupabaseAdmin"]>

async function loadAllRows<T>(
  supabase: SupabaseAdmin,
  table: string,
  columns: string,
  orderColumn: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

function toNumberOrNull(value: number | string | null) {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Valor monetário inválido: ${value}.`)
  return parsed
}

function empreendimentoNome(value: DatabaseImovelRow["empreendimentos"]) {
  const relation = Array.isArray(value) ? value[0] : value
  return relation?.nome ?? "Empreendimento desconhecido"
}

async function loadImoveis(supabase: SupabaseAdmin) {
  return loadAllRows<DatabaseImovelRow>(
    supabase,
    "imoveis",
    "id,tipo,inquilino_nome,ativo,empreendimento_id,empreendimentos(nome)",
    "id",
  )
}

async function loadSnapshots(supabase: SupabaseAdmin) {
  const raw = await loadAllRows<DatabaseSnapshotRow>(
    supabase,
    "imovel_competencias",
    "imovel_id,competencia,status_ocupacao,inquilino_nome,aluguel_competencia,aluguel_recebido,atrasos_recuperados,outros_recebimentos,competencia_original,atrasos_competencia_origem,aluguel_esperado",
    "imovel_id",
  )
  return raw.map((row) => ({
    imovel_id: row.imovel_id,
    competencia: row.competencia,
    status_ocupacao: row.status_ocupacao,
    inquilino_nome: row.inquilino_nome,
    aluguel_competencia: toNumberOrNull(row.aluguel_competencia),
    aluguel_recebido: toNumberOrNull(row.aluguel_recebido),
    atrasos_recuperados: toNumberOrNull(row.atrasos_recuperados),
    outros_recebimentos: toNumberOrNull(row.outros_recebimentos),
    competencia_original: row.competencia_original,
    atrasos_competencia_origem: row.atrasos_competencia_origem,
    aluguel_esperado: toNumberOrNull(row.aluguel_esperado),
  }))
}

function printSummary(imoveis: DatabaseImovelRow[], rows: BackfillRows) {
  const nomePorEmpreendimento = new Map<string, string>()
  const empreendimentoPorImovel = new Map<string, string>()
  const airbnbImoveis = new Set<string>()
  const ativosImoveis = new Set<string>()
  for (const imovel of imoveis) {
    empreendimentoPorImovel.set(imovel.id, imovel.empreendimento_id)
    nomePorEmpreendimento.set(imovel.empreendimento_id, empreendimentoNome(imovel.empreendimentos))
    if (isImovelAirbnb(imovel.tipo, imovel.inquilino_nome)) airbnbImoveis.add(imovel.id)
    if (imovel.ativo) ativosImoveis.add(imovel.id)
  }

  type Contagem = { contratos: number; valores: number; lancamentos: number; airbnb: number }
  const porEmpreendimento = new Map<string, Contagem>()
  const empty = (): Contagem => ({ contratos: 0, valores: 0, lancamentos: 0, airbnb: 0 })

  const contratoPorId = new Map(rows.contratos.map((contrato) => [contrato.id, contrato]))

  for (const contrato of rows.contratos) {
    const empreendimentoId = empreendimentoPorImovel.get(contrato.imovel_id) ?? "desconhecido"
    const contagem = porEmpreendimento.get(empreendimentoId) ?? empty()
    contagem.contratos += 1
    porEmpreendimento.set(empreendimentoId, contagem)
  }
  for (const valor of rows.valores) {
    const contrato = contratoPorId.get(valor.contrato_id)
    const empreendimentoId = contrato
      ? empreendimentoPorImovel.get(contrato.imovel_id) ?? "desconhecido"
      : "desconhecido"
    const contagem = porEmpreendimento.get(empreendimentoId) ?? empty()
    contagem.valores += 1
    porEmpreendimento.set(empreendimentoId, contagem)
  }
  for (const lancamento of rows.lancamentos) {
    const empreendimentoId = empreendimentoPorImovel.get(lancamento.imovel_id) ?? "desconhecido"
    const contagem = porEmpreendimento.get(empreendimentoId) ?? empty()
    contagem.lancamentos += 1
    porEmpreendimento.set(empreendimentoId, contagem)
  }
  for (const imovelId of airbnbImoveis) {
    const empreendimentoId = empreendimentoPorImovel.get(imovelId) ?? "desconhecido"
    const contagem = porEmpreendimento.get(empreendimentoId) ?? empty()
    contagem.airbnb += 1
    porEmpreendimento.set(empreendimentoId, contagem)
  }

  console.log(`Imóveis lidos: ${imoveis.length} (ativos: ${ativosImoveis.size}, airbnb: ${airbnbImoveis.size})`)
  console.log(`Total: ${rows.contratos.length} contratos, ${rows.valores.length} valores, ${rows.lancamentos.length} lançamentos`)
  console.log("")
  for (const [empreendimentoId, contagem] of [...porEmpreendimento.entries()].sort(
    ([, a], [, b]) => b.contratos - a.contratos,
  )) {
    const nome = nomePorEmpreendimento.get(empreendimentoId) ?? "desconhecido"
    console.log(
      `${nome}: ${contagem.contratos} contratos, ${contagem.valores} valores, ${contagem.lancamentos} lançamentos, ${contagem.airbnb} airbnb`,
    )
  }
}

async function applyRows(supabase: SupabaseAdmin, rows: BackfillRows) {
  // Delete-then-insert, ordem inversa das FKs: lançamentos → valores (via contratos) → contratos.
  const { error: deleteLancamentosError } = await supabase
    .from("lancamentos_competencia")
    .delete()
    .eq("origem", "backfill")
  if (deleteLancamentosError) throw deleteLancamentosError

  const { data: contratosBackfill, error: selectContratosError } = await supabase
    .from("contratos_locacao")
    .select("id")
    .eq("origem", "backfill")
  if (selectContratosError) throw selectContratosError
  const idsContratosBackfill = (contratosBackfill ?? []).map((row) => (row as { id: string }).id)

  if (idsContratosBackfill.length > 0) {
    const { error: deleteValoresError } = await supabase
      .from("contrato_valores")
      .delete()
      .in("contrato_id", idsContratosBackfill)
    if (deleteValoresError) throw deleteValoresError
  }

  const { error: deleteContratosError } = await supabase
    .from("contratos_locacao")
    .delete()
    .eq("origem", "backfill")
  if (deleteContratosError) throw deleteContratosError

  if (rows.contratos.length > 0) {
    const { error } = await supabase.from("contratos_locacao").insert(rows.contratos)
    if (error) throw error
  }
  if (rows.valores.length > 0) {
    const { error } = await supabase.from("contrato_valores").insert(rows.valores)
    if (error) throw error
  }
  if (rows.lancamentos.length > 0) {
    const { error } = await supabase.from("lancamentos_competencia").insert(rows.lancamentos)
    if (error) throw error
  }
}

function loadEnvLocal() {
  const filePath = join(process.cwd(), ".env.local")
  if (!existsSync(filePath)) return
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply")
  loadEnvLocal()
  const { createSupabaseAdmin } = await import("../lib/server/supabase")
  const supabase = createSupabaseAdmin()

  const imoveis = await loadImoveis(supabase)
  const snapshots = await loadSnapshots(supabase)
  const rows = buildBackfillRows(imoveis, snapshots)

  printSummary(imoveis, rows)

  if (apply) {
    await applyRows(supabase, rows)
    console.log("\n--apply: linhas gravadas.")
  } else {
    console.log("\nDry-run (sem --apply): nada foi escrito.")
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
