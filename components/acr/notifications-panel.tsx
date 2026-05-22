"use client"

import { Bell } from "lucide-react"

interface NotificationsPanelProps {
  onClose: () => void
}

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  return (
    <div className="absolute top-12 right-0 w-96 bg-white rounded-xl shadow-xl border border-[#D5DDD6] z-50 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-[#EEF1EE]">
        <h3 className="text-[16px] font-bold text-[#1A2B1C]">Notificações</h3>
        <button onClick={onClose} className="text-sm text-[#2D8C3A] hover:underline">Fechar</button>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF7F1]">
          <Bell size={18} className="text-[#2D8C3A]" />
        </div>
        <div>
          <p className="text-[14px] font-bold text-[#1A2B1C]">Nenhuma notificação real</p>
          <p className="mt-1 text-[13px] text-[#6B7F6E]">
            As notificações serão exibidas quando o backend de eventos estiver conectado.
          </p>
        </div>
      </div>
    </div>
  )
}
