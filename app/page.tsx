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
import type { AnalyzePrestacaoResponse, PrestacaoAnalysis } from "@/lib/prestacao-types"
import { formatBRL } from "@/lib/format"

type ProcessingState = {
  status: "idle" | "running" | "success" | "error"
  message: string
  error: string | null
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>("fechamentos")
  const [showNotifications, setShowNotifications] = useState(false)
  const [analysis, setAnalysis] = useState<PrestacaoAnalysis | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalyzePrestacaoResponse | null>(null)
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

  const analyzePrestacao = async (file: File) => {
    setAnalysis(null)
    setAnalysisResult(null)
    setProcessing({ status: "running", message: "Mastra esta validando, extraindo, rechecando e gerando o parecer tecnico.", error: null })
    navigate("processando")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/prestacao/analyze", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json()) as Partial<AnalyzePrestacaoResponse> & { error?: string }

      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error || "Nao foi possivel analisar a prestacao.")
      }

      setAnalysis(payload.analysis)
      setAnalysisResult(payload as AnalyzePrestacaoResponse)
      setProcessing({ status: "success", message: "Prestacao analisada e rechecada com sucesso.", error: null })
      navigate("revisao")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao analisar a prestacao."
      setProcessing({ status: "error", message: "Analise interrompida.", error: message })
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
        {currentView === "upload" && <UploadView onNavigate={navigate} onAnalyze={analyzePrestacao} />}
        {currentView === "processando" && (
          <ProcessandoView onNavigate={navigate} processing={processing} />
        )}
        {currentView === "revisao" && (
          <RevisaoView
            onNavigate={navigate}
            onOpenModal={openModal}
            analysis={analysis}
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
