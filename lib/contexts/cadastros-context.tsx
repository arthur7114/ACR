"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { CadastrosPayload, CsvImportResult } from "@/lib/cadastros-types"

interface CadastrosContextValue {
  cadastros: CadastrosPayload
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  saveCadastro: (url: string, input: Record<string, unknown>) => Promise<void>
  deactivateCadastro: (url: string, id: string) => Promise<void>
  importImoveis: (file: File) => Promise<CsvImportResult>
  importResult: CsvImportResult | null
  resetImportResult: () => void
}

const CadastrosContext = createContext<CadastrosContextValue | null>(null)

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Falha na requisicao.")
  }
  return payload
}

export function CadastrosProvider({ children }: { children: React.ReactNode }) {
  const [cadastros, setCadastros] = useState<CadastrosPayload>({
    imobiliarias: [],
    empreendimentos: [],
    imoveis: [],
    regrasComerciais: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [imobiliarias, empreendimentos, imoveis, regrasComerciais] = await Promise.all([
        fetchJson("/api/cadastros/imobiliarias?include_inactive=true"),
        fetchJson("/api/cadastros/empreendimentos?include_inactive=true"),
        fetchJson("/api/cadastros/imoveis?include_inactive=true"),
        fetchJson("/api/cadastros/regras-comerciais"),
      ])
      setCadastros({
        imobiliarias: imobiliarias.imobiliarias ?? [],
        empreendimentos: empreendimentos.empreendimentos ?? [],
        imoveis: imoveis.imoveis ?? [],
        regrasComerciais: regrasComerciais.regrasComerciais ?? [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar cadastros.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveCadastro = useCallback(
    async (url: string, input: Record<string, unknown>) => {
      setError(null)
      const method = input.id ? "PATCH" : "POST"
      await fetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      await reload()
    },
    [reload],
  )

  const deactivateCadastro = useCallback(
    async (url: string, id: string) => {
      setError(null)
      await fetchJson(`${url}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      await reload()
    },
    [reload],
  )

  const importImoveis = useCallback(
    async (file: File) => {
      setError(null)
      setImportResult(null)
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/cadastros/imoveis/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json()) as CsvImportResult & { error?: string }
      setImportResult(payload)
      if (!response.ok && payload.error) {
        throw new Error(payload.error)
      }
      await reload()
      return payload
    },
    [reload],
  )

  const resetImportResult = useCallback(() => setImportResult(null), [])

  const value = useMemo(
    () => ({
      cadastros,
      loading,
      error,
      reload,
      saveCadastro,
      deactivateCadastro,
      importImoveis,
      importResult,
      resetImportResult,
    }),
    [cadastros, loading, error, reload, saveCadastro, deactivateCadastro, importImoveis, importResult, resetImportResult],
  )

  return <CadastrosContext.Provider value={value}>{children}</CadastrosContext.Provider>
}

export function useCadastros() {
  const value = useContext(CadastrosContext)
  if (!value) throw new Error("useCadastros must be used within CadastrosProvider")
  return value
}
