"use client"

import { cn } from "@/lib/utils"

export type Metric = "valor" | "pct"

/** Chave segmentada para alternar entre valor (R$) e percentual. */
export function MetricToggle({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-acr-line bg-white p-0.5">
      <SegButton on={metric === "valor"} onClick={() => setMetric("valor")}>
        Valor (R$)
      </SegButton>
      <SegButton on={metric === "pct"} onClick={() => setMetric("pct")}>
        Percentual
      </SegButton>
    </div>
  )
}

function SegButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
        on ? "bg-acr-green text-white" : "text-acr-muted hover:text-acr-ink",
      )}
    >
      <span className={cn("size-2 rounded-[3px]", on ? "bg-white" : "bg-acr-line-2")} />
      {children}
    </button>
  )
}
