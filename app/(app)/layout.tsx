"use client"

import { useState } from "react"
import { Sidebar } from "@/components/acr/sidebar"
import { Topbar } from "@/components/acr/topbar"
import { CadastrosProvider } from "@/lib/contexts/cadastros-context"
import { ProcessingProvider } from "@/lib/contexts/processing-context"

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <CadastrosProvider>
      <ProcessingProvider>
        <div className="min-h-screen bg-[#F8FAF8]">
          <Sidebar />
          <Topbar
            showNotifications={showNotifications}
            onToggleNotifications={() => setShowNotifications((value) => !value)}
          />
          <main className="ml-[220px] mt-14 p-6">{children}</main>
        </div>
      </ProcessingProvider>
    </CadastrosProvider>
  )
}
