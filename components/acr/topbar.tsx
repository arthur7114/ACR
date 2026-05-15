"use client"

import { Bell } from "lucide-react"
import type { View } from "./types"
import { NotificationsPanel } from "./notifications-panel"

interface TopbarProps {
  currentView: View
  showNotifications: boolean
  onToggleNotifications: () => void
  onNavigate: (view: View) => void
}

function getBreadcrumb(view: View): string[] {
  switch (view) {
    case "fechamentos":
      return ["Fechamentos"]
    case "novo-fechamento":
      return ["Fechamentos", "Novo fechamento"]
    case "upload":
      return ["Fechamentos", "Novo fechamento", "Documentos"]
    case "processando":
      return ["Fechamentos", "Processando"]
    case "revisao":
      return ["Fechamentos", "Grand Messejana II — Março/2026"]
    case "imoveis":
      return ["Imóveis"]
    case "configuracoes":
      return ["Configurações"]
    default:
      return ["Fechamentos"]
  }
}

export function Topbar({ currentView, showNotifications, onToggleNotifications, onNavigate }: TopbarProps) {
  const crumbs = getBreadcrumb(currentView)

  return (
    <header className="fixed top-0 left-[220px] right-0 h-14 bg-white border-b border-[#EEF1EE] pl-6 pr-6 flex items-center justify-between z-30">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[13px]">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-[#D5DDD6]">/</span>}
            <span
              className={
                i === crumbs.length - 1
                  ? "text-[#1A2B1C] font-medium"
                  : "text-[#6B7F6E]"
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={onToggleNotifications}
            className="relative p-2 rounded-lg hover:bg-[#EEF1EE] transition-colors"
            aria-label="Notificações"
          >
            <Bell size={18} className="text-[#3D4F3F]" />
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
              2
            </span>
          </button>

          {showNotifications && (
            <NotificationsPanel
              onClose={onToggleNotifications}
              onNavigate={(v) => {
                onToggleNotifications()
                onNavigate(v)
              }}
            />
          )}
        </div>

        <div className="h-8 w-8 rounded-full bg-[#2D8C3A] flex items-center justify-center text-white font-bold text-[12px]">
          AB
        </div>
      </div>
    </header>
  )
}
