import assert from "node:assert/strict"
import test from "node:test"
import type { SupabaseClient } from "@supabase/supabase-js"

import { cadastrarContratoManual, registrarContrato, removerContrato, sincronizarEdicaoDoVigente } from "./imovel-contratos.ts"

type Row = Record<string, unknown>

// Banco em memória com só o que o módulo usa: select/eq/order/single, upsert, update e delete.
function bancoFalso(tabelas: Record<string, Row[]>) {
  const from = (nome: string) => {
    const linhas = (tabelas[nome] ??= [])
    const filtros: Array<[string, unknown]> = []
    let acao: "select" | "update" | "delete" = "select"
    let patch: Row = {}
    let ordem: { coluna: string; asc: boolean } | null = null
    const casadas = () => linhas.filter((linha) => filtros.every(([coluna, valor]) => linha[coluna] === valor))
    const executar = () => {
      if (acao === "update") for (const linha of casadas()) Object.assign(linha, patch)
      if (acao === "delete") for (const linha of casadas()) linhas.splice(linhas.indexOf(linha), 1)
      let resultado = acao === "select" ? casadas() : []
      if (ordem) {
        const { coluna, asc } = ordem
        resultado = [...resultado].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])) * (asc ? 1 : -1))
      }
      return resultado
    }
    const consulta: Record<string, unknown> = {
      select: () => consulta,
      eq: (coluna: string, valor: unknown) => (filtros.push([coluna, valor]), consulta),
      order: (coluna: string, opcoes: { ascending: boolean }) => ((ordem = { coluna, asc: opcoes.ascending }), consulta),
      update: (valores: Row) => ((acao = "update"), (patch = valores), consulta),
      delete: () => ((acao = "delete"), consulta),
      single: async () => ({ data: executar()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: executar()[0] ?? null, error: null }),
      upsert: async (valores: Row, { onConflict }: { onConflict: string }) => {
        const chaves = onConflict.split(",")
        const existente = linhas.find((linha) => chaves.every((chave) => linha[chave] === valores[chave]))
        if (existente) Object.assign(existente, valores)
        else linhas.push({ id: `c${linhas.length + 1}`, ...valores })
        return { error: null }
      },
      then: (resolve: (valor: unknown) => unknown) => resolve({ data: executar(), error: null }),
    }
    return consulta
  }
  return { from } as unknown as SupabaseClient
}

const IMOVEL = "imovel-1"
const imovel = (extra: Row = {}): Row => ({ id: IMOVEL, contrato_inicio: null, contrato_termino: null, contrato_locatario: null, contrato_fonte: null, ...extra })
const contrato = (id: string, inicio: string, termino: string | null, locatario = "ANA"): Row => ({ id, imovel_id: IMOVEL, inicio, termino, locatario, fonte: "x" })

test("registrar o mesmo inicio corrige as datas em vez de duplicar", async () => {
  const tabelas = { imovel_contratos: [] as Row[] }
  const banco = bancoFalso(tabelas)
  await registrarContrato(banco, { imovelId: IMOVEL, locatario: "ANA", inicio: "2026-07-31", termino: "2029-07-30", fonte: "Planilha" })
  await registrarContrato(banco, { imovelId: IMOVEL, locatario: "ANA", inicio: "2026-07-31", termino: "2029-08-30", fonte: "Relatório" })
  assert.equal(tabelas.imovel_contratos.length, 1)
  assert.equal(tabelas.imovel_contratos[0].termino, "2029-08-30")
})

test("contrato sem inicio nao entra na lista", async () => {
  const tabelas = { imovel_contratos: [] as Row[] }
  await registrarContrato(bancoFalso(tabelas), { imovelId: IMOVEL, locatario: "ANA", inicio: "", termino: "2029-07-30", fonte: "Planilha" })
  assert.equal(tabelas.imovel_contratos.length, 0)
})

