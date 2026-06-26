/** Título de seção (eyebrow em maiúsculas) com filete que preenche a linha. */
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center gap-2.5 px-0.5 text-xs font-semibold uppercase tracking-wider text-acr-muted">
      {children}
      <span className="h-px flex-1 bg-acr-line" />
    </div>
  )
}
