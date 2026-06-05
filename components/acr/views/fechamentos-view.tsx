"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle, Loader2, Plus, Send } from "lucide-react"
import { formatBRL } from "@/lib/format"

type Status = "pendente" | "aprovado" | "processando" | "preparado_egestor" | "lancado_egestor" | "erro_egestor"

interface Row {
  id: string
  competencia: string
  imobiliaria: string
  empreendimento: string
  status: Status
  aRepassar: number | null
  transferido: number | null
  diferenca: number | null
}

function formatCompetencia(date: string) {
  const [year, month] = date.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${months[parseInt(month) - 1]}/${year}`
}

function mapStatus(dbStatus: string): Status {
  if (dbStatus === "lancado_egestor") return "lancado_egestor"
  if (dbStatus === "preparado_egestor") return "preparado_egestor"
  if (dbStatus === "erro_egestor") return "erro_egestor"
  if (dbStatus === "aprovado") return "aprovado"
  if (dbStatus === "rascunho") return "processando"
  return "pendente"
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "pendente") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Pendente revisão
      </span>
    )
  }
  if (status === "aprovado") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Aprovado
      </span>
    )
  }
  if (status === "preparado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#E0F2FE] text-[#075985] rounded-full px-3 py-1 text-xs font-medium">
        <Send size={12} />
        Pronto eGestor
      </span>
    )
  }
  if (status === "lancado_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#166534] rounded-full px-3 py-1 text-xs font-medium">
        <CheckCircle size={12} />
        Lançado eGestor
      </span>
    )
  }
  if (status === "erro_egestor") {
    return (
      <span className="inline-flex items-center gap-1 bg-[#FEE2E2] text-[#991B1B] rounded-full px-3 py-1 text-xs font-medium">
        <AlertTriangle size={12} />
        Erro eGestor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-[#DBEAFE] text-[#1E40AF] rounded-full px-3 py-1 text-xs font-medium">
      Processando
    </span>
  )
}

export function FechamentosView() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/fechamentos")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) throw new Error(payload.error)

        const mapped: Row[] = (payload.fechamentos ?? []).map((f: {
          id: string
          competencia: string
          status: string
          total_repassar: number | null
          valor_repassado_comprovante: number | null
          diferenca_total: number | null
          imobiliarias: { nome: string }
          empreendimentos: { nome: string }
        }) => ({
          id: f.id,
          competencia: formatCompetencia(f.competencia),
          imobiliaria: f.imobiliarias?.nome ?? "-",
          empreendimento: f.empreendimentos?.nome ?? "-",
          status: mapStatus(f.status),
          aRepassar: f.total_repassar,
          transferido: f.valor_repassado_comprovante,
          diferenca: f.diferenca_total,
        }))

        setRows(mapped)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">Fechamentos</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">
            Conciliação mensal de repasses por imobiliária
          </p>
        </div>
        <Link
          href="/fechamentos/novo"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
        >
          <Plus size={16} />
          Novo Fechamento
        </Link>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#6B7F6E]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[14px]">Carregando fechamentos...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#DC2626]">
            <AlertTriangle size={18} />
            <span className="text-[14px]">{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#6B7F6E]">
            <p className="text-[14px]">Nenhum fechamento encontrado.</p>
            <Link
              href="/fechamentos/novo"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#2D8C3A] text-white text-[13px] font-medium hover:bg-[#1A5C24] transition-colors"
            >
              <Plus size={14} />
              Criar primeiro fechamento
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                  {["Competência", "Imobiliária", "Empreendimento", "Status", "A repassar", "Transferido", "Diferença", "Ações"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#EEF1EE] last:border-0 transition-colors duration-150 hover:bg-[#EFF7F1] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}
                  >
                    <td className="px-4 py-3.5 text-[#3D4F3F] font-medium">{row.competencia}</td>
                    <td className="px-4 py-3.5 text-[#3D4F3F]">{row.imobiliaria}</td>
                    <td className="px-4 py-3.5 text-[#3D4F3F]">{row.empreendimento}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3.5 text-[#3D4F3F] tabular-nums">
                      {row.aRepassar !== null ? formatBRL(row.aRepassar) : "-"}
                    </td>
                    <td className="px-4 py-3.5 text-[#3D4F3F] tabular-nums">
                      {row.transferido !== null ? formatBRL(row.transferido) : "-"}
                    </td>
                    <td className={`px-4 py-3.5 font-medium tabular-nums ${row.diferenca === 0 ? "text-[#22C55E]" : "text-[#DC2626]"}`}>
                      {row.diferenca !== null
                        ? `${row.diferenca < 0 ? "-" : ""}${formatBRL(Math.abs(row.diferenca))}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3.5">
                      {row.status === "pendente" ? (
                        <Link
                          href={`/fechamentos/${row.id}/revisao`}
                          className="h-8 inline-flex items-center px-3 rounded-lg bg-[#2D8C3A] text-white text-[13px] font-medium hover:bg-[#1A5C24] transition-colors"
                        >
                          Revisar
                        </Link>
                      ) : (
                        <Link
                          href={`/fechamentos/${row.id}/revisao`}
                          className="h-8 inline-flex items-center px-3 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[13px] font-medium hover:bg-[#EEF1EE] transition-colors"
                        >
                          Ver detalhes
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[#EEF1EE] bg-white">
              <span className="text-sm text-[#6B7F6E]">
                {rows.length} {rows.length === 1 ? "fechamento" : "fechamentos"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
