"use client"

import { useEffect, useRef } from "react"
import { Bell, CheckCircle2, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useNotifications } from "@/lib/contexts/notifications-context"

function tempoRelativo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!then) return ""
  const min = Math.floor((Date.now() - then) / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

interface NotificationsPanelProps {
  onClose: () => void
}

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const router = useRouter()
  const { notificacoes, marcarLidas } = useNotifications()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }

    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  const abrir = (fechamentoId: string | null, id: string, tipo: string) => {
    void marcarLidas([id])
    onClose()
    if (!fechamentoId) return
    const step = tipo === "analise_concluida" ? "revisao" : "upload"
    router.push(`/fechamentos/${fechamentoId}/${step}`)
  }

  return (
    <div
      id="notifications-panel"
      role="dialog"
      aria-labelledby="notifications-title"
      className="fixed inset-x-4 top-16 z-50 flex max-h-[calc(100dvh-5rem)] w-auto flex-col overflow-hidden rounded-xl border border-[#D5DDD6] bg-white shadow-md md:absolute md:inset-x-auto md:right-0 md:top-12 md:w-96 md:max-w-[calc(100vw-7rem)]"
    >
      <div className="flex min-h-14 items-center justify-between border-b border-acr-line py-1 pl-4 pr-2">
        <h3 id="notifications-title" className="text-[16px] font-bold text-acr-ink">
          Notificações
        </h3>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-acr-green-strong transition-colors hover:bg-acr-green-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acr-green focus-visible:ring-offset-2"
        >
          Fechar
        </button>
      </div>

      {notificacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-acr-green-tint">
            <Bell size={18} aria-hidden="true" className="text-acr-green" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-acr-ink">Tudo em dia</p>
            <p className="mt-1 text-[13px] text-acr-muted-2">Avisamos aqui quando uma análise terminar.</p>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-acr-line overflow-y-auto">
          {notificacoes.map((n) => {
            const ok = n.tipo === "analise_concluida"
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => abrir(n.fechamento_id, n.id, n.tipo)}
                  className={`flex min-h-11 w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-acr-green-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acr-green ${
                    n.lida ? "" : "bg-acr-green-tint"
                  }`}
                >
                  {ok ? (
                    <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[#16803A]" />
                  ) : (
                    <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[#DC2626]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="break-words text-[13px] font-bold text-acr-ink">{n.titulo}</span>
                      <span className="shrink-0 text-[11px] text-acr-muted-2">{tempoRelativo(n.criado_em)}</span>
                    </span>
                    {n.corpo && <span className="mt-0.5 block break-words text-[12px] text-acr-muted-2">{n.corpo}</span>}
                  </span>
                  {!n.lida && (
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-acr-green" aria-label="Não lida" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
