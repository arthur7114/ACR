"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, Building2, BarChart3, Settings, Receipt } from "lucide-react"

type NavItem = {
  href: string
  label: string
  icon: typeof FileText
  matches: (pathname: string) => boolean
}

const mainItems: NavItem[] = [
  {
    href: "/fechamentos",
    label: "Fechamentos",
    icon: FileText,
    matches: (pathname) => pathname === "/" || pathname.startsWith("/fechamentos"),
  },
  {
    href: "/imoveis",
    label: "Imóveis",
    icon: Building2,
    matches: (pathname) => pathname.startsWith("/imoveis"),
  },
  {
    href: "/iptu",
    label: "IPTU",
    icon: Receipt,
    matches: (pathname) => pathname.startsWith("/iptu"),
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    icon: BarChart3,
    matches: (pathname) => pathname.startsWith("/indicadores"),
  },
]

const configItem: NavItem = {
  href: "/configuracoes",
  label: "Configurações",
  icon: Settings,
  matches: (pathname) => pathname.startsWith("/configuracoes"),
}

export function Sidebar() {
  const pathname = usePathname() ?? "/"

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-[#1A2B1C] flex flex-col z-40">
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-full bg-[#2D8C3A] flex items-center justify-center text-white font-bold text-[13px]">
          AC
        </div>
        <span className="text-white font-bold text-[15px] tracking-tight">ACR</span>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-1">
        {mainItems.map((item) => {
          const Icon = item.icon
          const active = item.matches(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                active
                  ? "bg-[#2D8C3A] text-white"
                  : "text-white/55 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-3 space-y-3">
        <Link
          href={configItem.href}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
            configItem.matches(pathname)
              ? "bg-[#2D8C3A] text-white"
              : "text-white/55 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <Settings size={18} />
          <span>Configurações</span>
        </Link>

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
