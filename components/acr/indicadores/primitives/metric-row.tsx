import { cn } from "@/lib/utils"

/** Linha rótulo↔valor (com subvalor opcional), usada nas listas financeiras. */
export function MetricRow({
  label,
  value,
  sub,
  danger,
  pending,
}: {
  label: string
  value: string
  sub?: string
  danger?: boolean
  pending?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-b border-acr-line py-3 text-sm first:pt-0 last:border-0 last:pb-0">
      <div className="font-medium text-acr-ink">{label}</div>
      <div
        className={cn(
          "text-right text-[15px] font-bold tabular-nums",
          danger ? "text-acr-red" : pending ? "text-acr-muted" : "text-acr-ink",
        )}
      >
        {value}
        {sub && <small className="block text-[11px] font-medium text-acr-muted">{sub}</small>}
      </div>
    </div>
  )
}
