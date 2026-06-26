import { cn } from "@/lib/utils"

/** Tile de movimentação (título + número grande + descrição), com estado "pending". */
export function MetricTile({
  label,
  value,
  sub,
  amber,
  pending,
}: {
  label: string
  value: string
  sub?: string
  amber?: boolean
  pending?: boolean
}) {
  return (
    <div
      className={cn(
        "bg-white p-4",
        pending && "bg-[repeating-linear-gradient(45deg,#fff,#fff_8px,#fcfdfc_8px,#fcfdfc_16px)]",
      )}
    >
      <div className="text-[11px] font-medium text-acr-muted">{label}</div>
      <div
        className={cn("mt-1.5 text-xl font-bold tracking-tight tabular-nums", amber ? "text-acr-amber" : "text-acr-ink")}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-acr-muted">{sub}</div>}
    </div>
  )
}
