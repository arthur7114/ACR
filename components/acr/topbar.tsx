"use client"

import { Bell } from "lucide-react"
import type { FechamentoContext } from "@/lib/fechamento-context"
import { getFechamentoLabel } from "@/lib/fechamento-context"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import type { View } from "./types"
import { NotificationsPanel } from "./notifications-panel"

interface TopbarProps {
  currentView: View
  activeFechamento: FechamentoContext | null
  analysisResult: PackageAnalysis | null
  showNotifications: boolean
  onToggleNotifications: () => void
  onNavigate: (view: View) => void
}

function getBreadcrumb(view: View, activeFechamento: FechamentoContext | null, analysisResult: PackageAnalysis | null): string[] {
  const fechamentoLabel = getFechamentoLabel(activeFechamento, analysisResult)

  switch (view) {
    case "fechamentos":
      return ["Fechamentos"]
    case "novo-fechamento":
      return ["Fechamentos", "Novo fechamento"]
    case "upload":
      return ["Fechamentos", fechamentoLabel, "Documentos"]
    case "processando":
      return ["Fechamentos", fechamentoLabel, "Processando"]
    case "revisao":
      return ["Fechamentos", fechamentoLabel]
    case "imoveis":
      return ["Imóveis"]
    case "configuracoes":
      return ["Configurações"]
    default:
      return ["Fechamentos"]
  }
}

export function Topbar({
  currentView,
  activeFechamento,
  analysisResult,
  showNotifications,
  onToggleNotifications,
  onNavigate,
}: TopbarProps) {
  const crumbs = getBreadcrumb(currentView, activeFechamento, analysisResult)

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
          </button>

          {showNotifications && (
            <NotificationsPanel
              onClose={onToggleNotifications}
            />
          )}
        </div>

        <div className="h-8 w-8 rounded-full bg-[#DDEEE1]" aria-label="Usuário não carregado" />
      </div>
    </header>
  )
}
