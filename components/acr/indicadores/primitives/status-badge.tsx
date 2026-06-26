import { cn } from "@/lib/utils"
import type { RealizTone } from "../lib/realiz"

const TONE: Record<RealizTone, string> = {
  ok: "bg-acr-green-tint text-acr-green",
  mid: "bg-acr-amber-soft text-acr-amber",
  bad: "bg-acr-red-soft text-acr-red",
}

/** Etiqueta de status (Integral / Saudável / Parcial / Atenção). */
export function StatusBadge({ tone, children }: { tone: RealizTone; children: React.ReactNode }) {
  return (
    <span className={cn("w-max rounded-full px-2 py-0.5 text-[10.5px] font-semibold", TONE[tone])}>{children}</span>
  )
}
