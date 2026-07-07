"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type {
  BaixarIptuParcelasPayload,
  GerarIptuPayload,
  IptuFiltros,
  IptuPaginacao,
  IptuParcelaListItem,
  IptuParcelaPatch,
  IptuResumo,
} from "@/lib/iptu-types"

const PAGE_SIZE = 50

export interface GerarResultado {
  conflito: boolean
  conflitos: string[]
  carnesCriados: number
  parcelasCriadas: number
  imoveisPulados: string[]
}

export interface BaixaResultado {
  parcelasBaixadas: number
  totalPrevisto: number
  totalPago: number
  imoveisAfetados: number
}

interface IptuContextValue {
  parcelas: IptuParcelaListItem[]
  resumo: IptuResumo | null
  pagination: IptuPaginacao | null
  filtros: IptuFiltros
  loading: boolean
  error: string | null
  setFiltros: (filtros: IptuFiltros) => void
  setPage: (page: number) => void
  reload: () => Promise<void>
  gerar: (payload: GerarIptuPayload) => Promise<GerarResultado>
  editarParcela: (id: string, patch: IptuParcelaPatch) => Promise<void>
  baixar: (payload: BaixarIptuParcelasPayload) => Promise<BaixaResultado>
  ajustarNumeroParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
}

const IptuContext = createContext<IptuContextValue | null>(null)

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Falha na requisicao.")
  }
  return payload
}

function buildQuery(filtros: IptuFiltros, page: number): string {
  const params = new URLSearchParams()
  if (filtros.imobiliariaId) params.set("imobiliariaId", filtros.imobiliariaId)
  if (filtros.empreendimentoId) params.set("empreendimentoId", filtros.empreendimentoId)
  if (filtros.imovelId) params.set("imovelId", filtros.imovelId)
  if (filtros.ano) params.set("ano", String(filtros.ano))
  if (filtros.status) params.set("status", filtros.status)
  if (filtros.vencimentoInicio) params.set("vencimentoInicio", filtros.vencimentoInicio)
  if (filtros.vencimentoFim) params.set("vencimentoFim", filtros.vencimentoFim)
  if (filtros.mesVencimento) params.set("mesVencimento", filtros.mesVencimento)
  params.set("page", String(page))
  params.set("pageSize", String(PAGE_SIZE))
  return params.toString()
}

export function IptuProvider({ children }: { children: React.ReactNode }) {
  const [filtros, setFiltrosState] = useState<IptuFiltros>({})
  const [page, setPageState] = useState(1)
  const [parcelas, setParcelas] = useState<IptuParcelaListItem[]>([])
  const [resumo, setResumo] = useState<IptuResumo | null>(null)
  const [pagination, setPagination] = useState<IptuPaginacao | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchJson(`/api/iptu?${buildQuery(filtros, page)}`)
      setParcelas(payload.parcelas ?? [])
      setResumo(payload.resumo ?? null)
      setPagination(payload.pagination ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar IPTU.")
    } finally {
      setLoading(false)
    }
  }, [filtros, page])

  useEffect(() => {
    void reload()
  }, [reload])

  const setFiltros = useCallback((next: IptuFiltros) => {
    setFiltrosState(next)
    setPageState(1)
  }, [])

  const setPage = useCallback((next: number) => {
    setPageState(Math.max(1, next))
  }, [])

  const gerar = useCallback(
    async (payload: GerarIptuPayload): Promise<GerarResultado> => {
      const response = await fetch("/api/iptu/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (response.status === 409) {
        return {
          conflito: true,
          conflitos: data.conflitos ?? [],
          carnesCriados: 0,
          parcelasCriadas: 0,
          imoveisPulados: [],
        }
      }
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Falha ao gerar parcelas.")
      }
      await reload()
      return data.resultado as GerarResultado
    },
    [reload],
  )

  const editarParcela = useCallback(
    async (id: string, patch: IptuParcelaPatch) => {
      await fetchJson(`/api/iptu/parcelas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      await reload()
    },
    [reload],
  )

  const baixar = useCallback(
    async (payload: BaixarIptuParcelasPayload): Promise<BaixaResultado> => {
      const data = await fetchJson("/api/iptu/parcelas/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      await reload()
      return data.resultado as BaixaResultado
    },
    [reload],
  )

  const ajustarNumeroParcelas = useCallback(
    async (carneId: string, numeroParcelas: number) => {
      await fetchJson(`/api/iptu/carnes/${carneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_parcelas: numeroParcelas }),
      })
      await reload()
    },
    [reload],
  )

  const value = useMemo(
    () => ({
      parcelas,
      resumo,
      pagination,
      filtros,
      loading,
      error,
      setFiltros,
      setPage,
      reload,
      gerar,
      editarParcela,
      baixar,
      ajustarNumeroParcelas,
    }),
    [
      parcelas,
      resumo,
      pagination,
      filtros,
      loading,
      error,
      setFiltros,
      setPage,
      reload,
      gerar,
      editarParcela,
      baixar,
      ajustarNumeroParcelas,
    ],
  )

  return <IptuContext.Provider value={value}>{children}</IptuContext.Provider>
}

export function useIptu() {
  const value = useContext(IptuContext)
  if (!value) throw new Error("useIptu must be used within IptuProvider")
  return value
}
