import { createSupabaseAdmin } from "@/lib/server/supabase"
import { IPTU_PARCELAS_PADRAO, calcularNovasParcelas, calcularResponsavel, resolverImovelId } from "@/lib/iptu-logic"
import type { IptuAnomalia, IptuExtracao, IptuImportacao, IptuResponsavel } from "@/lib/iptu-types"
import type { ImovelStatus } from "@/lib/cadastros-types"

const BUCKET = "iptu-certidoes"

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
}

interface ImovelRow {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  unidade: string
  status: ImovelStatus
}

export interface ImportarCertidaoInput {
  imobiliariaId: string
  empreendimentoId: string
  fileName: string
  fileType: string
  fileBuffer: Buffer
  extracao: IptuExtracao
}

export interface ImportarCertidaoResultado {
  importacaoId: string
  parcelasNovas: number
  apartamentosNaoVinculados: string[]
  anomalias: IptuAnomalia[]
}

// NOTA: esta funcao nao e transacional entre Storage e banco. Se um insert por
// apartamento falhar no meio do loop, o PDF ja enviado ao Storage e a linha de
// iptu_importacoes ja gravada nao sao revertidos (ficam orfaos). Isso e aceito
// para este registro passivo/auditoria de IPTU: nao ha dado financeiro em risco,
// pois os valores de despesa efetivos continuam fluindo pelo pipeline separado
// de reconciliacao em despesas-locador.
export async function importarCertidaoIptu(input: ImportarCertidaoInput): Promise<ImportarCertidaoResultado> {
  const supabase = createSupabaseAdmin()

  const storagePath = `certidoes/${Date.now()}-${sanitizeFilename(input.fileName)}`
  const upload = await supabase.storage.from(BUCKET).upload(storagePath, input.fileBuffer, {
    contentType: input.fileType,
    upsert: false,
  })
  if (upload.error) throw upload.error

  const { data: importacao, error: importacaoError } = await supabase
    .from("iptu_importacoes")
    .insert({
      empreendimento_id: input.empreendimentoId,
      arquivo_nome: input.fileName,
      arquivo_path: storagePath,
      competencia_relatorio: input.extracao.competencia_relatorio,
      resultado_bruto: input.extracao,
      apartamentos_nao_vinculados: [],
      anomalias: [],
    })
    .select("id")
    .single()
  if (importacaoError) throw importacaoError

  const { data: imoveisData, error: imoveisError } = await supabase
    .from("imoveis")
    .select("id, imobiliaria_id, empreendimento_id, unidade, status")
    .eq("imobiliaria_id", input.imobiliariaId)
    .eq("empreendimento_id", input.empreendimentoId)
  if (imoveisError) throw imoveisError

  const imoveis = (imoveisData ?? []) as ImovelRow[]
  const apartamentosNaoVinculados: string[] = []
  const anomalias: IptuAnomalia[] = []
  let parcelasNovas = 0

  for (const apartamento of input.extracao.apartamentos) {
    const imovelId = resolverImovelId(imoveis, input.imobiliariaId, input.empreendimentoId, apartamento.unidade)
    if (!imovelId) {
      apartamentosNaoVinculados.push(apartamento.unidade)
      continue
    }

    const imovel = imoveis.find((i) => i.id === imovelId)!
    const anoReferencia = apartamento.ano_carne ?? Number(input.extracao.competencia_relatorio.split("/")[1])

    const carne = await buscarOuCriarCarne(supabase, imovelId, anoReferencia)

    const { count: parcelasPagasAtual, error: contagemError } = await supabase
      .from("iptu_parcelas")
      .select("id", { count: "exact", head: true })
      .eq("carne_id", carne.id)
      .eq("pago", true)
    if (contagemError) throw contagemError

    const { numerosNovos, anomalia } = calcularNovasParcelas(
      parcelasPagasAtual ?? 0,
      apartamento.parcelas_pagas,
      carne.numero_parcelas,
    )

    if (anomalia) {
      anomalias.push({
        unidade: apartamento.unidade,
        tipo: anomalia,
        detalhe: `parcelas informadas: ${apartamento.parcelas_pagas}, registradas: ${parcelasPagasAtual ?? 0}, carne: ${carne.numero_parcelas}`,
      })
    }

    if (numerosNovos.length > 0) {
      const responsavel = calcularResponsavel(imovel.status)
      const { error: insertError } = await supabase.from("iptu_parcelas").insert(
        numerosNovos.map((numero) => ({
          carne_id: carne.id,
          numero,
          pago: true,
          responsavel,
          status_imovel_no_registro: imovel.status,
          origem_importacao_id: importacao.id,
          registrado_em: new Date().toISOString(),
        })),
      )
      if (insertError) throw insertError
      parcelasNovas += numerosNovos.length
    }
  }

  const { error: updateError } = await supabase
    .from("iptu_importacoes")
    .update({ apartamentos_nao_vinculados: apartamentosNaoVinculados, anomalias })
    .eq("id", importacao.id)
  if (updateError) throw updateError

  return {
    importacaoId: importacao.id,
    parcelasNovas,
    apartamentosNaoVinculados,
    anomalias,
  }
}

