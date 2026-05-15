"use client"

import { Lightbulb } from "lucide-react"
import type { View } from "../types"
import { StepsIndicator } from "../steps-indicator"

interface NovoFechamentoViewProps {
  onNavigate: (view: View) => void
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

export function NovoFechamentoView({ onNavigate }: NovoFechamentoViewProps) {
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
            <select className={selectClass} defaultValue="">
              <option value="" disabled>
                Selecione a imobiliária
              </option>
              <option>Alive Imóveis</option>
              <option>Cesar Rego</option>
              <option>Plural Imobiliária</option>
            </select>
          </div>

          <div>
            <FieldLabel>Empreendimento</FieldLabel>
            <select className={selectClass} defaultValue="">
              <option value="" disabled>
                Selecione o empreendimento
              </option>
              <option>Grand Messejana II</option>
              <option>Apt. José de Alencar</option>
              <option>Galpão José Walter</option>
            </select>
          </div>

          <div>
            <FieldLabel>Competência</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select className={selectClass} defaultValue="3">
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
              <select className={selectClass} defaultValue="2026">
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
              placeholder="Alguma observação sobre este fechamento? (opcional)"
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#D5DDD6] rounded-lg text-[#3D4F3F] placeholder:text-[#9CA89E] focus:outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15 resize-none"
            />
          </div>
        </div>

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
            onClick={() => onNavigate("upload")}
            className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
          >
            Avançar para Documentos →
          </button>
        </div>
      </div>
    </div>
  )
}
