import assert from "node:assert/strict"
import test from "node:test"
import { preserveManualMovementOverrides } from "./persist-package.ts"

test("regeneracao nao reinsere a linha automatica substituida manualmente", () => {
  const automatic = {
    tipo_movimentacao: "receita_aluguel",
    categoria: "prestacao_contas_secao_1",
    descricao: "101 - Cliente",
    imovel_id: "imovel-1",
    origem_documental: "prestacao_alive_secao_1",
  }
  const other = { ...automatic, descricao: "102 - Outro", imovel_id: "imovel-2" }
  assert.deepEqual(
    preserveManualMovementOverrides([automatic, other], [{ ...automatic, descricao: "101 - corrigido pelo operador" }]),
    [other],
  )
})
