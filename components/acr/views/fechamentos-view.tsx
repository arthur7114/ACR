"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle, Loader2, Plus, Send, Trash2 } from "lucide-react"
import { formatBRL } from "@/lib/format"
import {
  resolveFechamentoListPresentation,
  type FechamentoListStatus,
} from "@/lib/fechamento-list"

interface Row {
  id: string
  competencia: string
  imobiliaria: string
  empreendimento: string
  status: FechamentoListStatus
  href: string
  actionLabel: string
  arquivado: boolean
  aRepassar: number | null
  transferido: number | null
  diferenca: number | null
}

type Confirm = { title: string; description: string; confirmLabel: string; danger?: boolean; requireText?: string; onConfirm: () => Promise<void> }

function formatCompetencia(date: string) {
  const [year, month] = date.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${months[parseInt(month) - 1]}/${year}`
}

function StatusBadge({ status }: { status: FechamentoListStatus }) {
  if (status === "rascunho") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-[#4B5563]">
        Aguardando documentos
      </span>
    )
  }
  if (status === "erro_processamento") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-3 py-1 text-xs font-medium text-[#991B1B]">
        <AlertTriangle size={12} />
        Erro na análise
      </span>
    )
  }
  if (status === "pendente") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Pendente revisão
      </span>
    )
  }
  if (status === "aprovado") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Aprovado
      </span>
    )
  }
  if (status === "preparado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#E0F2FE] text-[#075985] rounded-full px-3 py-1 text-xs font-medium">
        <Send size={12} />
        Pronto eGestor
      </span>
    )
  }
  if (status === "lancado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Lançado eGestor
      </span>
    )
  }
  if (status === "erro_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEE2E2] text-[#991B1B] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Erro eGestor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-[#DBEAFE] text-[#1E40AF] rounded-full px-3 py-1 text-xs font-medium">
      Processando
    </span>
  )
}

export function FechamentosView() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeArquivados, setIncludeArquivados] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/fechamentos${includeArquivados ? "?include_arquivados=true" : ""}`)
      const payload = await res.json()
      if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao carregar fechamentos.")
      const mapped: Row[] = (payload.fechamentos ?? []).map((f: {
        id: string
        competencia: string
        status: string
        processamento_status: string | null
        processamento_atualizado_em: string | null
        arquivado?: boolean
        total_repassar: number | null
        valor_repassado_comprovante: number | null
        diferenca_total: number | null
        imobiliarias: { nome: string }
        empreendimentos: { nome: string }
      }) => {
        const presentation = resolveFechamentoListPresentation({
          id: f.id,
          dbStatus: f.status,
          processamentoStatus: f.processamento_status,
          processamentoAtualizadoEm: f.processamento_atualizado_em,
        })
        return {
          id: f.id,
          competencia: formatCompetencia(f.competencia),
          imobiliaria: f.imobiliarias?.nome ?? "-",
          empreendimento: f.empreendimentos?.nome ?? "-",
          ...presentation,
          arquivado: Boolean(f.arquivado),
          aRepassar: f.total_repassar,
          transferido: f.valor_repassado_comprovante,
          diferenca: f.diferenca_total,
        }
      })
      setRows(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar fechamentos.")
    } finally {
      setLoading(false)
    }
  }, [includeArquivados])

  useEffect(() => {
    void reload()
  }, [reload])

  async function setArquivado(row: Row, arquivado: boolean) {
    const res = await fetch(`/api/fechamentos/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado }),
    })
    const payload = await res.json()
    if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao arquivar.")
    await reload()
  }

  async function excluir(row: Row) {
    const res = await fetch(`/api/fechamentos/${row.id}`, { method: "DELETE" })
    const payload = await res.json()
    if (!res.ok || payload.error) throw new Error(payload.error ?? "Falha ao excluir.")
    await reload()
  }

  function label(row: Row) {
    return `${row.imobiliaria} · ${row.empreendimento} · ${row.competencia}`
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">Fechamentos</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">Conciliação mensal de repasses por imobiliária</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#3D4F3F]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#D5DDD6] accent-[#2D8C3A]"
              checked={includeArquivados}
              onChange={(event) => setIncludeArquivados(event.target.checked)}
            />
            Mostrar arquivados
          </label>
          <Link
            href="/fechamentos/novo"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
          >
            <Plus size={16} />
            Novo Fechamento
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#6B7F6E]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[14px]">Carregando fechamentos...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#DC2626]">
            <AlertTriangle size={18} />
            <span className="text-[14px]">{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#6B7F6E]">
            <p className="text-[14px]">Nenhum fechamento encontrado.</p>
            <Link
              href="/fechamentos/novo"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#2D8C3A] text-white text-[13px] font-medium hover:bg-[#1A5C24] transition-colors"
            >
              <Plus size={14} />
              Criar primeiro fechamento
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                  {["Competência", "Imobiliária", "Empreendimento", "Status", "A repassar", "Transferido", "Diferença", "Ações"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#EEF1EE] last:border-0 transition-colors duration-150 hover:bg-[#EFF7F1] ${row.arquivado ? "opacity-60" : ""} ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}
                  >
                    <td className="px-4 py-3.5 text-[#3D4F3F] font-medium">
                      {row.competencia}
                      {row.arquivado && <span className="ml-2 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium text-[#6B7280]">arquivado</span>}
                    </td>
                    <td className="px-4 py-3.5 text-[#3D4F3F]">{row.imobiliaria}</td>
                    <td className="px-4 py-3.5 text-[#3D4F3F]">{row.empreendimento}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3.5 text-[#3D4F3F] tabular-nums">{row.aRepassar !== null ? formatBRL(row.aRepassar) : "-"}</td>
                    <td className="px-4 py-3.5 text-[#3D4F3F] tabular-nums">{row.transferido !== null ? formatBRL(row.transferido) : "-"}</td>
                    <td className={`px-4 py-3.5 font-medium tabular-nums ${row.diferenca === 0 ? "text-[#22C55E]" : "text-[#DC2626]"}`}>
                      {row.diferenca !== null ? `${row.diferenca < 0 ? "-" : ""}${formatBRL(Math.abs(row.diferenca))}` : "-"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={row.href}
                          className={`h-8 inline-flex items-center px-3 rounded-lg text-[13px] font-medium transition-colors ${
                            row.status === "pendente" || row.status === "rascunho"
                              ? "bg-[#2D8C3A] text-white hover:bg-[#1A5C24]"
                              : "bg-white border border-[#D5DDD6] text-[#3D4F3F] hover:bg-[#EEF1EE]"
                          }`}
                        >
                          {row.actionLabel}
                        </Link>
                        <button
                          onClick={() =>
                            setConfirm({
                              title: row.arquivado ? "Desarquivar fechamento" : "Arquivar fechamento",
                              description: row.arquivado
                                ? `"${label(row)}" volta para a lista principal.`
                                : `"${label(row)}" será ocultado da lista (sem apagar nada).`,
                              confirmLabel: row.arquivado ? "Desarquivar" : "Arquivar",
                              onConfirm: () => setArquivado(row, !row.arquivado),
                            })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D5DDD6] bg-white text-[#92400E] hover:bg-[#FEF3C7]"
                          title={row.arquivado ? "Desarquivar" : "Arquivar"}
                        >
                          {row.arquivado ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "Excluir fechamento",
                              description: `Isto apaga "${label(row)}" DEFINITIVAMENTE, junto com documentos, movimentações e lançamentos eGestor. Não pode ser desfeito. Digite EXCLUIR para confirmar.`,
                              confirmLabel: "Excluir definitivamente",
                              danger: true,
                              requireText: "EXCLUIR",
                              onConfirm: () => excluir(row),
                            })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D5DDD6] bg-white text-[#DC2626] hover:bg-[#FEF2F2]"
                          title="Excluir definitivamente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[#EEF1EE] bg-white">
              <span className="text-sm text-[#6B7F6E]">
                {rows.length} {rows.length === 1 ? "fechamento" : "fechamentos"}
              </span>
            </div>
          </>
        )}
      </div>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} onError={setError} />}
    </div>
  )
}

function ConfirmDialog({
  state,
  onClose,
  onError,
}: {
  state: Confirm
  onClose: () => void
  onError: (message: string | null) => void
}) {
  const [text, setText] = useState("")
  const [working, setWorking] = useState(false)
  const blocked = Boolean(state.requireText) && text.trim().toUpperCase() !== state.requireText!.trim().toUpperCase()

  async function handleConfirm() {
    if (blocked || working) return
    setWorking(true)
    try {
      await state.onConfirm()
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : "A ação não foi concluída.")
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
            className="mt-3 h-9 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#3D4F3F] outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"
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
