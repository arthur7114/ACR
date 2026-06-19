"use client"

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

  const abrir = (fechamentoId: string | null, id: string) => {
    void marcarLidas([id])
    onClose()
    if (fechamentoId) router.push(`/fechamentos/${fechamentoId}/revisao`)
  }

  return (
    <div className="absolute top-12 right-0 w-96 bg-white rounded-xl shadow-xl border border-[#D5DDD6] z-50 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-[#EEF1EE]">
        <h3 className="text-[16px] font-bold text-[#1A2B1C]">Notificações</h3>
        <button onClick={onClose} className="text-sm text-[#2D8C3A] hover:underline">
          Fechar
        </button>
      </div>

      {notificacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF7F1]">
            <Bell size={18} className="text-[#2D8C3A]" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#1A2B1C]">Tudo em dia</p>
            <p className="mt-1 text-[13px] text-[#6B7F6E]">Avisamos aqui quando uma análise terminar.</p>
          </div>
        </div>
      ) : (
        <ul className="max-h-96 overflow-y-auto divide-y divide-[#EEF1EE]">
          {notificacoes.map((n) => {
            const ok = n.tipo === "analise_concluida"
            return (
              <li key={n.id}>
                <button
                  onClick={() => abrir(n.fechamento_id, n.id)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-[#F4F9F5] transition-colors ${
                    n.lida ? "" : "bg-[#F4F9F5]"
                  }`}
                >
                  {ok ? (
                    <CheckCircle2 size={18} className="text-[#22C55E] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={18} className="text-[#DC2626] shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-[#1A2B1C]">{n.titulo}</span>
                      <span className="text-[11px] text-[#9CA89E] shrink-0">{tempoRelativo(n.criado_em)}</span>
                    </span>
                    {n.corpo && <span className="mt-0.5 block text-[12px] text-[#6B7F6E]">{n.corpo}</span>}
                  </span>
                  {!n.lida && <span className="mt-1 h-2 w-2 rounded-full bg-[#2D8C3A] shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
