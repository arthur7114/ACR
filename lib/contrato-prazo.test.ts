import assert from "node:assert/strict"
import test from "node:test"
import { dataCivil, mesmoLocatario, situacaoPrazo } from "./contrato-prazo.ts"

const HOJE = "2026-10-02"

function prazo(inicio: string | null, termino: string | null, locatario: string | null = "FULANO", inquilino: string | null = "FULANO") {
  return { contrato_inicio: inicio, contrato_termino: termino, contrato_locatario: locatario, inquilino_nome: inquilino }
}

test("classifica o prazo do contrato contra a data de hoje", () => {
  assert.deepEqual(situacaoPrazo(prazo(null, null), HOJE), { estado: "sem_data", diasParaTermino: null })
  assert.equal(situacaoPrazo(prazo("2025-09-01", "2028-02-28"), HOJE).estado, "vigente")
  assert.deepEqual(situacaoPrazo(prazo("2024-06-14", "2026-12-13"), HOJE), { estado: "vence_em_breve", diasParaTermino: 72 })
  assert.deepEqual(situacaoPrazo(prazo("2023-10-05", "2026-04-02"), HOJE), { estado: "vencido", diasParaTermino: -183 })
  assert.equal(situacaoPrazo(prazo("2026-11-01", "2029-04-30"), HOJE).estado, "a_iniciar")
  assert.equal(situacaoPrazo(prazo("2025-01-01", null), HOJE).estado, "vigente")
})

test("o termino exato de hoje ainda e vigente e entra no alerta", () => {
  assert.deepEqual(situacaoPrazo(prazo("2024-01-01", HOJE), HOJE), { estado: "vence_em_breve", diasParaTermino: 0 })
})

test("prazo de outro inquilino nao vale para a unidade", () => {
  const atual = situacaoPrazo(prazo("2025-09-15", "2028-03-14", "LOCATARIO ANTERIOR", "LOCATARIO NOVO"), HOJE)
  assert.equal(atual.estado, "outro_inquilino")
  // Acento, caixa e espaco sobrando nao contam como troca de inquilino.
  assert.equal(mesmoLocatario("JOÃO DA SILVA ", "joao da silva"), true)
})

test("dia inexistente no mes vai para o ultimo dia e avisa", () => {
  assert.deepEqual(dataCivil(30, 2, 2029), { iso: "2029-02-28", ajustada: true })
  assert.deepEqual(dataCivil(29, 2, 2028), { iso: "2028-02-29", ajustada: false })
  assert.deepEqual(dataCivil(11, 8, 26), { iso: "2026-08-11", ajustada: false })
  assert.equal(dataCivil(1, 13, 2026), null)
})
