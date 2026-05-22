"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react"
import { useProcessing } from "@/lib/contexts/processing-context"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { StepsIndicator } from "../steps-indicator"

interface UploadViewProps {
  fechamentoId: string
}

export function UploadView({ fechamentoId }: UploadViewProps) {
  const router = useRouter()
  const { setPendingFiles } = useProcessing()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [fechamento, setFechamento] = useState<FechamentoContext | null>(null)
  const [fechamentoError, setFechamentoError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/fechamentos/${fechamentoId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        if (payload.error || !payload.fechamento) {
          setFechamentoError(payload.error ?? "Fechamento nao encontrado.")
          return
        }
        const f = payload.fechamento
        setFechamento({
          id: f.id,
          imobiliariaId: f.imobiliaria_id,
          imobiliariaNome: f.imobiliarias?.nome ?? "Imobiliaria nao identificada",
          empreendimentoId: f.empreendimento_id,
          empreendimentoNome: f.empreendimentos?.nome ?? "Empreendimento nao identificado",
          competencia: f.competencia,
        })
      })
      .catch((err) => {
        if (!cancelled) setFechamentoError(err instanceof Error ? err.message : "Falha ao carregar fechamento.")
      })
    return () => {
      cancelled = true
    }
  }, [fechamentoId])

  const canProcess = selectedFiles.length > 0 && Boolean(fechamento)

  const selectFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const invalid = files.find((file) => file.type !== "application/pdf")
    if (invalid) {
      setFileError(`O arquivo ${invalid.name} nao e PDF. Envie apenas PDFs neste fluxo.`)
      return
    }

    const tooLarge = files.find((file) => file.size > 20 * 1024 * 1024)
    if (tooLarge) {
      setFileError(`O arquivo ${tooLarge.name} precisa ter no maximo 20MB.`)
      return
    }

    setSelectedFiles((current) => [...current, ...files])
    setFileError(null)
  }

  const handleStart = () => {
    if (!canProcess) return
    setPendingFiles(selectedFiles)
    router.push(`/fechamentos/${fechamentoId}/processando`)
  }

  return (
    <div>
      <StepsIndicator activeStep={2} />

      <div className="max-w-3xl mx-auto">
        {fechamento ? (
          <div className="bg-[#EFF7F1] border-l-4 border-[#2D8C3A] rounded-lg p-3 flex items-center gap-2 mb-4">
            <FileText size={16} className="text-[#2D8C3A]" />
            <span className="text-[13px] text-[#3D4F3F] font-medium">
              {fechamento.imobiliariaNome} · {fechamento.empreendimentoNome} · {formatCompetenciaLong(fechamento.competencia)}
            </span>
          </div>
        ) : fechamentoError ? (
          <div className="bg-[#FEE2E2] border-l-4 border-[#DC2626] rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="text-[#DC2626] mt-0.5 shrink-0" />
            <span className="text-[13px] text-[#991B1B]">{fechamentoError}</span>
          </div>
        ) : (
          <div className="bg-[#EEF1EE] rounded-lg p-3 flex items-center gap-2 mb-4">
            <Loader2 size={16} className="animate-spin text-[#6B7F6E]" />
            <span className="text-[13px] text-[#6B7F6E]">Carregando fechamento...</span>
          </div>
        )}

        <div className="bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
          <h2 className="text-[18px] font-bold text-[#1A2B1C]">Envie os documentos do fechamento</h2>
          <p className="text-[14px] text-[#6B7F6E] mt-1 mb-6">
            Envie o pacote em PDF: prestacao, comprovante de repasse, relatorio de locacao/reajuste e despesas.
          </p>

          <div
            className="border-2 border-dashed border-[#C3DEC9] rounded-xl bg-[#EFF7F1] p-12 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              selectFiles(event.dataTransfer.files)
            }}
          >
            <Upload size={40} className="text-[#2D8C3A] mx-auto mb-3" />
            <p className="text-[16px] font-medium text-[#1A2B1C]">Arraste os arquivos aqui</p>
            <p className="text-[14px] text-[#6B7F6E] my-2">ou</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(event) => event.target.files && selectFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-10 px-4 rounded-lg bg-white border border-[#2D8C3A] text-[#2D8C3A] text-[14px] font-medium hover:bg-[#EFF7F1] transition-colors"
            >
              Escolher arquivos
            </button>
            <p className="text-[12px] text-[#6B7F6E] mt-3">Tamanho maximo: 20MB por arquivo</p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="bg-[#EFF7F1] border border-[#C3DEC9] rounded-lg p-3 flex items-center gap-3">
                  <FileText size={18} className="text-[#2D8C3A] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-[#1A2B1C] font-medium truncate">{file.name}</p>
                    <p className="text-[11px] text-[#6B7F6E]">
                      {(file.size / 1024 / 1024).toFixed(2)} MB - aguardando classificacao real
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    className="p-1 rounded hover:bg-[#DDEEE1] text-[#6B7F6E]"
                    aria-label="Remover arquivo selecionado"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {fileError && (
            <div className="bg-[#FEE2E2] border border-[#DC2626] rounded-lg p-3 flex gap-2 items-start mt-4">
              <AlertTriangle size={16} className="text-[#DC2626] mt-0.5 shrink-0" />
              <p className="text-[13px] text-[#991B1B]">{fileError}</p>
            </div>
          )}

          <div className="flex justify-between items-center mt-6">
            <Link
              href="/fechamentos"
              className="text-[14px] text-[#6B7F6E] hover:text-[#3D4F3F] font-medium"
            >
              ← Voltar
            </Link>
            <button
              disabled={!canProcess}
              onClick={handleStart}
              className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Iniciar processamento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
