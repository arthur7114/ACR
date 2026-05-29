"use client"

import { useState } from "react"
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
import { ResolveConflictModal } from "@/components/acr/resolve-conflict-modal"

interface RevisaoViewProps {
  fechamentoId: string
  analysisResult: PackageAnalysis | null
  fechamento?: {
    imobiliarias?: { nome: string } | null
    empreendimentos?: { nome: string } | null
    competencia: string
    regra_comercial?: {
      taxa_administracao_percent: number
      taxa_intermediacao_percent: number
    } | null
  } | null
  onOpenModal: (apto: string, inquilino: string, valor: number) => void
  onRefresh?: () => void
}

function MetricTile({
  label,
  value,
  tone = "default",
  subtext,
}: {
  label: string
  value: string
  tone?: "default" | "positive" | "danger" | "warning"
  subtext?: string
}) {
  const valueClass =
    tone === "positive" ? "text-[#2D8C3A]" : tone === "danger" ? "text-[#DC2626]" : tone === "warning" ? "text-[#92400E]" : "text-[#1A2B1C]"

  return (
    <div className="rounded-lg border border-[#EEF1EE] bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7F6E]">{label}</p>
      <p className={`mt-1 text-[17px] font-bold leading-tight tabular-nums ${valueClass}`}>{value}</p>
      {subtext && <p className="mt-0.5 text-[11px] leading-tight text-[#6B7F6E]">{subtext}</p>}
    </div>
  )
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h3 className="text-[14px] font-bold text-[#1A2B1C]">{title}</h3>
      {description && <p className="mt-0.5 text-[12px] text-[#6B7F6E]">{description}</p>}
    </div>
  )
}

function getOpinionLabel(status: TechnicalOpinion["status"]) {
  if (status === "aprovado_tecnico") return "Pronto para aprovação"
  if (status === "aprovado_com_ressalvas") return "Aprovado com ressalvas"
  return "Aguardando resolução"
}

function getOpinionClasses(status: TechnicalOpinion["status"]) {
  if (status === "aprovado_tecnico") return "bg-[#DCFCE7] text-[#166534] border-[#22C55E]"
  if (status === "aprovado_com_ressalvas") return "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]"
  return "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]"
}

function getCheckClasses(check: PrestacaoRecheck) {
  const isResolved = check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
  if (isResolved) return "bg-[#E6F4EA] text-[#137333] border-[#A3E2B9]"
  if (check.status === "failed") return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
  if (check.status === "warning") return "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]"
  return "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
}

function getCheckLabel(check: PrestacaoRecheck) {
  const isResolved = check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
  if (isResolved) return "Resolvido"
  if (check.status === "failed") return "Bloqueante"
  if (check.status === "warning") return "Alerta"
  return "OK"
}

function isActionableWarning(check: PrestacaoRecheck) {
  const isResolved = check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
  if (check.status === "passed" && !isResolved) return false
  if (check.id === "required_prestacao_contas" || check.id === "required_comprovante_repasse") return true
  if (check.id === "rows_present") return check.status === "failed" || isResolved
  if (check.id === "repasse_conciliation") return true
  if (check.id === "resumo_financeiro") return true
  if (check.id === "total_linhas_receitas") return typeof check.difference === "number"
  if (check.id === "total_linhas_comissoes") return typeof check.difference === "number"
  if (check.id === "total_linhas_repasse") return typeof check.difference === "number"
  if (check.id === "comissao_administracao_regra") return true
  return false
}

function isResolvedCheck(check: PrestacaoRecheck) {
  return check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
}

