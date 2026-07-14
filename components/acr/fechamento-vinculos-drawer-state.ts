"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  FechamentoVinculosImoveis,
  ImovelVinculoCadastro,
  ReceitaSemImovel,
} from "@/lib/server/fechamento-imoveis"

export type VinculoMode = "existente" | "criar"
export type VinculoForm = { codigo: string; unidade: string; inquilino: string; status: string; aluguel: string }
export type VinculoUpdates = { inquilino: boolean; status: boolean; aluguel: boolean }
type VinculoFormState = Pick<VinculoController, "current" | "mode" | "selectedId" | "form" | "updates">

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function defaultForm(current: ReceitaSemImovel): VinculoForm {
  return {
    codigo: current.apto,
    unidade: current.apto,
    inquilino: current.inquilino,
    status: current.status_sugerido,
    aluguel: current.aluguel === null ? "" : String(current.aluguel),
  }
}

function buildRequestBody(controller: VinculoFormState) {
  if (controller.mode === "existente") {
    return {
      indice: controller.current!.indice,
      modo: "existente",
      imovel_id: controller.selectedId,
      status_sugerido: controller.current!.status_sugerido,
      atualizacoes: controller.updates,
    }
  }
  return {
    indice: controller.current!.indice,
    modo: "criar",
    cadastro: {
      codigo_imobiliaria: controller.form.codigo,
      unidade: controller.form.unidade,
      inquilino_nome: controller.form.inquilino,
      status: controller.form.status,
      valor_aluguel_esperado: controller.form.aluguel,
    },
  }
}

async function sendResolution(fechamentoId: string, body: unknown) {
  const response = await fetch(`/api/fechamentos/${fechamentoId}/imoveis/vincular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Falha ao resolver vínculo.")
  return payload.vinculos_imoveis as FechamentoVinculosImoveis
}

function filterCandidates(imoveis: ImovelVinculoCadastro[], search: string) {
  const query = normalize(search)
  if (!query) return imoveis
  return imoveis.filter((item) =>
    normalize(`${item.codigo_imobiliaria} ${item.unidade} ${item.inquilino_nome ?? ""}`).includes(query),
  )
}

export interface VinculoController {
  current: ReceitaSemImovel | null
  mode: VinculoMode
  setMode: (mode: VinculoMode) => void
  search: string
  setSearch: (value: string) => void
  selectedId: string | null
  setSelectedId: (value: string | null) => void
  selected: ImovelVinculoCadastro | null
  candidates: ImovelVinculoCadastro[]
  form: VinculoForm
  setForm: (value: VinculoForm | ((current: VinculoForm) => VinculoForm)) => void
  updates: VinculoUpdates
  setUpdates: (value: VinculoUpdates | ((current: VinculoUpdates) => VinculoUpdates)) => void
  saving: boolean
  error: string | null
  progress: number
  batchTotal: number
  pendingCount: number
  resolveCurrent: () => Promise<void>
}

export function useFechamentoVinculosDrawer(input: {
  open: boolean
  fechamentoId: string
  vinculos: FechamentoVinculosImoveis
  onResolved: (vinculos: FechamentoVinculosImoveis) => Promise<void> | void
  onOpenChange: (open: boolean) => void
}): VinculoController {
  const current = input.vinculos.pendentes[0] ?? null
  const [mode, setMode] = useState<VinculoMode>("criar")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<VinculoForm>({ codigo: "", unidade: "", inquilino: "", status: "ocupado", aluguel: "" })
  const [updates, setUpdates] = useState<VinculoUpdates>({ inquilino: false, status: false, aluguel: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchTotal, setBatchTotal] = useState(0)

  useBatchProgress(input.open, input.vinculos.pendentes.length, batchTotal, setBatchTotal)
  useCurrentDefaults(current, input.vinculos.imoveis.length, { setMode, setSearch, setSelectedId, setForm, setUpdates, setError })

  const selected = input.vinculos.imoveis.find((item) => item.id === selectedId) ?? null
  const candidates = useMemo(() => filterCandidates(input.vinculos.imoveis, search), [input.vinculos.imoveis, search])
  const formState: VinculoFormState = { current, mode, selectedId, form, updates }

  return {
    ...formState,
    setMode,
    search,
    setSearch,
    setSelectedId,
    selected,
    candidates,
    setForm,
    setUpdates,
    saving,
    error,
    progress: Math.max(batchTotal - input.vinculos.pendentes.length, 0),
    batchTotal,
    pendingCount: input.vinculos.pendentes.length,
    resolveCurrent: () => resolveCurrent(input, formState, { setSaving, setError }),
  }
}

function useBatchProgress(open: boolean, pending: number, total: number, setTotal: (value: number) => void) {
  useEffect(() => {
    if (!open) return setTotal(0)
    if (total === 0 && pending > 0) setTotal(pending)
  }, [open, pending, total, setTotal])
}

function useCurrentDefaults(
  current: ReceitaSemImovel | null,
  imoveisCount: number,
  setters: Pick<VinculoController, "setMode" | "setSearch" | "setSelectedId" | "setForm" | "setUpdates"> & { setError: (value: string | null) => void },
) {
  const { setMode, setSearch, setSelectedId, setForm, setUpdates, setError } = setters
  useEffect(() => {
    if (!current) return
    setMode(imoveisCount > 0 ? "existente" : "criar")
    setSearch(current.apto)
    setSelectedId(null)
    setForm(defaultForm(current))
    setUpdates({ inquilino: false, status: false, aluguel: false })
    setError(null)
  }, [current, imoveisCount, setMode, setSearch, setSelectedId, setForm, setUpdates, setError])
}

async function resolveCurrent(
  input: Parameters<typeof useFechamentoVinculosDrawer>[0],
  controller: VinculoFormState,
  state: { setSaving: (value: boolean) => void; setError: (value: string | null) => void },
) {
  if (!controller.current) return
  state.setSaving(true)
  state.setError(null)
  try {
    const vinculos = await sendResolution(input.fechamentoId, buildRequestBody(controller))
    await input.onResolved(vinculos)
    if (vinculos.pendentes.length === 0) input.onOpenChange(false)
  } catch (cause) {
    state.setError(cause instanceof Error ? cause.message : "Falha ao resolver vínculo.")
  } finally {
    state.setSaving(false)
  }
}