test("contrato manual mais recente vira o vigente; o anterior continua na lista", async () => {
  const tabelas = { imoveis: [imovel({ contrato_inicio: "2024-01-01", contrato_termino: "2026-12-31", contrato_locatario: "ANA" })], imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31")] }
  const resultado = await cadastrarContratoManual(bancoFalso(tabelas), { imovelId: IMOVEL, locatario: "BIA", inicio: "2027-01-01", termino: "2029-12-31" })
  assert.deepEqual(resultado, { vigente: true })
  assert.equal(tabelas.imoveis[0].contrato_inicio, "2027-01-01")
  assert.equal(tabelas.imoveis[0].contrato_locatario, "BIA")
  assert.equal(tabelas.imoveis[0].contrato_fonte, "Cadastro manual")
  assert.equal(tabelas.imovel_contratos.length, 2)
})

test("contrato manual anterior ao vigente entra so na lista", async () => {
  const tabelas = { imoveis: [imovel({ contrato_inicio: "2024-01-01", contrato_termino: "2026-12-31", contrato_locatario: "ANA" })], imovel_contratos: [] as Row[] }
  const resultado = await cadastrarContratoManual(bancoFalso(tabelas), { imovelId: IMOVEL, locatario: "ZÉ", inicio: "2020-03-01", termino: "2023-12-31" })
  assert.deepEqual(resultado, { vigente: false })
  assert.equal(tabelas.imoveis[0].contrato_inicio, "2024-01-01")
  assert.equal(tabelas.imovel_contratos.length, 1)
})

test("editar o prazo do mesmo locatario troca a linha; de outro locatario acrescenta", async () => {
  const mesmo = { imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31")] }
  await sincronizarEdicaoDoVigente(bancoFalso(mesmo), IMOVEL, { inicio: "2024-01-01", locatario: "ANA" }, { inicio: "2024-02-01", termino: "2026-12-31", locatario: "ana", fonte: "Edição manual" })
  assert.deepEqual(mesmo.imovel_contratos.map((c) => c.inicio), ["2024-02-01"])

  const outro = { imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31")] }
  await sincronizarEdicaoDoVigente(bancoFalso(outro), IMOVEL, { inicio: "2024-01-01", locatario: "ANA" }, { inicio: "2027-01-01", termino: "2029-12-31", locatario: "BIA", fonte: "Edição manual" })
  assert.deepEqual(outro.imovel_contratos.map((c) => c.inicio).sort(), ["2024-01-01", "2027-01-01"])
})

test("remover o vigente promove o contrato mais recente que sobrou", async () => {
  const tabelas = {
    imoveis: [imovel({ contrato_inicio: "2027-01-01", contrato_termino: "2029-12-31", contrato_locatario: "BIA" })],
    imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31", "ANA"), contrato("c2", "2027-01-01", "2029-12-31", "BIA")],
  }
  assert.deepEqual(await removerContrato(bancoFalso(tabelas), IMOVEL, "c2"), { removido: true })
  assert.equal(tabelas.imoveis[0].contrato_inicio, "2024-01-01")
  assert.equal(tabelas.imoveis[0].contrato_locatario, "ANA")
})

test("remover o unico contrato limpa o vigente; remover um antigo nao mexe nele", async () => {
  const unico = { imoveis: [imovel({ contrato_inicio: "2024-01-01", contrato_termino: "2026-12-31", contrato_locatario: "ANA" })], imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31")] }
  await removerContrato(bancoFalso(unico), IMOVEL, "c1")
  assert.equal(unico.imoveis[0].contrato_inicio, null)
  assert.equal(unico.imoveis[0].contrato_locatario, null)

  const antigo = { imoveis: [imovel({ contrato_inicio: "2027-01-01", contrato_termino: "2029-12-31", contrato_locatario: "BIA" })], imovel_contratos: [contrato("c1", "2024-01-01", "2026-12-31"), contrato("c2", "2027-01-01", "2029-12-31", "BIA")] }
  await removerContrato(bancoFalso(antigo), IMOVEL, "c1")
  assert.equal(antigo.imoveis[0].contrato_inicio, "2027-01-01")
  assert.equal(antigo.imovel_contratos.length, 1)
})
