"use client"

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { AnalyzePrestacaoResponse, PrestacaoAnalysis, TechnicalOpinion } from "@/lib/prestacao-types"
import type { View } from "../types"

interface RevisaoViewProps {
  onNavigate: (view: View) => void
  onOpenModal: (apto: string, inquilino: string, valor: number) => void
  analysis: PrestacaoAnalysis | null
  analysisResult: AnalyzePrestacaoResponse | null
}

interface ReceitaRow {
  apto: string
  inquilino: string
  aluguel: number | null
  garagem: number | null
  agua: number | null
  iptu: number | null
  total: number
  status: "ok" | "inadimplente"
}

function SummaryCard({
  label,
  value,
  valueColor = "#1A2B1C",
  subtext,
}: {
  label: string
  value: string
  valueColor?: string
  subtext?: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-[#D5DDD6] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <p className="text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium mb-1">{label}</p>
      <p className="text-[28px] font-bold tabular-nums leading-tight" style={{ color: valueColor }}>
        {value}
      </p>
      {subtext && <p className="text-[12px] text-[#6B7F6E] mt-1">{subtext}</p>}
    </div>
  )
}

function getOpinionLabel(status: TechnicalOpinion["status"]) {
  if (status === "aprovado_tecnico") return "Aprovado tecnico"
  if (status === "aprovado_com_ressalvas") return "Aprovado com ressalvas"
  return "Bloqueado"
}

function getOpinionClasses(status: TechnicalOpinion["status"]) {
  if (status === "aprovado_tecnico") return "bg-[#DCFCE7] text-[#166534] border-[#22C55E]"
  if (status === "aprovado_com_ressalvas") return "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]"
  return "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]"
}

export function RevisaoView({ onNavigate, onOpenModal, analysis, analysisResult }: RevisaoViewProps) {
  if (!analysis || !analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-[16px] text-[#6B7F6E]">Nenhuma analise disponivel.</p>
        <button
          onClick={() => onNavigate("upload")}
          className="h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24] transition-colors"
        >
          Voltar ao upload
        </button>
      </div>
    )
  }

  const receitaRows: ReceitaRow[] = analysis.receitas_por_imovel.map((row) => ({
    apto: row.apto,
    inquilino: row.inquilino,
    aluguel: row.aluguel,
    garagem: row.garagem,
    agua: row.agua,
    iptu: row.iptu,
    total: row.total,
    status: row.total <= 0 ? "inadimplente" : "ok",
  }))

  const totalReceitas = analysis.totais.total_receitas ?? receitaRows.reduce((sum, row) => sum + row.total, 0)
  const totalComissoes = analysis.totais.total_comissoes
  const totalRepassar = analysis.totais.total_repassar
  const parecer = analysisResult.parecer
  const failedRechecks = analysisResult.rechecks.filter((check) => check.status === "failed")
  const warningRechecks = analysisResult.rechecks.filter((check) => check.status === "warning")
  const hasBlocking = parecer.status === "bloqueado" || failedRechecks.length > 0

  return (
    <div className="space-y-6">
      <div
        className={`rounded-lg p-3 flex items-center justify-between border ${
          hasBlocking ? "bg-[#FEE2E2] border-[#DC2626]" : "bg-[#EFF7F1] border-[#2D8C3A]"
        }`}
      >
        <div className="flex items-center gap-2">
          {hasBlocking ? (
            <AlertTriangle size={18} className="text-[#DC2626] shrink-0" />
          ) : (
            <CheckCircle size={18} className="text-[#2D8C3A] shrink-0" />
          )}
          <span className={`text-[14px] ${hasBlocking ? "text-[#991B1B]" : "text-[#1A5C24]"}`}>
            {parecer.resumo}
          </span>
        </div>
        <button className="text-[#3D4F3F] text-sm font-medium hover:underline whitespace-nowrap">
          Ver rechecks
        </button>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">
            {analysis.empreendimento} - {analysis.competencia}
          </h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">
            {analysis.imobiliaria} · Dados extraidos por IA + rechecks
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium mt-2 border ${getOpinionClasses(parecer.status)}`}
          >
            {hasBlocking ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            {getOpinionLabel(parecer.status)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] inline-flex items-center gap-2 transition-colors">
            <RefreshCw size={14} />
            Reprocessar
          </button>
          <button
            disabled={hasBlocking}
            title={hasBlocking ? "Resolva as divergencias bloqueantes primeiro" : "Parecer tecnico sem bloqueios"}
            className={`h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium inline-flex items-center gap-2 ${
              hasBlocking ? "opacity-60 cursor-not-allowed pointer-events-none" : "hover:bg-[#1A5C24]"
            }`}
          >
            <CheckCircle size={14} />
            Aprovar fechamento
          </button>
        </div>
      </div>

      <div className={`bg-white border rounded-xl p-5 ${getOpinionClasses(parecer.status)}`}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Parecer tecnico Mastra</h3>
              <span className="text-[12px] font-medium tabular-nums">Confianca {Math.round(parecer.confianca * 100)}%</span>
            </div>
            <p className="text-[13px] text-[#3D4F3F] mt-2">{parecer.resumo}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parecer.motivos.map((motivo) => (
                <span key={motivo} className="inline-flex rounded-full bg-white/70 border border-current px-2.5 py-1 text-[11px]">
                  {motivo}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total recebido"
          value={formatBRL(totalReceitas)}
          valueColor="#2D8C3A"
          subtext={`${receitaRows.length} imoveis - ${analysis.competencia}`}
        />
        <SummaryCard
          label="Comissoes e despesas"
          value={totalComissoes !== null ? formatBRL(totalComissoes) : "-"}
          subtext="Recalculado por codigo"
        />
        <SummaryCard
          label="Total a repassar"
          value={totalRepassar !== null ? formatBRL(totalRepassar) : "-"}
          valueColor="#2D8C3A"
          subtext="Valor final protegido por recheck"
        />
        <SummaryCard
          label="Valor transferido"
          value="-"
          valueColor="#2D8C3A"
          subtext="Proximo slice"
        />
      </div>

      <div className={`bg-white border rounded-xl p-5 ${hasBlocking ? "border-[#DC2626]" : "border-[#D5DDD6]"}`}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} className={hasBlocking ? "text-[#DC2626]" : "text-[#2D8C3A]"} />
          <h3 className="text-[16px] font-bold text-[#1A2B1C]">Rechecks e divergencias</h3>
          <span className="ml-auto inline-flex items-center bg-[#EEF1EE] text-[#3D4F3F] rounded-full px-3 py-1 text-xs font-medium">
            {failedRechecks.length} bloqueante(s) · {warningRechecks.length} ressalva(s)
          </span>
        </div>

        <div className="space-y-3">
          {analysisResult.rechecks.map((check) => (
            <div key={check.id} className="border border-[#EEF1EE] rounded-lg p-3 flex justify-between gap-4">
              <div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium mb-2 ${
                    check.status === "failed"
                      ? "bg-[#FEE2E2] text-[#DC2626]"
                      : check.status === "warning"
                        ? "bg-[#FEF3C7] text-[#92400E]"
                        : "bg-[#DCFCE7] text-[#166534]"
                  }`}
                >
                  {check.status}
                </span>
                <p className="font-bold text-[14px] text-[#1A2B1C]">{check.label}</p>
                <p className="text-[13px] text-[#3D4F3F] mt-1">{check.message}</p>
              </div>
              {typeof check.difference === "number" && (
                <span className="text-[13px] font-bold tabular-nums text-[#1A2B1C]">
                  Dif. {formatBRL(check.difference)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-4 border-b border-[#EEF1EE] flex justify-between items-center">
          <h3 className="text-[16px] font-bold text-[#1A2B1C]">Receitas por imovel</h3>
          <span className="text-[14px] font-medium text-[#1A2B1C]">
            Total: <span className="tabular-nums">{formatBRL(totalReceitas)}</span>
          </span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
              {["Apto", "Inquilino", "Aluguel", "Garagem", "Agua", "IPTU", "Total", "Status"].map((header) => (
                <th key={header} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {receitaRows.map((row) => {
              const isInadimp = row.status === "inadimplente"
              const valueColor = isInadimp ? "text-[#DC2626]" : "text-[#3D4F3F]"

              return (
                <tr key={row.apto} className={`border-b border-[#EEF1EE] last:border-0 ${isInadimp ? "bg-[#FEF9F9]" : "hover:bg-[#EFF7F1]"}`}>
                  <td className="px-4 py-3.5 text-[#1A2B1C] font-medium">{row.apto}</td>
                  <td className="px-4 py-3.5 text-[#3D4F3F]">{row.inquilino}</td>
                  <td className={`px-4 py-3.5 tabular-nums cursor-pointer hover:underline ${valueColor}`} onClick={() => row.aluguel !== null && onOpenModal(row.apto, row.inquilino, row.aluguel)}>
                    {row.aluguel !== null ? formatBRL(row.aluguel) : "-"}
                  </td>
                  <td className={`px-4 py-3.5 tabular-nums ${valueColor}`}>{row.garagem !== null ? formatBRL(row.garagem) : "-"}</td>
                  <td className={`px-4 py-3.5 tabular-nums ${valueColor}`}>{row.agua !== null ? formatBRL(row.agua) : "-"}</td>
                  <td className={`px-4 py-3.5 tabular-nums ${valueColor}`}>{row.iptu !== null ? formatBRL(row.iptu) : "-"}</td>
                  <td className={`px-4 py-3.5 tabular-nums font-medium ${valueColor}`}>{formatBRL(row.total)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${isInadimp ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#DCFCE7] text-[#166534]"}`}>
                      {isInadimp ? "Inadimplente" : "OK"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-[#EFF7F1] border-2 border-[#2D8C3A] rounded-xl p-5">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-[#2D8C3A]" />
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Comprovante de Repasse</h3>
          </div>
          <span className="inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] rounded-full px-3 py-1 text-xs font-medium">
            Proximo slice
          </span>
        </div>
        <p className="text-[13px] text-[#3D4F3F]">
          A prestacao ja gera parecer tecnico. A conciliacao com o comprovante de repasse sera ligada na proxima etapa.
        </p>
      </div>

      <div className="bg-white border border-[#EEF1EE] rounded-xl p-4 flex justify-between items-center">
        <button onClick={() => onNavigate("fechamentos")} className="text-[14px] text-[#6B7F6E] hover:text-[#3D4F3F] font-medium">
          Voltar a lista
        </button>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] inline-flex items-center gap-2 transition-colors">
            <Download size={14} />
            Exportar relatorio
          </button>
          <button
            disabled={hasBlocking}
            className={`h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium inline-flex items-center gap-2 ${
              hasBlocking ? "opacity-60 cursor-not-allowed pointer-events-none" : "hover:bg-[#1A5C24]"
            }`}
          >
            <CheckCircle size={14} />
            Aprovar fechamento
          </button>
        </div>
      </div>
    </div>
  )
}