async function buscarOuCriarCarne(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  imovelId: string,
  anoReferencia: number,
) {
  const { data: existente, error: buscaError } = await supabase
    .from("iptu_carnes")
    .select("id, numero_parcelas")
    .eq("imovel_id", imovelId)
    .eq("ano_referencia", anoReferencia)
    .maybeSingle()
  if (buscaError) throw buscaError
  if (existente) return existente as { id: string; numero_parcelas: number }

  const { data: criado, error: criaError } = await supabase
    .from("iptu_carnes")
    .insert({ imovel_id: imovelId, ano_referencia: anoReferencia, numero_parcelas: IPTU_PARCELAS_PADRAO })
    .select("id, numero_parcelas")
    .single()
  if (criaError) throw criaError
  return criado as { id: string; numero_parcelas: number }
}

export interface IptuParcelaRow {
  id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  registrado_em: string | null
}

export interface IptuCarneComParcelas {
  id: string
  imovel_id: string
  unidade: string
  inquilino_nome: string | null
  ano_referencia: number
  numero_parcelas: number
  parcelas: IptuParcelaRow[]
}

export async function listarIptuPorEmpreendimento(empreendimentoId: string): Promise<IptuCarneComParcelas[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("iptu_carnes")
    .select(
      `
      id,
      imovel_id,
      ano_referencia,
      numero_parcelas,
      imoveis!inner ( unidade, inquilino_nome, empreendimento_id ),
      iptu_parcelas ( id, numero, pago, responsavel, status_imovel_no_registro, registrado_em )
    `,
    )
    .eq("imoveis.empreendimento_id", empreendimentoId)
    .order("ano_referencia", { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => {
    const imovel = row.imoveis as unknown as { unidade: string; inquilino_nome: string | null }
    const parcelas = (row.iptu_parcelas ?? []) as IptuParcelaRow[]
    return {
      id: row.id,
      imovel_id: row.imovel_id,
      unidade: imovel.unidade,
      inquilino_nome: imovel.inquilino_nome,
      ano_referencia: row.ano_referencia,
      numero_parcelas: row.numero_parcelas,
      parcelas: [...parcelas].sort((a, b) => a.numero - b.numero),
    }
  })
}

export async function atualizarResponsavelParcela(
  parcelaId: string,
  responsavel: IptuResponsavel,
): Promise<IptuParcelaRow> {
  const supabase = createSupabaseAdmin()
  const { data: parcela, error: buscaError } = await supabase
    .from("iptu_parcelas")
    .select("id, pago")
    .eq("id", parcelaId)
    .single()
  if (buscaError) throw buscaError
  if (!parcela.pago) {
    throw new Error("So e possivel definir responsavel em parcelas pagas.")
  }

  const { data, error } = await supabase
    .from("iptu_parcelas")
    .update({ responsavel })
    .eq("id", parcelaId)
    .select("id, numero, pago, responsavel, status_imovel_no_registro, registrado_em")
    .single()
  if (error) throw error
  return data as IptuParcelaRow
}

export async function atualizarNumeroParcelasCarne(
  carneId: string,
  numeroParcelas: number,
): Promise<{ id: string; numero_parcelas: number }> {
  const supabase = createSupabaseAdmin()
  const { count, error: countError } = await supabase
    .from("iptu_parcelas")
    .select("id", { count: "exact", head: true })
    .eq("carne_id", carneId)
    .eq("pago", true)
  if (countError) throw countError
  if ((count ?? 0) > numeroParcelas) {
    throw new Error("numero_parcelas nao pode ser menor que a quantidade ja paga.")
  }

  const { data, error } = await supabase
    .from("iptu_carnes")
    .update({ numero_parcelas: numeroParcelas })
    .eq("id", carneId)
    .select("id, numero_parcelas")
    .single()
  if (error) throw error
  return data
}

export async function listarImportacoesPorEmpreendimento(empreendimentoId: string): Promise<IptuImportacao[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("iptu_importacoes")
    .select("id, empreendimento_id, arquivo_nome, arquivo_path, competencia_relatorio, resultado_bruto, apartamentos_nao_vinculados, anomalias, criado_em")
    .eq("empreendimento_id", empreendimentoId)
    .order("criado_em", { ascending: false })
  if (error) throw error
  return (data ?? []) as IptuImportacao[]
}
