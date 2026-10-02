/**
 * Prazo do contrato novo (relatório de vigência) -> cadastro do imóvel, na
 * aprovação.
 *
 * Pedido do cliente (WhatsApp, 2026-10-02): "Os novos contratos serão
 * informados neste documento à medida que forem sendo firmados, com a leitura
 * do documento o sistema vai se mantendo atualizado." O documento é o
 * relatório de vigência da Alive (documento 3 do pacote), seção APARTAMENTO
 * ALUGADO: "Início de vigência dia 31/08/2026. Previsão de término: 30/02/2029."
 *
 * Leitura determinística (`reajuste-relatorio-parser.ts`), sem IA, pelo mesmo
 * motivo do reajuste: o layout é estável e erro de leitura precisa falhar.
 * Roda na APROVAÇÃO, como o reajuste: é ela que dá o documento por bom.
 *
 * Guarda: um relatório mais antigo não regride o cadastro. Se o imóvel já tem
 * um contrato com início POSTERIOR ao do relatório (aprovar julho depois de
 * agosto), nada muda. Toda troca vai para `auditoria_correcoes`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { formatarDataCurta, mesmoLocatario } from "@/lib/contrato-prazo"
import { encontrarImovel, type ImovelParaReajuste } from "./reajuste-cadastro"
import { extractPdfTextLines } from "./cesar-rego-parser"
import { parseRelatorioReajuste, type NovoContrato, type RelatorioReajuste } from "./reajuste-relatorio-parser"

const BUCKET = "fechamento-documentos"

export type ResultadoPrazo = "aplicado" | "ja_aplicado" | "sem_imovel" | "sem_data" | "cadastro_mais_recente"

export interface DecisaoPrazo {
  apto: string
  inquilino: string
  inicio: string | null
  termino: string | null
  resultado: ResultadoPrazo
  detalhe: string
}

export interface ImovelComPrazo extends ImovelParaReajuste {
  contrato_inicio: string | null
  contrato_termino: string | null
  contrato_locatario: string | null
}

export interface PlanoPrazo extends DecisaoPrazo {
  imovel: ImovelComPrazo | null
}

function dia(valor: string | null | undefined) {
  return valor ? String(valor).slice(0, 10) : null
}

export function descreverPrazo(inicio: string | null, termino: string | null, locatario: string | null) {
  if (!inicio && !termino) return "sem prazo"
  const periodo = `${formatarDataCurta(inicio)} a ${formatarDataCurta(termino)}`
  return locatario ? `${periodo} (${locatario})` : periodo
}

export function planejarPrazosDoRelatorio(contratos: NovoContrato[], imoveis: ImovelComPrazo[]): PlanoPrazo[] {
  return contratos.map((contrato) => {
    const base = {
      apto: contrato.apto,
      inquilino: contrato.inquilino,
      inicio: contrato.vigenciaInicio,
      termino: contrato.vigenciaTermino,
    }
    const ajuste = contrato.dataAjustada ? " Data impressa inexistente no calendário foi levada ao último dia do mês." : ""
    if (!contrato.vigenciaInicio && !contrato.vigenciaTermino) {
      return { ...base, imovel: null, resultado: "sem_data", detalhe: "Relatório não informa início nem término." }
    }
    const imovel = encontrarImovel(contrato.apto, imoveis) as ImovelComPrazo | null
    if (!imovel) {
      return { ...base, imovel: null, resultado: "sem_imovel", detalhe: "Nenhum imóvel ativo com essa unidade no empreendimento." }
    }
    const inicioAtual = dia(imovel.contrato_inicio)
    const terminoAtual = dia(imovel.contrato_termino)
    if (inicioAtual && contrato.vigenciaInicio && inicioAtual > contrato.vigenciaInicio) {
      return {
        ...base,
        imovel,
        resultado: "cadastro_mais_recente",
        detalhe: `Cadastro já tem contrato posterior (${descreverPrazo(inicioAtual, terminoAtual, imovel.contrato_locatario)}).`,
      }
    }
    if (
      inicioAtual === contrato.vigenciaInicio
      && terminoAtual === contrato.vigenciaTermino
      && mesmoLocatario(imovel.contrato_locatario, contrato.inquilino)
    ) {
      return { ...base, imovel, resultado: "ja_aplicado", detalhe: "Cadastro já tem este prazo." }
    }
    return {
      ...base,
      imovel,
      resultado: "aplicado",
      detalhe: `${descreverPrazo(inicioAtual, terminoAtual, imovel.contrato_locatario)} -> ${descreverPrazo(contrato.vigenciaInicio, contrato.vigenciaTermino, contrato.inquilino)}.${ajuste}`,
    }
  })
}

export type LeituraRelatorio =
  | { relatorio: RelatorioReajuste; documentoId: string; nomeArquivo: string }
  | { relatorio: null; motivo: string }

/**
 * Relatório de vigência do fechamento, lido do Storage. O documento pode estar
 * classificado como `desconhecido` (a confiança da IA ficou abaixo do limiar);
 * o nome do arquivo também decide. O nome vem do upload em NFD ("RELATO" +
 * acento combinante), então comparar sem normalizar nunca casa "RELATORIO".
 */
