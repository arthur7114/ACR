import type { ReactNode } from "react"

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#E2E8E3] bg-[#FAFBFA] px-6 py-10 text-center">
      {icon && <div className="text-[#9AA79B]">{icon}</div>}
      <p className="text-[13.5px] font-medium text-[#3D4F3F]">{title}</p>
      {description && <p className="max-w-sm text-[12.5px] text-[#6B7F6E]">{description}</p>}
    </div>
  )
}