function isObjectiveValidation(check: PrestacaoRecheck) {
  return !check.id.endsWith("_confidence")
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function getValidationSummary(rechecks: PrestacaoRecheck[]) {
  const objectiveChecks = rechecks.filter(isObjectiveValidation)

  return objectiveChecks.reduce(
    (summary, check) => {
      const isResolved = isResolvedCheck(check)
      if (isResolved || check.status === "passed") return { ...summary, passed: summary.passed + 1 }
      if (check.status === "failed") return { ...summary, blocked: summary.blocked + 1 }
      if (check.status === "warning") return { ...summary, warnings: summary.warnings + 1 }
      return summary
    },
    { blocked: 0, warnings: 0, passed: 0 },
  )
}

function getValidationSummaryLabel(summary: { blocked: number; warnings: number; passed: number }) {
  const parts = [summary.blocked > 0 ? pluralize(summary.blocked, "bloqueio", "bloqueios") : "Sem bloqueios"]
  if (summary.warnings > 0) parts.push(pluralize(summary.warnings, "alerta", "alertas"))
  if (summary.passed > 0) parts.push(`${summary.passed} ok`)
  return parts.join(" · ")
}

function getObjectiveOpinionCopy(summary: { blocked: number; warnings: number; passed: number }) {
  if (summary.blocked > 0) return "Fechamento bloqueado por pendências obrigatórias. Resolva os itens abaixo antes de aprovar."
  if (summary.warnings > 0) return "Há alertas para revisar antes de aprovar. Confira os itens destacados abaixo."
  return "Validações principais concluídas. O fechamento não possui bloqueios operacionais."
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

function sumRows(rows: ReceitaPorImovel[]) {
  return rows.reduce(
    (totals, row) => ({
      aluguel: totals.aluguel + (row.aluguel_com_desconto ?? row.aluguel ?? 0),
      garagem: totals.garagem + (row.garagem ?? 0),
      agua: totals.agua + (row.agua ?? 0),
      iptu: totals.iptu + (row.iptu ?? 0),
      seguro: totals.seguro + (row.seguro_incendio ?? 0),
      total: totals.total + row.total,
      comissao: totals.comissao + (row.comissao ?? 0),
      repasse: totals.repasse + (row.repasse ?? 0),
    }),
    { aluguel: 0, garagem: 0, agua: 0, iptu: 0, seguro: 0, total: 0, comissao: 0, repasse: 0 },
  )
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") return "-"
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`
}

export function RevisaoView({ fechamentoId, fechamento, onOpenModal, onRefresh, analysisResult }: RevisaoViewProps) {
  const [activeValidation, setActiveValidation] = useState<{
    id: string
    fechamento_id: string
    tipo_validacao: string
    mensagem: string
    valor_esperado: number | null
    valor_encontrado: number | null
    diferenca: number | null
  } | null>(null)
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false)

  if (!analysisResult) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-xl p-8 border border-[#EEF1EE] text-center">
        <AlertTriangle size={28} className="text-[#F59E0B] mx-auto mb-3" />
        <h2 className="text-[20px] font-bold text-[#1A2B1C]">Nenhuma análise carregada</h2>
        <p className="text-[14px] text-[#6B7F6E] mt-2">
          Envie os documentos deste fechamento para ver a conciliação.
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
  const validationSummary = getValidationSummary(rechecks)
  const hasBlocking = parecer.status === "bloqueado" || failedRechecks.length > 0
  const empreendimentoNome = fechamento?.empreendimentos?.nome ?? prestacao?.empreendimento ?? "Empreendimento nao identificado"
  const imobiliariaNome = fechamento?.imobiliarias?.nome ?? prestacao?.imobiliaria ?? "Imobiliaria nao identificada"
  const competencia = prestacao?.competencia ?? fechamento?.competencia ?? "Competencia nao identificada"
  const title = `${empreendimentoNome} - ${competencia}`
  const resumo = prestacao?.resumo_financeiro
  const totalLinhas = prestacao?.receitas_por_imovel.reduce((sum, row) => sum + row.total, 0) ?? 0
  const linhasImoveis = prestacao?.receitas_por_imovel ?? []
  const rowTotals = sumRows(linhasImoveis)
  const taxaAdministracao = totals.taxa_administracao_percent ?? fechamento?.regra_comercial?.taxa_administracao_percent ?? null
  const taxaIntermediacao = totals.taxa_intermediacao_percent ?? fechamento?.regra_comercial?.taxa_intermediacao_percent ?? null
  const comissaoCalculada = totals.comissao_administracao_calculada ?? null
  const linhasAluguelValido = linhasImoveis.filter((row): row is ReceitaPorImovel & { aluguel: number } => row.aluguel !== null && row.aluguel > 0)
  const mediaAluguel = linhasAluguelValido.length > 0
    ? linhasAluguelValido.reduce((sum, row) => sum + row.aluguel, 0) / linhasAluguelValido.length
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
            {hasBlocking ? "Há pendências que precisam de decisão antes da aprovação." : "Sem pendências bloqueantes no fechamento."}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">{title}</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">{imobiliariaNome} - conciliação da competência</p>
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
            title={hasBlocking ? "Resolva as pendências bloqueantes primeiro" : "Fechamento sem bloqueios"}
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Parecer automático</h3>
              <span className="w-fit rounded-full border border-current bg-white/70 px-2.5 py-1 text-[12px] font-medium">
                {getValidationSummaryLabel(validationSummary)}
              </span>
            </div>
            <p className="text-[13px] text-[#3D4F3F] mt-2">{getObjectiveOpinionCopy(validationSummary)}</p>
            <p className="text-[12px] text-[#6B7F6E] mt-1">
              Este resumo vem das validações automáticas do fechamento, não da confiança da IA.
            </p>
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

      <section className="overflow-hidden rounded-xl border border-[#D5DDD6] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 border-b border-[#EEF1EE] bg-[#F8FAF8] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle
            title="Resumo financeiro"
            description="Valores consolidados para decidir aprovação e repasse."
          />
          <div className="flex flex-wrap gap-2 text-[12px] text-[#3D4F3F]">
            <span className="rounded-full border border-[#D5DDD6] bg-white px-3 py-1">Admin. {formatPercent(taxaAdministracao)}</span>
            <span className="rounded-full border border-[#D5DDD6] bg-white px-3 py-1">Intermediação {formatPercent(taxaIntermediacao)}</span>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className={`rounded-xl border p-5 ${hasBlocking ? "border-[#FCA5A5] bg-[#FEF2F2]" : "border-[#BFE4C7] bg-[#F4F9F5]"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Total a repassar</p>
            <p className={`mt-2 text-[34px] font-bold leading-none tabular-nums ${hasBlocking ? "text-[#DC2626]" : "text-[#2D8C3A]"}`}>
              {formatBRL(totals.total_a_repassar)}
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[#3D4F3F]">
              {totals.valor_comprovado === null
                ? "Comprovante de repasse ainda não conciliado."
                : `Comprovante encontrado: ${formatBRL(totals.valor_comprovado)}.`}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricTile label="Recebido" value={formatBRL(totals.total_receitas)} tone="positive" subtext="Em nome do locador" />
              <MetricTile label="Descontos" value={formatBRL(totals.total_comissao_despesas)} subtext="Comissões + despesas" />
              <MetricTile
                label="Diferença"
                value={totals.diferenca_repasse === null ? "-" : formatBRL(totals.diferenca_repasse)}
                tone={totals.diferenca_repasse ? "danger" : "positive"}
                subtext="Entre cálculo e comprovante"
              />
            </div>

            {linhasImoveis.length > 0 && (
              <div className="space-y-3">
                <SectionTitle title="Composição do recebido" description="Soma das colunas pagas pelo inquilino." />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <MetricTile label="Aluguel" value={formatBRL(totals.total_aluguel ?? rowTotals.aluguel)} />
                  <MetricTile label="Garagem" value={formatBRL(totals.total_garagem ?? rowTotals.garagem)} />
                  <MetricTile label="Água" value={formatBRL(totals.total_agua ?? rowTotals.agua)} />
                  <MetricTile label="IPTU" value={formatBRL(totals.total_iptu ?? rowTotals.iptu)} />
                  <MetricTile label="Seguro incêndio" value={formatBRL(totals.total_seguro_incendio ?? rowTotals.seguro)} />
                </div>
              </div>
            )}

            {linhasImoveis.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricTile
                  label="Comissão admin."
                  value={formatBRL(totals.total_comissoes)}
                  subtext={comissaoCalculada === null ? "Documento" : `Cálculo: ${formatBRL(comissaoCalculada)}`}
                  tone={comissaoCalculada !== null && Math.abs(comissaoCalculada - totals.total_comissoes) > 0.01 ? "warning" : "default"}
                />
                <MetricTile
                  label="Aluguel médio"
                  value={linhasAluguelValido.length > 0 ? formatBRL(mediaAluguel) : "-"}
                  subtext={`${linhasAluguelValido.length} unidade(s) com aluguel`}
                />
                <MetricTile
                  label="Ocupação"
                  value={`${linhasAluguelValido.length}/${linhasImoveis.length}`}
                  subtext={`${inadimplentes} inadimplente(s), ${vagos} vago(s)`}
                  tone={inadimplentes > 0 ? "danger" : "default"}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {prestacao && (
        <section className="bg-white border border-[#EEF1EE] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-[#2D8C3A]" />
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Leitura do documento</h3>
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
                <p className="text-[12px] text-[#6B7F6E]">Qualidade da leitura {Math.round(document.confidence * 100)}%</p>
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
                  <h3 className="text-[14px] font-bold leading-tight text-[#1A2B1C]">Pendências de revisão</h3>
                  <p className="text-[12px] font-normal leading-tight text-[#6B7F6E]">
                    {actionableRechecks.length > 0 ? "Itens que precisam de decisão ou documento" : "Sem pendências acionáveis"}
                  </p>
                </div>
                <span className="ml-auto mr-2 inline-flex h-7 shrink-0 items-center rounded-full bg-[#EEF1EE] px-3 text-[12px] font-medium text-[#3D4F3F]">
                  {failedRechecks.length} bloqueante(s) · {warningRechecks.length} alerta(s)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {actionableRechecks.length > 0 ? (
                <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                  {actionableRechecks.map((check) => {
                    const isResolved = check.dbStatus === "resolvida" || check.dbStatus === "ignorada_com_justificativa"
                    return (
                      <div key={check.id} className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold ${getCheckClasses(check)}`}>
                              {getCheckLabel(check)}
                            </span>
                            <p className="truncate text-[13px] font-bold text-[#1A2B1C]">{check.label}</p>
                          </div>
                          <p className="mt-1.5 text-[12px] leading-snug text-[#3D4F3F]">{check.message}</p>
                          {isResolved && check.justificativa && (
                            <div className="mt-2 text-[12px] bg-[#F4F9F5] text-[#1A5C24] px-3 py-2 rounded-lg border border-[#D1E7D6]">
                              <span className="font-semibold block text-[11px] uppercase tracking-wide text-[#2D8C3A] mb-0.5">Pendência resolvida</span>
                              <span className="italic">{check.justificativa}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden flex-col items-end gap-0.5 md:flex text-right">
                            <CheckValue label="Correto" value={check.expected} />
                            <CheckValue label="Consolidado" value={check.actual} />
                            <CheckValue label="Dif." value={check.difference} />
                          </div>
                          {!isResolved && (
                            <button
                              onClick={() => {
                                setActiveValidation({
                                  id: check.databaseId || "",
                                  fechamento_id: fechamentoId,
                                  tipo_validacao: check.id,
                                  mensagem: check.message,
                                  valor_esperado: check.expected ?? null,
                                  valor_encontrado: check.actual ?? null,
                                  diferenca: check.difference ?? null
                                })
                                setIsResolveModalOpen(true)
                              }}
                              className="h-8 px-3 rounded-md bg-[#2D8C3A]/10 text-[#2D8C3A] hover:bg-[#2D8C3A] hover:text-white text-[12px] font-medium transition-colors"
                            >
                              Resolver
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="border-t border-[#EEF1EE] py-3 text-[13px] text-[#3D4F3F]">
                  Nenhuma pendência financeira ou ausência de documento obrigatório foi encontrada.
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

          <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                {["Apto", "Inquilino", "Aluguel", "Garagem (R$)", "Vagas", "Agua", "IPTU", "Seg. inc.", "Total", "Comissao", "Repasse", "Qualidade leitura"].map((header) => (
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
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.seguro_incendio !== null ? formatBRL(row.seguro_incendio) : "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums font-medium text-[#1A2B1C]">{formatBRL(row.total)}</td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.comissao !== null ? formatBRL(row.comissao) : "-"}</td>
                  <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.repasse !== null ? formatBRL(row.repasse) : "-"}</td>
                  <td className="px-4 py-3.5 text-[#3D4F3F]">{Math.round(row.confianca * 100)}%</td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#D5DDD6] bg-[#F8FAF8] font-semibold text-[#1A2B1C]">
                <td className="px-4 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.aluguel)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.garagem)}</td>
                <td className="px-4 py-3 tabular-nums">-</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.agua)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.iptu)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.seguro)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.total)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.comissao)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotals.repasse)}</td>
                <td className="px-4 py-3">-</td>
              </tr>
            </tfoot>
          </table>
          </div>
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

      <ResolveConflictModal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        validation={activeValidation}
        onResolveSuccess={() => onRefresh && onRefresh()}
      />
    </div>
  )
}
