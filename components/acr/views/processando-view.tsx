"use client"

import { AlertTriangle, CheckCircle, Clock, FileText, Loader2 } from "lucide-react"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { getFechamentoLabel } from "@/lib/fechamento-context"
import type { ProcessingEvent } from "@/lib/prestacao-types"
import type { View } from "../types"

interface ProcessandoViewProps {
  onNavigate: (view: View) => void
  processing: {
    status: "idle" | "running" | "success" | "error"
    message: string
    error: string | null
  }
  events: ProcessingEvent[]
  activeFechamento: FechamentoContext | null
}

function getEventLabel(event: ProcessingEvent) {
  const suffix = event.fileName ? ` - ${event.fileName}` : ""
  if (event.type === "workflow_started") return `Workflow iniciado${suffix}`
  if (event.type === "file_saved") return `Arquivo salvo${suffix}`
  if (event.type === "document_classified") return `Documento classificado${suffix}`
  if (event.type === "extraction_started") return `Extracao iniciada${suffix}`
  if (event.type === "extraction_completed") return `Extracao concluida${suffix}`
  if (event.type === "validation_started") return "Validacao deterministica iniciada"
  if (event.type === "validation_completed") return "Validacao deterministica concluida"
  if (event.type === "persistence_completed") return "Persistencia concluida"
  if (event.type === "workflow_completed") return "Workflow concluido"
  return "Workflow interrompido"
}

export function ProcessandoView({ onNavigate, processing, events, activeFechamento }: ProcessandoViewProps) {
  const isError = processing.status === "error"
  const isSuccess = processing.status === "success"
  const latestEvent = events.at(-1)
  const progress = latestEvent?.progress ?? 0

  return (
    <div>
      <div className="max-w-3xl mx-auto bg-[#EFF7F1] border-l-4 border-[#2D8C3A] rounded-lg p-3 flex items-center gap-2 mb-4">
        <FileText size={16} className="text-[#2D8C3A]" />
        <span className="text-[13px] text-[#3D4F3F] font-medium">
          {getFechamentoLabel(activeFechamento)}
        </span>
      </div>

      <div className="max-w-lg mx-auto bg-white rounded-xl p-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
        <div
          className={`h-14 w-14 border-4 border-[#EEF1EE] rounded-full mx-auto mb-4 ${
            isError ? "border-t-[#DC2626]" : "border-t-[#2D8C3A] animate-spin"
          }`}
        />

        <h2 className="text-[20px] font-bold text-[#1A2B1C] mb-2">
          {isError ? "Nao foi possivel analisar" : isSuccess ? "Analise concluida" : "Analisando os documentos..."}
        </h2>
        <p className="text-[14px] text-[#6B7F6E] max-w-sm mx-auto mb-8">
          {isError ? processing.error : latestEvent?.message ?? processing.message}
        </p>

        <ul className="text-left max-w-sm mx-auto space-y-3">
          {events.length === 0 && (
            <li className="flex items-center gap-3">
              <Clock size={20} className="text-[#D5DDD6] shrink-0" />
              <span className="flex-1 text-[14px] text-[#6B7F6E]">Aguardando primeiro evento do servidor</span>
              <span className="text-[12px] text-[#6B7F6E]">Aguardando</span>
            </li>
          )}

          {events.map((event, index) => {
            const isLatest = index === events.length - 1
            const failed = event.type === "workflow_failed"
            const completed = event.type === "workflow_completed" || (!isLatest && !failed)

            return (
              <li key={`${event.type}-${index}-${event.fileName ?? "workflow"}`} className="flex items-center gap-3">
                {failed && <AlertTriangle size={20} className="text-[#DC2626] shrink-0" />}
                {!failed && completed && <CheckCircle size={20} className="text-[#22C55E] shrink-0" />}
                {!failed && !completed && <Loader2 size={20} className="text-[#2D8C3A] animate-spin shrink-0" />}

                <span className={`flex-1 text-[14px] ${isLatest ? "font-bold text-[#1A2B1C]" : "text-[#3D4F3F]"}`}>
                  {getEventLabel(event)}
                </span>

                <span className={`text-[12px] ${failed ? "text-[#DC2626]" : isLatest ? "text-[#2D8C3A] font-medium" : "text-[#22C55E]"}`}>
                  {failed ? "Erro" : completed ? "Concluido" : "Em andamento"}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 bg-[#EEF1EE] rounded-full h-2 max-w-sm mx-auto overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isError ? "bg-[#DC2626]" : "bg-[#2D8C3A]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[12px] text-[#6B7F6E] text-center mt-2">
          {isError ? "Processamento interrompido" : isSuccess ? "Processamento concluido" : `${progress}% processado`}
        </p>

        <button
          onClick={() => onNavigate(isError ? "upload" : "fechamentos")}
          className="block mx-auto mt-6 h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] transition-colors"
        >
          {isError ? "Voltar ao upload" : "Fechar e aguardar notificacao"}
        </button>
      </div>
    </div>
  )
}
