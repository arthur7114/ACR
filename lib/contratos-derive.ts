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
      fechar(snapshot.competencia)
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

function inferirValor(meses: SnapshotMes[]): ContratoDerivado["valores"] {
  // Proporcionais acontecem na entrada e na saída: descartar extremos quando possível.
  const candidatos =
    meses.length > 2 ? meses.slice(1, -1) : meses
  const comValor = candidatos
    .filter((mes) => (mes.aluguelCompetencia ?? 0) > 0)
  const escolhido =
    comValor.length > 0
      ? comValor[comValor.length - 1]
      : [...meses]
          .filter((mes) => (mes.aluguelCompetencia ?? 0) > 0)
          .sort((a, b) => (a.aluguelCompetencia ?? 0) - (b.aluguelCompetencia ?? 0))
          .pop()
  if (!escolhido) return []
  return [
    {
      vigenciaInicio: meses[0].competencia,
      valor: escolhido.aluguelCompetencia as number,
      origem: "inferido",
    },
  ]
}