export async function lerRelatorioDeVigencia(supabase: SupabaseClient, fechamentoId: string): Promise<LeituraRelatorio> {
  const { data, error } = await supabase
    .from("documentos_fechamento")
    .select("id,nome_arquivo,arquivo_url,tipo_documento")
    .eq("fechamento_id", fechamentoId)
  if (error) throw error
  const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  const candidato = (data ?? []).find(
    (documento) =>
      documento.tipo_documento === "relatorio_reajuste" || semAcento(documento.nome_arquivo ?? "").includes("RELATORIO"),
  )
  if (!candidato?.arquivo_url) return { relatorio: null, motivo: "fechamento sem relatório de vigência" }

  const download = await supabase.storage.from(BUCKET).download(candidato.arquivo_url)
  if (download.error) {
    return { relatorio: null, motivo: `relatório ${candidato.nome_arquivo} indisponível no Storage (${download.error.message})` }
  }
  const linhas = await extractPdfTextLines(Buffer.from(await download.data.arrayBuffer()))
  try {
    return {
      relatorio: parseRelatorioReajuste(linhas.map((linha) => linha.text).join("\n")),
      documentoId: candidato.id,
      nomeArquivo: candidato.nome_arquivo ?? "",
    }
  } catch (erro) {
    return {
      relatorio: null,
      motivo: `${candidato.nome_arquivo} não é um relatório de vigência legível (${erro instanceof Error ? erro.message : String(erro)})`,
    }
  }
}

export async function aplicarPrazosDoRelatorioDoFechamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  options: { dryRun?: boolean; usuario?: string } = {},
): Promise<DecisaoPrazo[]> {
  const leitura = await lerRelatorioDeVigencia(supabase, fechamentoId)
  if (!leitura.relatorio) return []
  const contratos = leitura.relatorio.novosContratos
  if (contratos.length === 0) return []

  const { data: fechamento, error: erroFechamento } = await supabase
    .from("fechamentos")
    .select("id,imobiliaria_id,empreendimento_id")
    .eq("id", fechamentoId)
    .single()
  if (erroFechamento) throw erroFechamento

  const { data: imoveisRaw, error: erroImoveis } = await supabase
    .from("imoveis")
    .select("id,codigo_imobiliaria,unidade,valor_aluguel_esperado,contrato_inicio,contrato_termino,contrato_locatario")
    .eq("imobiliaria_id", fechamento.imobiliaria_id)
    .eq("empreendimento_id", fechamento.empreendimento_id)
    .eq("ativo", true)
  if (erroImoveis) throw erroImoveis

  const [ano, mes] = leitura.relatorio.competencia.split("-")
  const fonte = `Relatório de vigência ${mes}/${ano}`
  const planos = planejarPrazosDoRelatorio(contratos, (imoveisRaw ?? []) as ImovelComPrazo[])
  const decisoes: DecisaoPrazo[] = []

  for (const { imovel, ...decisao } of planos) {
    if (decisao.resultado !== "aplicado" || !imovel || options.dryRun) {
      decisoes.push(options.dryRun && decisao.resultado === "aplicado" ? { ...decisao, detalhe: `[dry-run] ${decisao.detalhe}` } : decisao)
      continue
    }
    const { error } = await supabase
      .from("imoveis")
      .update({
        contrato_inicio: decisao.inicio,
        contrato_termino: decisao.termino,
        contrato_locatario: decisao.inquilino,
        contrato_fonte: fonte,
      })
      .eq("id", imovel.id)
    if (error) throw error

    const { error: erroAuditoria } = await supabase.from("auditoria_correcoes").insert({
      fechamento_id: fechamentoId,
      usuario: options.usuario ?? "Sistema",
      campo_alterado: `imoveis.contrato[${imovel.unidade ?? decisao.apto}]`,
      valor_anterior: descreverPrazo(dia(imovel.contrato_inicio), dia(imovel.contrato_termino), imovel.contrato_locatario),
      valor_novo: descreverPrazo(decisao.inicio, decisao.termino, decisao.inquilino),
      justificativa: `Contrato novo declarado no ${fonte} (${leitura.nomeArquivo}), aplicado ao prazo do contrato no cadastro.`,
    })
    if (erroAuditoria) throw erroAuditoria
    decisoes.push(decisao)
  }
  return decisoes
}
