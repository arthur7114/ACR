/**
 * Planilha "CADASTRO INQUILINOS" do cliente (WhatsApp, 2026-10-02, ref. julho
 * 2026) -> prazo do contrato no cadastro do imóvel.
 *
 * Layout: uma aba, um bloco de 5 colunas por empreendimento (APTO, INQUILINO,
 * INICIO, TERMINO, ALUGUEL) lado a lado, com coluna vazia entre blocos. Dentro
 * de um bloco, uma linha só com o primeiro campo preenchido abre uma subseção:
 * "SALAS" no LOCMAIS, "POMPILIO GOMES" e "JOSE WALTER" no bloco JOAO CORDEIRO
 * (que na verdade junta os imóveis da Cesar Rego e da Plural).
 *
 * As datas são datas do Excel (número serial), não texto: não há ambiguidade
 * dia/mês, mesmo onde a célula exibe "12/3/24".
 *
 * Guarda principal: o prazo só vai para o imóvel se o inquilino da planilha é
 * o inquilino do cadastro. A planilha é de julho; em agosto GM II 12 e 26
 * trocaram de inquilino, e gravar a data antiga no contrato novo seria
 * inventar um prazo. Divergência vira linha do relatório, não escrita.
 */
import { mesmoLocatario, normalizarLocatario } from "@/lib/contrato-prazo"
import { normalizeCodigoImovel } from "@/lib/codigo-imovel"

export interface LinhaPlanilha {
  /** Linha na planilha (1-based), para o operador achar a célula. */
  linha: number
  bloco: string
  subsecao: string | null
  unidade: string
  inquilino: string | null
  inicio: string | null
  termino: string | null
  /** Texto que veio na coluna TERMINO no lugar de data (ex.: "Self storage"). */
  terminoTexto: string | null
  aluguel: number | null
}

const LARGURA_BLOCO = 6 // 5 colunas + 1 separadora

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor).replace(/\s+/g, " ").trim()
  return t.length > 0 ? t : null
}

// Serial do Excel (sistema 1900) -> AAAA-MM-DD.
export function dataDoSerial(valor: unknown): string | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 1) return null
  const data = new Date(Math.round((valor - 25569) * 86400) * 1000)
  return data.toISOString().slice(0, 10)
}

function moeda(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor * 100) / 100
  return null
}

export function lerPlanilhaInquilinos(linhas: unknown[][]): LinhaPlanilha[] {
  const cabecalho = linhas.findIndex((linha) => linha.some((celula) => texto(celula)?.toUpperCase() === "INQUILINO"))
  if (cabecalho < 1) throw new Error("Planilha não reconhecida: cabeçalho INQUILINO ausente.")
  const titulos = linhas[cabecalho - 1] ?? []
  const largura = Math.max(...linhas.map((linha) => linha.length))
  const resultado: LinhaPlanilha[] = []

  for (let coluna = 0; coluna < largura; coluna += LARGURA_BLOCO) {
    const bloco = texto(titulos[coluna])
    if (!bloco) continue
    let subsecao: string | null = null
    for (let indice = cabecalho + 1; indice < linhas.length; indice++) {
      const [unidadeBruta, inquilinoBruto, inicioBruto, terminoBruto, aluguelBruto] = (linhas[indice] ?? []).slice(coluna, coluna + 5)
      const unidade = texto(unidadeBruta)
      if (!unidade) continue
      if (texto(inquilinoBruto)?.toUpperCase() === "INQUILINO") continue // cabeçalho repetido da subseção
      const vazia = [inquilinoBruto, inicioBruto, terminoBruto, aluguelBruto].every((celula) => texto(celula) === null)
      if (vazia && !/^\d+$/.test(unidade)) {
        subsecao = unidade
        continue
      }
      const termino = dataDoSerial(terminoBruto)
      resultado.push({
        linha: indice + 1,
        bloco,
        subsecao,
        unidade,
        inquilino: texto(inquilinoBruto),
        inicio: dataDoSerial(inicioBruto),
        termino,
        terminoTexto: termino ? null : texto(terminoBruto),
        aluguel: moeda(aluguelBruto),
      })
    }
  }
  return resultado
}

export interface ImovelDoCadastro {
  id: string
  empreendimento: string
  unidade: string
  codigo_imobiliaria: string
  inquilino_nome: string | null
  valor_aluguel_esperado: number | string | null
  contrato_inicio: string | null
  contrato_termino: string | null
  contrato_locatario: string | null
}

// Rótulo do bloco/subseção na planilha -> nome do empreendimento no cadastro.
// Explícito de propósito: um empreendimento a mais na planilha tem de aparecer
// como "sem empreendimento", não casar com o primeiro nome parecido.
const EMPREENDIMENTO_DO_BLOCO: Record<string, string> = {
  "GRAND CASTELAO": "GRAND CASTELAO I",
  "GRAND MESSEJANA I": "GRAND MESSEJANA I",
  "GRAND MESSEJANA II": "GRAND MESSEJANA II",
  "GRAND MARACANAU": "GRAND MARACANAU",
  LOCMAIS: "LOCMAIS",
  "JOAO CORDEIRO": "JOAO CORDEIRO",
  "POMPILIO GOMES": "GALPAO POMPILIO GOMES",
  "JOSE WALTER": "GALPAO JOSE WALTER",
}

// Blocos cujos imóveis o cadastro identifica pelo endereço (no campo de
// inquilino), não por número de unidade. Ali o inquilino não é conferível.
const IDENTIFICADO_POR_ENDERECO = new Set(["JOAO CORDEIRO", "GALPAO POMPILIO GOMES", "GALPAO JOSE WALTER"])

