"use client"

import { useEffect, useMemo, useState } from "react"
import { Info, X } from "lucide-react"
import type { Empreendimento, Imobiliaria } from "@/lib/cadastros-types"

interface AlocarEmpreendimentoModalProps {
  open: boolean
  onClose: () => void
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  competenciaDefault?: string
  pendingFilesCount: number
  onConfirm: (input: {
    imobiliariaId: string
    empreendimentoId: string
    competencia: string
  }) => Promise<void>
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5">
      <span className="text-[#6B7F6E]">{children}</span>
      {required && <span className="text-[#DC2626] ml-1">*</span>}
    </label>
  )
}

const selectClass =
  "w-full h-10 px-3 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#3D4F3F] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

function parseCompetenciaDefault(value: string | undefined) {
  if (value) {
    const match = value.match(/^(\d{4})-(\d{2})/)
    if (match) return { year: match[1], month: match[2] }
  }
  const now = new Date()
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0"),
  }
}

export function AlocarEmpreendimentoModal({
  open,
  onClose,
  imobiliarias,
  empreendimentos,
  competenciaDefault,
  pendingFilesCount,
  onConfirm,
}: AlocarEmpreendimentoModalProps) {
  const imobiliariasAtivas = useMemo(() => imobiliarias.filter((item) => item.ativo), [imobiliarias])
  const empreendimentosAtivos = useMemo(() => empreendimentos.filter((item) => item.ativo), [empreendimentos])

  const defaultCompetencia = parseCompetenciaDefault(competenciaDefault)

  const [imobiliariaId, setImobiliariaId] = useState<string>("")
  const [empreendimentoId, setEmpreendimentoId] = useState<string>("")
  const [mes, setMes] = useState<string>(defaultCompetencia.month)
  const [ano, setAno] = useState<string>(defaultCompetencia.year)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setImobiliariaId(imobiliariasAtivas[0]?.id ?? "")
      setEmpreendimentoId(empreendimentosAtivos[0]?.id ?? "")
      setMes(defaultCompetencia.month)
      setAno(defaultCompetencia.year)
      setError(null)
      setSubmitting(false)
    }
  }, [open, imobiliariasAtivas, empreendimentosAtivos, defaultCompetencia.month, defaultCompetencia.year])

  if (!open) return null

  const canConfirm = Boolean(imobiliariaId && empreendimentoId && mes && ano && !submitting)

  const handleConfirm = async () => {
    if (!canConfirm) return
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm({
        imobiliariaId,
        empreendimentoId,
        competencia: `${ano}-${mes.padStart(2, "0")}-01`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao confirmar alocacao.")
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-[18px] font-bold text-[#1A2B1C]">Alocar documento avulso</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded hover:bg-[#EEF1EE] text-[#6B7F6E] disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-[#DBEAFE] text-[#1E40AF] rounded-lg p-3 text-sm flex gap-2 mb-5 items-start">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            {pendingFilesCount === 1
              ? "Este arquivo precisa estar vinculado a um fechamento."
              : `Os ${pendingFilesCount} arquivos precisam estar vinculados a um fechamento.`}{" "}
            Confirme abaixo a imobiliaria, o empreendimento e a competencia.
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <FieldLabel required>Imobiliaria</FieldLabel>
            <select
              className={selectClass}
              value={imobiliariaId}
              onChange={(event) => setImobiliariaId(event.target.value)}
              disabled={submitting}
            >
              {imobiliariasAtivas.length === 0 && (
                <option value="" disabled>
                  Nenhuma imobiliaria ativa cadastrada
                </option>
              )}
              {imobiliariasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel required>Empreendimento</FieldLabel>
            <select
              className={selectClass}
              value={empreendimentoId}
              onChange={(event) => setEmpreendimentoId(event.target.value)}
              disabled={submitting}
            >
              {empreendimentosAtivos.length === 0 && (
                <option value="" disabled>
                  Nenhum empreendimento ativo cadastrado
                </option>
              )}
              {empreendimentosAtivos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel required>Competencia</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select
                className={selectClass}
                value={mes}
                onChange={(event) => setMes(event.target.value)}
                disabled={submitting}
              >
                {MONTH_LABELS.map((label, index) => {
                  const value = String(index + 1).padStart(2, "0")
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                })}
              </select>
              <input
                type="number"
                min={2020}
                max={2099}
                className={`${selectClass} tabular-nums`}
                value={ano}
                onChange={(event) => setAno(event.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-[#FEE2E2] border border-[#DC2626] rounded-lg p-3 mt-4 text-[13px] text-[#991B1B]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Processando..." : "Confirmar e processar"}
          </button>
        </div>
      </div>
    </div>
  )
}
