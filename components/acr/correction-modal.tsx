"use client"

import { useEffect, useState } from "react"
import { X, Info } from "lucide-react"
import { toast } from "sonner"

interface CorrectionModalProps {
  open: boolean
  onClose: () => void
  fechamentoId: string
  apto: string
  inquilino: string
  tipo?: string
  valorLido?: string
  valorInicial?: number
  onSaved?: () => void
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5">
      <span className="text-[#6B7F6E]">{children}</span>
      {required && <span className="text-[#DC2626] ml-1">*</span>}
    </label>
  )
}

// Converte "1.234,56" (pt-BR) para 1234.56.
function parseValorBR(value: string): number | null {
  const cleaned = value.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function CorrectionModal({
  open,
  onClose,
  fechamentoId,
  apto,
  inquilino,
  tipo = "Aluguel",
  valorLido = "-",
  valorInicial,
  onSaved,
}: CorrectionModalProps) {
  const [valor, setValor] = useState("")
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValor(typeof valorInicial === "number" ? valorInicial.toFixed(2).replace(".", ",") : "")
      setMotivo("")
    }
  }, [open, valorInicial])

  if (!open) return null

  const handleSave = async () => {
    const valorNovo = parseValorBR(valor)
    if (valorNovo === null || valorNovo < 0) {
      toast.error("Informe um valor correto válido (ex.: 685,16).")
      return
    }
    if (!motivo.trim()) {
      toast.error("Explique o motivo da correção antes de salvar.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/fechamentos/${fechamentoId}/corrigir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apto,
          inquilino,
          campo: "aluguel",
          valor_novo: valorNovo,
          justificativa: motivo.trim(),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.error) {
        toast.error(payload.error ?? "Não foi possível salvar a correção.")
        return
      }
      toast.success("Correção salva com sucesso", {
        style: { background: "#DCFCE7", color: "#166534", border: "1px solid #22C55E" },
      })
      setMotivo("")
      setValor("")
      onClose()
      onSaved?.()
    } catch {
      toast.error("Falha de rede ao salvar a correção. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={saving ? undefined : onClose}
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-[18px] font-bold text-[#1A2B1C]">Corrigir lançamento — Apto {apto}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#EEF1EE] text-[#6B7F6E]" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Info badge */}
        <div className="bg-[#DBEAFE] text-[#1E40AF] rounded-lg p-3 text-sm flex gap-2 mb-5 items-start">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>Esta correção ficará registrada com seu nome, data e motivo, e o fechamento será revalidado.</span>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <FieldLabel>Inquilino</FieldLabel>
            <input
              disabled
              value={inquilino || "-"}
              className="w-full h-10 px-3 text-[14px] bg-[#F8FAF8] border border-[#D5DDD6] rounded-lg text-[#3D4F3F]"
            />
          </div>

          <div>
            <FieldLabel>Tipo</FieldLabel>
            <input
              disabled
              value={tipo}
              className="w-full h-10 px-3 text-[14px] bg-[#F8FAF8] border border-[#D5DDD6] rounded-lg text-[#3D4F3F]"
            />
          </div>

          <div>
            <FieldLabel>Valor lido pelo sistema</FieldLabel>
            <input
              disabled
              value={valorLido}
              className="w-full h-10 px-3 text-[14px] bg-[#F8FAF8] border border-[#D5DDD6] rounded-lg text-[#3D4F3F] tabular-nums"
            />
          </div>

          <div>
            <FieldLabel required>Valor correto</FieldLabel>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6B7F6E]">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="685,16"
                className="w-full h-10 pl-10 pr-3 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#1A2B1C] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15 tabular-nums"
              />
            </div>
          </div>

          <div>
            <FieldLabel required>Por que você está corrigindo?</FieldLabel>
            <textarea
              rows={4}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique o motivo. Ex: valor estava ilegível — conferido manualmente na prestação original."
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#1A2B1C] placeholder:text-[#9CA89E] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15 resize-none"
            />
            <p className="text-[11px] text-[#6B7F6E] mt-1 text-right">{motivo.length}/500</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !motivo.trim() || !valor.trim()}
            className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Salvando..." : "Salvar correção"}
          </button>
        </div>
      </div>
    </div>
  )
}
