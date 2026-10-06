// Prazo do contrato de locação no cadastro do imóvel (início e término
// previsto, com o dia). Pedido do cliente (WhatsApp, 2026-10-02): a planilha
// CADASTRO INQUILINOS traz início e término de cada contrato, e os contratos
// novos passam a vir no relatório de vigência — "com a leitura do documento o
// sistema vai se mantendo atualizado".
//
// Não confundir com `contratos_locacao` / `imovel_vigencias`: aqueles têm grão
// de mês e descrevem o que os fechamentos comprovaram para os Indicadores. Aqui
// é o prazo que o contrato assinado declara, e não altera nenhum número.

export type EstadoPrazo =
  | "sem_data"
  | "a_iniciar"
  | "vigente"
  | "vence_em_breve"
  | "vencido"
  | "outro_inquilino"

export interface PrazoContrato {
  contrato_inicio: string | null
  contrato_termino: string | null
  contrato_locatario: string | null
  inquilino_nome: string | null
}

export interface SituacaoPrazo {
  estado: EstadoPrazo
  /** Dias até o término (negativo quando já venceu); null sem término. */
  diasParaTermino: number | null
}

/** Janela do alerta "vence em breve": três meses, o prazo usual de aviso. */
export const DIAS_ALERTA_VENCIMENTO = 90

const DIA_MS = 24 * 60 * 60 * 1000

export function normalizarLocatario(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function mesmoLocatario(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizarLocatario(a)
  return x.length > 0 && x === normalizarLocatario(b)
}

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / DIA_MS)
}

/**
 * O prazo pertence a quem assinou. Se o cadastro já mostra outro inquilino
 * (a ocupação foi atualizada por um fechamento e nenhum documento trouxe o
 * contrato novo), as datas são do contrato anterior e não valem para a unidade.
 */
export function situacaoPrazo(prazo: PrazoContrato, hojeISO: string): SituacaoPrazo {
  if (!prazo.contrato_inicio && !prazo.contrato_termino) return { estado: "sem_data", diasParaTermino: null }
  if (prazo.contrato_locatario && prazo.inquilino_nome && !mesmoLocatario(prazo.contrato_locatario, prazo.inquilino_nome)) {
    return { estado: "outro_inquilino", diasParaTermino: null }
  }
  const dias = prazo.contrato_termino ? diasEntre(hojeISO, prazo.contrato_termino) : null
  if (prazo.contrato_inicio && prazo.contrato_inicio > hojeISO) return { estado: "a_iniciar", diasParaTermino: dias }
  if (dias === null) return { estado: "vigente", diasParaTermino: null }
  if (dias < 0) return { estado: "vencido", diasParaTermino: dias }
  if (dias <= DIAS_ALERTA_VENCIMENTO) return { estado: "vence_em_breve", diasParaTermino: dias }
  return { estado: "vigente", diasParaTermino: dias }
}

export interface DataCivil {
  iso: string
  /** O documento trouxe um dia que o mês não tem (ex.: 30/02) e foi levado ao último dia. */
  ajustada: boolean
}

/**
 * Data de calendário a partir de dia/mês/ano impressos. O relatório de agosto
 * do GM II diz "Previsão de término: 30/02/2029": o dia que não existe vira o
 * último dia do mês, e o chamador registra o ajuste em vez de descartar o prazo.
 */
export function dataCivil(dia: number, mes: number, ano: number): DataCivil | null {
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(ano)) return null
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const anoCompleto = ano < 100 ? 2000 + ano : ano
  const ultimoDia = new Date(Date.UTC(anoCompleto, mes, 0)).getUTCDate()
  const diaValido = Math.min(dia, ultimoDia)
  return {
    iso: `${anoCompleto}-${String(mes).padStart(2, "0")}-${String(diaValido).padStart(2, "0")}`,
    ajustada: diaValido !== dia,
  }
}

export function formatarDataCurta(iso: string | null | undefined) {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.slice(0, 10).split("-")
  return `${dia}/${mes}/${ano.slice(2)}`
}

/**
 * Um contrato declarado vira o vigente do imóvel quando começa no mesmo dia ou
 * depois do atual. Um que começou antes é histórico: entra na lista de
 * contratos sem trocar o prazo que a lista de imóveis mostra.
 */
export function viraVigente(inicioAtual: string | null | undefined, inicioNovo: string) {
  return !inicioAtual || inicioNovo.slice(0, 10) >= inicioAtual.slice(0, 10)
}

export type DestinoEdicao = "substituir" | "acrescentar"

/**
 * Editar o prazo no formulário do imóvel: do mesmo locatário é correção do
 * contrato que já estava lá (a linha antiga sai); de outro locatário é um
 * contrato novo, e o antigo continua no histórico.
 */
export function destinoDaEdicao(
  anterior: { inicio: string | null; locatario: string | null } | null,
  locatarioNovo: string | null,
): DestinoEdicao {
  if (!anterior?.inicio) return "acrescentar"
  if (!anterior.locatario || !locatarioNovo) return "substituir"
  return mesmoLocatario(anterior.locatario, locatarioNovo) ? "substituir" : "acrescentar"
}