export type ResultadoImportacao =
  | "aplicar"
  | "ja_aplicado"
  | "sem_prazo"
  | "sem_data"
  | "sem_inquilino"
  | "inquilino_divergente"
  | "sem_imovel"
  | "cadastro_mais_recente"

export interface PlanoImportacao {
  linha: LinhaPlanilha
  empreendimento: string
  imovel: ImovelDoCadastro | null
  resultado: ResultadoImportacao
  detalhe: string
  /** Locatário gravado junto do prazo; null quando o cadastro não o confere. */
  locatario: string | null
  /** Diferença informativa de aluguel planilha x cadastro (não é aplicada). */
  aluguelDivergente: { planilha: number; cadastro: number } | null
}

function chave(valor: string) {
  return normalizarLocatario(valor)
}

function empreendimentoDaLinha(linha: LinhaPlanilha) {
  const rotulo = chave(linha.subsecao && linha.subsecao !== "SALAS" ? linha.subsecao : linha.bloco)
  return EMPREENDIMENTO_DO_BLOCO[rotulo] ?? rotulo
}

// "1" no bloco LOCMAIS é "GALPÃO 01"; na subseção SALAS, "SALA 01".
function unidadeDoCadastro(linha: LinhaPlanilha, empreendimento: string) {
  if (empreendimento !== "LOCMAIS" || !/^\d+$/.test(linha.unidade)) return linha.unidade
  const numero = linha.unidade.padStart(2, "0")
  return linha.subsecao === "SALAS" ? `SALA ${numero}` : `GALPAO ${numero}`
}

function encontrar(linha: LinhaPlanilha, empreendimento: string, imoveis: ImovelDoCadastro[]) {
  const doEmpreendimento = imoveis.filter((imovel) => chave(imovel.empreendimento) === empreendimento)
  if (IDENTIFICADO_POR_ENDERECO.has(empreendimento)) {
    const porEndereco = doEmpreendimento.find((imovel) => chave(imovel.inquilino_nome ?? "") === chave(linha.unidade))
    if (porEndereco) return porEndereco
    // Empreendimento de imóvel único (Galpão José Walter): o endereço da
    // planilha não está no cadastro, mas não há outro imóvel para confundir.
    return doEmpreendimento.length === 1 ? doEmpreendimento[0] : null
  }
  const alvo = chave(unidadeDoCadastro(linha, empreendimento))
  return (
    doEmpreendimento.find(
      (imovel) => chave(imovel.unidade) === alvo || normalizeCodigoImovel(imovel.unidade) === normalizeCodigoImovel(alvo),
    ) ?? null
  )
}

function numero(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export function planejarImportacao(linhas: LinhaPlanilha[], imoveis: ImovelDoCadastro[]): PlanoImportacao[] {
  return linhas.map((linha) => {
    const empreendimento = empreendimentoDaLinha(linha)
    const imovel = encontrar(linha, empreendimento, imoveis)
    const porEndereco = IDENTIFICADO_POR_ENDERECO.has(empreendimento)
    const cadastroAluguel = numero(imovel?.valor_aluguel_esperado)
    const aluguelDivergente =
      linha.aluguel !== null && cadastroAluguel !== null && Math.abs(linha.aluguel - cadastroAluguel) >= 0.005
        ? { planilha: linha.aluguel, cadastro: cadastroAluguel }
        : null
    const base = { linha, empreendimento, imovel, aluguelDivergente, locatario: porEndereco ? null : linha.inquilino }
    const plano = (resultado: ResultadoImportacao, detalhe: string): PlanoImportacao => ({ ...base, resultado, detalhe })

    const temData = Boolean(linha.inicio || linha.termino)
    const appOuVazia = !linha.inquilino || /AIR\s*BNB/i.test(linha.inquilino)
    if (!temData && appOuVazia) return plano("sem_prazo", linha.inquilino ? "Unidade por aplicativo." : "Unidade sem inquilino na planilha.")
    if (!imovel) return plano("sem_imovel", `Nenhum imóvel ativo "${linha.unidade}" em ${empreendimento}.`)
    if (!temData) return plano("sem_data", `Planilha tem ${linha.inquilino}, mas sem início nem término.`)
    if (!linha.inquilino) return plano("sem_inquilino", "Planilha tem datas, mas não diz o inquilino.")
    if (!porEndereco && !mesmoLocatario(linha.inquilino, imovel.inquilino_nome)) {
      return plano(
        "inquilino_divergente",
        `Planilha diz ${linha.inquilino}; cadastro diz ${imovel.inquilino_nome ?? "vago"}.`,
      )
    }
    const inicioAtual = imovel.contrato_inicio ? String(imovel.contrato_inicio).slice(0, 10) : null
    const terminoAtual = imovel.contrato_termino ? String(imovel.contrato_termino).slice(0, 10) : null
    if (inicioAtual && linha.inicio && inicioAtual > linha.inicio) {
      return plano("cadastro_mais_recente", `Cadastro já tem contrato a partir de ${inicioAtual}.`)
    }
    if (inicioAtual === linha.inicio && terminoAtual === linha.termino) return plano("ja_aplicado", "Cadastro já tem este prazo.")
    const notas = [
      linha.terminoTexto ? `TERMINO na planilha: "${linha.terminoTexto}" (sem data).` : null,
      porEndereco ? `Imóvel identificado pelo endereço; locatário ${linha.inquilino} não é conferível no cadastro.` : null,
    ].filter(Boolean)
    return plano("aplicar", notas.join(" "))
  })
}
