import { formatPercent } from "@/lib/format"

/** Barra de progresso rotulada (percentuais aplicados). */
export function ProgressBar({
  label,
  value,
  width,
  amber,
}: {
  label: string
  value: number | null
  width: number
  amber?: boolean
}) {
  const w = Math.min(Math.max(width, 0), 100)
  return (
    <div className="mt-4 first:mt-1">
      <div className="flex items-center justify-between text-[13px] font-medium text-acr-ink">
        <span>{label}</span>
        <b className="font-bold tabular-nums">{value !== null ? formatPercent(value) : "—"}</b>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-acr-green-soft">
        <div
          className="h-full rounded-full"
          style={{ width: `${w}%`, background: amber ? "var(--acr-amber)" : "var(--acr-green)" }}
        />
      </div>
    </div>
  )
}
