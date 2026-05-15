"use client"

import { CheckCircle, AlertTriangle } from "lucide-react"
import type { View } from "./types"

interface NotificationsPanelProps {
  onClose: () => void
  onNavigate: (view: View) => void
}

export function NotificationsPanel({ onNavigate }: NotificationsPanelProps) {
  return (
    <div className="absolute top-12 right-0 w-96 bg-white rounded-xl shadow-xl border border-[#D5DDD6] z-50 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-[#EEF1EE]">
        <h3 className="text-[16px] font-bold text-[#1A2B1C]">Notificações</h3>
        <button className="text-sm text-[#2D8C3A] hover:underline">Marcar todas como lidas</button>
      </div>

      <ul className="divide-y divide-[#EEF1EE]">
        {/* Item 1 */}
        <li className="bg-[#EFF7F1] border-l-4 border-[#2D8C3A] p-4">
          <div className="flex gap-3">
            <CheckCircle size={20} className="text-[#2D8C3A] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] font-bold text-[#1A2B1C]">Processamento concluído</p>
              <p className="text-[13px] text-[#3D4F3F] mt-0.5">
                Grand Messejana II · Mar/2026 — 1 divergência bloqueante para revisar.
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-[#6B7F6E]">há 2 minutos</span>
                <button
                  onClick={() => onNavigate("revisao")}
                  className="text-sm text-[#2D8C3A] font-medium hover:underline"
                >
                  Revisar agora →
                </button>
              </div>
            </div>
          </div>
        </li>

        {/* Item 2 */}
        <li className="bg-[#FEF9F0] border-l-4 border-[#F59E0B] p-4">
          <div className="flex gap-3">
            <AlertTriangle size={20} className="text-[#F59E0B] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] font-bold text-[#1A2B1C]">Divergência bloqueante</p>
              <p className="text-[13px] text-[#3D4F3F] mt-0.5">
                Apto 03 — Inadimplência sem resolução no fechamento de Mar/2026.
              </p>
              <span className="text-[11px] text-[#6B7F6E] mt-2 block">há 2 minutos</span>
            </div>
          </div>
        </li>

        {/* Item 3 */}
        <li className="bg-white p-4">
          <div className="flex gap-3">
            <CheckCircle size={20} className="text-[#D5DDD6] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] font-bold text-[#3D4F3F]">Fechamento aprovado</p>
              <p className="text-[13px] text-[#3D4F3F] mt-0.5">
                Cesar Rego · Apt. José de Alencar · Mar/2026 aprovado por Arthur Brito.
              </p>
              <span className="text-[11px] text-[#6B7F6E] mt-2 block">há 3 horas</span>
            </div>
          </div>
        </li>
      </ul>

      <div className="p-3 text-center border-t border-[#EEF1EE]">
        <button className="text-sm text-[#2D8C3A] font-medium hover:underline">
          Ver todas as notificações
        </button>
      </div>
    </div>
  )
}
