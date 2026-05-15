"use client"

import { useEffect, useState } from "react"
import { FileText, CheckCircle, Loader2, Clock } from "lucide-react"
import type { View } from "../types"

interface ProcessandoViewProps {
  onNavigate: (view: View) => void
  processing: {
    status: "idle" | "running" | "success" | "error"
    message: string
    error: string | null
  }
}

const steps = [
  "Salvando arquivos",
  "Classificando documentos",
  "Extraindo dados com IA",
  "Rodando rechecks deterministicos",
  "Gerando parecer tecnico",
  "Finalizando",
]

const progressByIndex: Record<number, string> = {
  0: "8%",
  1: "25%",
  2: "45%",
  3: "65%",
  4: "82%",
  5: "95%",
  6: "100%",
}

export function ProcessandoView({ onNavigate, processing }: ProcessandoViewProps) {
  const isError = processing.status === "error"
  const isSuccess = processing.status === "success"

  const [displayIndex, setDisplayIndex] = useState(0)

  // Avança steps 0→1→2 otimisticamente enquanto o workflow roda
  useEffect(() => {
    if (processing.status !== "running") return
    const t1 = setTimeout(() => setDisplayIndex(1), 700)
    const t2 = setTimeout(() => setDisplayIndex(2), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [processing.status])

  // Quando o workflow termina com sucesso, fast-forward pelos steps restantes
  useEffect(() => {
    if (processing.status !== "success") return
    setDisplayIndex((prev) => Math.max(prev, 3))
    const t1 = setTimeout(() => setDisplayIndex(4), 350)
    const t2 = setTimeout(() => setDisplayIndex(5), 700)
    const t3 = setTimeout(() => setDisplayIndex(6), 1100)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [processing.status])

  const allDone = isSuccess && displayIndex >= 6

  return (
    <div>
      <div className="max-w-3xl mx-auto bg-[#EFF7F1] border-l-4 border-[#2D8C3A] rounded-lg p-3 flex items-center gap-2 mb-4">
        <FileText size={16} className="text-[#2D8C3A]" />
        <span className="text-[13px] text-[#3D4F3F] font-medium">
          Alive Imoveis · Grand Messejana II · Marco/2026
        </span>
      </div>

      <div className="max-w-lg mx-auto bg-white rounded-xl p-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
        <div
          className={`h-14 w-14 border-4 border-[#EEF1EE] rounded-full mx-auto mb-4 ${
            isError ? "border-t-[#DC2626]" : allDone ? "border-t-[#2D8C3A]" : "border-t-[#2D8C3A] animate-spin"
          }`}
        />

        <h2 className="text-[20px] font-bold text-[#1A2B1C] mb-2">
          {isError ? "Nao foi possivel analisar" : allDone ? "Analise concluida" : "Analisando os documentos..."}
        </h2>
        <p className="text-[14px] text-[#6B7F6E] max-w-sm mx-auto mb-8">
          {isError ? processing.error : processing.message}
        </p>

        <ul className="text-left max-w-sm mx-auto space-y-3">
          {steps.map((label, index) => {
            const done = index < displayIndex
            const active = index === displayIndex && !allDone
            const waiting = !done && !active

            return (
              <li key={label} className="flex items-center gap-3">
                {done && <CheckCircle size={20} className="text-[#22C55E] shrink-0" />}
                {active && !isError && <Loader2 size={20} className="text-[#2D8C3A] animate-spin shrink-0" />}
                {(waiting || (active && isError)) && <Clock size={20} className="text-[#D5DDD6] shrink-0" />}

                <span className={`flex-1 text-[14px] ${active ? "font-bold text-[#1A2B1C]" : done ? "text-[#3D4F3F]" : "text-[#6B7F6E]"}`}>
                  {label}
                </span>

                <span className={`text-[12px] ${done ? "text-[#22C55E]" : active ? "text-[#2D8C3A] font-medium" : "text-[#6B7F6E]"}`}>
                  {done ? "Concluido" : active ? "Em andamento..." : "Aguardando"}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 bg-[#EEF1EE] rounded-full h-2 max-w-sm mx-auto overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isError ? "bg-[#DC2626]" : "bg-[#2D8C3A]"}`}
            style={{ width: isError ? "45%" : progressByIndex[Math.min(displayIndex, 6)] }}
          />
        </div>
        <p className="text-[12px] text-[#6B7F6E] text-center mt-2">
          {isError ? "Processamento interrompido" : allDone ? "6 de 6 etapas concluidas" : "Mastra executando 6 etapas"}
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
