"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import { formatCompetenciaLong } from "@/lib/fechamento-context"
import { NotificationsPanel } from "./notifications-panel"
import { MobileNavigationSheet } from "./sidebar"
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
  if (pathname.startsWith("/iptu")) {
    return [{ label: "IPTU" }]
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
  const currentCrumb = crumbs[crumbs.length - 1]?.label ?? "Fechamentos"
  const { naoLidas, marcarLidas, pedirPermissaoNavegador } = useNotifications()
  const notificationsTriggerRef = useRef<HTMLButtonElement>(null)

  const closeNotifications = useCallback(() => {
    if (!showNotifications) return
    onToggleNotifications()
    requestAnimationFrame(() => notificationsTriggerRef.current?.focus())
  }, [onToggleNotifications, showNotifications])

  const handleToggleNotifications = () => {
    if (showNotifications) {
      closeNotifications()
      return
    }

    if (!showNotifications) {
      // Gesto do usuario: bom momento para pedir permissao de notificacao do SO.
      pedirPermissaoNavegador()
      void marcarLidas()
    }
    onToggleNotifications()
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-acr-line bg-white pl-2 pr-4 md:left-[72px] md:px-6 min-[1200px]:!left-[220px]">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <MobileNavigationSheet />

        <nav aria-label="Caminho da página" className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-acr-ink md:hidden" title={currentCrumb}>
            {currentCrumb}
          </span>

          <div className="hidden min-w-0 items-center gap-2 overflow-hidden text-[13px] md:flex">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span className="shrink-0 text-[#D5DDD6]">/</span>}
                {crumb.href && i < crumbs.length - 1 ? (
                  <Link
                    href={crumb.href}
                    className="truncate text-acr-muted-2 transition-colors hover:text-acr-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acr-green"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`truncate ${
                      i === crumbs.length - 1 ? "font-medium text-acr-ink" : "text-acr-muted"
                    }`}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        </nav>
      </div>

      <div className="flex shrink-0 items-center">
        <div className="relative">
          <button
            ref={notificationsTriggerRef}
            type="button"
            onClick={handleToggleNotifications}
            className="relative flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-acr-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acr-green focus-visible:ring-offset-2"
            aria-label="Notificações"
            aria-expanded={showNotifications}
            aria-controls="notifications-panel"
            aria-haspopup="dialog"
          >
            <Bell size={18} aria-hidden="true" className="text-acr-muted-2" />
            {naoLidas > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </button>

          {showNotifications && <NotificationsPanel onClose={closeNotifications} />}
        </div>
      </div>
    </header>
  )
}
