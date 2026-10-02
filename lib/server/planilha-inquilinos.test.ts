import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"
import { lerPlanilhaInquilinos, planejarImportacao, type ImovelDoCadastro } from "./planilha-inquilinos.ts"

// Fixture sintetica no layout da planilha CADASTRO INQUILINOS do cliente
// (ref. julho/2026). O repositorio e publico: a planilha real nao entra aqui.
// Datas sao seriais do Excel, como na real (45901 = 01/09/2025).
const serial = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569
const _ = null
const bloco = (apto: unknown, inquilino: unknown, inicio: unknown, termino: unknown, aluguel: unknown) => [apto, inquilino, inicio, termino, aluguel, _]

function planilha(): unknown[][] {
  const linhas: unknown[][] = [
    ["REF JULHO 2026"],
    [
      ...bloco("GRAND CASTELÃO", _, _, _, _),
      ...bloco("GRAND MESSEJANA II", _, _, _, _),
      ...bloco("GRAND MARACANAU", _, _, _, _),
      ...bloco("LOCMAIS", _, _, _, _),
      ...bloco("JOAO CORDEIRO", _, _, _, _),
    ],
    [
      ...bloco("APTO", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
      ...bloco("APTO", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
      ...bloco("APTO", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
      ...bloco("GALP", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
      ...bloco("FLAT", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
    ],
    [
      ...bloco("1", "ANA TESTE", serial("2025-09-01"), serial("2028-02-28"), 690),
      ...bloco("1", "BRUNO TESTE", serial("2024-12-03"), serial("2027-06-02"), 637.22),
      ...bloco("102", "AIRBNB", _, _, _),
      ...bloco("4", "EMPRESA TESTE LTDA", serial("2024-12-19"), "Self storage", 2089.24),
      ...bloco("RUA EXEMPLO,488 APART. A", "CARLA TESTE", serial("2007-06-01"), serial("2027-02-28"), 1237.05),
    ],
    [
      ...bloco("2", "DANIEL TESTE", serial("2026-02-04"), serial("2028-08-03"), 690),
      ...bloco("3", "EDUARDA TESTE", _, _, 700),
      ...bloco("101", _, _, _, 400),
      ...bloco("SALAS", _, _, _, _),
      ...bloco("POMPILIO GOMES", _, _, _, _),
    ],
    [
      ...bloco(_, _, _, _, _),
      ...bloco("26", "FABIO TESTE", serial("2025-09-15"), serial("2028-03-14"), 660),
      ...bloco(_, _, _, _, _),
      ...bloco("1", "GABRIELA TESTE", serial("2026-06-24"), serial("2028-12-23"), 800),
      ...bloco("GALPÃO", "INQUILINO", "INICIO", "TERMINO", "ALUGUEL"),
    ],
    [
      ...bloco(_, _, _, _, _),
      ...bloco("4", _, serial("2026-09-01"), serial("2029-02-28"), 700),
      ...bloco(_, _, _, _, _),
      ...bloco(_, _, _, _, _),
      ...bloco("POMPILIO GOMES,240 ", "BLINDAGEM TESTE", serial("2016-01-01"), serial("2027-07-31"), 5517.41),
    ],
    [...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco("JOSE WALTER", _, _, _, _)],
    [...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco(_, _, _, _, _), ...bloco("R. Exemplo 20", "OFICINA TESTE", serial("2022-07-06"), serial("2028-07-06"), 3348.52)],
  ]
  // Passa pelo xlsx como o script faz: celulas numericas voltam como serial.
  const aba = XLSX.utils.aoa_to_sheet(linhas)
  return XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: null })
}

test("le os blocos e subsecoes no layout da planilha do cliente", () => {
  const linhas = lerPlanilhaInquilinos(planilha())
  const achar = (bloco: string, unidade: string, subsecao: string | null = null) =>
    linhas.find((l) => l.bloco === bloco && l.unidade === unidade && l.subsecao === subsecao)

  assert.deepEqual([achar("GRAND CASTELÃO", "1")?.inicio, achar("GRAND CASTELÃO", "1")?.termino], ["2025-09-01", "2028-02-28"])
  assert.equal(achar("GRAND MESSEJANA II", "1")?.termino, "2027-06-02")
  assert.equal(achar("LOCMAIS", "1", "SALAS")?.inquilino, "GABRIELA TESTE")
  assert.equal(achar("LOCMAIS", "4")?.termino, null)
  assert.equal(achar("LOCMAIS", "4")?.terminoTexto, "Self storage")
  assert.equal(achar("JOAO CORDEIRO", "POMPILIO GOMES,240", "POMPILIO GOMES")?.inquilino, "BLINDAGEM TESTE")
  assert.equal(achar("JOAO CORDEIRO", "R. Exemplo 20", "JOSE WALTER")?.termino, "2028-07-06")
  // Cabecalho repetido da subsecao nao vira unidade.
  assert.equal(linhas.some((l) => l.inquilino === "INQUILINO"), false)
})

test("falha fechado quando a planilha nao tem o cabecalho esperado", () => {
  assert.throws(() => lerPlanilhaInquilinos([["APTO", "NOME"], ["1", "X"]]), /cabeçalho INQUILINO ausente/)
})

function imovel(empreendimento: string, unidade: string, inquilino: string | null, extra: Partial<ImovelDoCadastro> = {}): ImovelDoCadastro {
  return {
    id: `${empreendimento}-${unidade}`,
    empreendimento,
    unidade,
    codigo_imobiliaria: unidade,
    inquilino_nome: inquilino,
    valor_aluguel_esperado: null,
    contrato_inicio: null,
    contrato_termino: null,
    contrato_locatario: null,
    ...extra,
  }
}

test("so grava prazo quando o inquilino da planilha e o do cadastro", () => {
  const linhas = lerPlanilhaInquilinos(planilha())
  const imoveis = [
    imovel("Grand Castelão I", "1", "Ana Teste", { valor_aluguel_esperado: 700 }),
    imovel("Grand Castelão I", "2", null),
    // A planilha e de julho; em agosto o 26 trocou de inquilino.
    imovel("Grand Messejana II", "26", "OUTRO INQUILINO"),
    imovel("Grand Messejana II", "3", "EDUARDA TESTE"),
    imovel("Grand Messejana II", "4", null),
    imovel("LOCMAIS", "SALA 01", "GABRIELA TESTE"),
    imovel("LOCMAIS", "GALPÃO 04", "EMPRESA TESTE LTDA"),
    imovel("GRAND MARACANAÚ", "102", "AIRBNB"),
    imovel("João Cordeiro", "0002520", "RUA EXEMPLO,488 APART. A"),
    imovel("Galpão Pompilio Gomes", "0002526", "POMPILIO GOMES,230"),
    imovel("Galpão Pompilio Gomes", "0002527", "POMPILIO GOMES,240"),
    imovel("Galpao Jose Walter", "GA0002", "GALPAO JOSE WALTER"),
  ]
  const planos = planejarImportacao(linhas, imoveis)
  const de = (unidade: string, empreendimento?: string) =>
    planos.find((p) => p.imovel?.unidade === unidade && (!empreendimento || p.empreendimento === empreendimento))

  const castelao1 = de("1", "GRAND CASTELAO I")
  assert.equal(castelao1?.resultado, "aplicar")
  assert.equal(castelao1?.locatario, "ANA TESTE")
  assert.deepEqual(castelao1?.aluguelDivergente, { planilha: 690, cadastro: 700 })

  assert.equal(de("2", "GRAND CASTELAO I")?.resultado, "inquilino_divergente") // cadastro vago
  assert.equal(de("26")?.resultado, "inquilino_divergente")
  assert.equal(de("3", "GRAND MESSEJANA II")?.resultado, "sem_data")
  assert.equal(de("4", "GRAND MESSEJANA II")?.resultado, "sem_inquilino")
  assert.equal(de("102")?.resultado, "sem_prazo")
  assert.equal(planos.find((p) => p.linha.unidade === "101")?.resultado, "sem_prazo")

  assert.equal(de("SALA 01")?.resultado, "aplicar")
  const galpao4 = de("GALPÃO 04")
  assert.equal(galpao4?.resultado, "aplicar")
  assert.match(galpao4?.detalhe ?? "", /Self storage/)

  // César Rêgo/Plural: cadastro identifica pelo endereço; locatário não é conferível.
  assert.equal(de("0002520")?.resultado, "aplicar")
  assert.equal(de("0002527")?.resultado, "aplicar")
  assert.equal(de("0002527")?.locatario, null)
  assert.equal(de("0002526"), undefined) // nao esta na planilha sintetica
  assert.equal(de("GA0002")?.resultado, "aplicar")
})

test("planilha nao regride contrato mais novo nem reescreve o mesmo prazo", () => {
  const linhas = lerPlanilhaInquilinos(planilha()).filter((l) => l.bloco === "GRAND CASTELÃO")
  const planos = planejarImportacao(linhas, [
    imovel("Grand Castelão I", "1", "ANA TESTE", { contrato_inicio: "2025-09-01", contrato_termino: "2028-02-28" }),
    imovel("Grand Castelão I", "2", "DANIEL TESTE", { contrato_inicio: "2026-09-01" }),
  ])
  assert.deepEqual(planos.map((p) => p.resultado), ["ja_aplicado", "cadastro_mais_recente"])
})
