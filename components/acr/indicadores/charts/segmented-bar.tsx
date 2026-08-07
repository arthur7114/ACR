import { cn } from "@/lib/utils"

export interface BarSegment {
  key: string
  label: string
  /** null = dado ausente (nunca é tratado como zero). */
  value: number | null
  /** Classe de preenchimento do segmento (bg-*). */
  fill: string
  /** Texto já formatado para a legenda. */
  display: string
}

// Uma barra só, proporcional, no lugar de uma lista de valores soltos: a
// relação entre as partes é a informação, e ela desaparece quando os números
// ficam lado a lado sem escala. Ausência (null) nunca vira fatia — a barra
// encurta e a legenda mostra "—", preservando a diferença entre zero
// confirmado e dado que não existe.
export function SegmentedBar({
  segments,
  caption,
  className,
}: {
  segments: BarSegment[]
  caption: string
  className?: string
}) {
  const known = segments.filter(
    (segment): segment is BarSegment & { value: number } =>
      typeof segment.value === "number" && segment.value > 0,
  )
  const total = known.reduce((sum, segment) => sum + segment.value, 0)

  return (
    <div className={className}>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-[#edf0ed]"
        role="img"
        aria-label={`${caption}: ${segments.map((segment) => `${segment.label} ${segment.display}`).join(", ")}`}
      >
        {total > 0
          && known.map((segment) => (
            <span
              key={segment.key}
              className={cn("h-full first:rounded-l-full last:rounded-r-full", segment.fill)}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ))}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", segment.fill, segment.value === null && "opacity-30")} />
            <dt className="text-xs text-acr-muted-2">{segment.label}</dt>
            <dd className="text-xs font-semibold text-acr-ink tabular-nums">{segment.display}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
