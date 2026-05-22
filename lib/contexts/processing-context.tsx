"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { FechamentoContext } from "@/lib/fechamento-context"
import type { PackageAnalysis, ProcessingEvent } from "@/lib/prestacao-types"

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
  processingEvents: ProcessingEvent[]
  processing: ProcessingState
  runProcessing: (
    files: File[],
    context: FechamentoContext,
    onCompleted: (analysis: PackageAnalysis) => void,
  ) => Promise<void>
  reset: () => void
}

const ProcessingContext = createContext<ProcessingContextValue | null>(null)

const INITIAL_STATE: ProcessingState = {
  status: "idle",
  message: "Aguardando envio da prestacao.",
  error: null,
}

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [analysisResult, setAnalysisResult] = useState<PackageAnalysis | null>(null)
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([])
  const [processing, setProcessing] = useState<ProcessingState>(INITIAL_STATE)

  const reset = useCallback(() => {
    setPendingFiles([])
    setAnalysisResult(null)
    setProcessingEvents([])
    setProcessing(INITIAL_STATE)
  }, [])

  const runProcessing = useCallback(
    async (files: File[], context: FechamentoContext, onCompleted: (analysis: PackageAnalysis) => void) => {
      setAnalysisResult(null)
      setProcessingEvents([])
      setProcessing({ status: "running", message: "Processamento real do pacote iniciado.", error: null })

      try {
        const formData = new FormData()
        files.forEach((file) => formData.append("files", file))
        formData.append("fechamentoContext", JSON.stringify(context))

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
            setProcessing({
              status: event.type === "workflow_failed" ? "error" : "running",
              message: event.message,
              error: event.error ?? null,
            })

            if (event.type === "workflow_completed" && event.result) {
              setAnalysisResult(event.result)
              setProcessing({ status: "success", message: event.message, error: null })
              onCompleted(event.result)
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao processar o pacote."
        const event: ProcessingEvent = {
          type: "workflow_failed",
          message,
          progress: 100,
          error: message,
        }
        setProcessingEvents((events) => [...events, event])
        setProcessing({ status: "error", message: "Processamento interrompido.", error: message })
      }
    },
    [],
  )

  const value = useMemo(
    () => ({
      pendingFiles,
      setPendingFiles,
      analysisResult,
      setAnalysisResult,
      processingEvents,
      processing,
      runProcessing,
      reset,
    }),
    [pendingFiles, analysisResult, processingEvents, processing, runProcessing, reset],
  )

  return <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>
}

export function useProcessing() {
  const value = useContext(ProcessingContext)
  if (!value) throw new Error("useProcessing must be used within ProcessingProvider")
  return value
}
