"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Building2, CheckCircle, Edit3, EyeOff, FileUp, History, Home, Loader2, RotateCcw, Save, Search, Trash2 } from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { CsvImportResult, Empreendimento, Imobiliaria, Imovel, ImovelStatus, RegraComercial } from "@/lib/cadastros-types"
import { ImovelHistoricoDrawer } from "./imovel-historico-drawer"

type Tab = "imoveis" | "imobiliarias" | "empreendimentos" | "regras"

type ImovelForm = {
  id?: string
  imobiliaria_id: string
  empreendimento_id: string
  codigo_imobiliaria: string
  unidade: string
  tipo: string
  inquilino_nome: string
  status: ImovelStatus
  valor_aluguel_esperado: string
  taxa_administracao_percent: string
  ativo: boolean
  egestor_tag_id: string
  observacoes: string
}

type ImobiliariaForm = {
  id?: string
  nome: string
  cnpj: string
  email: string
  telefone: string
  layout: string
  ativo: boolean
  tolerancia_repasse_reais: string
  janela_antes_dias: string
  janela_depois_dias: string
  egestor_tag_id: string
  observacoes: string
}

type EmpreendimentoForm = {
  id?: string
  nome: string
  codigo: string
  descricao: string
  endereco: string
  ativo: boolean
  egestor_tag_id: string
}

type RegraComercialForm = {
  id?: string
  imobiliaria_id: string
  empreendimento_id: string
  taxa_administracao_percent: string
  taxa_intermediacao_percent: string
  ativo: boolean
}

interface ImoveisViewProps {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  imoveis: Imovel[]
  regrasComerciais: RegraComercial[]
  loading: boolean
  error: string | null
  importResult: CsvImportResult | null
  includeInactive: boolean
  onToggleInactive: (value: boolean) => void
  onSaveImovel: (input: Record<string, unknown>) => Promise<void>
  onDeactivateImovel: (id: string) => Promise<void>
  onReactivateImovel: (id: string) => Promise<void>
  onDeleteImovel: (id: string) => Promise<void>
  onSaveImobiliaria: (input: Record<string, unknown>) => Promise<void>
  onDeactivateImobiliaria: (id: string) => Promise<void>
  onReactivateImobiliaria: (id: string) => Promise<void>
  onDeleteImobiliaria: (id: string) => Promise<void>
  onSaveEmpreendimento: (input: Record<string, unknown>) => Promise<void>
  onDeactivateEmpreendimento: (id: string) => Promise<void>
  onReactivateEmpreendimento: (id: string) => Promise<void>
  onDeleteEmpreendimento: (id: string) => Promise<void>
  onSaveRegraComercial: (input: Record<string, unknown>) => Promise<void>
  onDeactivateRegraComercial: (id: string) => Promise<void>
  onReactivateRegraComercial: (id: string) => Promise<void>
  onDeleteRegraComercial: (id: string) => Promise<void>
  onImportImoveis: (file: File) => Promise<void>
  onSyncImoveis: () => Promise<{ criados: number; atualizados: number; totalUnidades: number }>
}

type ConfirmState = {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  requireText?: string
  onConfirm: () => Promise<void>
}

const inputClass =
  "h-9 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#3D4F3F] outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"

const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#6B7F6E]"

const statuses: Array<{ value: ImovelStatus; label: string }> = [
  { value: "ocupado", label: "Ocupado" },
  { value: "vago", label: "Vago" },
  { value: "inadimplente", label: "Inadimplente" },
  { value: "em_rescisao", label: "Em rescisão" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "inativo", label: "Inativo" },
]

const emptyImovel: ImovelForm = {
  imobiliaria_id: "",
  empreendimento_id: "",
  codigo_imobiliaria: "",
  unidade: "",
  tipo: "",
  inquilino_nome: "",
  status: "ocupado",
  valor_aluguel_esperado: "",
  taxa_administracao_percent: "",
  ativo: true,
  egestor_tag_id: "",
  observacoes: "",
}

const emptyImobiliaria: ImobiliariaForm = {
  nome: "",
  cnpj: "",
  email: "",
  telefone: "",
  layout: "outro",
  ativo: true,
  tolerancia_repasse_reais: "0.10",
  janela_antes_dias: "15",
  janela_depois_dias: "45",
  egestor_tag_id: "",
  observacoes: "",
}

const emptyEmpreendimento: EmpreendimentoForm = {
  nome: "",
  codigo: "",
  descricao: "",
  endereco: "",
  ativo: true,
  egestor_tag_id: "",
}

