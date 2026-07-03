"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type IptuResponsavel = "inquilino" | "proprietario"

export type IptuParcelaRow = {
  id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  registrado_em: string | null
}

export type IptuCarneComParcelas = {
  id: string
  imovel_id: string
  unidade: string
  inquilino_nome: string | null
  ano_referencia: number
  numero_parcelas: number
  parcelas: IptuParcelaRow[]
}

export type ImportarCertidaoResultado = {
  importacaoId: string
  parcelasNovas: number
  apartamentosNaoVinculados: string[]
  anomalias: Array<{ unidade: string; tipo: "regressao" | "excede_carne"; detalhe: string }>
}

export type IptuImportacao = {
  id: string
  empreendimento_id: string
  arquivo_nome: string
  arquivo_path: string
  competencia_relatorio: string
  apartamentos_nao_vinculados: string[]
  anomalias: Array<{ unidade: string; tipo: "regressao" | "excede_carne"; detalhe: string }>
  criado_em: string
}

interface IptuContextValue {
  carnes: IptuCarneComParcelas[]
  importacoes: IptuImportacao[]
  loading: boolean
  error: string | null
  empreendimentoId: string | null
  setEmpreendimentoId: (id: string | null) => void
  importarCertidao: (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => Promise<ImportarCertidaoResultado>
  atualizarResponsavel: (parcelaId: string, responsavel: IptuResponsavel) => Promise<void>
  atualizarNumeroParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
  ultimoResultadoImportacao: ImportarCertidaoResultado | null
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

export function IptuProvider({ children }: { children: React.ReactNode }) {
  const [empreendimentoId, setEmpreendimentoId] = useState<string | null>(null)
  const [carnes, setCarnes] = useState<IptuCarneComParcelas[]>([])
  const [importacoes, setImportacoes] = useState<IptuImportacao[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimoResultadoImportacao, setUltimoResultadoImportacao] = useState<ImportarCertidaoResultado | null>(null)

  const reload = useCallback(async () => {
    if (!empreendimentoId) {
      setCarnes([])
      setImportacoes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [carnesPayload, importacoesPayload] = await Promise.all([
        fetchJson(`/api/iptu?empreendimento_id=${encodeURIComponent(empreendimentoId)}`),
        fetchJson(`/api/iptu/importacoes?empreendimento_id=${encodeURIComponent(empreendimentoId)}`),
      ])
      setCarnes(carnesPayload.carnes ?? [])
      setImportacoes(importacoesPayload.importacoes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar controle de IPTU.")
    } finally {
      setLoading(false)
    }
  }, [empreendimentoId])

  useEffect(() => {
    void reload()
  }, [reload])

  const importarCertidao = useCallback(
    async (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => {
      setError(null)
      const formData = new FormData()
      formData.append("file", input.file)
      formData.append("imobiliaria_id", input.imobiliariaId)
      formData.append("empreendimento_id", input.empreendimentoId)
      const resultado = (await fetchJson("/api/iptu/importar", {
        method: "POST",
        body: formData,
      })) as ImportarCertidaoResultado
      setUltimoResultadoImportacao(resultado)
      await reload()
      return resultado
    },
    [reload],
  )

  const atualizarResponsavel = useCallback(
    async (parcelaId: string, responsavel: IptuResponsavel) => {
      setError(null)
      await fetchJson(`/api/iptu/parcelas/${parcelaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel }),
      })
      await reload()
    },
    [reload],
  )

  const atualizarNumeroParcelas = useCallback(
    async (carneId: string, numeroParcelas: number) => {
      setError(null)
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
      carnes,
      importacoes,
      loading,
      error,
      empreendimentoId,
      setEmpreendimentoId,
      importarCertidao,
      atualizarResponsavel,
      atualizarNumeroParcelas,
      ultimoResultadoImportacao,
    }),
    [
      carnes,
      importacoes,
      loading,
      error,
      empreendimentoId,
      importarCertidao,
      atualizarResponsavel,
      atualizarNumeroParcelas,
      ultimoResultadoImportacao,
    ],
  )

  return <IptuContext.Provider value={value}>{children}</IptuContext.Provider>
}

export function useIptu() {
  const value = useContext(IptuContext)
  if (!value) throw new Error("useIptu must be used within IptuProvider")
  return value
}
