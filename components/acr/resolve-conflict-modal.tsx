"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

interface ResolveConflictModalProps {
  isOpen: boolean
  onClose: () => void
  validation: {
    id: string
    fechamento_id: string
    tipo_validacao: string
    mensagem: string
    valor_esperado: number | null
    valor_encontrado: number | null
    diferenca: number | null
  } | null
  onResolveSuccess: () => void
}

export function ResolveConflictModal({
  isOpen,
  onClose,
  validation,
  onResolveSuccess,
}: ResolveConflictModalProps) {
  const [option, setOption] = useState<"esperado" | "encontrado" | "custom">("esperado")
  const [customValue, setCustomValue] = useState<string>("")
  const [justification, setJustification] = useState<string>("")
  const [loading, setLoading] = useState(false)

  // Reset state when modal opens/closes or validation changes
  useEffect(() => {
    if (isOpen) {
      setOption(validation?.valor_esperado !== null ? "esperado" : validation?.valor_encontrado !== null ? "encontrado" : "custom")
      setCustomValue("")
      setJustification("")
    }
  }, [isOpen, validation])

  if (!validation) return null

  const formatCurrency = (val: number | null) => {
    if (val === null) return "-"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
  }

  const hasExpected = validation.valor_esperado !== null
  const hasFound = validation.valor_encontrado !== null
  const hasDifference = typeof validation.diferenca === "number" && validation.diferenca > 0
  // Pendência sem valor a decidir (documento opcional ausente, alerta
  // informativo): não há número a escolher. Forçar um valor manual gravaria um
  // "0" espúrio na auditoria; a ação correta é apenas ignorar com justificativa.
  const isValuelessAlert = !hasExpected && !hasFound

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!justification.trim()) {
      toast.error("Informe a justificativa para registrar a decisão.")
      return
    }

    if (!isValuelessAlert && option === "custom" && (!customValue || isNaN(Number(customValue)))) {
      toast.error("Informe um valor manual válido.")
      return
    }

    setLoading(true)

    let officialValue: number | null = null
    let valueOrigin: "sistema" | "documento" | "manual" | undefined
    let fullJustification: string
    if (isValuelessAlert) {
      fullJustification = `[Ignorado] ${justification.trim()}`
    } else {
      let chosenValText = ""
      if (option === "esperado") {
        officialValue = validation.valor_esperado
        valueOrigin = "sistema"
        chosenValText = `Valor calculado pelo sistema: ${formatCurrency(validation.valor_esperado)}`
      } else if (option === "encontrado") {
        officialValue = validation.valor_encontrado
        valueOrigin = "documento"
        chosenValText = `Valor informado no documento: ${formatCurrency(validation.valor_encontrado)}`
      } else {
        officialValue = Number(customValue)
        valueOrigin = "manual"
        chosenValText = `Valor manual: ${formatCurrency(officialValue)}`
      }
      fullJustification = `[Resolvido - Aceito ${chosenValText}] ${justification.trim()}`
    }

    try {
      const res = await fetch(`/api/validacoes/${validation.id}/resolver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "ignorada_com_justificativa",
          valor_oficial: officialValue,
          origem_valor: valueOrigin,
          justificativa: fullJustification,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Falha ao resolver divergência.")
      }

      toast.success(isValuelessAlert ? "Pendência ignorada com justificativa." : "Pendência marcada como resolvida.")
      onResolveSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro de conexão ao salvar resolução.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border border-[#D5DDD6] bg-white p-0 text-[#1A2B1C] shadow-2xl sm:max-w-[720px]">
        <div className="border-b border-[#EEF1EE] bg-[#F8FAF8] px-6 py-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[20px] font-bold text-[#1A2B1C]">
            <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
            Resolver pendência do fechamento
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] leading-relaxed text-[#6B7F6E]">
            {isValuelessAlert
              ? "Este alerta não tem valor a ajustar. Informe uma justificativa para ignorá-lo; nenhum valor da prestação é alterado. A decisão fica registrada no histórico de auditoria."
              : "Escolha o valor que ficará registrado e informe uma justificativa. A decisão será salva no histórico de auditoria."}
          </DialogDescription>
        </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-[#F5D08A] bg-[#FFF8E8] p-4">
            <h4 className="text-[13px] font-bold text-[#7A4D00]">Pendência encontrada</h4>
            <p className="mt-1 text-[13px] leading-relaxed text-[#5C4A23]">{validation.mensagem}</p>
          </div>

          {!isValuelessAlert && (
          <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#D5DDD6] bg-white p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Sistema calculou</span>
              <span className="mt-1 block text-[22px] font-bold tabular-nums text-[#1A2B1C]">
                {formatCurrency(validation.valor_esperado)}
              </span>
            </div>
            <div className="rounded-lg border border-[#D5DDD6] bg-white p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Extraído pela IA</span>
              <span className="mt-1 block text-[22px] font-bold tabular-nums text-[#1A2B1C]">
                {formatCurrency(validation.valor_encontrado)}
              </span>
            </div>
            <div className={`rounded-lg border p-4 ${hasDifference ? "border-[#FCA5A5] bg-[#FEF2F2]" : "border-[#D1E7D6] bg-[#F4F9F5]"}`}>
              <span className={`block text-[11px] font-semibold uppercase tracking-wide ${hasDifference ? "text-[#991B1B]" : "text-[#1A5C24]"}`}>Diferença</span>
              <span className={`mt-1 block text-[22px] font-bold tabular-nums ${hasDifference ? "text-[#991B1B]" : "text-[#1A5C24]"}`}>
                {formatCurrency(validation.diferenca)}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="block text-[13px] font-bold text-[#1A2B1C]">Valor que será considerado no fechamento</Label>
            <RadioGroup
              value={option}
              onValueChange={(val: "esperado" | "encontrado" | "custom") => setOption(val)}
              className="grid gap-3"
            >
              {hasExpected && (
                <div className="flex items-center gap-3 rounded-lg border border-[#D5DDD6] bg-white p-3 transition hover:bg-[#F8FAF8]">
                  <RadioGroupItem value="esperado" id="r-esperado" className="border-[#6B7F6E] text-[#2D8C3A]" />
                  <Label htmlFor="r-esperado" className="flex-1 cursor-pointer text-[14px] text-[#3D4F3F]">
                    Usar valor calculado pelo sistema <span className="font-semibold tabular-nums text-[#1A2B1C]">{formatCurrency(validation.valor_esperado)}</span>
                  </Label>
                </div>
              )}
              {hasFound && (
                <div className="flex items-center gap-3 rounded-lg border border-[#D5DDD6] bg-white p-3 transition hover:bg-[#F8FAF8]">
                  <RadioGroupItem value="encontrado" id="r-encontrado" className="border-[#6B7F6E] text-[#2D8C3A]" />
                  <Label htmlFor="r-encontrado" className="flex-1 cursor-pointer text-[14px] text-[#3D4F3F]">
                    Manter valor informado no documento <span className="font-semibold tabular-nums text-[#1A2B1C]">{formatCurrency(validation.valor_encontrado)}</span>
                  </Label>
                </div>
              )}
              <div className="flex items-center gap-3 rounded-lg border border-[#D5DDD6] bg-white p-3 transition hover:bg-[#F8FAF8]">
                <RadioGroupItem value="custom" id="r-custom" className="border-[#6B7F6E] text-[#2D8C3A]" />
                <Label htmlFor="r-custom" className="flex-1 cursor-pointer text-[14px] text-[#3D4F3F]">
                  Informar outro valor manualmente
                </Label>
              </div>
            </RadioGroup>
          </div>

          {option === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-value" className="text-[13px] font-medium text-[#3D4F3F]">Valor manual</Label>
              <Input
                id="custom-value"
                type="number"
                step="0.01"
                placeholder="Ex.: 2944.00"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="h-10 border-[#D5DDD6] text-[#1A2B1C] focus-visible:ring-[#2D8C3A]/30"
              />
            </div>
          )}
          </>
          )}

          <div className="space-y-2">
            <Label htmlFor="justification" className="text-[13px] font-bold text-[#1A2B1C]">
              Justificativa para auditoria <span className="text-[#DC2626]">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Ex.: valor conferido no comprovante enviado pela imobiliária; pendência aceita para fechamento desta competência."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="min-h-[96px] border-[#D5DDD6] text-[#1A2B1C] placeholder:text-[#8A9A8C] focus-visible:ring-[#2D8C3A]/30"
              required
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[#D1E7D6] bg-[#F4F9F5] px-3 py-2 text-[12px] text-[#1A5C24]">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            {isValuelessAlert
              ? "Ignorar remove a pendência da lista sem alterar nenhum valor da prestação; a decisão fica rastreável no histórico."
              : "Resolver remove a pendência da lista, mas mantém a decisão rastreável no histórico."}
          </div>

          <DialogFooter className="gap-2 border-t border-[#EEF1EE] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 border-[#D5DDD6] text-[#3D4F3F] hover:bg-[#EEF1EE]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 bg-[#2D8C3A] text-white hover:bg-[#1A5C24]"
            >
              {loading ? "Salvando..." : isValuelessAlert ? "Ignorar pendência" : "Salvar resolução"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
