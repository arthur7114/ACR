"use client"

import { FileText, Building2, Settings } from "lucide-react"
import type { View } from "./types"

interface SidebarProps {
  currentView: View
  onNavigate: (view: View) => void
}

const mainItems: Array<{ view: View; label: string; icon: typeof FileText }> = [
  { view: "fechamentos", label: "Fechamentos", icon: FileText },
  { view: "imoveis", label: "Imóveis", icon: Building2 },
]

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const isActive = (view: View) => {
    if (view === "fechamentos") {
      return ["fechamentos", "novo-fechamento", "upload", "processando", "revisao"].includes(currentView)
    }
    return currentView === view
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-[#1A2B1C] flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-full bg-[#2D8C3A] flex items-center justify-center text-white font-bold text-[13px]">
          AC
        </div>
        <span className="text-white font-bold text-[15px] tracking-tight">ACR</span>
      </div>

      {/* Main menu */}
      <nav className="flex-1 px-3 mt-2 space-y-1">
        {mainItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.view)
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                active
                  ? "bg-[#2D8C3A] text-white"
                  : "text-white/55 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 space-y-3">
        <button
          onClick={() => onNavigate("configuracoes")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
            isActive("configuracoes")
              ? "bg-[#2D8C3A] text-white"
              : "text-white/55 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <Settings size={18} />
          <span>Configurações</span>
        </button>

        <div className="border-t border-white/10 pt-3 px-1 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-white/10" />
          <div className="flex flex-col leading-tight">
            <span className="text-white text-[13px] font-medium">Usuário</span>
            <span className="text-white/50 text-[11px]">Sessão local</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
