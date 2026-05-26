"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { Sparkles, Check, AlertTriangle } from "lucide-react"

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
      setOption("esperado")
      setCustomValue("")
      setJustification("")
    }
  }, [isOpen, validation])

  if (!validation) return null

  const formatCurrency = (val: number | null) => {
    if (val === null) return "N/A"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!justification.trim()) {
      toast.error("Por favor, preencha a justificativa.")
      return
    }

    if (option === "custom" && (!customValue || isNaN(Number(customValue)))) {
      toast.error("Por favor, preencha um valor customizado válido.")
      return
    }

    setLoading(true)

    // Build standard audit-compliant justification
    let chosenValText = ""
    if (option === "esperado") {
      chosenValText = `Valor Calculado: ${formatCurrency(validation.valor_esperado)}`
    } else if (option === "encontrado") {
      chosenValText = `Valor Extraído pela IA: ${formatCurrency(validation.valor_encontrado)}`
    } else {
      chosenValText = `Valor Customizado: ${formatCurrency(Number(customValue))}`
    }

    const fullJustification = `[Resolvido - Aceito ${chosenValText}] ${justification.trim()}`

    try {
      const res = await fetch(`/api/validacoes/${validation.id}/resolver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "ignorada_com_justificativa", // OR "resolvida" as per PRD
          justificativa: fullJustification,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Falha ao resolver divergência.")
      }

      toast.success("Divergência resolvida com sucesso!")
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
      <DialogContent className="sm:max-w-[500px] border border-emerald-500/20 bg-zinc-950/95 text-zinc-50 shadow-2xl backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-emerald-400">
            <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
            Reconciliar Divergência
          </DialogTitle>
          <DialogDescription className="text-zinc-400 mt-2">
            Esta ação resolverá o conflito financeiro no fechamento ativo e registrará o log de auditoria obrigatório.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Validation Details */}
          <div className="rounded-lg bg-zinc-900/60 p-4 border border-zinc-800">
            <h4 className="text-sm font-semibold text-zinc-300">Mensagem da Divergência:</h4>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{validation.mensagem}</p>
          </div>

          {/* Comparison Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-900/40 p-3 border border-zinc-800/80 text-center">
              <span className="text-xs text-zinc-500 block uppercase tracking-wider font-semibold">Cálculo Determinado</span>
              <span className="text-lg font-bold text-zinc-100 mt-1 block">
                {formatCurrency(validation.valor_esperado)}
              </span>
            </div>
            <div className="rounded-lg bg-zinc-900/40 p-3 border border-zinc-800/80 text-center">
              <span className="text-xs text-zinc-500 block uppercase tracking-wider font-semibold">Extraído pela IA</span>
              <span className="text-lg font-bold text-zinc-100 mt-1 block">
                {formatCurrency(validation.valor_encontrado)}
              </span>
            </div>
          </div>

          {/* Choice Section */}
          <div className="space-y-3">
            <Label className="text-zinc-300 font-semibold block text-sm">Qual valor deve ser considerado oficial?</Label>
            <RadioGroup
              value={option}
              onValueChange={(val: "esperado" | "encontrado" | "custom") => setOption(val)}
              className="grid gap-3"
            >
              {validation.valor_esperado !== null && (
                <div className="flex items-center space-x-3 rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 hover:bg-zinc-900/40 transition">
                  <RadioGroupItem value="esperado" id="r-esperado" className="border-zinc-700 text-emerald-500" />
                  <Label htmlFor="r-esperado" className="cursor-pointer text-sm text-zinc-300 flex-1">
                    Aceitar Cálculo Determinístico ({formatCurrency(validation.valor_esperado)})
                  </Label>
                </div>
              )}
              {validation.valor_encontrado !== null && (
                <div className="flex items-center space-x-3 rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 hover:bg-zinc-900/40 transition">
                  <RadioGroupItem value="encontrado" id="r-encontrado" className="border-zinc-700 text-emerald-500" />
                  <Label htmlFor="r-encontrado" className="cursor-pointer text-sm text-zinc-300 flex-1">
                    Aceitar Extração da IA ({formatCurrency(validation.valor_encontrado)})
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-3 rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 hover:bg-zinc-900/40 transition">
                <RadioGroupItem value="custom" id="r-custom" className="border-zinc-700 text-emerald-500" />
                <Label htmlFor="r-custom" className="cursor-pointer text-sm text-zinc-300 flex-1">
                  Digitar outro valor
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Custom value input */}
          {option === "custom" && (
            <div className="space-y-2 animate-fadeIn">
              <Label htmlFor="custom-value" className="text-zinc-400 text-sm">Valor Customizado (R$)</Label>
              <Input
                id="custom-value"
                type="number"
                step="0.01"
                placeholder="Ex: 1250.00"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-zinc-100 focus-visible:ring-emerald-500/50"
              />
            </div>
          )}

          {/* Justification Textarea */}
          <div className="space-y-2">
            <Label htmlFor="justification" className="text-zinc-300 font-semibold text-sm">
              Justificativa Técnica <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Digite o motivo operacional pelo qual esta divergência foi aceita/resolvida..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="min-h-[90px] bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-600 focus-visible:ring-emerald-500/50"
              required
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg hover:shadow-emerald-500/20 transition-all"
            >
              {loading ? "Resolvendo..." : "Confirmar Resolução"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
