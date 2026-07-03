/** Card de KPI da faixa principal: rótulo com dot semântico + valor + subtítulo. */
export function KpiCard({
  label,
  dot,
  value,
  sub,
}: {
  label: string
  dot: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="acr-card acr-card-hover flex flex-col p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-acr-muted">
        <span className="size-2 rounded-[3px]" style={{ background: dot }} />
        {label}
      </div>
      <div className="mt-3 text-[26px] font-bold leading-none tracking-tight text-acr-ink tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-acr-muted">{sub}</div>}
    </div>
  )
}
