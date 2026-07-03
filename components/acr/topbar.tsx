"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import { NotificationsPanel } from "./notifications-panel"
import { useNotifications } from "@/lib/contexts/notifications-context"

type Crumb = {
  label: string
  href?: string
}

function useFechamentoSummary(fechamentoId: string | null) {
  const [summary, setSummary] = useState<{
    imobiliaria: string
    empreendimento: string
    competencia: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!fechamentoId) {
      setSummary(null)
      return
    }
    fetch(`/api/fechamentos/${fechamentoId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || payload.error) return
        const fechamento = payload.fechamento
        if (!fechamento) return
        setSummary({
          imobiliaria: fechamento.imobiliarias?.nome ?? "Imobiliaria nao identificada",
          empreendimento: fechamento.empreendimentos?.nome ?? "Empreendimento nao identificado",
          competencia: formatCompetenciaLong(fechamento.competencia),
        })
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [fechamentoId])

  return summary
}

function buildCrumbs(pathname: string, summary: ReturnType<typeof useFechamentoSummary>): Crumb[] {
  if (pathname === "/" || pathname === "/fechamentos") {
    return [{ label: "Fechamentos" }]
  }
  if (pathname === "/fechamentos/novo") {
    return [{ label: "Fechamentos", href: "/fechamentos" }, { label: "Novo fechamento" }]
  }
  const match = pathname.match(/^\/fechamentos\/([^/]+)\/([^/]+)$/)
  if (match) {
    const [, id, step] = match
    const label = summary
      ? `${summary.imobiliaria} · ${summary.empreendimento} · ${summary.competencia}`
      : "Fechamento"
    const stepLabel =
      step === "upload" ? "Documentos" : step === "processando" ? "Processando" : step === "revisao" ? "Revisao" : step
    return [
      { label: "Fechamentos", href: "/fechamentos" },
      { label, href: `/fechamentos/${id}/revisao` },
      { label: stepLabel },
    ]
  }
  if (pathname.startsWith("/imoveis")) {
    return [{ label: "Imóveis" }]
  }
  if (pathname.startsWith("/indicadores")) {
    return [{ label: "Indicadores" }]
  }
  if (pathname.startsWith("/configuracoes")) {
    return [{ label: "Configurações" }]
  }
  if (pathname.startsWith("/logs")) {
    return [{ label: "Logs" }]
  }
  return [{ label: "Fechamentos" }]
}

function extractFechamentoId(pathname: string) {
  const match = pathname.match(/^\/fechamentos\/([0-9a-f-]{36})\//i)
  return match ? match[1] : null
}

interface TopbarProps {
  showNotifications: boolean
  onToggleNotifications: () => void
}

export function Topbar({ showNotifications, onToggleNotifications }: TopbarProps) {
  const pathname = usePathname() ?? "/"
  const fechamentoId = extractFechamentoId(pathname)
  const summary = useFechamentoSummary(fechamentoId)
  const crumbs = buildCrumbs(pathname, summary)
  const { naoLidas, marcarLidas, pedirPermissaoNavegador } = useNotifications()

  const handleToggleNotifications = () => {
    if (!showNotifications) {
      // Gesto do usuario: bom momento para pedir permissao de notificacao do SO.
      pedirPermissaoNavegador()
      void marcarLidas()
    }
    onToggleNotifications()
  }

  return (
    <header className="fixed top-0 left-[220px] right-0 h-14 bg-white border-b border-[#EEF1EE] pl-6 pr-6 flex items-center justify-between z-30">
      <nav className="flex items-center gap-2 text-[13px]">
        {crumbs.map((crumb, i) => (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span className="text-[#D5DDD6]">/</span>}
            {crumb.href && i < crumbs.length - 1 ? (
              <Link href={crumb.href} className="text-[#6B7F6E] hover:text-[#1A2B1C]">
                {crumb.label}
              </Link>
            ) : (
              <span
                className={i === crumbs.length - 1 ? "text-[#1A2B1C] font-medium" : "text-[#6B7F6E]"}
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={handleToggleNotifications}
            className="relative p-2 rounded-lg hover:bg-[#EEF1EE] transition-colors"
            aria-label="Notificações"
          >
            <Bell size={18} className="text-[#3D4F3F]" />
            {naoLidas > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </button>

          {showNotifications && <NotificationsPanel onClose={onToggleNotifications} />}
        </div>
      </div>
    </header>
  )
}
