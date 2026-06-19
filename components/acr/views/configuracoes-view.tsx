"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle, Loader2, Plus, Save, ShieldCheck } from "lucide-react"
import type { EgestorConfigPayload, EgestorConta } from "@/lib/egestor-types"

type ContaDraft = {
  id?: string
  nome: string
  personal_token: string
  cod_disponivel_padrao: string
  ativo: boolean
}

type Draft = {
  contas: ContaDraft[]
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

function toDraft(data: EgestorConfigPayload): Draft {
  return {
    contas: data.contas.map((conta) => ({
      id: conta.id,
      nome: conta.nome,
      personal_token: "",
      cod_disponivel_padrao: conta.cod_disponivel_padrao ? String(conta.cod_disponivel_padrao) : "",
      ativo: conta.ativo,
    })),
    mapeamentos: data.mapeamentos,
    imobiliarias: data.imobiliarias,
    empreendimentos: data.empreendimentos,
  }
}

type ContatoItem = { codigo: number; nome: string }
type ContatosState = Record<string, ContatoItem[] | "loading" | "error">

export function ConfiguracoesView() {
  const [payload, setPayload] = useState<EgestorConfigPayload | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contatosPorConta, setContatosPorConta] = useState<ContatosState>({})

  const canSave = useMemo(() => Boolean(draft && !saving), [draft, saving])
  const contaMetaById = useMemo(() => {
    const map = new Map<string, EgestorConta>()
    for (const conta of payload?.contas ?? []) map.set(conta.id, conta)
    return map
  }, [payload])

  const loadConfig = useCallback(() => {
    setLoading(true)
    fetch("/api/egestor/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setPayload(data)
        setDraft(toDraft(data))
        // Busca contatos para cada conta com token configurado.
        for (const conta of (data as EgestorConfigPayload).contas) {
          if (!conta.token_configurado) continue
          setContatosPorConta((prev) => ({ ...prev, [conta.id]: "loading" }))
          fetch(`/api/egestor/contatos?conta_id=${conta.id}`)
            .then((res) => res.json())
            .then((items) => {
              setContatosPorConta((prev) => ({
                ...prev,
                [conta.id]: Array.isArray(items) ? items : "error",
              }))
            })
            .catch(() => setContatosPorConta((prev) => ({ ...prev, [conta.id]: "error" })))
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar configurações."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function save(testarContaId?: string) {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const response = await fetch("/api/egestor/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contas: draft.contas.map((conta) => ({
          id: conta.id,
          nome: conta.nome,
          personal_token: conta.personal_token || undefined,
          cod_disponivel_padrao: conta.cod_disponivel_padrao ? Number(conta.cod_disponivel_padrao) : null,
          ativo: conta.ativo,
        })),
        mapeamentos: draft.mapeamentos,
        imobiliarias: draft.imobiliarias,
        empreendimentos: draft.empreendimentos,
        testar_conexao_conta_id: testarContaId,
      }),
    })
    const data = await response.json()
    setSaving(false)
    if (!response.ok || data.error) {
      setError(data.error ?? "Falha ao salvar configurações.")
      return
    }
    setPayload(data)
    setDraft(toDraft(data))
    setMessage(testarContaId ? "Configuração salva e conexão validada." : "Configuração salva.")
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
        <button
          onClick={() => save()}
          disabled={!canSave}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[14px] font-medium text-white hover:bg-[#1A5C24] disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Salvar
        </button>
      </div>

      {(error || message) && (
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-[13px] ${error ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]" : "border-[#BFE4C7] bg-[#F4F9F5] text-[#1A5C24]"}`}>
          {error ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          {error ?? message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">Contas eGestor</h2>
          <button
            onClick={addConta}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]"
          >
            <Plus size={14} />
            Adicionar conta
          </button>
        </div>
        {draft.contas.map((conta, index) => (
          <ContaCard
            key={conta.id ?? `nova-${index}`}
            conta={conta}
            meta={conta.id ? contaMetaById.get(conta.id) : undefined}
            mapeamentos={conta.id ? draft.mapeamentos.filter((map) => map.conta_id === conta.id) : []}
            saving={saving}
            onChange={(changes) => updateConta(index, changes)}
            onTest={conta.id ? () => save(conta.id) : undefined}
            onMapChange={(categoria, changes) => conta.id && updateMap(conta.id, categoria, changes)}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[#EEF1EE] bg-white p-5">
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">Empreendimentos</h2>
          <p className="mt-1 text-[12px] text-[#6B7F6E]">Conta define para qual eGestor o empreendimento é lançado.</p>
          <div className="mt-4 space-y-3">
            {draft.empreendimentos.map((emp) => (
              <div key={emp.id} className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                <p className="truncate text-[13px] font-medium text-[#1A2B1C]">{emp.nome}</p>
                <Field label="Conta">
                  <select
                    value={emp.egestor_conta_id ?? ""}
                    onChange={(e) => updateEmpreendimento(emp.id, { egestor_conta_id: e.target.value || null })}
                    className={inputClass}
                  >
                    <option value="">Global (padrão)</option>
                    {draft.contas
                      .filter((conta) => conta.id)
                      .map((conta) => (
                        <option key={conta.id} value={conta.id}>{conta.nome}</option>
                      ))}
                  </select>
                </Field>
                <Field label="Tag">
                  <input
                    value={emp.egestor_tag_id ?? ""}
                    onChange={(e) => updateEmpreendimento(emp.id, { egestor_tag_id: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#EEF1EE] bg-white p-5">
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">Imobiliárias</h2>
          <p className="mt-1 text-[12px] text-[#6B7F6E]">Contato eGestor por conta + tag da imobiliária.</p>
          <div className="mt-4 space-y-4">
            {draft.imobiliarias.map((imob) => (
              <div key={imob.id} className="rounded-lg border border-[#EEF1EE] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold text-[#1A2B1C]">{imob.nome}</p>
                  <div className="w-[180px]">
                    <Field label="Tag">
                      <input
                        value={imob.egestor_tag_id ?? ""}
                        onChange={(e) => updateImobiliaria(imob.id, { egestor_tag_id: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {draft.contas
                    .filter((conta) => conta.id)
                    .map((conta) => {
                      const listaContatos = contatosPorConta[conta.id!]
                      const currentValue = contatoValue(imob.contatos, conta.id!)
                      return (
                        <Field key={conta.id} label={`Contato · ${conta.nome}`}>
                          {Array.isArray(listaContatos) ? (
                            <select
                              value={currentValue}
                              onChange={(e) => updateContato(imob.id, conta.id!, e.target.value ? Number(e.target.value) : null)}
                              className={inputClass}
                            >
                              <option value="">— selecione —</option>
                              {/* mantém opção do valor atual mesmo que não esteja na lista */}
                              {currentValue && !listaContatos.some((c) => String(c.codigo) === currentValue) && (
                                <option value={currentValue}>{currentValue}</option>
                              )}
                              {listaContatos.map((c) => (
                                <option key={c.codigo} value={String(c.codigo)}>{c.nome}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={currentValue}
                              onChange={(e) => updateContato(imob.id, conta.id!, e.target.value ? Number(e.target.value) : null)}
                              inputMode="numeric"
                              placeholder={listaContatos === "loading" ? "Carregando…" : undefined}
                              disabled={listaContatos === "loading"}
                              className={inputClass}
                            />
                          )}
                        </Field>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )

  function addConta() {
    setDraft((current) =>
      current
        ? { ...current, contas: [...current.contas, { nome: "Nova conta", personal_token: "", cod_disponivel_padrao: "", ativo: true }] }
        : current,
    )
  }

  function updateConta(index: number, changes: Partial<ContaDraft>) {
    setDraft((current) => {
      if (!current) return current
      const contas = current.contas.map((conta, i) => (i === index ? { ...conta, ...changes } : conta))
      return { ...current, contas }
    })
  }

  function updateMap(contaId: string, categoria: string, changes: Partial<Draft["mapeamentos"][number]>) {
    setDraft((current) => {
      if (!current) return current
      const mapeamentos = current.mapeamentos.map((map) =>
        map.conta_id === contaId && map.categoria === categoria ? { ...map, ...changes } : map,
      )
      return { ...current, mapeamentos }
    })
  }

  function updateEmpreendimento(id: string, changes: Partial<Draft["empreendimentos"][number]>) {
    setDraft((current) => {
      if (!current) return current
      const empreendimentos = current.empreendimentos.map((emp) => (emp.id === id ? { ...emp, ...changes } : emp))
      return { ...current, empreendimentos }
    })
  }

  function updateImobiliaria(id: string, changes: Partial<Draft["imobiliarias"][number]>) {
    setDraft((current) => {
      if (!current) return current
      const imobiliarias = current.imobiliarias.map((imob) => (imob.id === id ? { ...imob, ...changes } : imob))
      return { ...current, imobiliarias }
    })
  }

  function updateContato(imobId: string, contaId: string, value: number | null) {
    setDraft((current) => {
      if (!current) return current
      const imobiliarias = current.imobiliarias.map((imob) => {
        if (imob.id !== imobId) return imob
        const exists = imob.contatos.some((contato) => contato.conta_id === contaId)
        const contatos = exists
          ? imob.contatos.map((contato) => (contato.conta_id === contaId ? { ...contato, egestor_contato_id: value } : contato))
          : [...imob.contatos, { conta_id: contaId, egestor_contato_id: value }]
        return { ...imob, contatos }
      })
      return { ...current, imobiliarias }
    })
  }
}

function ContaCard({
  conta,
  meta,
  mapeamentos,
  saving,
  onChange,
  onTest,
  onMapChange,
}: {
  conta: ContaDraft
  meta?: EgestorConta
  mapeamentos: EgestorConfigPayload["mapeamentos"]
  saving: boolean
  onChange: (changes: Partial<ContaDraft>) => void
  onTest?: () => void
  onMapChange: (categoria: string, changes: Partial<EgestorConfigPayload["mapeamentos"][number]>) => void
}) {
  const hasToken = Boolean(meta?.token_configurado || conta.personal_token)
  const testStatus = meta?.ultimo_teste_status

  return (
    <div className="rounded-xl border border-[#EEF1EE] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)_160px_140px]">
        <Field label="Nome da conta">
          <input value={conta.nome} onChange={(e) => onChange({ nome: e.target.value })} className={inputClass} />
        </Field>
        <Field label={`Personal token${meta?.token_mascarado ? ` (${meta.token_mascarado})` : ""}`}>
          <input
            value={conta.personal_token}
            onChange={(e) => onChange({ personal_token: e.target.value })}
            type="password"
            placeholder={meta?.token_configurado ? "Cole um novo token para substituir" : "Cole o token desta conta"}
            className={inputClass}
          />
        </Field>
        <Field label="Conta disponível">
          <input
            value={conta.cod_disponivel_padrao}
            onChange={(e) => onChange({ cod_disponivel_padrao: e.target.value })}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-[13px] font-medium text-[#1A2B1C]">
            <input type="checkbox" checked={conta.ativo} onChange={(e) => onChange({ ativo: e.target.checked })} className="h-4 w-4 accent-[#2D8C3A]" />
            Ativa
          </label>
          {onTest && (
            <button
              onClick={onTest}
              disabled={saving || !hasToken}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] disabled:opacity-60"
            >
              <ShieldCheck size={14} />
              Testar
            </button>
          )}
        </div>
      </div>

      {testStatus && (
        <p className={`mt-2 text-[12px] ${testStatus === "ok" ? "text-[#1A5C24]" : "text-[#991B1B]"}`}>
          Último teste: {testStatus === "ok" ? "OK" : "erro"}
          {meta?.ultimo_teste_mensagem ? ` — ${meta.ultimo_teste_mensagem}` : ""}
        </p>
      )}

      {conta.id ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-[#EEF1EE]">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
              <tr>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Plano</th>
                <th className="px-3 py-2 text-left">Tags extras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1EE]">
              {mapeamentos.map((map) => (
                <tr key={map.categoria}>
                  <td className="px-3 py-2 font-medium text-[#1A2B1C]">{categoriaLabels[map.categoria] ?? map.categoria}</td>
                  <td className="px-3 py-2 text-[#3D4F3F]">{map.tipo_lancamento}</td>
                  <td className="px-3 py-2">
                    <input
                      value={map.cod_plano_contas ?? ""}
                      onChange={(e) => onMapChange(map.categoria, { cod_plano_contas: e.target.value ? Number(e.target.value) : null })}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input value={map.tags.join(", ")} onChange={(e) => onMapChange(map.categoria, { tags: splitTags(e.target.value) })} className={inputClass} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[#6B7F6E]">Salve a conta para configurar os planos de contas.</p>
      )}
    </div>
  )
}

function contatoValue(contatos: EgestorConfigPayload["imobiliarias"][number]["contatos"], contaId: string) {
  const found = contatos.find((contato) => contato.conta_id === contaId)
  return found?.egestor_contato_id != null ? String(found.egestor_contato_id) : ""
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
