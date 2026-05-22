"use client"

import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { PackageAnalysis, PrestacaoRecheck, ReceitaPorImovel, TechnicalOpinion } from "@/lib/prestacao-types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface RevisaoViewProps {
  fechamentoId: string
  analysisResult: PackageAnalysis | null
  onOpenModal: (apto: string, inquilino: string, valor: number) => void
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

function getCheckClasses(status: "passed" | "warning" | "failed") {
  if (status === "failed") return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
  if (status === "warning") return "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]"
  return "bg-[#DCFCE7] text-[#166534]"
}

function getCheckLabel(status: "passed" | "warning" | "failed") {
  if (status === "failed") return "Bloqueante"
  if (status === "warning") return "Alerta"
  return "OK"
}

function isActionableWarning(check: PrestacaoRecheck) {
  if (check.status === "passed") return false
  if (check.id === "required_prestacao_contas" || check.id === "required_comprovante_repasse") return true
  if (check.id === "rows_present") return check.status === "failed"
  if (check.id === "repasse_conciliation") return true
  if (check.id === "resumo_financeiro") return true
  if (check.id === "total_linhas_receitas") return typeof check.difference === "number"
  if (check.id === "total_linhas_comissoes") return typeof check.difference === "number"
  if (check.id === "total_linhas_repasse") return typeof check.difference === "number"
  return false
}

const VAGO_INQUILINO_TOKENS = new Set(["", "vago", "vaga", "disponivel", "disponível", "-", "--"])

function isInquilinoVazio(inquilino: string | null | undefined) {
  if (!inquilino) return true
  return VAGO_INQUILINO_TOKENS.has(inquilino.trim().toLowerCase())
}

function getRowBadge(row: ReceitaPorImovel) {
  const aluguelZerado = row.aluguel === null || row.aluguel === 0

  if (!aluguelZerado) return null

  if (isInquilinoVazio(row.inquilino)) {
    return {
      label: "Vago",
      classes: "border-[#D5DDD6] bg-[#EEF1EE] text-[#6B7F6E]",
    }
  }

  return {
    label: "Inadimplente",
    classes: "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]",
  }
}

function CheckValue({ label, value }: { label: string; value: number | null | undefined }) {
  if (typeof value !== "number") return null

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#6B7F6E]">
      {label}
      <strong className="font-semibold text-[#1A2B1C] tabular-nums">{formatBRL(value)}</strong>
    </span>
  )
}

