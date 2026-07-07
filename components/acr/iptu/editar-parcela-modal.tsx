"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import type { IptuParcelaListItem, IptuParcelaPatch } from "@/lib/iptu-types"
import { Field, Modal, PrimaryButton, SecondaryButton, SelectInput, TextInput, inputClass, labelClass } from "./ui"

export function EditarParcelaModal({
  parcela,
  onClose,
  onEditar,
  onAjustarParcelas,
  onDone,
}: {
  parcela: IptuParcelaListItem
  onClose: () => void
  onEditar: (id: string, patch: IptuParcelaPatch) => Promise<void>
  onAjustarParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
  onDone: (mensagem: string) => void
}) {
  const paga = parcela.status === "pago"
  const [dataVencimento, setDataVencimento] = useState(parcela.dataVencimento ?? "")
  const [valorPrevisto, setValorPrevisto] = useState(String(parcela.valorPrevisto))
  const [observacoes, setObservacoes] = useState(parcela.observacoes ?? "")
  const [responsavel, setResponsavel] = useState(parcela.responsavel ?? "")
  const [novoNumero, setNovoNumero] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ajustando, setAjustando] = useState(false)

  async function salvar() {
    const patch: IptuParcelaPatch = {
      observacoes: observacoes.trim() || null,
      responsavel: responsavel === "inquilino" || responsavel === "proprietario" ? responsavel : null,
    }
    if (!paga) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
        setErro("Informe uma data de vencimento válida.")
        return
      }
      const valor = Number(valorPrevisto.replace(",", "."))
      if (!Number.isFinite(valor) || valor < 0) {
        setErro("Valor previsto deve ser maior ou igual a zero.")
        return
      }
      patch.dataVencimento = dataVencimento
      patch.valorPrevisto = valor
    }
    setSalvando(true)
    setErro(null)
    try {
      await onEditar(parcela.id, patch)
      onDone("Parcela atualizada.")
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao atualizar parcela.")
      setSalvando(false)
    }
  }

  async function aplicarAjuste() {
    const n = Number(novoNumero)
    if (!Number.isInteger(n) || n < 1) {
      setErro("Informe um número de parcelas válido.")
      return
    }
    setAjustando(true)
    setErro(null)
    try {
      await onAjustarParcelas(parcela.carneId, n)
      onDone(`Carnê ${parcela.ano} ajustado para ${n} parcelas.`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao ajustar carnê.")
      setAjustando(false)
    }
  }

  return (
    <Modal
      title={`Editar parcela ${parcela.numeroParcela}/${parcela.ano} · ${parcela.unidade}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={salvando}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 size={16} className="animate-spin" />}
            Salvar
          </PrimaryButton>
        </div>
      }
    >
      {erro && (
        <div className="mb-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">
          {erro}
        </div>
      )}

      {paga && (
        <div className="mb-4 rounded-lg border border-[#FDE68A] bg-[#FEF3C7] px-3 py-2 text-[13px] text-[#92400E]">
          Parcela paga: vencimento e valor previsto ficam bloqueados. Ajuste a baixa se necessário.
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vencimento">
            <input
              type="date"
              className={inputClass}
              value={dataVencimento}
              disabled={paga}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </Field>
          <Field label="Valor previsto">
            <TextInput value={valorPrevisto} onChange={setValorPrevisto} type="text" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsável">
            <SelectInput value={responsavel} onChange={setResponsavel}>
              <option value="">Não definido</option>
              <option value="inquilino">Inquilino</option>
              <option value="proprietario">Proprietário</option>
            </SelectInput>
          </Field>
          <Field label="Observações">
            <TextInput value={observacoes} onChange={setObservacoes} />
          </Field>
        </div>
      </div>

      <div className="mt-5 border-t border-[#EEF1EE] pt-4">
        <span className={labelClass}>Ajustar nº de parcelas do carnê {parcela.ano}</span>
        <p className="mb-2 text-[12px] text-[#6B7F6E]">
          Aumentar cria parcelas adicionais (sem vencimento). Reduzir remove apenas parcelas futuras não pagas.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            placeholder="Novo total"
            className={`${inputClass} w-40`}
            value={novoNumero}
            onChange={(e) => setNovoNumero(e.target.value)}
          />
          <SecondaryButton onClick={aplicarAjuste} disabled={ajustando || !novoNumero}>
            {ajustando && <Loader2 size={16} className="animate-spin" />}
            Aplicar ajuste
          </SecondaryButton>
        </div>
      </div>
    </Modal>
  )
}
