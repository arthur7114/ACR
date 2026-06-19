"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Bell, CheckCircle, Clock, FileText, Loader2 } from "lucide-react"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import { useProcessing } from "@/lib/contexts/processing-context"

interface ProcessandoViewProps {
  fechamentoId: string
}

type BootState = "loading" | "active" | "none"
type Step = { label: string; done: boolean }

export function ProcessandoView({ fechamentoId }: ProcessandoViewProps) {
  const router = useRouter()
  const { pendingFiles, processing, progress, stepLabel, analysisResult, runProcessing, resumeProcessing, setPendingFiles } =
    useProcessing()
  const [fechamento, setFechamento] = useState<FechamentoContext | null>(null)
  const [bootState, setBootState] = useState<BootState>("loading")
  const [steps, setSteps] = useState<Step[]>([])
  const startedRef = useRef(false)
  const navigatedRef = useRef(false)

  // 1) Carrega o contexto e decide: iniciar (arquivos novos), reconectar (job ativo) ou nada.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/fechamentos/${fechamentoId}`).then((response) => response.json()),
      fetch(`/api/fechamentos/${fechamentoId}/processamento`)
        .then((response) => response.json())
        .catch(() => ({})),
    ])
      .then(([payload, proc]) => {
        if (cancelled) return
        if (payload.error || !payload.fechamento) {
          setBootState("none")
          return
        }
        const f = payload.fechamento
        const ctx: FechamentoContext = {
          id: f.id,
          imobiliariaId: f.imobiliaria_id,
          imobiliariaNome: f.imobiliarias?.nome ?? "Imobiliária não identificada",
          empreendimentoId: f.empreendimento_id,
          empreendimentoNome: f.empreendimentos?.nome ?? "Empreendimento não identificado",
          competencia: f.competencia,
        }
        setFechamento(ctx)

        if (startedRef.current) return

        const jaConcluido =
          proc.processamento_status === "concluido" ||
          f.status === "pendente_revisao" ||
          f.status === "processado_com_sucesso"

        if (pendingFiles.length > 0) {
          // Fluxo novo vindo do upload (reprocessa mesmo se ja houver analise).
          startedRef.current = true
          const files = pendingFiles
          setPendingFiles([])
          setBootState("active")
          void runProcessing(files, ctx)
        } else if (jaConcluido) {
          // Ja concluido: vai direto pra revisao.
          startedRef.current = true
          if (!navigatedRef.current) {
            navigatedRef.current = true
            router.replace(`/fechamentos/${fechamentoId}/revisao`)
          }
        } else if (proc.processamento_status === "processando") {
          // Reconexao: reload ou voltou pra tela com o job ainda rodando no servidor.
          startedRef.current = true
          setBootState("active")
          resumeProcessing(f.id)
        } else {
          setBootState("none")
        }
      })
      .catch(() => {
        if (!cancelled) setBootState("none")
      })
    return () => {
      cancelled = true
    }
    // pendingFiles e capturado uma vez na montagem (definido no upload antes de navegar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechamentoId])

  // 2) Historico de etapas derivado do rotulo atual do servidor.
  useEffect(() => {
    if (!stepLabel) return
    setSteps((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.label === stepLabel) {
        if (processing.status !== "running" && !last.done) {
          const copy = [...prev]
          copy[copy.length - 1] = { ...last, done: true }
          return copy
        }
        return prev
      }
      const marked = prev.map((s) => ({ ...s, done: true }))
      return [...marked, { label: stepLabel, done: processing.status !== "running" }]
    })
  }, [stepLabel, processing.status])

  // 3) Navega pra revisao ao concluir — somente enquanto esta tela esta montada.
  useEffect(() => {
    if (processing.status === "success" && analysisResult && !navigatedRef.current) {
      navigatedRef.current = true
      const timer = setTimeout(() => router.push(`/fechamentos/${fechamentoId}/revisao`), 700)
      return () => clearTimeout(timer)
    }
  }, [processing.status, analysisResult, fechamentoId, router])

  const isError = processing.status === "error"
  const isSuccess = processing.status === "success"

  if (bootState === "none") {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-xl p-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
        <AlertTriangle size={32} className="text-[#92400E] mx-auto mb-4" />
        <h2 className="text-[20px] font-bold text-[#1A2B1C] mb-2">Nenhum processamento ativo</h2>
        <p className="text-[14px] text-[#6B7F6E] max-w-sm mx-auto mb-6">
          Volte para o upload de documentos para iniciar um novo processamento.
        </p>
        <button
          onClick={() => router.push(`/fechamentos/${fechamentoId}/upload`)}
          className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
        >
          Ir para upload
        </button>
      </div>
    )
  }

  return (
    <div>
      {fechamento && (
        <div className="max-w-3xl mx-auto bg-[#EFF7F1] border-l-4 border-[#2D8C3A] rounded-lg p-3 flex items-center gap-2 mb-4">
          <FileText size={16} className="text-[#2D8C3A]" />
          <span className="text-[13px] text-[#3D4F3F] font-medium">
            {fechamento.imobiliariaNome} · {fechamento.empreendimentoNome} · {formatCompetenciaLong(fechamento.competencia)}
          </span>
        </div>
      )}

      <div className="max-w-lg mx-auto bg-white rounded-xl p-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
        <div
          className={`h-14 w-14 border-4 border-[#EEF1EE] rounded-full mx-auto mb-4 ${
            isError ? "border-t-[#DC2626]" : isSuccess ? "border-t-[#22C55E]" : "border-t-[#2D8C3A] animate-spin"
          }`}
        />

        <h2 className="text-[20px] font-bold text-[#1A2B1C] mb-2">
          {isError ? "Não foi possível analisar" : isSuccess ? "Análise concluída" : "Analisando os documentos..."}
        </h2>
        <p className="text-[14px] text-[#6B7F6E] max-w-sm mx-auto mb-4">
          {isError ? processing.error : isSuccess ? "Redirecionando para a revisão..." : stepLabel || processing.message}
        </p>

        {!isError && !isSuccess && (
          <div className="mb-6 mx-auto max-w-sm bg-[#F8FAF8] border border-[#EEF1EE] rounded-lg p-3 flex items-start gap-2 text-left">
            <Clock size={15} className="text-[#6B7F6E] shrink-0 mt-0.5" />
            <p className="text-[12px] leading-snug text-[#6B7F6E]">
              Documentos densos costumam levar de <strong className="text-[#3D4F3F]">2 a 5 minutos</strong>. Você pode
              fechar esta tela — avisamos quando terminar.
            </p>
          </div>
        )}

        <ul className="text-left max-w-sm mx-auto space-y-3">
          {steps.length === 0 && !isError && (
            <li className="flex items-center gap-3">
              <Loader2 size={20} className="text-[#2D8C3A] animate-spin shrink-0" />
              <span className="flex-1 text-[14px] text-[#6B7F6E]">Conectando ao processamento...</span>
            </li>
          )}

          {steps.map((step, index) => {
            const isLast = index === steps.length - 1
            const failedHere = isError && isLast
            const spinning = isLast && !step.done && !isError && !isSuccess

            return (
              <li key={`${step.label}-${index}`} className="flex items-start gap-3">
                {failedHere && <AlertTriangle size={20} className="text-[#DC2626] shrink-0" />}
                {!failedHere && spinning && <Loader2 size={20} className="text-[#2D8C3A] animate-spin shrink-0" />}
                {!failedHere && !spinning && <CheckCircle size={20} className="text-[#22C55E] shrink-0" />}

                <span className={`flex-1 text-[14px] ${isLast ? "font-bold text-[#1A2B1C]" : "text-[#3D4F3F]"}`}>
                  {step.label}
                </span>
                <span
                  className={`shrink-0 text-[12px] ${
                    failedHere ? "text-[#DC2626]" : spinning ? "text-[#2D8C3A] font-medium" : "text-[#22C55E]"
                  }`}
                >
                  {failedHere ? "Erro" : spinning ? "Em andamento" : "Concluído"}
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
          {isError ? "Processamento interrompido" : isSuccess ? "Processamento concluído" : `${progress}% processado`}
        </p>

        {isError ? (
          <button
            onClick={() => router.push(`/fechamentos/${fechamentoId}/upload`)}
            className="block mx-auto mt-6 h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] transition-colors"
          >
            Voltar ao upload
          </button>
        ) : (
          <button
            onClick={() => router.push("/fechamentos")}
            className="mx-auto mt-6 flex items-center gap-2 h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] transition-colors"
          >
            <Bell size={15} className="text-[#6B7F6E]" />
            Fechar e aguardar notificação
          </button>
        )}
      </div>
    </div>
  )
}
