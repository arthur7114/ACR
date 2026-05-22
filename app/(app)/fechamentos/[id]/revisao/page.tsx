"use client"

import { use, useEffect, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { CorrectionModal } from "@/components/acr/correction-modal"
import { RevisaoView } from "@/components/acr/views/revisao-view"
import { useProcessing } from "@/lib/contexts/processing-context"
import { formatBRL } from "@/lib/format"
import type { PackageAnalysis } from "@/lib/prestacao-types"

interface PageProps {
  params: Promise<{ id: string }>
}

export default function RevisaoPage({ params }: PageProps) {
  const { id } = use(params)
  const { analysisResult: cachedAnalysis } = useProcessing()
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(cachedAnalysis)
  const [loading, setLoading] = useState(!cachedAnalysis)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState({ open: false, apto: "", inquilino: "", valor: 0 })

  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/fechamentos/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        if (payload.error) {
          setError(payload.error)
          return
        }
        setAnalysis(payload.analise_completa ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar revisao.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, cachedAnalysis])

  if (loading) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl p-8 border border-[#EEF1EE] text-center">
        <Loader2 size={28} className="text-[#2D8C3A] animate-spin mx-auto mb-3" />
        <p className="text-[14px] text-[#6B7F6E]">Carregando analise...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl p-8 border border-[#EEF1EE] text-center">
        <AlertTriangle size={28} className="text-[#DC2626] mx-auto mb-3" />
        <p className="text-[14px] text-[#991B1B]">{error}</p>
      </div>
    )
  }

  return (
    <>
      <RevisaoView
        fechamentoId={id}
        analysisResult={analysis}
        onOpenModal={(apto, inquilino, valor) => setModal({ open: true, apto, inquilino, valor })}
      />
      <CorrectionModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        apto={modal.apto}
        inquilino={modal.inquilino}
        valorLido={formatBRL(modal.valor)}
      />
    </>
  )
}