export function RevisaoView({ fechamentoId, onOpenModal, analysisResult }: RevisaoViewProps) {
  if (!analysisResult) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-xl p-8 border border-[#EEF1EE] text-center">
        <AlertTriangle size={28} className="text-[#F59E0B] mx-auto mb-3" />
        <h2 className="text-[20px] font-bold text-[#1A2B1C]">Nenhum processamento real carregado</h2>
        <p className="text-[14px] text-[#6B7F6E] mt-2">
          A revisao so exibe dados extraidos e validados pelo pipeline real.
        </p>
        <Link
          href={`/fechamentos/${fechamentoId}/upload`}
          className="inline-block mt-6 h-10 px-4 leading-10 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium hover:bg-[#1A5C24]"
        >
          Voltar ao upload
        </Link>
      </div>
    )
  }

  const { prestacao, repasse, despesas, reajuste, totals, parecer, documents, rechecks } = analysisResult
  const actionableRechecks = rechecks.filter(isActionableWarning)
  const failedRechecks = actionableRechecks.filter((check) => check.status === "failed")
  const warningRechecks = actionableRechecks.filter((check) => check.status === "warning")
  const hasBlocking = parecer.status === "bloqueado" || failedRechecks.length > 0
  const title = `${prestacao?.empreendimento ?? "Empreendimento nao identificado"} - ${prestacao?.competencia ?? "Competencia nao identificada"}`
  const resumo = prestacao?.resumo_financeiro
  const totalLinhas = prestacao?.receitas_por_imovel.reduce((sum, row) => sum + row.total, 0) ?? 0
  const linhasImoveis = prestacao?.receitas_por_imovel ?? []
  const linhasAluguelValido = linhasImoveis.filter((row): row is ReceitaPorImovel & { aluguel: number } => row.aluguel !== null && row.aluguel > 0)
  const mediaAluguel = linhasAluguelValido.length > 0
    ? linhasAluguelValido.reduce((sum, row) => sum + row.aluguel, 0) / linhasAluguelValido.length
    : 0
  const mediaGeral = linhasImoveis.length > 0
    ? linhasImoveis.reduce((sum, row) => sum + (row.aluguel ?? 0), 0) / linhasImoveis.length
    : 0
  const inadimplentes = linhasImoveis.filter((row) => getRowBadge(row)?.label === "Inadimplente").length
  const vagos = linhasImoveis.filter((row) => getRowBadge(row)?.label === "Vago").length

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
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">{title}</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">
            {prestacao?.imobiliaria ?? "Imobiliaria nao identificada"} - dados reais extraidos e validados
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium mt-2 border ${getOpinionClasses(parecer.status)}`}>
            {hasBlocking ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            {getOpinionLabel(parecer.status)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/fechamentos/${fechamentoId}/upload`}
            className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] inline-flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={14} />
            Reprocessar
          </Link>
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
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Parecer tecnico deterministico</h3>
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
        <SummaryCard label="Recebidos no resumo" value={formatBRL(totals.total_receitas)} valueColor="#2D8C3A" subtext="R$ recebidos em nome do locador" />
        <SummaryCard label="Comissao administracao" value={formatBRL(totals.total_comissoes)} subtext="Comissao principal do documento" />
        <SummaryCard label="Comissao + despesas" value={formatBRL(totals.total_comissao_despesas)} subtext="Total abatido no resumo" />
        <SummaryCard label="Total a repassar" value={formatBRL(totals.total_a_repassar)} valueColor={hasBlocking ? "#DC2626" : "#2D8C3A"} subtext={totals.valor_comprovado === null ? "Comprovante nao conciliado" : `Comprovado: ${formatBRL(totals.valor_comprovado)}`} />
      </div>

      {linhasImoveis.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            label="Media de aluguel"
            value={linhasAluguelValido.length > 0 ? formatBRL(mediaAluguel) : "-"}
            subtext={`${linhasAluguelValido.length} imovel(is) com aluguel > 0`}
          />
          <SummaryCard
            label="Media considerando vagos"
            value={formatBRL(mediaGeral)}
            subtext={`${linhasImoveis.length} imovel(is) no total`}
          />
          <SummaryCard
            label="Ocupacao"
            value={`${linhasAluguelValido.length}/${linhasImoveis.length}`}
            subtext={`${inadimplentes} inadimplente(s) - ${vagos} vago(s)`}
            valueColor={inadimplentes > 0 ? "#991B1B" : undefined}
          />
        </div>
      )}

      {prestacao && (
        <section className="bg-white border border-[#EEF1EE] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-[#2D8C3A]" />
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Plano e resumo financeiro extraidos</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium mb-1">Secoes identificadas</p>
                <div className="flex flex-wrap gap-2">
                  {prestacao.plano_extracao.secoes_identificadas.map((secao) => (
                    <span key={secao} className="rounded-full bg-[#EFF7F1] border border-[#C3DEC9] px-2.5 py-1 text-[11px] text-[#1A5C24]">
                      {secao}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium mb-1">Estrategia de leitura</p>
                <ul className="space-y-1">
                  {prestacao.plano_extracao.estrategia.map((item) => (
                    <li key={item} className="text-[13px] text-[#3D4F3F]">{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <dt className="text-[#6B7F6E]">Total das linhas</dt>
              <dd className="text-[#1A2B1C] font-medium text-right">{formatBRL(resumo?.total_linhas_receitas ?? totalLinhas)}</dd>
              <dt className="text-[#6B7F6E]">Comissao principal</dt>
              <dd className="text-[#1A2B1C] font-medium text-right">{resumo?.comissao_administracao === null || resumo?.comissao_administracao === undefined ? "-" : formatBRL(resumo.comissao_administracao)}</dd>
              <dt className="text-[#6B7F6E]">Outras despesas</dt>
              <dd className="text-[#1A2B1C] font-medium text-right">{formatBRL(totals.total_despesas)}</dd>
              <dt className="text-[#6B7F6E]">Total comissao + despesas</dt>
              <dd className="text-[#1A2B1C] font-medium text-right">{formatBRL(totals.total_comissao_despesas)}</dd>
              <dt className="text-[#6B7F6E]">Recebidos locador</dt>
              <dd className="text-[#1A2B1C] font-bold text-right">{formatBRL(totals.total_receitas)}</dd>
              <dt className="text-[#6B7F6E]">Total a repassar</dt>
              <dd className="text-[#1A2B1C] font-bold text-right">{formatBRL(totals.total_a_repassar)}</dd>
            </dl>
          </div>

          {resumo && resumo.outras_comissoes_despesas.length > 0 && (
            <div className="mt-5 border-t border-[#EEF1EE] pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium mb-2">Outras comissoes e despesas no resumo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {resumo.outras_comissoes_despesas.map((item) => (
                  <div key={`${item.descricao}-${item.valor}`} className="flex justify-between gap-3 rounded-lg border border-[#EEF1EE] px-3 py-2">
                    <span className="text-[13px] text-[#3D4F3F]">{item.descricao}</span>
                    <span className="text-[13px] font-bold text-[#1A2B1C] tabular-nums">{formatBRL(item.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bg-white border border-[#EEF1EE] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#EEF1EE] flex items-center gap-2">
          <FileText size={18} className="text-[#2D8C3A]" />
          <h3 className="text-[16px] font-bold text-[#1A2B1C]">Documentos processados</h3>
        </div>
        <div className="divide-y divide-[#EEF1EE]">
          {documents.map((document) => (
            <div key={document.fileName} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#1A2B1C] truncate">{document.fileName}</p>
                <p className="text-[12px] text-[#6B7F6E]">{document.reason}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] font-medium text-[#3D4F3F]">{document.documentType}</p>
                <p className="text-[12px] text-[#6B7F6E]">{Math.round(document.confidence * 100)}%</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`bg-white border rounded-xl px-4 ${hasBlocking ? "border-[#DC2626]" : "border-[#D5DDD6]"}`}>
        <Accordion type="single" collapsible>
          <AccordionItem value="warnings" className="border-0">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex w-full items-center gap-3">
                <AlertTriangle size={16} className={hasBlocking ? "text-[#DC2626]" : actionableRechecks.length > 0 ? "text-[#F59E0B]" : "text-[#2D8C3A]"} />
                <div className="min-w-0 text-left">
                  <h3 className="text-[14px] font-bold leading-tight text-[#1A2B1C]">Warnings reais</h3>
                  <p className="text-[12px] font-normal leading-tight text-[#6B7F6E]">
                    {actionableRechecks.length > 0 ? "Divergencias financeiras e documentos obrigatorios" : "Sem divergencias financeiras acionaveis"}
                  </p>
                </div>
                <span className="ml-auto mr-2 inline-flex h-7 shrink-0 items-center rounded-full bg-[#EEF1EE] px-3 text-[12px] font-medium text-[#3D4F3F]">
                  {failedRechecks.length} bloqueante(s) - {warningRechecks.length} alerta(s)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {actionableRechecks.length > 0 ? (
                <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                  {actionableRechecks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold ${getCheckClasses(check.status)}`}>
                            {getCheckLabel(check.status)}
                          </span>
                          <p className="truncate text-[13px] font-bold text-[#1A2B1C]">{check.label}</p>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-[#3D4F3F]">{check.message}</p>
                      </div>
                      <div className="hidden shrink-0 flex-col items-end gap-0.5 md:flex">
                        <CheckValue label="Correto" value={check.expected} />
                        <CheckValue label="Consolidado" value={check.actual} />
                        <CheckValue label="Dif." value={check.difference} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-t border-[#EEF1EE] py-3 text-[13px] text-[#3D4F3F]">
                  Nenhuma divergencia financeira ou ausencia de documento obrigatorio foi encontrada.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {prestacao && (
        <section className="bg-white rounded-xl border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-4 border-b border-[#EEF1EE] flex justify-between items-center">
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Receitas por imovel</h3>
            <span className="text-[14px] font-medium text-[#1A2B1C]">
              Total das linhas: <span className="tabular-nums">{formatBRL(resumo?.total_linhas_receitas ?? totalLinhas)}</span>
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                {["Apto", "Inquilino", "Aluguel", "Garagem (R$)", "Vagas", "Agua", "IPTU", "Total", "Confianca"].map((header) => (
                  <th key={header} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prestacao.receitas_por_imovel.map((row) => {
                const badge = getRowBadge(row)
                return (
                <tr key={`${row.apto}-${row.inquilino}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                  <td className="px-4 py-3.5 text-[#1A2B1C] font-medium">{row.apto}</td>
                  <td className="px-4 py-3.5 text-[#3D4F3F]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{row.inquilino?.trim() ? row.inquilino : "-"}</span>
                      {badge && (
                        <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold ${badge.classes}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F] cursor-pointer hover:underline" onClick={() => row.aluguel !== null && onOpenModal(row.apto, row.inquilino, row.aluguel)}>
                    {row.aluguel !== null ? formatBRL(row.aluguel) : "-"}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.garagem !== null ? formatBRL(row.garagem) : "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.vagas_garagem ?? "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.agua !== null ? formatBRL(row.agua) : "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.iptu !== null ? formatBRL(row.iptu) : "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums font-medium text-[#1A2B1C]">{formatBRL(row.total)}</td>
                  <td className="px-4 py-3.5 text-[#3D4F3F]">{Math.round(row.confianca * 100)}%</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#EEF1EE] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ReceiptText size={18} className="text-[#2D8C3A]" />
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Comprovante de repasse</h3>
          </div>
          {repasse ? (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <dt className="text-[#6B7F6E]">Valor</dt>
              <dd className="text-[#1A2B1C] font-bold text-right">{repasse.valor === null ? "-" : formatBRL(repasse.valor)}</dd>
              <dt className="text-[#6B7F6E]">Data</dt>
              <dd className="text-[#1A2B1C] text-right">{repasse.data ?? "-"}</dd>
              <dt className="text-[#6B7F6E]">Origem</dt>
              <dd className="text-[#1A2B1C] text-right">{repasse.origem_nome ?? "-"}</dd>
              <dt className="text-[#6B7F6E]">Destino</dt>
              <dd className="text-[#1A2B1C] text-right">{repasse.destino_nome ?? "-"}</dd>
              <dt className="text-[#6B7F6E]">Protocolo</dt>
              <dd className="text-[#1A2B1C] text-right">{repasse.protocolo ?? "-"}</dd>
            </dl>
          ) : (
            <p className="text-[13px] text-[#991B1B]">Comprovante nao extraido no pacote real.</p>
          )}
        </div>

        <div className="bg-white border border-[#EEF1EE] rounded-xl p-5">
          <h3 className="text-[16px] font-bold text-[#1A2B1C] mb-4">Despesas extraidas</h3>
          {despesas && despesas.despesas.length > 0 ? (
            <div className="space-y-3">
              {despesas.despesas.map((despesa, index) => (
                <div key={`${despesa.tipo}-${index}`} className="flex justify-between gap-3 border-b border-[#EEF1EE] pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-[13px] font-medium text-[#1A2B1C]">{despesa.fornecedor ?? despesa.tipo}</p>
                    <p className="text-[12px] text-[#6B7F6E]">{despesa.referencia ?? despesa.vencimento ?? "Referencia nao extraida"}</p>
                  </div>
                  <p className="text-[13px] font-bold tabular-nums text-[#1A2B1C]">{formatBRL(despesa.valor)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[#6B7F6E]">Nenhuma despesa extraida do pacote real.</p>
          )}
        </div>
      </section>

      {reajuste && reajuste.itens.length > 0 && (
        <section className="bg-white border border-[#EEF1EE] rounded-xl p-5">
          <h3 className="text-[16px] font-bold text-[#1A2B1C] mb-4">Relatorio de locacao/reajuste</h3>
          <div className="space-y-3">
            {reajuste.itens.map((item, index) => (
              <div key={`${item.descricao}-${index}`} className="border border-[#EEF1EE] rounded-lg p-3">
                <p className="text-[13px] font-bold text-[#1A2B1C]">{item.descricao}</p>
                <p className="text-[12px] text-[#6B7F6E] mt-1">
                  {item.apto ?? "Apto nao identificado"} - {item.inquilino ?? "Inquilino nao identificado"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bg-white border border-[#EEF1EE] rounded-xl p-4 flex justify-between items-center">
        <Link href="/fechamentos" className="text-[14px] text-[#6B7F6E] hover:text-[#3D4F3F] font-medium">
          Voltar a lista
        </Link>
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
