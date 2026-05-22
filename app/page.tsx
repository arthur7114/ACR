"use client"

import { useState } from "react"
import { Sidebar } from "@/components/acr/sidebar"
import { Topbar } from "@/components/acr/topbar"
import { FechamentosView } from "@/components/acr/views/fechamentos-view"
import { NovoFechamentoView } from "@/components/acr/views/novo-fechamento-view"
import { UploadView } from "@/components/acr/views/upload-view"
import { ProcessandoView } from "@/components/acr/views/processando-view"
import { RevisaoView } from "@/components/acr/views/revisao-view"
import { PlaceholderView } from "@/components/acr/views/placeholder-view"
import { CorrectionModal } from "@/components/acr/correction-modal"
import type { View } from "@/components/acr/types"
import type { PackageAnalysis, ProcessingEvent } from "@/lib/prestacao-types"
import { formatBRL } from "@/lib/format"

type ProcessingState = {
  status: "idle" | "running" | "success" | "error"
  message: string
  error: string | null
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>("fechamentos")
  const [showNotifications, setShowNotifications] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<PackageAnalysis | null>(null)
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([])
  const [processing, setProcessing] = useState<ProcessingState>({
    status: "idle",
    message: "Aguardando envio da prestacao.",
    error: null,
  })
  const [modal, setModal] = useState<{
    open: boolean
    apto: string
    inquilino: string
    valor: number
  }>({
    open: false,
    apto: "",
    inquilino: "",
    valor: 0,
  })

  const navigate = (view: View) => {
    setCurrentView(view)
    setShowNotifications(false)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const openModal = (apto: string, inquilino: string, valor: number) =>
    setModal({ open: true, apto, inquilino, valor })

  const processPackage = async (files: File[]) => {
    setAnalysisResult(null)
    setProcessingEvents([])
    setProcessing({ status: "running", message: "Processamento real do pacote iniciado.", error: null })
    navigate("processando")

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))

      const response = await fetch("/api/fechamentos/process/stream", {
        method: "POST",
        body: formData,
      })

      if (!response.ok || !response.body) {
        throw new Error("Nao foi possivel iniciar o processamento do pacote.")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let completed = false

      while (!completed) {
        const read = await reader.read()
        completed = read.done
        buffer += decoder.decode(read.value, { stream: !completed })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue

          const event = JSON.parse(line) as ProcessingEvent
          setProcessingEvents((events) => [...events, event])
          setProcessing({ status: event.type === "workflow_failed" ? "error" : "running", message: event.message, error: event.error ?? null })

          if (event.type === "workflow_completed" && event.result) {
            setAnalysisResult(event.result)
            setProcessing({ status: "success", message: event.message, error: null })
            navigate("revisao")
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar o pacote."
      const event: ProcessingEvent = {
        type: "workflow_failed",
        message,
        progress: 100,
        error: message,
      }
      setProcessingEvents((events) => [...events, event])
      setProcessing({ status: "error", message: "Processamento interrompido.", error: message })
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAF8]">
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <Topbar
        currentView={currentView}
        showNotifications={showNotifications}
        onToggleNotifications={() => setShowNotifications((s) => !s)}
        onNavigate={navigate}
      />

      <main className="ml-[220px] mt-14 p-6">
        {currentView === "fechamentos" && <FechamentosView onNavigate={navigate} />}
        {currentView === "novo-fechamento" && <NovoFechamentoView onNavigate={navigate} />}
        {currentView === "upload" && <UploadView onNavigate={navigate} onAnalyze={processPackage} />}
        {currentView === "processando" && (
          <ProcessandoView onNavigate={navigate} processing={processing} events={processingEvents} />
        )}
        {currentView === "revisao" && (
          <RevisaoView
            onNavigate={navigate}
            onOpenModal={openModal}
            analysisResult={analysisResult}
          />
        )}
        {currentView === "imoveis" && (
          <PlaceholderView
            title="Imóveis"
            description="Cadastro e gestão dos imóveis dos empreendimentos. Esta área será detalhada em breve."
            icon="building"
          />
        )}
        {currentView === "configuracoes" && (
          <PlaceholderView
            title="Configurações"
            description="Preferências da conta, integrações bancárias e regras de conciliação."
            icon="settings"
          />
        )}
      </main>

      <CorrectionModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        apto={modal.apto}
        inquilino={modal.inquilino}
        valorLido={formatBRL(modal.valor)}
      />
    </div>
  )
}
