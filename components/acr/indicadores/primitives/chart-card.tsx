import { cn } from "@/lib/utils"

/** Cartão branco padrão do painel. */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-acr-line bg-white p-5", className)}>{children}</div>
  )
}

/**
 * Cabeçalho padronizado de cartão: título + descrição + chip de fonte,
 * com um slot opcional à direita (toggle, legenda, busca…).
 */
export function ChartCardHeader({
  title,
  desc,
  source,
  right,
}: {
  title: string
  desc?: React.ReactNode
  source?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-acr-ink">{title}</h3>
        {(desc || source) && (
          <p className="mt-0.5 text-xs text-acr-muted">
            {desc}
            {desc && source ? " · " : null}
            {source && <span className="font-medium opacity-85">fonte: {source}</span>}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** Nota de rodapé com ícone (info/alerta). */
export function CardNote({
  children,
  icon,
  className,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mt-3.5 flex items-center gap-2 text-xs text-acr-muted", className)}>
      {icon}
      <span>{children}</span>
    </div>
  )
}
