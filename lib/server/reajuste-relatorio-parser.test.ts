import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseRelatorioReajuste } from "./reajuste-relatorio-parser.ts"

function textoDoPdf(caminho: string) {
  return execFileSync("pdftotext", ["-layout", caminho, "-"], { encoding: "utf-8" })
}

test("le a atualizacao monetaria do relatorio real de marco/2026", () => {
  const relatorio = parseRelatorioReajuste(
    textoDoPdf("docs/Artefatos/3. RELATÓRIO LOCAÇÃO MARÇO 2026 - GM2 (1).pdf"),
  )

  assert.equal(relatorio.competencia, "2026-03")
  assert.match(relatorio.empreendimento, /GRAND MESSEJANA II/)
  assert.equal(relatorio.reajustes.length, 2)

  const apto4 = relatorio.reajustes.find((item) => item.apto === "4")
  assert.equal(apto4?.aluguelAnterior, 660)
  assert.equal(apto4?.aluguelNovo, 685.16)
  // Neste relatorio a linha da vaga vem sem o "em" ("para carro 03/2026").
  assert.equal(apto4?.garagemAnterior, 50)
  assert.equal(apto4?.garagemNova, 51.91)

  const apto7 = relatorio.reajustes.find((item) => item.apto === "7")
  assert.equal(apto7?.aluguelNovo, 716.31)
  assert.equal(apto7?.garagemNova, null)

  // APTO 03 aparece em ATRASADOS QUE FORAM RECEBIDOS, nao em ATUALIZACAO:
  // tratar atraso como reajuste inventaria um contrato que nao mudou.
  assert.equal(relatorio.reajustes.some((item) => item.apto === "3"), false)
})

test("le contratos novos e reajustes do layout de julho/2026", () => {
  const texto = [
    "                RELATÓRIO VIGÊNCIA DE JULHO/2026 – GRAND MESSEJANA II",
    "                             APARTAMENTO ALUGADO:",
    "APTO 03: VITOR SOUSA PINTO.",
    "Início de vigência dia 16/07/2026. Previsão de término: 15/01/2029. Sem desconto.",
    "Valor total da locação contratada:",
    "- R$ 700,00 de aluguel;",
    "- R$ 25,00 de vaga de garagem para moto;",
    "- R$ 1,43 de IPTU mensal;",
    "- R$ 139,83 de seguro-incêndio (cota única).",
    "                 ALIVE IMÓVEIS LTDA - CNPJ 54.595.488/0001-76",
    "APTO 23: JAMILLE RODRIGUES DA PRATA.",
    "Início de vigência dia 30/07/2026. Previsão de término: 29/01/2029.",
    "Valor total da locação contratada:",
    "- R$ 700,00 de aluguel;",
    "- R$ 1,43 de IPTU mensal;",
    "                             ATUALIZAÇÃO MONETÁRIA:",
    "APTO 02: LUIS AUGUSTO ATAIDE BORGES.",
    "Aluguel em 07/2025: R$ 660,00.",
    "Aluguel em 07/2026: R$ 690,63.",
    "Vaga de garagem para carro em 07/2025: R$ 50,00.",
    "Vaga de garagem para carro em 07/2026: R$ 52,32.",
    "                        ATRASADOS QUE FORAM RECEBIDOS:",
    "APTO 07: LUANA ALINE BATISTA.",
    "Vigência de junho de 2026.",
    "Principal aluguel: R$ 716,31.",
    "Atualizado aluguel: R$ 790,33.",
  ].join("\n")

  const relatorio = parseRelatorioReajuste(texto)

  assert.equal(relatorio.competencia, "2026-07")
  assert.deepEqual(relatorio.novosContratos, [
    { apto: "3", inquilino: "VITOR SOUSA PINTO", vigenciaInicio: "2026-07-16", aluguel: 700, garagem: 25 },
    { apto: "23", inquilino: "JAMILLE RODRIGUES DA PRATA", vigenciaInicio: "2026-07-30", aluguel: 700, garagem: null },
  ])
  assert.deepEqual(relatorio.reajustes, [
    {
      apto: "2",
      inquilino: "LUIS AUGUSTO ATAIDE BORGES",
      aluguelAnterior: 660,
      aluguelNovo: 690.63,
      garagemAnterior: 50,
      garagemNova: 52.32,
    },
  ])
  // O atrasado nao vira contrato novo nem reajuste.
  assert.equal(relatorio.reajustes.some((item) => item.apto === "7"), false)
  assert.equal(relatorio.novosContratos.some((item) => item.apto === "7"), false)
})

test("falha fechado quando o documento nao e um relatorio de vigencia", () => {
  assert.throws(
    () => parseRelatorioReajuste("PRESTAÇÃO DE CONTAS LOCAÇÃO JULHO 2026\nAPTO 02: FULANO."),
    /cabeçalho ausente/i,
  )
})

// O script de correcao le o PDF do Storage via pdfjs (extractPdfTextLines), nao
// via pdftotext. Os dois caminhos precisam produzir a mesma leitura, senao a
// correcao roda sobre um texto diferente do que o teste acima valida.
test("extracao por pdfjs produz a mesma leitura que pdftotext", async () => {
  const { extractPdfTextLines } = await import("./cesar-rego-parser.ts")
  const caminho = "docs/Artefatos/3. RELATÓRIO LOCAÇÃO MARÇO 2026 - GM2 (1).pdf"
  const linhas = await extractPdfTextLines(readFileSync(caminho))

  const viaPdfjs = parseRelatorioReajuste(linhas.map((linha) => linha.text).join("\n"))
  const viaPdftotext = parseRelatorioReajuste(textoDoPdf(caminho))

  assert.equal(viaPdfjs.competencia, viaPdftotext.competencia)
  assert.deepEqual(viaPdfjs.reajustes, viaPdftotext.reajustes)
  assert.deepEqual(viaPdfjs.novosContratos, viaPdftotext.novosContratos)
})
