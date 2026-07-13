export type FechamentoListStatus =
  | "rascunho"
  | "pendente"
  | "aprovado"
  | "processando"
  | "erro_processamento"
  | "preparado_egestor"
  | "lancado_egestor"
  | "erro_egestor"

export interface FechamentoListPresentation {
  status: FechamentoListStatus
  href: string
  actionLabel: string
}

export interface FechamentoListInput {
  id: string
  dbStatus: string
  processamentoStatus: string | null
  processamentoAtualizadoEm: string | null
  agora?: string
}

const STUCK_AFTER_MS = 15 * 60 * 1000

export function resolveFechamentoListPresentation(
  input: FechamentoListInput,
): FechamentoListPresentation {
  const { id, dbStatus, processamentoStatus } = input

  if (processamentoStatus === "processando" && isProcessingFresh(input)) {
    return {
      status: "processando",
      href: `/fechamentos/${id}/processando`,
      actionLabel: "Acompanhar",
    }
  }

  if (processamentoStatus === "erro" || processamentoStatus === "processando") {
    return {
      status: "erro_processamento",
      href: `/fechamentos/${id}/upload`,
      actionLabel: "Tentar novamente",
    }
  }

  if (dbStatus === "rascunho") {
    return {
      status: "rascunho",
      href: `/fechamentos/${id}/upload`,
      actionLabel: "Enviar documentos",
    }
  }

  const status = mapCompletedStatus(dbStatus)
  return {
    status,
    href: `/fechamentos/${id}/revisao`,
    actionLabel: status === "pendente" ? "Revisar" : "Ver detalhes",
  }
}

function isProcessingFresh(input: FechamentoListInput) {
  const updatedAt = input.processamentoAtualizadoEm ? new Date(input.processamentoAtualizadoEm).getTime() : 0
  const now = input.agora ? new Date(input.agora).getTime() : Date.now()
  return updatedAt > 0 && Number.isFinite(now) && now - updatedAt < STUCK_AFTER_MS
}

function mapCompletedStatus(dbStatus: string): Exclude<FechamentoListStatus, "rascunho" | "processando" | "erro_processamento"> {
  if (dbStatus === "lancado_egestor") return "lancado_egestor"
  if (dbStatus === "preparado_egestor") return "preparado_egestor"
  if (dbStatus === "erro_egestor") return "erro_egestor"
  if (dbStatus === "aprovado") return "aprovado"
  return "pendente"
}
