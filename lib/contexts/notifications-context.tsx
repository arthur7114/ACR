"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export interface Notificacao {
  id: string
  fechamento_id: string | null
  tipo: string
  titulo: string
  corpo: string | null
  lida: boolean
  criado_em: string
}

interface NotificationsContextValue {
  notificacoes: Notificacao[]
  naoLidas: number
  marcarLidas: (ids?: string[]) => Promise<void>
  pedirPermissaoNavegador: () => void
  refetch: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

const POLL_INTERVAL_MS = 12000

function notifyBrowser(titulo: string, corpo: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return
  try {
    const n = new Notification(titulo, { body: corpo })
    n.onclick = () => window.focus()
  } catch {
    // Alguns navegadores exigem ServiceWorker para notificar; ignore silenciosamente.
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const seenRef = useRef<Set<string> | null>(null)

  const fetchNotifs = useCallback(async () => {
    try {
      const response = await fetch("/api/notificacoes")
      if (!response.ok) return
      const payload = await response.json()
      const list: Notificacao[] = payload.notificacoes ?? []
      setNotificacoes(list)
      setNaoLidas(payload.nao_lidas ?? 0)

      if (seenRef.current === null) {
        // Primeira carga: apenas semeia o conjunto, sem disparar toasts retroativos.
        seenRef.current = new Set(list.map((item) => item.id))
        return
      }

      // Itens novos desde o ultimo poll => toast + notificacao do SO (do mais antigo ao mais novo).
      for (const item of [...list].reverse()) {
        if (seenRef.current.has(item.id)) continue
        seenRef.current.add(item.id)
        const descricao = item.corpo ?? ""
        if (item.tipo === "analise_concluida") {
          toast.success(item.titulo, { description: descricao })
        } else {
          toast.error(item.titulo, { description: descricao })
        }
        notifyBrowser(item.titulo, descricao)
      }
    } catch {
      // Poll resiliente: erro transitorio nao quebra o ciclo.
    }
  }, [])

  useEffect(() => {
    void fetchNotifs()
    const id = setInterval(() => void fetchNotifs(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchNotifs])

  const marcarLidas = useCallback(
    async (ids?: string[]) => {
      try {
        await fetch("/api/notificacoes/marcar-lidas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
        })
      } finally {
        await fetchNotifs()
      }
    },
    [fetchNotifs],
  )

  const pedirPermissaoNavegador = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission === "default") {
      void Notification.requestPermission()
    }
  }, [])

  const value = useMemo(
    () => ({
      notificacoes,
      naoLidas,
      marcarLidas,
      pedirPermissaoNavegador,
      refetch: () => void fetchNotifs(),
    }),
    [notificacoes, naoLidas, marcarLidas, pedirPermissaoNavegador, fetchNotifs],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  const value = useContext(NotificationsContext)
  if (!value) throw new Error("useNotifications must be used within NotificationsProvider")
  return value
}
