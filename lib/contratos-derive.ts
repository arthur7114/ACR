import { normalizePropertyKeyPart } from "./indicadores-domain"

export interface SnapshotMes {
  competencia: string
  statusOcupacao:
    | "ocupado"
    | "alugado_app"
    | "inadimplente"
    | "vago"
    | "em_rescisao"
    | "desconhecido"
  inquilinoNome: string | null
  aluguelCompetencia: number | null
  aluguelRecebido: number | null
}

export interface ContratoDerivado {
  locatarioNome: string
  inicio: string
  fim: string | null
  valores: Array<{ vigenciaInicio: string; valor: number; origem: "inferido" }>
}

const STATUS_COM_CONTRATO = new Set(["ocupado", "inadimplente", "em_rescisao"])

function nextMonth(competencia: string): string {
  const [year, month] = competencia.split("-").map(Number)
  const date = new Date(Date.UTC(year, month, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Converte o `fim` exclusivo de ContratoDerivado (primeiro mês não coberto)
 * para a convenção inclusiva (último mês coberto) esperada pela constraint de
 * exclusão do banco em `contratos_locacao.fim` (que soma 1 dia a `fim` — ver
 * `supabase/migrations/202608050001_contratos_locacao.sql`). Use apenas na
 * fronteira de escrita da linha do banco; todo cálculo em memória sobre
 * `ContratoDerivado` deve continuar usando o `fim` exclusivo original.
 */
export function fimParaBanco(fimExclusivo: string | null): string | null {
  return fimExclusivo ? previousMonth(fimExclusivo) : null
}

/**
 * Converte de volta: do `fim` inclusivo armazenado no banco para o `fim`
 * exclusivo usado nos cálculos em memória (comparações `data < fim`).
 */
export function fimDoBanco(fimInclusivo: string | null): string | null {
  return fimInclusivo ? nextMonth(fimInclusivo) : null
}

function previousMonth(competencia: string): string {
  const [year, month] = competencia.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
}

export function deriveContracts(snapshots: SnapshotMes[]): ContratoDerivado[] {
  const ordered = [...snapshots].sort((a, b) =>
    a.competencia.localeCompare(b.competencia),
  )
  const contratos: ContratoDerivado[] = []
  let atual: { locatario: string; nome: string; meses: SnapshotMes[] } | null = null

  const fechar = (fim: string | null) => {
    if (!atual) return
    contratos.push({
      locatarioNome: atual.nome,
      inicio: atual.meses[0].competencia,
      fim,
      valores: inferirValor(atual.meses),
    })
    atual = null
  }

  for (const snapshot of ordered) {
    const chave = normalizePropertyKeyPart(snapshot.inquilinoNome ?? "")
    if (snapshot.statusOcupacao === "desconhecido") continue // não abre nem fecha
    if (!STATUS_COM_CONTRATO.has(snapshot.statusOcupacao)) {
      // vago ou alugado_app: qualquer contrato aberto termina aqui.
      fechar(snapshot.competencia)
      continue
    }
    if (atual && chave && atual.locatario !== chave) {
      fechar(nextMonth(atual.meses[atual.meses.length - 1].competencia))
    }
    if (!atual) {
      atual = {
        locatario: chave,
        nome: snapshot.inquilinoNome ?? "Locatário não identificado",
        meses: [],
      }
    }
    atual.meses.push(snapshot)
  }
  fechar(null)
  return contratos
}

// A série de valores acompanha reajuste: uma linha por mudança de aluguel, com
// a vigência começando no mês em que o novo valor apareceu. Antes daqui saía um
// valor único por contrato, e o mês proporcional era descartado cortando o
// primeiro e o último da janela às cegas — o que jogava fora todo reajuste que
// entrasse em vigor no último mês conhecido (9 unidades subestimadas em
// jun/2026).
//
// Mês proporcional cobre parte do mês, então fica MUITO abaixo do mês cheio
// vizinho: nos dados reais de 2026 os proporcionais observados vão de 3% a 37%
// do valor cheio (rescisões de 1 a ~11 dias). Já a variação normal de aluguel
// entre meses fica acima de 95%. O corte em 80% separa os dois casos com folga
// dos dois lados — sem ele, um aluguel que oscila para baixo por centavos era
// lido como proporcional e descartava o mês mais recente.
const LIMITE_PROPORCIONAL = 0.8

function inferirValor(meses: SnapshotMes[]): ContratoDerivado["valores"] {
  // Mês sem aluguel (inadimplente, dado ausente) não é evidência de valor:
  // não abre vigência nova nem interrompe a série.
  let comValor = meses.filter((mes) => (mes.aluguelCompetencia ?? 0) > 0)

  // Inquilino que paga sempre atrasado não tem aluguel em NENHUMA competência:
  // todo recebimento é atraso de mês anterior. Sem este resgate o contrato
  // ficaria sem valor e a unidade desapareceria da inadimplência. Só vale como
  // último recurso, porque o recebido pode embutir garagem e encargos — daí ser
  // restrito ao caso em que não há aluguel de competência algum.
  if (comValor.length === 0) {
    comValor = meses
      .filter((mes) => (mes.aluguelRecebido ?? 0) > 0)
      .map((mes) => ({ ...mes, aluguelCompetencia: mes.aluguelRecebido }))
  }
  if (comValor.length === 0) return []

  const ehProporcional = (extremo: SnapshotMes, vizinho: SnapshotMes) =>
    (extremo.aluguelCompetencia as number) <
    (vizinho.aluguelCompetencia as number) * LIMITE_PROPORCIONAL

  const cheios = [...comValor]
  if (cheios.length > 1 && ehProporcional(cheios[0], cheios[1])) cheios.shift()
  if (cheios.length > 1 && ehProporcional(cheios[cheios.length - 1], cheios[cheios.length - 2])) {
    cheios.pop()
  }
  if (cheios.length === 0) return []

  const valores: ContratoDerivado["valores"] = []
  for (const mes of cheios) {
    const valor = mes.aluguelCompetencia as number
    const anterior = valores[valores.length - 1]
    if (anterior && Math.abs(anterior.valor - valor) <= 0.01) continue
    valores.push({
      // A primeira vigência vale desde o início do contrato, não desde o mês em
      // que o aluguel foi observado: o proporcional de entrada é do mesmo contrato.
      vigenciaInicio: valores.length === 0 ? meses[0].competencia : mes.competencia,
      valor,
      origem: "inferido",
    })
  }
  return valores
}
