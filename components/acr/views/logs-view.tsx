"use client"

import { useEffect, useState } from "react"
import { EmptyState } from "@/components/acr/ui/empty-state"
import { ErrorState } from "@/components/acr/ui/error-state"
import { History } from "lucide-react"

type LogEntry = {
  id: string
  tipo: "correcao" | "notificacao"
  titulo: string
  detalhe: string
  quando: string
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[] | "loading" | "error">("loading")

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((payload) => setLogs(payload.logs ?? "error"))
      .catch(() => setLogs("error"))
  }, [])

  return (
    <div>
      <h1 className="text-[20px] font-bold tracking-tight text-[#1A2B1C]">Logs</h1>
      <p className="mt-1 text-[13px] text-[#6B7F6E]">Correções manuais e eventos do sistema.</p>

      <div className="acr-card mt-5 overflow-hidden p-0">
        {logs === "loading" && <p className="p-6 text-[13px] text-[#6B7F6E]">Carregando...</p>}
        {logs === "error" && <ErrorState title="Não foi possível carregar os logs." />}
        {Array.isArray(logs) && logs.length === 0 && (
          <EmptyState icon={<History size={22} />} title="Nenhum registro ainda" description="Correções manuais e eventos do sistema vão aparecer aqui." />
        )}
        {Array.isArray(logs) && logs.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium">Título</th>
                <th className="px-4 py-2.5 text-left font-medium">Detalhe</th>
                <th className="px-4 py-2.5 text-left font-medium">Quando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1EE]">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        log.tipo === "correcao" ? "bg-[#FBF3E4] text-[#92400E]" : "bg-[#EFF6F0] text-[#1A5C24]"
                      }`}
                    >
                      {log.tipo === "correcao" ? "Correção" : "Notificação"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#1A2B1C]">{log.titulo}</td>
                  <td className="px-4 py-2.5 text-[#3D4F3F]">{log.detalhe}</td>
                  <td className="px-4 py-2.5 text-[#6B7F6E]">{new Date(log.quando).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