const emptyRegraComercial: RegraComercialForm = {
  imobiliaria_id: "",
  empreendimento_id: "",
  taxa_administracao_percent: "",
  taxa_intermediacao_percent: "",
  ativo: true,
}

export function ImoveisView({
  imobiliarias,
  empreendimentos,
  imoveis,
  regrasComerciais,
  loading,
  error,
  importResult,
  includeInactive,
  onToggleInactive,
  onSaveImovel,
  onDeactivateImovel,
  onReactivateImovel,
  onDeleteImovel,
  onSaveImobiliaria,
  onDeactivateImobiliaria,
  onReactivateImobiliaria,
  onDeleteImobiliaria,
  onSaveEmpreendimento,
  onDeactivateEmpreendimento,
  onReactivateEmpreendimento,
  onDeleteEmpreendimento,
  onSaveRegraComercial,
  onDeactivateRegraComercial,
  onReactivateRegraComercial,
  onDeleteRegraComercial,
  onImportImoveis,
  onSyncImoveis,
}: ImoveisViewProps) {
  const [tab, setTab] = useState<Tab>("imoveis")
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [query, setQuery] = useState("")
  const [imobiliariaFilter, setImobiliariaFilter] = useState("")
  const [empreendimentoFilter, setEmpreendimentoFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [imovelForm, setImovelForm] = useState<ImovelForm>(emptyImovel)
  const [imobiliariaForm, setImobiliariaForm] = useState<ImobiliariaForm>(emptyImobiliaria)
  const [empreendimentoForm, setEmpreendimentoForm] = useState<EmpreendimentoForm>(emptyEmpreendimento)
  const [regraComercialForm, setRegraComercialForm] = useState<RegraComercialForm>(emptyRegraComercial)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [historicoImovel, setHistoricoImovel] = useState<Imovel | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const autoSyncTried = useRef(false)

  // Sincronização automática: na primeira vez que a lista de imóveis estiver
  // vazia (sem erro/carregamento), popula a partir das prestações processadas.
  // Guarda contra loop: roda no máximo uma vez por montagem.
  useEffect(() => {
    if (loading || error || imoveis.length > 0 || autoSyncTried.current) return
    autoSyncTried.current = true
    setAutoSyncing(true)
    setActionError(null)
    onSyncImoveis()
      .then((r) => {
        if (r.criados > 0 || r.atualizados > 0) {
          setSyncMsg(`Sincronizado automaticamente: ${r.criados} criados, ${r.atualizados} atualizados (${r.totalUnidades} unidades).`)
        }
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : "Falha na sincronização automática."))
      .finally(() => setAutoSyncing(false))
  }, [loading, error, imoveis.length, onSyncImoveis])

  async function handleSync() {
    setSyncing(true)
    setActionError(null)
    setSyncMsg(null)
    try {
      const r = await onSyncImoveis()
      setSyncMsg(`Sincronizado: ${r.criados} criados, ${r.atualizados} atualizados (${r.totalUnidades} unidades).`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível sincronizar imóveis.")
    } finally {
      setSyncing(false)
    }
  }

  const filteredImoveis = useMemo(() => {
    const normalized = normalize(query)
    return imoveis.filter((imovel) => {
      const text = normalize(`${imovel.codigo_imobiliaria} ${imovel.unidade} ${imovel.inquilino_nome ?? ""}`)
      return (
        (!normalized || text.includes(normalized)) &&
        (!imobiliariaFilter || imovel.imobiliaria_id === imobiliariaFilter) &&
        (!empreendimentoFilter || imovel.empreendimento_id === empreendimentoFilter) &&
        (!statusFilter || imovel.status === statusFilter)
      )
    })
  }, [empreendimentoFilter, imobiliariaFilter, imoveis, query, statusFilter])

  async function submitImovel() {
    setSaving(true)
    setActionError(null)
    try {
      await onSaveImovel(toImovelPayload(imovelForm))
      setImovelForm(emptyImovel)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel salvar o imovel.")
    } finally {
      setSaving(false)
    }
  }

  async function submitImobiliaria() {
    setSaving(true)
    setActionError(null)
    try {
      await onSaveImobiliaria(toImobiliariaPayload(imobiliariaForm))
      setImobiliariaForm(emptyImobiliaria)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel salvar a imobiliaria.")
    } finally {
      setSaving(false)
    }
  }

  async function submitEmpreendimento() {
    setSaving(true)
    setActionError(null)
    try {
      await onSaveEmpreendimento(toEmpreendimentoPayload(empreendimentoForm))
      setEmpreendimentoForm(emptyEmpreendimento)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel salvar o empreendimento.")
    } finally {
      setSaving(false)
    }
  }

  async function submitRegraComercial() {
    setSaving(true)
    setActionError(null)
    try {
      await onSaveRegraComercial(toRegraComercialPayload(regraComercialForm))
      setRegraComercialForm(emptyRegraComercial)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel salvar a regra comercial.")
    } finally {
      setSaving(false)
    }
  }

  function askHide(label: string, name: string, action: () => Promise<void>) {
    setConfirm({
      title: `Ocultar ${label}`,
      description: `"${name}" será ocultado da lista. Você pode reativá-lo depois marcando "Mostrar ocultos".`,
      confirmLabel: "Ocultar",
      onConfirm: () => action(),
    })
  }

  function askDelete(label: string, name: string, action: () => Promise<void>, extra?: string) {
    setConfirm({
      title: `Excluir ${label}`,
      description: `Isto apaga "${name}" DEFINITIVAMENTE e não pode ser desfeito.${extra ? ` ${extra}` : ""} Digite o nome para confirmar.`,
      confirmLabel: "Excluir definitivamente",
      danger: true,
      requireText: name,
      onConfirm: () => action(),
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#1A2B1C]">Imóveis</h1>
          <p className="mt-1 text-[14px] text-[#6B7F6E]">Cadastros base para conciliação por unidade</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#3D4F3F]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#D5DDD6] accent-[#2D8C3A]"
              checked={includeInactive}
              onChange={(event) => onToggleInactive(event.target.checked)}
            />
            Mostrar ocultos
          </label>
          <button
            onClick={() => void handleSync()}
            disabled={syncing}
            title="Cria/atualiza imóveis a partir das prestações já processadas"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[14px] font-medium text-[#3D4F3F] transition-colors hover:bg-[#EEF1EE] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Sincronizar dos fechamentos
          </button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[14px] font-medium text-[#3D4F3F] transition-colors hover:bg-[#EEF1EE]">
            <FileUp size={16} />
            Importar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void onImportImoveis(file).catch((error) => {
                    setActionError(error instanceof Error ? error.message : "Nao foi possivel importar o CSV.")
                  })
                }
                event.currentTarget.value = ""
              }}
            />
          </label>
        </div>
      </div>

      <div className="mb-4 flex border-b border-[#D5DDD6]">
        <TabButton active={tab === "imoveis"} icon={Home} label="Imóveis" onClick={() => setTab("imoveis")} />
        <TabButton active={tab === "imobiliarias"} icon={Building2} label="Imobiliárias" onClick={() => setTab("imobiliarias")} />
        <TabButton active={tab === "empreendimentos"} icon={Building2} label="Empreendimentos" onClick={() => setTab("empreendimentos")} />
        <TabButton active={tab === "regras"} icon={CheckCircle} label="Regras comerciais" onClick={() => setTab("regras")} />
      </div>

      {(error || actionError) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#DC2626]">
          <AlertTriangle size={16} />
          {actionError ?? error}
        </div>
      )}

      {syncMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#BBF7D0] bg-[#EFF7F1] px-3 py-2 text-[13px] text-[#166534]">
          <CheckCircle size={16} />
          {syncMsg}
        </div>
      )}

      {importResult && (
        <div className="mb-4 rounded-lg border border-[#D5DDD6] bg-white px-3 py-2 text-[13px] text-[#3D4F3F]">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle size={16} className="text-[#2D8C3A]" />
            Importação: {importResult.created} criados, {importResult.updated} atualizados, {importResult.errors.length} erros
          </div>
          {importResult.errors.length > 0 && (
            <div className="mt-2 space-y-1 text-[#DC2626]">
              {importResult.errors.slice(0, 5).map((item) => (
                <p key={`${item.line}-${item.message}`}>Linha {item.line}: {item.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="acr-card flex items-center justify-center gap-2 py-16 text-[#6B7F6E]">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[14px]">Carregando cadastros...</span>
        </div>
      ) : (
        <>
          {tab === "imoveis" && (
            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
              <div className="acr-card min-w-0 overflow-hidden">
                <div className="grid grid-cols-[1fr_180px_180px_160px] gap-3 border-b border-[#EEF1EE] p-4">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7F6E]" />
                    <input className={`${inputClass} pl-9`} placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} />
                  </div>
                  <Select value={imobiliariaFilter} onChange={setImobiliariaFilter}>
                    <option value="">Imobiliária</option>
                    {imobiliarias.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </Select>
                  <Select value={empreendimentoFilter} onChange={setEmpreendimentoFilter}>
                    <option value="">Empreendimento</option>
                    {empreendimentos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </Select>
                  <Select value={statusFilter} onChange={setStatusFilter}>
                    <option value="">Status</option>
                    {statuses.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                        {["Código", "Unidade", "Imobiliária", "Empreendimento", "Status", "Aluguel", "Taxa", "Ações"].map((header) => (
                          <th key={header} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredImoveis.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-[13px] text-[#6B7F6E]">
                            {autoSyncing ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 size={15} className="animate-spin" />
                                Sincronizando imóveis dos fechamentos…
                              </span>
                            ) : imoveis.length === 0 ? (
                              <>
                                Nenhum imóvel cadastrado ainda. Use{" "}
                                <span className="font-semibold text-[#3D4F3F]">&ldquo;Sincronizar dos fechamentos&rdquo;</span>{" "}
                                para popular a partir das prestações já processadas — ou importe um CSV / cadastre manualmente.
                              </>
                            ) : (
                              "Nenhum imóvel encontrado para os filtros atuais."
                            )}
                          </td>
                        </tr>
                      )}
                      {filteredImoveis.map((imovel) => (
                        <tr key={imovel.id} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                          <td className="px-4 py-3 font-medium text-[#3D4F3F]">{imovel.codigo_imobiliaria}</td>
                          <td className="px-4 py-3 text-[#3D4F3F]">
                            <button
                              onClick={() => setHistoricoImovel(imovel)}
                              className="text-left font-medium text-[#2D8C3A] hover:underline"
                              title="Ver histórico do imóvel"
                            >
                              {imovel.unidade}
                            </button>
                            <div className="text-[12px] text-[#6B7F6E]">{imovel.inquilino_nome || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-[#3D4F3F]">{imovel.imobiliarias?.nome ?? "-"}</td>
                          <td className="px-4 py-3 text-[#3D4F3F]">{imovel.empreendimentos?.nome ?? "-"}</td>
                          <td className="px-4 py-3"><StatusBadge status={imovel.status} active={imovel.ativo} /></td>
                          <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{imovel.valor_aluguel_esperado !== null ? formatBRL(Number(imovel.valor_aluguel_esperado)) : "-"}</td>
                          <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{imovel.taxa_administracao_percent ?? "-"}%</td>
                          <td className="px-4 py-3">
                            <RowActions
                              active={imovel.ativo}
                              onHistory={() => setHistoricoImovel(imovel)}
                              onEdit={() => setImovelForm(fromImovel(imovel))}
                              onHide={() => askHide("imóvel", `${imovel.codigo_imobiliaria} · ${imovel.unidade}`, () => onDeactivateImovel(imovel.id))}
                              onReactivate={() => void runAction(() => onReactivateImovel(imovel.id), setActionError)}
                              onDelete={() => askDelete("imóvel", `${imovel.codigo_imobiliaria} · ${imovel.unidade}`, () => onDeleteImovel(imovel.id))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <FormPanel
                title={imovelForm.id ? "Editar imóvel" : "Novo imóvel"}
                onCancel={() => setImovelForm(emptyImovel)}
                onSubmit={() => void submitImovel()}
                saving={saving}
              >
                <Field label="Imobiliária">
                  <Select value={imovelForm.imobiliaria_id} onChange={(value) => setImovelForm((form) => ({ ...form, imobiliaria_id: value }))}>
                    <option value="">Selecione</option>
                    {imobiliarias.filter((item) => item.ativo).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Empreendimento">
                  <Select value={imovelForm.empreendimento_id} onChange={(value) => setImovelForm((form) => ({ ...form, empreendimento_id: value }))}>
                    <option value="">Selecione</option>
                    {empreendimentos.filter((item) => item.ativo).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <TwoColumns>
                  <Field label="Código imobiliária">
                    <Input value={imovelForm.codigo_imobiliaria} onChange={(value) => setImovelForm((form) => ({ ...form, codigo_imobiliaria: value }))} />
                  </Field>
                  <Field label="Unidade">
                    <Input value={imovelForm.unidade} onChange={(value) => setImovelForm((form) => ({ ...form, unidade: value }))} />
                  </Field>
                </TwoColumns>
                <TwoColumns>
                  <Field label="Tipo">
                    <Input value={imovelForm.tipo} onChange={(value) => setImovelForm((form) => ({ ...form, tipo: value }))} />
                  </Field>
                  <Field label="Status">
                    <Select value={imovelForm.status} onChange={(value) => setImovelForm((form) => ({ ...form, status: value as ImovelStatus }))}>
                      {statuses.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </TwoColumns>
                <Field label="Inquilino">
                  <Input value={imovelForm.inquilino_nome} onChange={(value) => setImovelForm((form) => ({ ...form, inquilino_nome: value }))} />
                </Field>
                <TwoColumns>
                  <Field label="Aluguel esperado">
                    <Input type="number" value={imovelForm.valor_aluguel_esperado} onChange={(value) => setImovelForm((form) => ({ ...form, valor_aluguel_esperado: value }))} />
                  </Field>
                  <Field label="Taxa admin. %">
                    <Input type="number" value={imovelForm.taxa_administracao_percent} onChange={(value) => setImovelForm((form) => ({ ...form, taxa_administracao_percent: value }))} />
                  </Field>
                </TwoColumns>
                <Field label="Tag eGestor">
                  <Input value={imovelForm.egestor_tag_id} onChange={(value) => setImovelForm((form) => ({ ...form, egestor_tag_id: value }))} />
                </Field>
                <Field label="Observações">
                  <Textarea value={imovelForm.observacoes} onChange={(value) => setImovelForm((form) => ({ ...form, observacoes: value }))} />
                </Field>
              </FormPanel>
            </div>
          )}

          {tab === "imobiliarias" && (
            <RegistrySection
              rows={imobiliarias}
              headers={["Nome", "Layout", "Contato", "Tolerância", "Janela", "Status", "Ações"]}
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                  <td className="px-4 py-3 font-medium text-[#3D4F3F]">{item.nome}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.layout}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.email || item.telefone || "-"}</td>
                  <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{formatBRL(Number(item.tolerancia_repasse_reais ?? 0))}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.janela_antes_dias}/{item.janela_depois_dias} dias</td>
                  <td className="px-4 py-3"><ActiveBadge active={item.ativo} /></td>
                  <td className="px-4 py-3">
                    <RowActions
                      active={item.ativo}
                      onEdit={() => setImobiliariaForm(fromImobiliaria(item))}
                      onHide={() => askHide("imobiliária", item.nome, () => onDeactivateImobiliaria(item.id))}
                      onReactivate={() => void runAction(() => onReactivateImobiliaria(item.id), setActionError)}
                      onDelete={() => askDelete("imobiliária", item.nome, () => onDeleteImobiliaria(item.id), "Fechamentos e imóveis vinculados também serão excluídos em cascata.")}
                    />
                  </td>
                </tr>
              )}
              form={
                <FormPanel title={imobiliariaForm.id ? "Editar imobiliária" : "Nova imobiliária"} onCancel={() => setImobiliariaForm(emptyImobiliaria)} onSubmit={() => void submitImobiliaria()} saving={saving}>
                  <Field label="Nome"><Input value={imobiliariaForm.nome} onChange={(value) => setImobiliariaForm((form) => ({ ...form, nome: value }))} /></Field>
                  <TwoColumns>
                    <Field label="CNPJ"><Input value={imobiliariaForm.cnpj} onChange={(value) => setImobiliariaForm((form) => ({ ...form, cnpj: value }))} /></Field>
                    <Field label="Layout"><Input value={imobiliariaForm.layout} onChange={(value) => setImobiliariaForm((form) => ({ ...form, layout: value }))} /></Field>
                  </TwoColumns>
                  <TwoColumns>
                    <Field label="Email"><Input value={imobiliariaForm.email} onChange={(value) => setImobiliariaForm((form) => ({ ...form, email: value }))} /></Field>
                    <Field label="Telefone"><Input value={imobiliariaForm.telefone} onChange={(value) => setImobiliariaForm((form) => ({ ...form, telefone: value }))} /></Field>
                  </TwoColumns>
                  <TwoColumns>
                    <Field label="Tolerância"><Input type="number" value={imobiliariaForm.tolerancia_repasse_reais} onChange={(value) => setImobiliariaForm((form) => ({ ...form, tolerancia_repasse_reais: value }))} /></Field>
                    <Field label="Tag eGestor"><Input value={imobiliariaForm.egestor_tag_id} onChange={(value) => setImobiliariaForm((form) => ({ ...form, egestor_tag_id: value }))} /></Field>
                  </TwoColumns>
                  <TwoColumns>
                    <Field label="Janela antes"><Input type="number" value={imobiliariaForm.janela_antes_dias} onChange={(value) => setImobiliariaForm((form) => ({ ...form, janela_antes_dias: value }))} /></Field>
                    <Field label="Janela depois"><Input type="number" value={imobiliariaForm.janela_depois_dias} onChange={(value) => setImobiliariaForm((form) => ({ ...form, janela_depois_dias: value }))} /></Field>
                  </TwoColumns>
                  <Field label="Observações"><Textarea value={imobiliariaForm.observacoes} onChange={(value) => setImobiliariaForm((form) => ({ ...form, observacoes: value }))} /></Field>
                </FormPanel>
              }
            />
          )}

          {tab === "empreendimentos" && (
            <RegistrySection
              rows={empreendimentos}
              headers={["Código", "Nome", "Endereço", "Status", "Ações"]}
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                  <td className="px-4 py-3 font-medium text-[#3D4F3F]">{item.codigo || "-"}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.nome}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.endereco || "-"}</td>
                  <td className="px-4 py-3"><ActiveBadge active={item.ativo} /></td>
                  <td className="px-4 py-3">
                    <RowActions
                      active={item.ativo}
                      onEdit={() => setEmpreendimentoForm(fromEmpreendimento(item))}
                      onHide={() => askHide("empreendimento", item.nome, () => onDeactivateEmpreendimento(item.id))}
                      onReactivate={() => void runAction(() => onReactivateEmpreendimento(item.id), setActionError)}
                      onDelete={() => askDelete("empreendimento", item.nome, () => onDeleteEmpreendimento(item.id), "Fechamentos e imóveis vinculados também serão excluídos em cascata.")}
                    />
                  </td>
                </tr>
              )}
              form={
                <FormPanel title={empreendimentoForm.id ? "Editar empreendimento" : "Novo empreendimento"} onCancel={() => setEmpreendimentoForm(emptyEmpreendimento)} onSubmit={() => void submitEmpreendimento()} saving={saving}>
                  <TwoColumns>
                    <Field label="Código"><Input value={empreendimentoForm.codigo} onChange={(value) => setEmpreendimentoForm((form) => ({ ...form, codigo: value }))} /></Field>
                    <Field label="Nome"><Input value={empreendimentoForm.nome} onChange={(value) => setEmpreendimentoForm((form) => ({ ...form, nome: value }))} /></Field>
                  </TwoColumns>
                  <Field label="Endereço"><Input value={empreendimentoForm.endereco} onChange={(value) => setEmpreendimentoForm((form) => ({ ...form, endereco: value }))} /></Field>
                  <Field label="Descrição"><Textarea value={empreendimentoForm.descricao} onChange={(value) => setEmpreendimentoForm((form) => ({ ...form, descricao: value }))} /></Field>
                  <Field label="Tag eGestor"><Input value={empreendimentoForm.egestor_tag_id} onChange={(value) => setEmpreendimentoForm((form) => ({ ...form, egestor_tag_id: value }))} /></Field>
                </FormPanel>
              }
            />
          )}

          {tab === "regras" && (
            <RegistrySection
              rows={regrasComerciais}
              headers={["Imobiliária", "Empreendimento", "Tx admin.", "Tx intermediação", "Status", "Ações"]}
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                  <td className="px-4 py-3 font-medium text-[#3D4F3F]">{item.imobiliarias?.nome ?? "-"}</td>
                  <td className="px-4 py-3 text-[#3D4F3F]">{item.empreendimentos?.nome ?? "-"}</td>
                  <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{formatPercent(item.taxa_administracao_percent)}</td>
                  <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{formatPercent(item.taxa_intermediacao_percent)}</td>
                  <td className="px-4 py-3"><ActiveBadge active={item.ativo} /></td>
                  <td className="px-4 py-3">
                    <RowActions
                      active={item.ativo}
                      onEdit={() => setRegraComercialForm(fromRegraComercial(item))}
                      onHide={() => askHide("regra", `${item.imobiliarias?.nome ?? "?"} / ${item.empreendimentos?.nome ?? "?"}`, () => onDeactivateRegraComercial(item.id))}
                      onReactivate={() => void runAction(() => onReactivateRegraComercial(item.id), setActionError)}
                      onDelete={() => askDelete("regra comercial", `${item.imobiliarias?.nome ?? "?"} / ${item.empreendimentos?.nome ?? "?"}`, () => onDeleteRegraComercial(item.id))}
                    />
                  </td>
                </tr>
              )}
              form={
                <FormPanel title={regraComercialForm.id ? "Editar regra" : "Nova regra"} onCancel={() => setRegraComercialForm(emptyRegraComercial)} onSubmit={() => void submitRegraComercial()} saving={saving}>
                  <Field label="Imobiliária">
                    <Select value={regraComercialForm.imobiliaria_id} onChange={(value) => setRegraComercialForm((form) => ({ ...form, imobiliaria_id: value }))}>
                      <option value="">Selecione</option>
                      {imobiliarias.filter((item) => item.ativo).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Empreendimento">
                    <Select value={regraComercialForm.empreendimento_id} onChange={(value) => setRegraComercialForm((form) => ({ ...form, empreendimento_id: value }))}>
                      <option value="">Selecione</option>
                      {empreendimentos.filter((item) => item.ativo).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <TwoColumns>
                    <Field label="Tx admin. %"><Input type="number" value={regraComercialForm.taxa_administracao_percent} onChange={(value) => setRegraComercialForm((form) => ({ ...form, taxa_administracao_percent: value }))} /></Field>
                    <Field label="Tx intermediação %"><Input type="number" value={regraComercialForm.taxa_intermediacao_percent} onChange={(value) => setRegraComercialForm((form) => ({ ...form, taxa_intermediacao_percent: value }))} /></Field>
                  </TwoColumns>
                </FormPanel>
              }
            />
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          state={confirm}
          onClose={() => setConfirm(null)}
          onError={setActionError}
        />
      )}

      {historicoImovel && (
        <ImovelHistoricoDrawer
          empreendimentoId={historicoImovel.empreendimento_id}
          empreendimentoNome={historicoImovel.empreendimentos?.nome ?? "Empreendimento"}
          unidade={historicoImovel.unidade}
          codigo={historicoImovel.codigo_imobiliaria}
          onClose={() => setHistoricoImovel(null)}
        />
      )}
    </div>
  )
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Home; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 border-b-2 px-4 text-[14px] font-medium transition-colors ${
        active ? "border-[#2D8C3A] text-[#1A2B1C]" : "border-transparent text-[#6B7F6E] hover:text-[#3D4F3F]"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, type = "text" }: { value: string; onChange: (value: string) => void; type?: string }) {
  return <input type={type} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  )
}

function Textarea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <textarea
      rows={3}
      className="w-full resize-none rounded-lg border border-[#D5DDD6] bg-white px-3 py-2 text-[13px] text-[#3D4F3F] outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function TwoColumns({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function FormPanel({ title, children, saving, onCancel, onSubmit }: { title: string; children: React.ReactNode; saving: boolean; onCancel: () => void; onSubmit: () => void }) {
  return (
    <div className="acr-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#1A2B1C]">{title}</h2>
        <button onClick={onCancel} className="text-[13px] font-medium text-[#6B7F6E] hover:text-[#3D4F3F]">
          Limpar
        </button>
      </div>
      <div className="space-y-3">{children}</div>
      <button
        onClick={onSubmit}
        disabled={saving}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2D8C3A] text-[14px] font-medium text-white transition-colors hover:bg-[#1A5C24] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar
      </button>
    </div>
  )
}

function RegistrySection<T>({ rows, headers, renderRow, form }: { rows: T[]; headers: string[]; renderRow: (row: T) => React.ReactNode; form: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="acr-card max-h-[70vh] min-w-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-4 py-12 text-center text-[13px] text-[#6B7F6E]">
                  Nenhum registro cadastrado ainda.
                </td>
              </tr>
            )}
            {rows.map(renderRow)}
          </tbody>
        </table>
      </div>
      {form}
    </div>
  )
}

function RowActions({
  active,
  onEdit,
  onHide,
  onReactivate,
  onDelete,
  onHistory,
}: {
  active: boolean
  onEdit: () => void
  onHide: () => void
  onReactivate: () => void
  onDelete: () => void
  onHistory?: () => void
}) {
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D5DDD6] bg-white hover:bg-[#EEF1EE]"
  return (
    <div className="flex items-center gap-2">
      {onHistory && (
        <button onClick={onHistory} className={`${iconBtn} text-[#2D8C3A] hover:bg-[#EFF7F1]`} title="Histórico do imóvel">
          <History size={14} />
        </button>
      )}
      <button onClick={onEdit} className={`${iconBtn} text-[#3D4F3F]`} title="Editar">
        <Edit3 size={14} />
      </button>
      {active ? (
        <button onClick={onHide} className={`${iconBtn} text-[#92400E] hover:bg-[#FEF3C7]`} title="Ocultar">
          <EyeOff size={14} />
        </button>
      ) : (
        <button onClick={onReactivate} className={`${iconBtn} text-[#166534] hover:bg-[#DCFCE7]`} title="Reativar">
          <RotateCcw size={14} />
        </button>
      )}
      <button onClick={onDelete} className={`${iconBtn} text-[#DC2626] hover:bg-[#FEF2F2]`} title="Excluir definitivamente">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function ConfirmDialog({
  state,
  onClose,
  onError,
}: {
  state: ConfirmState
  onClose: () => void
  onError: (message: string | null) => void
}) {
  const [text, setText] = useState("")
  const [working, setWorking] = useState(false)
  const blocked = Boolean(state.requireText) && normalize(text.trim()) !== normalize(state.requireText!.trim())

  async function handleConfirm() {
    if (blocked || working) return
    setWorking(true)
    onError(null)
    try {
      await state.onConfirm()
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : "A ação não foi concluída.")
      onClose()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#EEF1EE] bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          {state.danger && <AlertTriangle size={18} className="text-[#DC2626]" />}
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">{state.title}</h2>
        </div>
        <p className="text-[13px] leading-relaxed text-[#6B7F6E]">{state.description}</p>
        {state.requireText && (
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={state.requireText}
            className={`${inputClass} mt-3`}
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]">
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={blocked || working}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              state.danger ? "bg-[#DC2626] hover:bg-[#991B1B]" : "bg-[#2D8C3A] hover:bg-[#1A5C24]"
            }`}
          >
            {working && <Loader2 size={14} className="animate-spin" />}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, active }: { status: ImovelStatus; active: boolean }) {
  const label = statuses.find((item) => item.value === status)?.label ?? status
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-[#EFF7F1] text-[#166534]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
      {label}
    </span>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
      {active ? "Ativo" : "Inativo"}
    </span>
  )
}

function fromImovel(imovel: Imovel): ImovelForm {
  return {
    id: imovel.id,
    imobiliaria_id: imovel.imobiliaria_id,
    empreendimento_id: imovel.empreendimento_id,
    codigo_imobiliaria: imovel.codigo_imobiliaria,
    unidade: imovel.unidade,
    tipo: imovel.tipo ?? "",
    inquilino_nome: imovel.inquilino_nome ?? "",
    status: imovel.status,
    valor_aluguel_esperado: imovel.valor_aluguel_esperado?.toString() ?? "",
    taxa_administracao_percent: imovel.taxa_administracao_percent?.toString() ?? "",
    ativo: imovel.ativo,
    egestor_tag_id: imovel.egestor_tag_id ?? "",
    observacoes: imovel.observacoes ?? "",
  }
}

function fromImobiliaria(imobiliaria: Imobiliaria): ImobiliariaForm {
  return {
    id: imobiliaria.id,
    nome: imobiliaria.nome,
    cnpj: imobiliaria.cnpj ?? "",
    email: imobiliaria.email ?? "",
    telefone: imobiliaria.telefone ?? "",
    layout: imobiliaria.layout,
    ativo: imobiliaria.ativo,
    tolerancia_repasse_reais: imobiliaria.tolerancia_repasse_reais?.toString() ?? "0.10",
    janela_antes_dias: imobiliaria.janela_antes_dias?.toString() ?? "15",
    janela_depois_dias: imobiliaria.janela_depois_dias?.toString() ?? "45",
    egestor_tag_id: imobiliaria.egestor_tag_id ?? "",
    observacoes: imobiliaria.observacoes ?? "",
  }
}

function fromEmpreendimento(empreendimento: Empreendimento): EmpreendimentoForm {
  return {
    id: empreendimento.id,
    nome: empreendimento.nome,
    codigo: empreendimento.codigo ?? "",
    descricao: empreendimento.descricao ?? "",
    endereco: empreendimento.endereco ?? "",
    ativo: empreendimento.ativo,
    egestor_tag_id: empreendimento.egestor_tag_id ?? "",
  }
}

function fromRegraComercial(regra: RegraComercial): RegraComercialForm {
  return {
    id: regra.id,
    imobiliaria_id: regra.imobiliaria_id,
    empreendimento_id: regra.empreendimento_id,
    taxa_administracao_percent: regra.taxa_administracao_percent.toString(),
    taxa_intermediacao_percent: regra.taxa_intermediacao_percent.toString(),
    ativo: regra.ativo,
  }
}

function toImovelPayload(form: ImovelForm) {
  return {
    ...form,
    valor_aluguel_esperado: form.valor_aluguel_esperado || null,
    taxa_administracao_percent: form.taxa_administracao_percent || null,
  }
}

function toImobiliariaPayload(form: ImobiliariaForm) {
  return {
    ...form,
    tolerancia_repasse_reais: form.tolerancia_repasse_reais || "0.10",
    janela_antes_dias: form.janela_antes_dias || "15",
    janela_depois_dias: form.janela_depois_dias || "45",
  }
}

function toEmpreendimentoPayload(form: EmpreendimentoForm) {
  return form
}

function toRegraComercialPayload(form: RegraComercialForm) {
  return {
    ...form,
    taxa_administracao_percent: form.taxa_administracao_percent || "0",
    taxa_intermediacao_percent: form.taxa_intermediacao_percent || "0",
  }
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value))}%`
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

async function runAction(action: () => Promise<void>, setActionError: (message: string | null) => void) {
  setActionError(null)
  try {
    await action()
  } catch (error) {
    setActionError(error instanceof Error ? error.message : "A acao nao foi concluida.")
  }
}
