"use client"

import { use, useEffect, useState, useCallback } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { CorrectionModal } from "@/components/acr/correction-modal"
import { RevisaoView } from "@/components/acr/views/revisao-view"
import { resolveFechamentoListPresentation } from "@/lib/fechamento-list"
import { formatBRL } from "@/lib/format"
import type { EgestorEnvio, EgestorLancamento } from "@/lib/egestor-types"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type { FechamentoVinculosImoveis } from "@/lib/server/fechamento-imoveis"

interface PageProps {
  params: Promise<{ id: string }>
}

type FechamentoResumo = {
  imobiliarias?: { nome: string } | null
  empreendimentos?: { nome: string } | null
  competencia: string
  status?: string
  processamento_status?: string | null
  processamento_atualizado_em?: string | null
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
  const router = useRouter()
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(null)
  const [fechamento, setFechamento] = useState<FechamentoResumo | null>(null)
  const [egestorLancamentos, setEgestorLancamentos] = useState<EgestorLancamento[]>([])
  const [egestorEnvios, setEgestorEnvios] = useState<EgestorEnvio[]>([])
  const [statusEventos, setStatusEventos] = useState<StatusEvento[]>([])
  const [vinculosImoveis, setVinculosImoveis] = useState<FechamentoVinculosImoveis>({
    total_receitas: 0,
    total_vinculadas: 0,
    pendentes: [],
    imoveis: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState({ open: false, apto: "", inquilino: "", valor: 0 })

  const loadFromApi = useCallback(() => {
    setError(null)
    return fetch(`/api/fechamentos/${id}`)
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar revisao.")
        return payload
      })
      .then((payload) => {
        if (payload.error) {
          setError(payload.error)
          return false
        }
        const nextAnalysis = payload.analise_completa ?? null
        const nextFechamento = payload.fechamento ?? null
        const destination = resolveFechamentoListPresentation({
          id,
          dbStatus: nextFechamento?.status ?? "rascunho",
          hasAnalysis: Boolean(nextAnalysis),
          processamentoStatus: nextFechamento?.processamento_status ?? null,
          processamentoAtualizadoEm: nextFechamento?.processamento_atualizado_em ?? null,
        }).href

        if (destination !== `/fechamentos/${id}/revisao`) {
          router.replace(destination)
          return true
        }

        setAnalysis(nextAnalysis)
        setFechamento(nextFechamento)
        setEgestorLancamentos(payload.egestor_lancamentos ?? [])
        setEgestorEnvios(payload.egestor_envios ?? [])
        setStatusEventos(payload.status_eventos ?? [])
        setVinculosImoveis(payload.vinculos_imoveis ?? { total_receitas: 0, total_vinculadas: 0, pendentes: [], imoveis: [] })
        return false
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar revisao.")
        return false
      })
  }, [id, router])

  useEffect(() => {
    setLoading(true)
    loadFromApi().then((redirecting) => {
      if (!redirecting) setLoading(false)
    })
  }, [id, loadFromApi])

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
        vinculosImoveis={vinculosImoveis}
        onVinculosChange={setVinculosImoveis}
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
