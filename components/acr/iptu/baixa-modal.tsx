"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { formatBRL } from "@/lib/format"
import { hojeLocalISO } from "@/lib/iptu-logic"
import type { IptuParcelaListItem } from "@/lib/iptu-types"
import type { BaixaResultado } from "@/lib/contexts/iptu-context"
import { Field, Modal, PrimaryButton, SecondaryButton, TextInput, inputClass, labelClass } from "./ui"

export function BaixaModal({
  parcelas,
  onClose,
  onBaixar,
  onDone,
}: {
  parcelas: IptuParcelaListItem[]
  onClose: () => void
  onBaixar: (payload: {
    parcelaIds: string[]
    dataBaixa: string
    valoresPagos?: Record<string, number>
    observacoes?: string
  }) => Promise<BaixaResultado>
  onDone: (mensagem: string) => void
}) {
  const [dataBaixa, setDataBaixa] = useState(hojeLocalISO())
  const [observacoes, setObservacoes] = useState("")
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(parcelas.map((p) => [p.id, String(p.valorPrevisto)])),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const totalPrevisto = useMemo(() => parcelas.reduce((s, p) => s + p.valorPrevisto, 0), [parcelas])
  const totalPago = useMemo(
    () => parcelas.reduce((s, p) => s + (Number(valores[p.id]?.replace(",", ".")) || 0), 0),
    [parcelas, valores],
  )
  const imoveisAfetados = useMemo(() => new Set(parcelas.map((p) => p.imovelId)).size, [parcelas])

  async function confirmar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBaixa)) {
      setErro("Informe a data da baixa.")
      return
    }
    const valoresPagos: Record<string, number> = {}
    for (const p of parcelas) {
      const raw = valores[p.id]?.replace(",", ".")
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setErro(`Valor pago invalido na parcela ${p.numeroParcela} (${p.unidade}).`)
        return
      }
      valoresPagos[p.id] = n
    }
    setSalvando(true)
    setErro(null)
    try {
      const resultado = await onBaixar({
        parcelaIds: parcelas.map((p) => p.id),
        dataBaixa,
        valoresPagos,
        observacoes: observacoes.trim() || undefined,
      })
      onDone(
        `${resultado.parcelasBaixadas} parcela(s) baixadas · ${formatBRL(resultado.totalPago)} em ${resultado.imoveisAfetados} imóvel(is).`,
      )
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao dar baixa.")
      setSalvando(false)
    }
  }

  return (
    <Modal
      title={parcelas.length === 1 ? "Dar baixa na parcela" : `Dar baixa em ${parcelas.length} parcelas`}
      onClose={onClose}
      wide={parcelas.length > 1}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#6B7F6E]">
            Previsto {formatBRL(totalPrevisto)} · Pago {formatBRL(totalPago)} · {imoveisAfetados} imóvel(is)
          </span>
          <div className="flex gap-2">
            <SecondaryButton onClick={onClose} disabled={salvando}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton onClick={confirmar} disabled={salvando}>
              {salvando && <Loader2 size={16} className="animate-spin" />}
              Confirmar baixa
            </PrimaryButton>
          </div>
        </div>
      }
    >
      {erro && (
        <div className="mb-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">
          {erro}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Field label="Data da baixa">
          <input type="date" className={inputClass} value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} />
        </Field>
        <Field label="Observação (opcional)">
          <TextInput value={observacoes} onChange={setObservacoes} placeholder="Observação da baixa" />
        </Field>
      </div>

      <span className={labelClass}>Parcelas</span>
      <div className="max-h-64 overflow-auto rounded-lg border border-[#EEF1EE]">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-[#F8FAF8]">
            <tr className="border-b border-[#EEF1EE]">
              <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Imóvel</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Parcela</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Previsto</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Valor pago</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p) => (
              <tr key={p.id} className="border-b border-[#EEF1EE] last:border-0">
                <td className="px-3 py-2 text-[#3D4F3F]">{p.unidade}</td>
                <td className="px-3 py-2 text-[#6B7F6E]">
                  {p.numeroParcela}/{p.ano}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[#6B7F6E]">{formatBRL(p.valorPrevisto)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    className={`${inputClass} h-8 w-28 text-right`}
                    value={valores[p.id] ?? ""}
                    onChange={(e) => setValores((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
