"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { FechamentoContext } from "@/lib/fechamento-context"
import type { PackageAnalysis } from "@/lib/prestacao-types"

type ProcessingStatus = "idle" | "running" | "success" | "error"

export interface ProcessingState {
  status: ProcessingStatus
  message: string
  error: string | null
}

interface ProcessingContextValue {
  pendingFiles: File[]
  setPendingFiles: (files: File[]) => void
  analysisResult: PackageAnalysis | null
  setAnalysisResult: (analysis: PackageAnalysis | null) => void
  processing: ProcessingState
  progress: number
  stepLabel: string
  // Inicia o processamento em segundo plano (POST 202) e acompanha por polling.
  runProcessing: (files: File[], context: FechamentoContext) => Promise<void>
  // Reconecta a um job ja em andamento (reload/voltou pra tela) sem reenviar arquivos.
  resumeProcessing: (fechamentoId: string) => void
  reset: () => void
}

const ProcessingContext = createContext<ProcessingContextValue | null>(null)

const INITIAL_STATE: ProcessingState = {
  status: "idle",
  message: "Aguardando envio da prestação.",
  error: null,
}

const POLL_INTERVAL_MS = 2500
const STUCK_AFTER_MS = 15 * 60 * 1000

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [analysisResult, setAnalysisResult] = useState<PackageAnalysis | null>(null)
  const [processing, setProcessing] = useState<ProcessingState>(INITIAL_STATE)
  const [progress, setProgress] = useState(0)
  const [stepLabel, setStepLabel] = useState("")
  const pollTokenRef = useRef<{ cancelled: boolean } | null>(null)

  const stopPoll = useCallback(() => {
    if (pollTokenRef.current) pollTokenRef.current.cancelled = true
    pollTokenRef.current = null
  }, [])

  const reset = useCallback(() => {
    stopPoll()
    setPendingFiles([])
    setAnalysisResult(null)
    setProcessing(INITIAL_STATE)
    setProgress(0)
    setStepLabel("")
  }, [stopPoll])

  const beginPoll = useCallback(
    (fechamentoId: string) => {
      stopPoll()
      const token = { cancelled: false }
      pollTokenRef.current = token
      setProcessing({ status: "running", message: "Analisando os documentos...", error: null })

      const tick = async () => {
        if (token.cancelled) return
        try {
          const response = await fetch(`/api/fechamentos/${fechamentoId}/processamento`)
          const f = await response.json()
          const ps: string | null = f.processamento_status ?? null
          const concluido =
            ps === "concluido" ||
            f.fechamento_status === "pendente_revisao" ||
            f.fechamento_status === "processado_com_sucesso"

          if (concluido) {
            setProgress(100)
            setStepLabel("Análise concluída")
            try {
              const full = await fetch(`/api/fechamentos/${fechamentoId}`).then((r) => r.json())
              setAnalysisResult(full.analise_completa ?? null)
            } catch {
              setAnalysisResult(null)
            }
            setProcessing({ status: "success", message: "Análise concluída.", error: null })
            token.cancelled = true
            return
          }
          if (ps === "erro") {
            const msg = f.processamento_erro ?? "Falha no processamento do pacote."
            setStepLabel("Falha na análise")
            setProcessing({ status: "error", message: "Processamento interrompido.", error: msg })
            token.cancelled = true
            return
          }
          const updated = f.processamento_atualizado_em ? new Date(f.processamento_atualizado_em).getTime() : 0
          if (ps === "processando" && updated > 0 && Date.now() - updated > STUCK_AFTER_MS) {
            setProcessing({
              status: "error",
              message: "Processamento travado.",
              error: "Sem atualização há mais de 15 minutos. Reprocesse o pacote.",
            })
            token.cancelled = true
            return
          }
          if (ps !== null) {
            setProgress(typeof f.processamento_progress === "number" ? f.processamento_progress : 0)
            setStepLabel(f.processamento_evento ?? "Analisando os documentos...")
            setProcessing({
              status: "running",
              message: f.processamento_evento ?? "Analisando os documentos...",
              error: null,
            })
          }
        } catch {
          // Erro transitorio de rede: mantem o ciclo de polling.
        }
        if (!token.cancelled) setTimeout(() => void tick(), POLL_INTERVAL_MS)
      }

      void tick()
    },
    [stopPoll],
  )

  const runProcessing = useCallback(
    async (files: File[], context: FechamentoContext) => {
      setAnalysisResult(null)
      setProgress(2)
      setStepLabel("Iniciando análise")
      setProcessing({ status: "running", message: "Iniciando análise...", error: null })

      try {
        const formData = new FormData()
        files.forEach((file) => formData.append("files", file))
        formData.append("fechamentoContext", JSON.stringify(context))

        const response = await fetch("/api/fechamentos/process", { method: "POST", body: formData })
        if (!response.ok && response.status !== 202) {
          const payload = await response.json().catch(() => ({}))
          // 409 = ja esta processando; ainda assim seguimos para o polling.
          if (response.status !== 409) {
            throw new Error(payload.error ?? "Não foi possível iniciar o processamento do pacote.")
          }
        }
        beginPoll(context.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao iniciar o processamento."
        setStepLabel("Falha na análise")
        setProcessing({ status: "error", message: "Processamento interrompido.", error: message })
      }
    },
    [beginPoll],
  )

  const resumeProcessing = useCallback(
    (fechamentoId: string) => {
      beginPoll(fechamentoId)
    },
    [beginPoll],
  )

  const value = useMemo(
    () => ({
      pendingFiles,
      setPendingFiles,
      analysisResult,
      setAnalysisResult,
      processing,
      progress,
      stepLabel,
      runProcessing,
      resumeProcessing,
      reset,
    }),
    [pendingFiles, analysisResult, processing, progress, stepLabel, runProcessing, resumeProcessing, reset],
  )

  return <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>
}

export function useProcessing() {
  const value = useContext(ProcessingContext)
  if (!value) throw new Error("useProcessing must be used within ProcessingProvider")
  return value
}
