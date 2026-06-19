"use client"

import { use, useEffect, useState, useCallback } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { CorrectionModal } from "@/components/acr/correction-modal"
import { RevisaoView } from "@/components/acr/views/revisao-view"
import { useProcessing } from "@/lib/contexts/processing-context"
import { formatBRL } from "@/lib/format"
import type { EgestorEnvio, EgestorLancamento } from "@/lib/egestor-types"
import type { PackageAnalysis } from "@/lib/prestacao-types"

interface PageProps {
  params: Promise<{ id: string }>
}

type FechamentoResumo = {
  imobiliarias?: { nome: string } | null
  empreendimentos?: { nome: string } | null
  competencia: string
  status?: string
  comentario_operador?: string | null
  regra_comercial?: {
    taxa_administracao_percent: number
    taxa_intermediacao_percent: number
  } | null
}

type StatusEvento = {
  id: string
  status_anterior: string | null
  status_novo: string
  usuario: string
  motivo: string | null
  criado_em: string
}

export default function RevisaoPage({ params }: PageProps) {
  const { id } = use(params)
  const { analysisResult: cachedAnalysis } = useProcessing()
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(cachedAnalysis)
  const [fechamento, setFechamento] = useState<FechamentoResumo | null>(null)
  const [egestorLancamentos, setEgestorLancamentos] = useState<EgestorLancamento[]>([])
  const [egestorEnvios, setEgestorEnvios] = useState<EgestorEnvio[]>([])
  const [statusEventos, setStatusEventos] = useState<StatusEvento[]>([])
  const [loading, setLoading] = useState(!cachedAnalysis)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState({ open: false, apto: "", inquilino: "", valor: 0 })

  const loadFromApi = useCallback(() => {
    setError(null)
    return fetch(`/api/fechamentos/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) {
          setError(payload.error)
          return
        }
        setAnalysis(payload.analise_completa ?? null)
        setFechamento(payload.fechamento ?? null)
        setEgestorLancamentos(payload.egestor_lancamentos ?? [])
        setEgestorEnvios(payload.egestor_envios ?? [])
        setStatusEventos(payload.status_eventos ?? [])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar revisao.")
      })
  }, [id])

  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis)
      setLoading(false)
      loadFromApi()
      return
    }
    setLoading(true)
    loadFromApi().finally(() => setLoading(false))
  }, [id, cachedAnalysis, loadFromApi])

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
        fechamento={fechamento}
        egestorLancamentos={egestorLancamentos}
        egestorEnvios={egestorEnvios}
        statusEventos={statusEventos}
        onOpenModal={(apto, inquilino, valor) => setModal({ open: true, apto, inquilino, valor })}
        onRefresh={loadFromApi}
      />
      <CorrectionModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        fechamentoId={id}
        apto={modal.apto}
        inquilino={modal.inquilino}
        valorLido={formatBRL(modal.valor)}
        valorInicial={modal.valor}
        onSaved={loadFromApi}
      />
    </>
  )
}
