"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Lightbulb, Loader2 } from "lucide-react"
import type { Empreendimento, Imobiliaria } from "@/lib/cadastros-types"
import type { View } from "../types"
import { StepsIndicator } from "../steps-indicator"

interface NovoFechamentoViewProps {
  onNavigate: (view: View) => void
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  loading: boolean
  error: string | null
  onCreateFechamento: (input: Record<string, unknown>) => Promise<void>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium mb-1.5">
      {children}
    </label>
  )
}

const selectClass =
  "w-full h-10 px-3 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#3D4F3F] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"

export function NovoFechamentoView({
  onNavigate,
  imobiliarias,
  empreendimentos,
  loading,
  error,
  onCreateFechamento,
}: NovoFechamentoViewProps) {
  const activeImobiliarias = useMemo(() => imobiliarias.filter((item) => item.ativo), [imobiliarias])
  const activeEmpreendimentos = useMemo(() => empreendimentos.filter((item) => item.ativo), [empreendimentos])
  const [imobiliariaId, setImobiliariaId] = useState("")
  const [empreendimentoId, setEmpreendimentoId] = useState("")
  const [month, setMonth] = useState("3")
  const [year, setYear] = useState("2026")
  const [observacoes, setObservacoes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit() {
    if (!imobiliariaId || !empreendimentoId) {
      setFormError("Selecione imobiliaria e empreendimento.")
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      await onCreateFechamento({
        imobiliaria_id: imobiliariaId,
        empreendimento_id: empreendimentoId,
        competencia: `${year}-${month.padStart(2, "0")}-01`,
        observacoes,
      })
      onNavigate("upload")
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar o fechamento.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <StepsIndicator activeStep={1} />

      <div className="max-w-xl mx-auto bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#EEF1EE]">
        <h2 className="text-[18px] font-bold text-[#1A2B1C]">Novo Fechamento</h2>
        <p className="text-[14px] text-[#6B7F6E] mt-1 mb-6">
          Preencha as informações básicas do fechamento mensal
        </p>

        <div className="space-y-4">
          <div>
            <FieldLabel>Imobiliária</FieldLabel>
            <select className={selectClass} value={imobiliariaId} onChange={(event) => setImobiliariaId(event.target.value)} disabled={loading}>
              <option value="" disabled>
                {loading ? "Carregando imobiliárias" : "Selecione a imobiliária"}
              </option>
              {activeImobiliarias.map((imobiliaria) => (
                <option key={imobiliaria.id} value={imobiliaria.id}>
                  {imobiliaria.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Empreendimento</FieldLabel>
            <select className={selectClass} value={empreendimentoId} onChange={(event) => setEmpreendimentoId(event.target.value)} disabled={loading}>
              <option value="" disabled>
                {loading ? "Carregando empreendimentos" : "Selecione o empreendimento"}
              </option>
              {activeEmpreendimentos.map((empreendimento) => (
                <option key={empreendimento.id} value={empreendimento.id}>
                  {empreendimento.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Competência</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select className={selectClass} value={month} onChange={(event) => setMonth(event.target.value)}>
                {[
                  "Janeiro",
                  "Fevereiro",
                  "Março",
                  "Abril",
                  "Maio",
                  "Junho",
                  "Julho",
                  "Agosto",
                  "Setembro",
                  "Outubro",
                  "Novembro",
                  "Dezembro",
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select className={selectClass} value={year} onChange={(event) => setYear(event.target.value)}>
                <option>2024</option>
                <option>2025</option>
                <option>2026</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Observações</FieldLabel>
            <textarea
              rows={3}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder="Alguma observação sobre este fechamento? (opcional)"
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#3D4F3F] placeholder:text-[#9CA89E] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15 resize-none"
            />
          </div>
        </div>

        {(error || formError) && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#DC2626]">
            <AlertTriangle size={16} />
            {formError ?? error}
          </div>
        )}

        <div className="bg-[#EFF7F1] border-l-4 border-[#2D8C3A] rounded-lg p-3 flex gap-2 items-start mt-4">
          <Lightbulb size={16} className="text-[#2D8C3A] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#3D4F3F]">
            Você poderá adicionar documentos na próxima etapa.
          </p>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => onNavigate("fechamentos")}
            className="text-[14px] text-[#6B7F6E] hover:text-[#3D4F3F] font-medium"
          >
            ← Voltar
          </button>
          <button
            onClick={() => void submit()}
            disabled={submitting || loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1A5C24] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Avançar para Documentos →
          </button>
        </div>
      </div>
    </div>
  )
}
