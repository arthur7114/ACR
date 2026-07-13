"use client"

import { useState } from "react"
import { Sidebar } from "@/components/acr/sidebar"
import { Topbar } from "@/components/acr/topbar"
import { CadastrosProvider } from "@/lib/contexts/cadastros-context"
import { ProcessingProvider } from "@/lib/contexts/processing-context"
import { NotificationsProvider } from "@/lib/contexts/notifications-context"

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <CadastrosProvider>
      <ProcessingProvider>
        <NotificationsProvider>
          <div className="min-h-dvh overflow-x-clip bg-acr-page pt-14">
            <a
              href="#main-content"
              className="sr-only fixed left-4 top-3 z-50 rounded-lg bg-acr-ink px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-acr-green focus:ring-offset-2"
            >
              Pular para o conteúdo
            </a>
            <Sidebar />
            <Topbar
              showNotifications={showNotifications}
              onToggleNotifications={() => setShowNotifications((value) => !value)}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className="min-w-0 p-4 focus:outline-none md:ml-[72px] md:p-6 min-[1200px]:!ml-[220px]"
            >
              {children}
            </main>
          </div>
        </NotificationsProvider>
      </ProcessingProvider>
    </CadastrosProvider>
  )
}
