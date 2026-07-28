"use client"

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatBRL } from "@/lib/format"
import type { GrupoDespesaFechamento } from "@/lib/fechamento-operacional"

export function ExpenseBreakdownCard({
  groups,
  total,
}: {
  groups: GrupoDespesaFechamento[]
  total: number
}) {
  return (
    <div className="rounded-xl border border-[#EEF1EE] bg-white p-4" style={{ borderTop: "2px solid #D97706" }}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#D97706]">Outras despesas</p>
      <ExpenseBreakdown groups={groups} />
      <div className="mt-3 flex justify-between border-t border-[#EEF1EE] pt-2.5 text-[13px]">
        <span className="font-semibold text-[#D97706]">Abatido do repasse</span>
        <span className="font-bold tabular-nums text-[#D97706]">− {formatBRL(total)}</span>
      </div>
    </div>
  )
}

export function ExpenseBreakdown({ groups }: { groups: GrupoDespesaFechamento[] }) {
  if (groups.length === 0) {
    return <p className="text-[12px] text-[#6B7F6E]">Nenhum item discriminado.</p>
  }

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <div key={group.categoria} className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[#6B7F6E]">{group.label}</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[#6B7F6E] hover:bg-[#EEF1EE] hover:text-[#1A5C24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D8C3A]"
                  aria-label={`Ver discriminação de ${group.label}`}
                >
                  <Info size={13} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(360px,calc(100vw-24px))] border-[#D5DDD6] p-0">
                <div className="border-b border-[#EEF1EE] px-4 py-3">
                  <p className="text-[13px] font-semibold text-[#1A2B1C]">{group.label}</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7F6E]">Descrição completa, referência e valor extraídos.</p>
                </div>
                <div className="max-h-64 divide-y divide-[#EEF1EE] overflow-y-auto">
                  {group.itens.map((item, index) => (
                    <div key={`${item.descricao}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="break-words text-[12px] leading-snug text-[#1A2B1C]">{item.descricao}</p>
                        <p className="mt-1 text-[11px] text-[#6B7F6E]">Referência: {item.referencia ?? "Não informada"}</p>
                      </div>
                      <p className="text-[12px] font-semibold tabular-nums text-[#1A2B1C]">{formatBRL(item.valor)}</p>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <span className="shrink-0 font-medium tabular-nums text-[#1A2B1C]">{formatBRL(group.total)}</span>
        </div>
      ))}
    </div>
  )
}
