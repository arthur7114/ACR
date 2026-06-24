"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle,
  DoorOpen,
  Handshake,
  Loader2,
  Receipt,
  User,
  X,
} from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { EventoImovel, EventoTipo, ImovelHistorico } from "@/lib/imovel-historico-types"

interface ImovelHistoricoDrawerProps {
  empreendimentoId: string
  empreendimentoNome: string
  unidade: string
  codigo?: string | null
  onClose: () => void
}

const tipoMeta: Record<EventoTipo, { label: string; color: string; bg: string; icon: typeof Receipt }> = {
  pago: { label: "Aluguel pago", color: "#166534", bg: "#EFF7F1", icon: CheckCircle },
  inadimplente: { label: "Inadimplente", color: "#991B1B", bg: "#FEF2F2", icon: AlertTriangle },
  vago: { label: "Vago", color: "#6B7280", bg: "#F3F4F6", icon: DoorOpen },
  acordo: { label: "Acordo", color: "#9A3412", bg: "#FFF7ED", icon: Handshake },
  rescisao: { label: "Rescisão", color: "#9F1239", bg: "#FFF1F2", icon: ArrowLeftRight },
  atraso: { label: "Inadimplência paga", color: "#1D4ED8", bg: "#EFF6FF", icon: CalendarClock },
  intermediacao: { label: "Intermediação", color: "#7C3AED", bg: "#FAF5FF", icon: Receipt },
}

export function ImovelHistoricoDrawer({
  empreendimentoId,
  empreendimentoNome,
  unidade,
  codigo,
  onClose,
}: ImovelHistoricoDrawerProps) {
  const [historico, setHistorico] = useState<ImovelHistorico | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = `/api/imoveis/historico?empreendimento_id=${encodeURIComponent(empreendimentoId)}&unidade=${encodeURIComponent(unidade)}`
    fetch(url)
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? "Falha ao carregar o histórico.")
        return json.historico as ImovelHistorico
      })
      .then((data) => {
        if (!cancelled) setHistorico(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar o histórico.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [empreendimentoId, unidade])

  const resumo = historico?.resumo

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[560px] flex-col bg-[#F8FAF8] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EEF1EE] bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Histórico do imóvel</p>
            <h2 className="mt-0.5 text-[20px] font-bold text-[#1A2B1C]">
              Unidade {unidade}
              {codigo ? <span className="ml-2 text-[13px] font-medium text-[#6B7F6E]">{codigo}</span> : null}
            </h2>
            <p className="text-[13px] text-[#6B7F6E]">{empreendimentoNome}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#D5DDD6] bg-white text-[#3D4F3F] hover:bg-[#EEF1EE]"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-[#6B7F6E]">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[14px]">Carregando histórico...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#DC2626]">
              <AlertTriangle size={16} />
              {error}
            </div>
          ) : !historico || historico.eventos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D5DDD6] bg-white px-4 py-12 text-center text-[14px] text-[#6B7F6E]">
              Nenhum lançamento encontrado para esta unidade nas prestações já processadas.
            </div>
          ) : (
            <>
              {/* Situação atual */}
              {resumo?.situacaoAtual && (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-[#EEF1EE] bg-white p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Situação atual</p>
                    <div className="mt-1 flex items-center gap-2">
                      <TipoBadge tipo={resumo.situacaoAtual} />
                      {resumo.inquilinoAtual && (
                        <span className="text-[13px] text-[#3D4F3F]">{resumo.inquilinoAtual}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Total recebido</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-[#1A2B1C]">{formatBRL(resumo.totalRecebido)}</p>
                  </div>
                </div>
              )}

              {/* Métricas */}
              {resumo && (
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <Metric label="Meses obs." value={resumo.mesesObservados} />
                  <Metric label="Pago" value={resumo.mesesPago} tone="#166534" />
                  <Metric label="Inadimplente" value={resumo.mesesInadimplente} tone="#991B1B" />
                  <Metric label="Vago" value={resumo.mesesVago} tone="#6B7280" />
                  <Metric label="Acordos" value={resumo.acordos} tone="#9A3412" />
                  <Metric label="Rescisões" value={resumo.rescisoes} tone="#9F1239" />
                  <Metric label="Inad. pagas" value={resumo.atrasosQuitados} tone="#1D4ED8" />
                  <Metric label="Intermed." value={resumo.intermediacoes} tone="#7C3AED" />
                </div>
              )}

              {/* Inquilinos */}
              {historico.inquilinos.length > 0 && (
                <div className="mb-4 rounded-xl border border-[#EEF1EE] bg-white p-4">
                  <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">
                    <User size={13} /> Inquilinos
                  </p>
                  <div className="space-y-2">
                    {historico.inquilinos.map((inq) => (
                      <div key={inq.inquilino} className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-[#1A2B1C]">{inq.inquilino}</span>
                        <span className="text-[#6B7F6E]">
                          {inq.primeiraCompetencia === inq.ultimaCompetencia
                            ? mesAno(inq.ultimaCompetencia)
                            : `${mesAno(inq.primeiraCompetencia)} – ${mesAno(inq.ultimaCompetencia)}`}
                          <span className="ml-2 tabular-nums">({inq.meses} {inq.meses === 1 ? "mês" : "meses"})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linha do tempo */}
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Linha do tempo</p>
              <div className="relative pl-7">
                <div className="absolute left-[10px] top-1 bottom-1 w-0.5 bg-[#E1E8E2]" />
                {historico.eventos.map((evento, index) => (
                  <TimelineItem key={`${evento.competencia}-${evento.tipo}-${index}`} evento={evento} />
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function TimelineItem({ evento }: { evento: EventoImovel }) {
  const meta = tipoMeta[evento.tipo]
  const Icon = meta.icon
  const valorPrincipal = evento.total
  return (
    <div className="relative mb-5 last:mb-0">
      {/* ícone sobre o fio condutor */}
      <div
        className="absolute -left-[25px] top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#F8FAF8]"
        style={{ color: meta.color }}
      >
        <Icon size={15} />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TipoBadge tipo={evento.tipo} />
            <span className="text-[12px] text-[#6B7F6E]">{evento.competenciaLabel}</span>
          </div>
          {evento.inquilino && <p className="mt-1 text-[13px] text-[#3D4F3F]">{evento.inquilino}</p>}
          {evento.observacao && (
            <p className="mt-0.5 text-[12px] leading-snug text-[#6B7F6E]">{evento.observacao}</p>
          )}
        </div>
        {valorPrincipal !== null && valorPrincipal !== undefined && (
          <div className="shrink-0 text-right">
            <p className="text-[14px] font-bold tabular-nums text-[#1A2B1C]">{formatBRL(valorPrincipal)}</p>
            {evento.comissao !== null && evento.comissao !== undefined && evento.comissao > 0 && (
              <p className="text-[11px] tabular-nums text-[#6B7F6E]">comissão {formatBRL(evento.comissao)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TipoBadge({ tipo }: { tipo: EventoTipo }) {
  const meta = tipoMeta[tipo]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

function Metric({ label, value, tone = "#1A2B1C" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#EEF1EE] bg-white px-3 py-2 text-center">
      <p className="text-[18px] font-bold tabular-nums" style={{ color: tone }}>
        {value}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#6B7F6E]">{label}</p>
    </div>
  )
}

function mesAno(competencia: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(competencia)
  if (!m) return competencia
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`
}
