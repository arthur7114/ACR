import assert from "node:assert/strict"
import test from "node:test"
import { planejarPrazosDoRelatorio, type ImovelComPrazo } from "./contrato-prazo-cadastro.ts"
import type { NovoContrato } from "./reajuste-relatorio-parser.ts"

function imovel(unidade: string, prazo: Partial<ImovelComPrazo> = {}): ImovelComPrazo {
  return {
    id: `id-${unidade}`,
    codigo_imobiliaria: unidade,
    unidade,
    valor_aluguel_esperado: 700,
    contrato_inicio: null,
    contrato_termino: null,
    contrato_locatario: null,
    ...prazo,
  }
}

function contrato(apto: string, inquilino: string, inicio: string | null, termino: string | null): NovoContrato {
  return { apto, inquilino, vigenciaInicio: inicio, vigenciaTermino: termino, dataAjustada: false, aluguel: 700, garagem: null }
}

test("contrato novo do relatorio substitui o prazo do inquilino anterior", () => {
  const [plano] = planejarPrazosDoRelatorio(
    [contrato("26", "LOCATARIO NOVO", "2026-08-11", "2029-02-10")],
    [imovel("26", { contrato_inicio: "2025-09-15", contrato_termino: "2028-03-14", contrato_locatario: "LOCATARIO ANTERIOR" })],
  )
  assert.equal(plano.resultado, "aplicado")
  assert.equal(plano.imovel?.id, "id-26")
  assert.match(plano.detalhe, /15\/09\/25 a 14\/03\/28 \(LOCATARIO ANTERIOR.*-> 11\/08\/26 a 10\/02\/29 \(LOCATARIO NOVO/)
})

test("relatorio antigo nao regride contrato mais novo do cadastro", () => {
  const [plano] = planejarPrazosDoRelatorio(
    [contrato("3", "LOCATARIO TESTE", "2026-07-16", "2029-01-15")],
    [imovel("03", { contrato_inicio: "2026-09-01", contrato_termino: "2029-02-28", contrato_locatario: "OUTRA PESSOA" })],
  )
  assert.equal(plano.resultado, "cadastro_mais_recente")
})

test("mesmo prazo e mesmo locatario nao reescreve", () => {
  const [plano] = planejarPrazosDoRelatorio(
    [contrato("3", "LOCATARIO TESTE", "2026-07-16", "2029-01-15")],
    [imovel("3", { contrato_inicio: "2026-07-16", contrato_termino: "2029-01-15", contrato_locatario: "Locatario Teste" })],
  )
  assert.equal(plano.resultado, "ja_aplicado")
})

test("sem imovel ou sem datas vira decisao explicita, nao escrita", () => {
  const planos = planejarPrazosDoRelatorio(
    [contrato("99", "FULANO", "2026-08-01", null), contrato("3", "FULANO", null, null)],
    [imovel("3")],
  )
  assert.deepEqual(planos.map((p) => p.resultado), ["sem_imovel", "sem_data"])
})
