"use client"

import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/acr/sidebar"
import { Topbar } from "@/components/acr/topbar"
import { FechamentosView } from "@/components/acr/views/fechamentos-view"
import { NovoFechamentoView } from "@/components/acr/views/novo-fechamento-view"
import { UploadView } from "@/components/acr/views/upload-view"
import { ProcessandoView } from "@/components/acr/views/processando-view"
import { RevisaoView } from "@/components/acr/views/revisao-view"
import { ImoveisView } from "@/components/acr/views/imoveis-view"
import { PlaceholderView } from "@/components/acr/views/placeholder-view"
import { CorrectionModal } from "@/components/acr/correction-modal"
import { AlocarEmpreendimentoModal } from "@/components/acr/alocar-empreendimento-modal"
import type { View } from "@/components/acr/types"
import type { CadastrosPayload, CsvImportResult } from "@/lib/cadastros-types"
import type { FechamentoContext } from "@/lib/fechamento-context"
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
  const [activeFechamento, setActiveFechamento] = useState<FechamentoContext | null>(null)
  const [cadastros, setCadastros] = useState<CadastrosPayload>({
    imobiliarias: [],
    empreendimentos: [],
    imoveis: [],
  })
  const [cadastrosLoading, setCadastrosLoading] = useState(true)
  const [cadastrosError, setCadastrosError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null)
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
  const [alocacaoModal, setAlocacaoModal] = useState<{ open: boolean; pendingFiles: File[] }>({
    open: false,
    pendingFiles: [],
  })

  const loadCadastros = useCallback(async () => {
    setCadastrosLoading(true)
    setCadastrosError(null)

    try {
      const [imobiliarias, empreendimentos, imoveis] = await Promise.all([
        fetchJson("/api/cadastros/imobiliarias"),
        fetchJson("/api/cadastros/empreendimentos"),
        fetchJson("/api/cadastros/imoveis"),
      ])

      setCadastros({
        imobiliarias: imobiliarias.imobiliarias ?? [],
        empreendimentos: empreendimentos.empreendimentos ?? [],
        imoveis: imoveis.imoveis ?? [],
      })
    } catch (error) {
      setCadastrosError(error instanceof Error ? error.message : "Falha ao carregar cadastros.")
    } finally {
      setCadastrosLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCadastros()
  }, [loadCadastros])

  const navigate = (view: View) => {
    setCurrentView(view)
    setShowNotifications(false)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const openModal = (apto: string, inquilino: string, valor: number) =>
    setModal({ open: true, apto, inquilino, valor })

  const saveCadastro = async (url: string, input: Record<string, unknown>) => {
    setCadastrosError(null)
    const method = input.id ? "PATCH" : "POST"
    await fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    await loadCadastros()
  }

  const deactivateCadastro = async (url: string, id: string) => {
    setCadastrosError(null)
    await fetchJson(`${url}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    await loadCadastros()
  }

  const importImoveis = async (file: File) => {
    setCadastrosError(null)
    setImportResult(null)
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/cadastros/imoveis/import", {
      method: "POST",
      body: formData,
    })
    const payload = await response.json()

    setImportResult(payload as CsvImportResult)
    if (!response.ok && payload.error) {
      throw new Error(payload.error)
    }
    await loadCadastros()
  }

  const createFechamento = async (input: Record<string, unknown>) => {
    setCadastrosError(null)
    const payload = await fetchJson("/api/fechamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })

    const fechamento = payload.fechamento as {
      id: string
      imobiliaria_id: string
      empreendimento_id: string
      competencia: string
      imobiliarias?: { nome: string } | null
      empreendimentos?: { nome: string } | null
    }

    const context: FechamentoContext = {
      id: fechamento.id,
      imobiliariaId: fechamento.imobiliaria_id,
      imobiliariaNome: fechamento.imobiliarias?.nome ?? "Imobiliaria nao identificada",
      empreendimentoId: fechamento.empreendimento_id,
      empreendimentoNome: fechamento.empreendimentos?.nome ?? "Empreendimento nao identificado",
      competencia: fechamento.competencia,
    }

    setActiveFechamento(context)
    return context
  }

  const handleRequireFechamento = (files: File[]) => {
    setAlocacaoModal({ open: true, pendingFiles: files })
  }

  const handleAlocarConfirm = async ({
    imobiliariaId,
    empreendimentoId,
    competencia,
  }: {
    imobiliariaId: string
    empreendimentoId: string
    competencia: string
  }) => {
    const context = await createFechamento({
      imobiliaria_id: imobiliariaId,
      empreendimento_id: empreendimentoId,
      competencia,
    })
    const filesToProcess = alocacaoModal.pendingFiles
    setAlocacaoModal({ open: false, pendingFiles: [] })
    await processPackage(filesToProcess, context)
  }

  const processPackage = async (files: File[], overrideContext?: FechamentoContext) => {
    const contextToUse = overrideContext ?? activeFechamento
    setAnalysisResult(null)
    setProcessingEvents([])
    setProcessing({ status: "running", message: "Processamento real do pacote iniciado.", error: null })
    navigate("processando")

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))
      if (contextToUse) {
        formData.append("fechamentoContext", JSON.stringify(contextToUse))
      }

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
        activeFechamento={activeFechamento}
        analysisResult={analysisResult}
        showNotifications={showNotifications}
        onToggleNotifications={() => setShowNotifications((s) => !s)}
        onNavigate={navigate}
      />

      <main className="ml-[220px] mt-14 p-6">
        {currentView === "fechamentos" && <FechamentosView onNavigate={navigate} />}
        {currentView === "novo-fechamento" && (
          <NovoFechamentoView
            onNavigate={navigate}
            imobiliarias={cadastros.imobiliarias}
            empreendimentos={cadastros.empreendimentos}
            loading={cadastrosLoading}
            error={cadastrosError}
            onCreateFechamento={createFechamento}
          />
        )}
        {currentView === "upload" && (
          <UploadView
            onNavigate={navigate}
            onAnalyze={(files) => processPackage(files)}
            onRequireFechamento={handleRequireFechamento}
            activeFechamento={activeFechamento}
          />
        )}
        {currentView === "processando" && (
          <ProcessandoView
            onNavigate={navigate}
            processing={processing}
            events={processingEvents}
            activeFechamento={activeFechamento}
          />
        )}
        {currentView === "revisao" && (
          <RevisaoView
            onNavigate={navigate}
            onOpenModal={openModal}
            analysisResult={analysisResult}
          />
        )}
        {currentView === "imoveis" && (
          <ImoveisView
            imobiliarias={cadastros.imobiliarias}
            empreendimentos={cadastros.empreendimentos}
            imoveis={cadastros.imoveis}
            loading={cadastrosLoading}
            error={cadastrosError}
            importResult={importResult}
            onSaveImovel={(input) => saveCadastro("/api/cadastros/imoveis", input)}
            onDeactivateImovel={(id) => deactivateCadastro("/api/cadastros/imoveis", id)}
            onSaveImobiliaria={(input) => saveCadastro("/api/cadastros/imobiliarias", input)}
            onDeactivateImobiliaria={(id) => deactivateCadastro("/api/cadastros/imobiliarias", id)}
            onSaveEmpreendimento={(input) => saveCadastro("/api/cadastros/empreendimentos", input)}
            onDeactivateEmpreendimento={(id) => deactivateCadastro("/api/cadastros/empreendimentos", id)}
            onImportImoveis={importImoveis}
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

      <AlocarEmpreendimentoModal
        open={alocacaoModal.open}
        onClose={() => setAlocacaoModal({ open: false, pendingFiles: [] })}
        imobiliarias={cadastros.imobiliarias}
        empreendimentos={cadastros.empreendimentos}
        pendingFilesCount={alocacaoModal.pendingFiles.length}
        onConfirm={handleAlocarConfirm}
      />
    </div>
  )
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Falha na requisicao.")
  }

  return payload
}
