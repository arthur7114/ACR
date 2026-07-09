import assert from "node:assert/strict"
import test from "node:test"
import { editarParcela } from "./iptu.ts"

const parcelaDetalhada = {
  id: "parcela-1",
  carne_id: "carne-1",
  numero: 1,
  data_vencimento: "2026-01-06",
  valor_previsto: "96.13",
  valor_pago: "96.13",
  data_baixa: "2026-01-06",
  observacoes: "Confirmada",
  responsavel: "inquilino",
  ano_referencia: 2026,
  origem: "manual",
  imovel_id: "imovel-1",
  unidade: "GALPAO 01",
  inquilino_nome: "Empresa teste",
  imobiliaria_id: "imobiliaria-1",
  empreendimento_id: "empreendimento-1",
  imobiliaria_nome: "Alive Imoveis",
  empreendimento_nome: "Locmais",
}

test("editarParcela relê a parcela pela view detalhada depois de salvar", async () => {
  const tabelas: string[] = []
  let alteracoes: Record<string, unknown> | null = null
  let consultasNaTabelaBase = 0

  const supabase = {
    from(tabela: string) {
      tabelas.push(tabela)

      if (tabela === "iptu_parcelas") {
        consultasNaTabelaBase += 1
        if (consultasNaTabelaBase === 1) {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "parcela-1", data_baixa: "2026-01-06" }, error: null }),
              }),
            }),
          }
        }

        return {
          update: (changes: Record<string, unknown>) => {
            alteracoes = changes
            return { eq: async () => ({ error: null }) }
          },
        }
      }

      if (tabela === "iptu_parcelas_detalhe") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: parcelaDetalhada, error: null }),
            }),
          }),
        }
      }

      throw new Error(`Tabela inesperada: ${tabela}`)
    },
  }

  const parcela = await editarParcela(
    "parcela-1",
    { observacoes: "Confirmada", responsavel: "inquilino" },
    supabase as never,
  )

  assert.deepEqual(tabelas, ["iptu_parcelas", "iptu_parcelas", "iptu_parcelas_detalhe"])
  assert.deepEqual(alteracoes, { observacoes: "Confirmada", responsavel: "inquilino" })
  assert.equal(parcela.unidade, "GALPAO 01")
  assert.equal(parcela.status, "pago")
})
