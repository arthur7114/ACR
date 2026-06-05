"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle, Loader2, Save, ShieldCheck } from "lucide-react"
import type { EgestorConfigPayload } from "@/lib/egestor-types"

type Draft = {
  personal_token: string
  ativo: boolean
  cod_disponivel_padrao: string
  mapeamentos: EgestorConfigPayload["mapeamentos"]
  imobiliarias: EgestorConfigPayload["imobiliarias"]
  empreendimentos: EgestorConfigPayload["empreendimentos"]
}

const categoriaLabels: Record<string, string> = {
  repasse_mensal: "Repasse mensal",
  comissao_administrativa: "Comissão administrativa",
  energia: "Energia",
  agua: "Água/esgoto",
  iptu: "IPTU",
  seguro: "Seguro",
  outras_despesas: "Outras despesas",
}

export function ConfiguracoesView() {
  const [payload, setPayload] = useState<EgestorConfigPayload | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasToken = Boolean(payload?.configuracao.token_configurado || draft?.personal_token)
  const canSave = useMemo(() => Boolean(draft && !saving), [draft, saving])

  const loadConfig = useCallback(() => {
    setLoading(true)
    fetch("/api/egestor/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setPayload(data)
        setDraft({
          personal_token: "",
          ativo: data.configuracao.ativo,
          cod_disponivel_padrao: data.configuracao.cod_disponivel_padrao ? String(data.configuracao.cod_disponivel_padrao) : "",
          mapeamentos: data.mapeamentos,
          imobiliarias: data.imobiliarias,
          empreendimentos: data.empreendimentos,
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar configurações."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function save(testarConexao = false) {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const response = await fetch("/api/egestor/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        cod_disponivel_padrao: draft.cod_disponivel_padrao ? Number(draft.cod_disponivel_padrao) : null,
        personal_token: draft.personal_token || undefined,
        testar_conexao: testarConexao,
      }),
    })
    const data = await response.json()
    setSaving(false)
    if (!response.ok || data.error) {
      setError(data.error ?? "Falha ao salvar configurações.")
      return
    }
    setPayload(data)
    setDraft({
      personal_token: "",
      ativo: data.configuracao.ativo,
      cod_disponivel_padrao: data.configuracao.cod_disponivel_padrao ? String(data.configuracao.cod_disponivel_padrao) : "",
      mapeamentos: data.mapeamentos,
      imobiliarias: data.imobiliarias,
      empreendimentos: data.empreendimentos,
    })
    setMessage(testarConexao ? "Configuração salva e conexão validada." : "Configuração salva.")
  }

  if (loading || !draft) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[#EEF1EE] bg-white py-16 text-[#6B7F6E]">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-[14px]">Carregando configurações...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">Configurações</h1>
          <p className="mt-1 text-[14px] text-[#6B7F6E]">Integrações e mapeamentos operacionais do fechamento.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save(true)}
            disabled={!canSave || !hasToken}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[14px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] disabled:opacity-60"
          >
            <ShieldCheck size={15} />
            Testar conexão
          </button>
          <button
            onClick={() => save(false)}
            disabled={!canSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[14px] font-medium text-white hover:bg-[#1A5C24] disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar
          </button>
        </div>
      </div>

      {(error || message) && (
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-[13px] ${error ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]" : "border-[#BFE4C7] bg-[#F4F9F5] text-[#1A5C24]"}`}>
          {error ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          {error ?? message}
        </div>
      )}

      <section className="rounded-xl border border-[#EEF1EE] bg-white p-5">
        <h2 className="text-[16px] font-bold text-[#1A2B1C]">Integração eGestor</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_160px]">
          <Field label={`Personal token${payload?.configuracao.token_mascarado ? ` (${payload.configuracao.token_mascarado})` : ""}`}>
            <input value={draft.personal_token} onChange={(e) => setDraft({ ...draft, personal_token: e.target.value })} type="password" placeholder="Cole um novo token para substituir" className={inputClass} />
          </Field>
          <Field label="Conta disponível">
            <input value={draft.cod_disponivel_padrao} onChange={(e) => setDraft({ ...draft, cod_disponivel_padrao: e.target.value })} inputMode="numeric" className={inputClass} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-[13px] font-medium text-[#1A2B1C]">
            <input type="checkbox" checked={draft.ativo} onChange={(e) => setDraft({ ...draft, ativo: e.target.checked })} className="h-4 w-4 accent-[#2D8C3A]" />
            Integração ativa
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-[#EEF1EE] bg-white p-5">
        <h2 className="text-[16px] font-bold text-[#1A2B1C]">Planos de contas por categoria</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-[#EEF1EE]">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
              <tr><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Plano</th><th className="px-3 py-2 text-left">Tags extras</th></tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1EE]">
              {draft.mapeamentos.map((map, index) => (
                <tr key={map.categoria}>
                  <td className="px-3 py-2 font-medium text-[#1A2B1C]">{categoriaLabels[map.categoria] ?? map.categoria}</td>
                  <td className="px-3 py-2 text-[#3D4F3F]">{map.tipo_lancamento}</td>
                  <td className="px-3 py-2"><input value={map.cod_plano_contas ?? ""} onChange={(e) => updateMap(index, { cod_plano_contas: e.target.value ? Number(e.target.value) : null })} className={inputClass} /></td>
                  <td className="px-3 py-2"><input value={map.tags.join(", ")} onChange={(e) => updateMap(index, { tags: splitTags(e.target.value) })} className={inputClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <MappingPanel title="Imobiliárias" rows={draft.imobiliarias} contact onChange={(rows) => setDraft({ ...draft, imobiliarias: rows })} />
        <MappingPanel title="Empreendimentos" rows={draft.empreendimentos} onChange={(rows) => setDraft({ ...draft, empreendimentos: rows })} />
      </section>
    </div>
  )

  function updateMap(index: number, changes: Partial<Draft["mapeamentos"][number]>) {
    setDraft((current) => {
      if (!current) return current
      const mapeamentos = current.mapeamentos.map((map, i) => i === index ? { ...map, ...changes } : map)
      return { ...current, mapeamentos }
    })
  }
}

function MappingPanel<T extends { id: string; nome: string; egestor_tag_id: string | null; egestor_contato_id?: number | null }>({
  title,
  rows,
  contact,
  onChange,
}: {
  title: string
  rows: T[]
  contact?: boolean
  onChange: (rows: T[]) => void
}) {
  return (
    <div className="rounded-xl border border-[#EEF1EE] bg-white p-5">
      <h2 className="text-[16px] font-bold text-[#1A2B1C]">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className={`grid gap-3 ${contact ? "md:grid-cols-[minmax(0,1fr)_120px_160px]" : "md:grid-cols-[minmax(0,1fr)_180px]"} items-end`}>
            <p className="truncate text-[13px] font-medium text-[#1A2B1C]">{row.nome}</p>
            {contact && (
              <Field label="Contato">
                <input value={row.egestor_contato_id ?? ""} onChange={(e) => updateRow(index, { egestor_contato_id: e.target.value ? Number(e.target.value) : null } as Partial<T>)} className={inputClass} />
              </Field>
            )}
            <Field label="Tag">
              <input value={row.egestor_tag_id ?? ""} onChange={(e) => updateRow(index, { egestor_tag_id: e.target.value } as Partial<T>)} className={inputClass} />
            </Field>
          </div>
        ))}
      </div>
    </div>
  )

  function updateRow(index: number, changes: Partial<T>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...changes } : row))
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">{label}</span>
      {children}
    </label>
  )
}

function splitTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean)
}

const inputClass = "h-10 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#1A2B1C] outline-none focus:border-[#2D8C3A]"
