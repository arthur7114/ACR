import { AlertTriangle } from "lucide-react"

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-6 py-10 text-center">
      <AlertTriangle size={20} className="text-[#991B1B]" />
      <p className="text-[13.5px] font-medium text-[#991B1B]">{title}</p>
      {description && <p className="max-w-sm text-[12.5px] text-[#B45858]">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
