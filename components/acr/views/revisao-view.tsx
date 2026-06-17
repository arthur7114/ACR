"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  History,
  Paperclip,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  Search,
  MessageSquare,
  Info
} from "lucide-react"
import { formatBRL } from "@/lib/format"
import { contarVagasDeTexto } from "@/lib/vagas"
import type { EgestorEnvio, EgestorLancamento } from "@/lib/egestor-types"
import type { AcordoRescisaoRecebido, PackageAnalysis, PrestacaoRecheck, ReceitaPorImovel, TechnicalOpinion } from "@/lib/prestacao-types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ResolveConflictModal } from "@/components/acr/resolve-conflict-modal"

type StatusEvento = {
  id: string
  status_anterior: string | null
  status_novo: string
  usuario: string
  motivo: string | null
  criado_em: string
}

interface RevisaoViewProps {
  fechamentoId: string
  analysisResult: PackageAnalysis | null
  fechamento?: {
    imobiliarias?: { nome: string } | null
    empreendimentos?: { nome: string } | null
    competencia: string
    comentario_operador?: string | null
    status?: string
    regra_comercial?: {
      taxa_administracao_percent: number
      taxa_intermediacao_percent: number
    } | null
  } | null
  egestorLancamentos?: EgestorLancamento[]
  egestorEnvios?: EgestorEnvio[]
  statusEventos?: StatusEvento[]
  onOpenModal: (apto: string, inquilino: string, valor: number) => void
  onRefresh?: () => void
}

function MetricTile({
  label,
  value,
  tone = "default",
  subtext,
  tooltip,
}: {
  label: string
  value: string
  tone?: "default" | "positive" | "danger" | "warning"
  subtext?: string
  tooltip?: string
}) {
  const valueClass =
    tone === "positive" ? "text-[#2D8C3A]" : tone === "danger" ? "text-[#DC2626]" : tone === "warning" ? "text-[#92400E]" : "text-[#1A2B1C]"

  return (
    <div className="rounded-lg border border-[#EEF1EE] bg-white px-3 py-2.5 relative group" title={tooltip}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7F6E] flex items-center gap-1">
        {label}
        {tooltip && <Info size={12} className="text-[#8A9A8C]" />}
      </p>
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
  if (check.id === "acordos_competencias") return check.status === "warning" || isResolved
  if (check.id === "duplicate_agreement_payment") return true
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

const VAGO_INQUILINO_TOKENS = new Set(["", "vago", "vaga", "disponivel", "disponível", "-", "--", "null", ": null", "nulo", "undefined"])

function isInquilinoVazio(inquilino: string | null | undefined) {
  if (!inquilino) return true
  return VAGO_INQUILINO_TOKENS.has(inquilino.trim().toLowerCase())
}

function displayInquilino(inquilino: string | null | undefined) {
  if (!inquilino?.trim()) return "-"
  const trimmed = inquilino.trim()
  return /^[:\s]*(null|nulo|undefined)$/i.test(trimmed) ? "-" : trimmed
}

function isAirbnbRow(row: ReceitaPorImovel) {
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return /air\s*bnb/.test(text)
}

function isVacantRow(row: ReceitaPorImovel) {
  if (isAirbnbRow(row)) return false
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return isInquilinoVazio(row.inquilino) || /\b(vago|vacancia|vacância|disponivel|disponível)\b/.test(text)
}

function isDelinquentRow(row: ReceitaPorImovel) {
  if (isAirbnbRow(row)) return false
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return !isVacantRow(row) && ((row.aluguel === null || row.aluguel === 0) || /inadimpl/.test(text))
}

function isRentedCurrentRow(row: ReceitaPorImovel) {
  return !isAirbnbRow(row) && !isVacantRow(row) && !isDelinquentRow(row)
}

function getRowBadge(row: ReceitaPorImovel, acordoAptos: Set<string> = new Set()) {
  if (isAirbnbRow(row)) {
    return {
      label: "Airbnb",
      classes: "border-[#99F6E4] bg-[#CCFBF1] text-[#0F766E]",
    }
  }

  if (isVacantRow(row)) {
    return {
      label: "Vago",
      classes: "border-[#D5DDD6] bg-[#EEF1EE] text-[#6B7F6E]",
    }
  }

  if (isDelinquentRow(row)) {
    // Apto quitado via acordo/rescisao no mes nao e inadimplente.
    if (acordoAptos.has(aptoKey(row.apto))) {
      return {
        label: "Acordo",
        classes: "border-[#BFDBFE] bg-[#DBEAFE] text-[#1E40AF]",
      }
    }
    return {
      label: "Inadimplente",
      classes: "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]",
    }
  }

  return null
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
      aluguel: totals.aluguel + (row.aluguel ?? 0),
      aluguelComDesconto: totals.aluguelComDesconto + (getAluguelComDesconto(row) ?? 0),
      garagem: totals.garagem + (row.garagem ?? 0),
      vagas: totals.vagas + getVagasGaragem(row),
      agua: totals.agua + (row.agua ?? 0),
      iptu: totals.iptu + (row.iptu ?? 0),
      seguro: totals.seguro + (row.seguro_incendio ?? 0),
      total: totals.total + row.total,
      totalComDesconto: totals.totalComDesconto + getTotalComDesconto(row),
      comissao: totals.comissao + (row.comissao ?? 0),
      repasse: totals.repasse + (row.repasse ?? 0),
    }),
    { aluguel: 0, aluguelComDesconto: 0, garagem: 0, vagas: 0, agua: 0, iptu: 0, seguro: 0, total: 0, totalComDesconto: 0, comissao: 0, repasse: 0 },
  )
}

// Total da unidade ja com o desconto aplicado (total bruto menos o desconto da linha).
function getTotalComDesconto(row: ReceitaPorImovel) {
  return Math.max(row.total - (row.desconto ?? 0), 0)
}

// Normaliza o numero do apto para comparar receitas x acordos/rescisoes.
function aptoKey(apto: string | null | undefined) {
  return (apto ?? "").trim().toLowerCase()
}

// Vagas de garagem informadas dentro de um acordo/rescisao (campo extraido ou parse da observacao).
function vagasDoAcordo(item: AcordoRescisaoRecebido) {
  if (typeof item.vagas_garagem === "number") return item.vagas_garagem
  return contarVagasDeTexto(item.observacao) ?? 0
}

function getAluguelComDesconto(row: ReceitaPorImovel) {
  if (typeof row.aluguel_com_desconto === "number") return row.aluguel_com_desconto
  if (typeof row.aluguel !== "number") return null
  if (typeof row.desconto === "number" && row.desconto > 0) return Math.max(row.aluguel - row.desconto, 0)
  return row.aluguel
}

function getVagasGaragem(row: ReceitaPorImovel) {
  if (typeof row.vagas_garagem === "number") return row.vagas_garagem
  return (row.garagem ?? 0) > 0 ? 1 : 0
}

// Normaliza a competencia ("2026-05" ou "05/2026") para "MM/YYYY", de forma a
// comparar com o mes de referencia do aluguel (campo vencimento). Retorna null
// quando o formato nao for numerico (ex.: "Maio/2026").
function competenciaParaMesAno(competencia: string | null | undefined): string | null {
  if (!competencia) return null
  const ymd = /^(\d{4})-(\d{2})/.exec(competencia)
  if (ymd) return `${ymd[2]}/${ymd[1]}`
  const my = /^(\d{2})\/(\d{4})/.exec(competencia)
  if (my) return `${my[1]}/${my[2]}`
  return null
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") return "-"
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`
}

function formatDateBR(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date)
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(date)
}

function getEgestorStatusClasses(status: EgestorLancamento["status"]) {
  if (status === "validado") return "bg-[#DCFCE7] text-[#166534]"
  if (status === "enviado") return "bg-[#DBEAFE] text-[#1E40AF]"
  if (status === "anexo_pendente") return "bg-[#FEF3C7] text-[#92400E]"
  if (status === "erro") return "bg-[#FEE2E2] text-[#991B1B]"
  return "bg-[#FEF3C7] text-[#92400E]"
}

function getEgestorStatusLabel(lancamento: EgestorLancamento) {
  if (lancamento.status === "validado") return "Validado"
  if (lancamento.status === "enviado") return `Enviado #${lancamento.egestor_codigo ?? "-"}`
  if (lancamento.status === "anexo_pendente") return "Anexo pendente"
  if (lancamento.status === "erro") return "Erro"
  return "Configuração pendente"
}

export function RevisaoView({
  fechamentoId,
  fechamento,
  onOpenModal,
  onRefresh,
  analysisResult,
  egestorLancamentos = [],
  egestorEnvios = [],
  statusEventos = [],
}: RevisaoViewProps) {
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

  const [filtroTexto, setFiltroTexto] = useState("")
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "alugados" | "vagos" | "inadimplentes" | "airbnb">("todos")

  const [comentario, setComentario] = useState(fechamento?.comentario_operador ?? "")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [egestorAction, setEgestorAction] = useState<"idle" | "approving" | "previewing" | "sending" | "retrying" | "revalidating">("idle")
  const [egestorError, setEgestorError] = useState<string | null>(null)

  useEffect(() => {
    if (fechamento?.comentario_operador !== undefined && comentario === "") {
      setComentario(fechamento.comentario_operador || "")
    }
  }, [fechamento?.comentario_operador, comentario])

  useEffect(() => {
    if (comentario === (fechamento?.comentario_operador ?? "")) return;
    setSaveStatus("saving")
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fechamentos/${fechamentoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comentario_operador: comentario })
        })
        if (res.ok) setSaveStatus("saved")
        else setSaveStatus("error")
      } catch (e) {
        setSaveStatus("error")
      }
    }, 800)
    return () => clearTimeout(timeout)
  }, [comentario, fechamentoId, fechamento?.comentario_operador])

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

  const { prestacao, repasse, despesas, reajuste, totals, parecer } = analysisResult
  const documents = analysisResult.documents ?? []
  const rechecks = analysisResult.rechecks ?? []
  const motivosParecer = parecer.motivos ?? []
  const actionableRechecks = rechecks.filter(isActionableWarning)
  const failedRechecks = actionableRechecks.filter((check) => check.status === "failed" && !isResolvedCheck(check))
  const warningRechecks = actionableRechecks.filter((check) => check.status === "warning" && !isResolvedCheck(check))
  const validationSummary = getValidationSummary(rechecks)
  const hasBlocking = validationSummary.blocked > 0
  const isApproved = ["aprovado", "preparado_egestor", "lancado_egestor", "erro_egestor"].includes(fechamento?.status ?? "")
  const canPreviewEgestor = isApproved && !hasBlocking
  const canSendEgestor = canPreviewEgestor && egestorLancamentos.length > 0 && egestorLancamentos.every((l) => l.status === "validado")
  const hasSentEgestor = egestorLancamentos.some((l) => l.egestor_codigo !== null)
  const hasPendingAnexos = egestorLancamentos.some((l) => l.status === "anexo_pendente")

  async function runEgestorAction(action: "approve" | "preview" | "send" | "retry" | "revalidate") {
    setEgestorError(null)
    const states = {
      approve: "approving",
      preview: "previewing",
      send: "sending",
      retry: "retrying",
      revalidate: "revalidating",
    } as const
    const urls = {
      approve: `/api/fechamentos/${fechamentoId}/aprovar`,
      preview: `/api/fechamentos/${fechamentoId}/egestor/preview`,
      send: `/api/fechamentos/${fechamentoId}/egestor/send`,
      retry: `/api/fechamentos/${fechamentoId}/egestor/retry-anexos`,
      revalidate: `/api/fechamentos/${fechamentoId}/egestor/revalidar`,
    }
    setEgestorAction(states[action])
    const response = await fetch(urls[action], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "send" ? JSON.stringify({ confirmation: "ENVIAR_EGESTOR" }) : "{}",
    })
    const payload = await response.json()
    setEgestorAction("idle")
    if (!response.ok || payload.error) {
      setEgestorError(payload.error ?? "Falha na integração eGestor.")
      return
    }
    if (onRefresh) await onRefresh()
  }
  const empreendimentoNome = fechamento?.empreendimentos?.nome ?? prestacao?.empreendimento ?? "Empreendimento nao identificado"
  const imobiliariaNome = fechamento?.imobiliarias?.nome ?? prestacao?.imobiliaria ?? "Imobiliaria nao identificada"
  const competencia = prestacao?.competencia ?? fechamento?.competencia ?? "Competencia nao identificada"
  const competenciaMesAno = competenciaParaMesAno(prestacao?.competencia ?? fechamento?.competencia)
  const title = `${empreendimentoNome} - ${competencia}`
  const resumo = prestacao?.resumo_financeiro
  const linhasImoveis = prestacao?.receitas_por_imovel ?? []
  const acordosRescisoesRecebidos = prestacao?.acordos_rescisoes_recebidos ?? []
  // Aptos que foram quitados via acordo/rescisao no mes (nao contam como inadimplentes).
  const acordoAptos = new Set(acordosRescisoesRecebidos.map((item) => aptoKey(item.apto)).filter(Boolean))
  // Vagas de garagem informadas dentro dos acordos/rescisoes (ex.: "GARAGEM MOTO + GARAGEM CARRO").
  const vagasAcordos = acordosRescisoesRecebidos.reduce((sum, item) => sum + vagasDoAcordo(item), 0)
  const inadimplenciasAcumuladas = prestacao?.inadimplencias_acumuladas ?? []
  const totalInadimplenciaAcumulada = inadimplenciasAcumuladas.reduce((sum, item) => sum + item.valor, 0)
  const totalLinhas = linhasImoveis.reduce((sum, row) => sum + row.total, 0)
  const rowTotals = sumRows(linhasImoveis)
  // Total de vagas = vagas das receitas + vagas informadas nos acordos/rescisoes.
  const vagasTotais = rowTotals.vagas + vagasAcordos
  const taxaAdministracao = totals.taxa_administracao_percent ?? fechamento?.regra_comercial?.taxa_administracao_percent ?? null
  const comissaoCalculada = totals.comissao_administracao_calculada ?? null
  const baseComissao = totals.base_comissao_administracao ?? 0
  // Comissao realizada = comissao das linhas da tabela / total das linhas da tabela
  // (mensal regular; nao mistura comissao de acordos nem o recebido bruto com acordos).
  const comissaoRealizadaPercent = rowTotals.total > 0 ? (rowTotals.comissao / rowTotals.total) * 100 : null
  const outrasComissoesDespesas = resumo?.outras_comissoes_despesas ?? []
  // Intermediação vem do documento (quando existir), nunca do cadastro da imobiliária
  const intermediacaoDocumento = (() => {
    const item = outrasComissoesDespesas.find((d) => /intermedia/i.test(d.descricao))
    if (!item) return null
    const matchPercent = (texto: string | null | undefined) => {
      const m = texto?.match(/(\d+(?:[.,]\d+)?)\s*%/)
      return m ? Number(m[1].replace(",", ".")) : null
    }
    let percent = matchPercent(item.descricao)
    // Fallback (ainda do documento): procurar o % nas observacoes de acordos de intermediacao.
    if (percent === null) {
      for (const acordo of acordosRescisoesRecebidos) {
        if (/intermedia/i.test(acordo.observacao ?? "")) {
          percent = matchPercent(acordo.observacao)
          if (percent !== null) break
        }
      }
    }
    return { percent, valor: item.valor }
  })()
  const linhasAlugadas = linhasImoveis.filter(isRentedCurrentRow)
  const linhasAluguelValido = linhasAlugadas.filter((row): row is ReceitaPorImovel & { aluguel: number } => row.aluguel !== null && row.aluguel > 0)
  const mediaAluguel = linhasAluguelValido.length > 0
    ? linhasAluguelValido.reduce((sum, row) => sum + row.aluguel, 0) / linhasAluguelValido.length
    : 0
  const isInadimplenteEfetivo = (row: ReceitaPorImovel) => isDelinquentRow(row) && !acordoAptos.has(aptoKey(row.apto))
  const inadimplentes = linhasImoveis.filter(isInadimplenteEfetivo).length
  const vagos = linhasImoveis.filter(isVacantRow).length
  const airbnb = linhasImoveis.filter(isAirbnbRow).length

  const linhasImoveisExibicao = linhasImoveis.filter((row) => {
    const textMatch = !filtroTexto || 
      row.apto.toLowerCase().includes(filtroTexto.toLowerCase()) || 
      (row.inquilino?.toLowerCase() || "").includes(filtroTexto.toLowerCase())
    if (!textMatch) return false
    
    if (filtroStatus === "vagos") return isVacantRow(row)
    if (filtroStatus === "inadimplentes") return isInadimplenteEfetivo(row)
    if (filtroStatus === "alugados") return isRentedCurrentRow(row)
    if (filtroStatus === "airbnb") return isAirbnbRow(row)
    return true
  })

  const rowTotalsExibicao = sumRows(linhasImoveisExibicao)

  const despesasAgrupadas = (despesas?.despesas ?? []).reduce((acc, d) => {
    let cat = "Outras despesas"
    const lower = (d.tipo || d.fornecedor || "").toLowerCase()
    if (lower.includes("enel") || lower.includes("energia") || lower.includes("luz")) cat = "Energia Elétrica"
    else if (lower.includes("cagece") || lower.includes("agua") || lower.includes("água")) cat = "Água/Esgoto"
    else if (lower.includes("iptu")) cat = "IPTU"
    else if (lower.includes("seguro") || lower.includes("incendio")) cat = "Seguro Incêndio"
    
    if (!acc[cat]) acc[cat] = { total: 0, items: [] }
    acc[cat].total += d.valor
    acc[cat].items.push(d)
    return acc
  }, {} as Record<string, { total: number, items: Array<NonNullable<typeof despesas>["despesas"][number]> }>)

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
            onClick={() => runEgestorAction("approve")}
            disabled={hasBlocking || isApproved || egestorAction !== "idle"}
            title={hasBlocking ? "Resolva as pendências bloqueantes primeiro" : isApproved ? "Fechamento aprovado" : "Aprovar fechamento"}
            className={`h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium inline-flex items-center gap-2 ${
              hasBlocking || isApproved ? "opacity-60 cursor-not-allowed pointer-events-none" : "hover:bg-[#1A5C24]"
            }`}
          >
            <CheckCircle size={14} />
            {isApproved ? "Fechamento aprovado" : egestorAction === "approving" ? "Aprovando..." : "Aprovar fechamento"}
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
              {motivosParecer.map((motivo) => (
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
            {intermediacaoDocumento && (
              <span className="rounded-full border border-[#D5DDD6] bg-white px-3 py-1">
                Intermediação {intermediacaoDocumento.percent !== null ? formatPercent(intermediacaoDocumento.percent) : formatBRL(intermediacaoDocumento.valor)}
              </span>
            )}
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
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B7F6E]">
              Data do repasse: <span className="font-semibold text-[#1A2B1C]">{formatDateBR(repasse?.data)}</span>
            </p>
          </div>

          <div className="space-y-4">
            {/* Topo: receita recebida + total de vagas de garagem (receitas + acordos). */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricTile label="Recebido" value={formatBRL(totals.total_receitas)} tone="positive" subtext="Em nome do locador" tooltip="Soma de todos os aluguéis e encargos (água, IPTU, etc.) efetivamente pagos pelos inquilinos nesta competência." />
              <MetricTile label="Vagas garagem" value={`${vagasTotais}`} subtext="Receitas + acordos do mês" tooltip="Total de vagas de garagem das receitas mais as vagas informadas nos acordos/rescisões." />
            </div>

            {linhasImoveis.length > 0 && (
              <div className="space-y-3">
                <SectionTitle title="Composição do recebido" description="Soma das colunas pagas pelo inquilino." />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <MetricTile label="Aluguel" value={formatBRL(totals.total_aluguel ?? rowTotals.aluguelComDesconto)} />
                  <MetricTile label="Garagem" value={formatBRL(totals.total_garagem ?? rowTotals.garagem)} />
                  <MetricTile label="Vagas garagem" value={`${vagasTotais}`} />
                  <MetricTile label="Água" value={formatBRL(totals.total_agua ?? rowTotals.agua)} />
                  <MetricTile label="IPTU" value={formatBRL(totals.total_iptu ?? rowTotals.iptu)} />
                  <MetricTile label="Seguro incêndio" value={formatBRL(totals.total_seguro_incendio ?? rowTotals.seguro)} />
                </div>
              </div>
            )}

            {/* Deduções (comissão e despesas) abaixo da discriminação das receitas. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Comissão admin." value={formatBRL(rowTotals.comissao)} subtext={`${formatPercent(comissaoRealizadaPercent)} realizada`} tooltip={taxaAdministracao ? `Taxa cadastrada: ${formatPercent(taxaAdministracao ?? 0)}\nBase de cálculo (total): ${formatBRL(baseComissao ?? 0)}\nValor calculado: ${formatBRL(comissaoCalculada ?? 0)}` : "Comissão das linhas da tabela ÷ total da tabela."} />
              <MetricTile label="Outras despesas" value={formatBRL(totals.total_despesas)} subtext={`${outrasComissoesDespesas.length} item(ns) no resumo`} tooltip="Soma de outras retenções ou despesas, descontadas do repasse final." />
              <MetricTile label="Comissão + despesas" value={formatBRL(totals.total_comissao_despesas)} subtext="Total abatido do repasse" tooltip="Valor consolidado retido pela imobiliária antes de efetuar o repasse." />
              <MetricTile
                label="Diferença"
                value={totals.diferenca_repasse === null ? "-" : formatBRL(totals.diferenca_repasse)}
                tone={totals.diferenca_repasse ? "danger" : "positive"}
                subtext="Entre cálculo e comprovante"
                tooltip="Diferença entre o Total a Repassar (calculado) e o valor pago encontrado no comprovante de repasse."
              />
            </div>

            {linhasImoveis.length > 0 && (
              <div className="space-y-3">
                <SectionTitle title="Situação das unidades" description="Aluguel ativo, inadimplência, vacância e Airbnb são contagens separadas." />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <MetricTile
                    label="Alugadas"
                    value={`${linhasAlugadas.length}`}
                    subtext="Com pagamento ou cobrança ativa"
                    tone="positive"
                  />
                  <MetricTile
                    label="Inadimplentes"
                    value={`${inadimplentes}`}
                    subtext="Unidades com inquilino e aluguel zerado/obs"
                    tone={inadimplentes > 0 ? "danger" : "default"}
                  />
                  <MetricTile
                    label="Aptos vagos"
                    value={`${vagos}`}
                    subtext="Apartamentos vagos ou disponíveis"
                    tone={vagos > 0 ? "warning" : "default"}
                  />
                  <MetricTile
                    label="Airbnb"
                    value={`${airbnb}`}
                    subtext="Operadas como Airbnb (não contam como apartamentos vagos)"
                  />
                </div>
              </div>
            )}

            {linhasImoveis.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <MetricTile
                  label="Aluguel médio"
                  value={linhasAluguelValido.length > 0 ? formatBRL(mediaAluguel) : "-"}
                  subtext={`${linhasAluguelValido.length} unidade(s) alugadas com valor`}
                />
                <MetricTile
                  label="Inadimplência acumulada"
                  value={inadimplenciasAcumuladas.length > 0 ? formatBRL(totalInadimplenciaAcumulada) : "-"}
                  subtext={inadimplenciasAcumuladas.length > 0 ? `${inadimplenciasAcumuladas.length} débito(s) de meses anteriores` : "Sem seção de inadimplências no documento"}
                  tone={inadimplenciasAcumuladas.length > 0 ? "danger" : "default"}
                  tooltip="Dívidas acumuladas de competências anteriores listadas na seção INADIMPLÊNCIAS do documento. Não compõem a receita do mês."
                />
              </div>
            )}
          </div>
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
                            check.databaseId ? (
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
                            ) : (
                              <button
                                onClick={() => onRefresh && onRefresh()}
                                className="h-8 px-3 rounded-md border border-[#D5DDD6] bg-white text-[#3D4F3F] hover:bg-[#EEF1EE] text-[12px] font-medium transition-colors"
                              >
                                Atualizar
                              </button>
                            )
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
          <div className="p-4 border-b border-[#EEF1EE] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Receitas por imóvel</h3>
              <p className="text-[12px] text-[#6B7F6E]">Mostrando {linhasImoveisExibicao.length} de {linhasImoveis.length} unidades</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-[#8A9A8C]" />
                <input
                  type="text"
                  placeholder="Buscar apto ou inquilino..."
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  className="h-9 w-full sm:w-[220px] rounded-md border border-[#D5DDD6] bg-white pl-8 pr-3 text-[13px] text-[#1A2B1C] focus:border-[#2D8C3A] focus:outline-none"
                />
              </div>
              <div className="flex bg-[#F4F9F5] rounded-md p-1 border border-[#D1E7D6]">
                {(["todos", "alugados", "vagos", "inadimplentes", "airbnb"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFiltroStatus(status)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-sm capitalize transition-colors ${
                      filtroStatus === status ? "bg-white text-[#1A5C24] shadow-sm border border-[#C3DEC9]" : "text-[#6B7F6E] hover:text-[#3D4F3F]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                {["Apto", "Inquilino", "Aluguel", "Valor c/ desc.", "Garagem (R$)", "Vagas", "Água", "IPTU", "Seg. inc.", "Total", "Total c/ desc.", "Comissão", "Repasse", "Ref.", "Obs"].map((header) => (
                  <th key={header} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-[#6B7F6E] font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasImoveisExibicao.length > 0 ? (
                linhasImoveisExibicao.map((row) => {
                  const badge = getRowBadge(row, acordoAptos)
                  return (
                  <tr key={`${row.apto}-${row.inquilino}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                    <td className="px-4 py-3.5 text-[#1A2B1C] font-medium">{row.apto}</td>
                    <td className="px-4 py-3.5 text-[#3D4F3F]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{displayInquilino(row.inquilino)}</span>
                        {badge && (
                          <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold ${badge.classes}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F] cursor-pointer hover:underline" onClick={() => row.aluguel !== null && onOpenModal(row.apto, row.inquilino, row.aluguel)}>
                      {row.aluguel !== null ? formatBRL(row.aluguel) : "-"}
                      {(row.desconto ?? 0) > 0 && (
                        <span className="block text-[10px] font-medium text-[#B45309]">desconto {formatBRL(row.desconto as number)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-medium text-[#1A2B1C]">
                      {getAluguelComDesconto(row) !== null ? formatBRL(getAluguelComDesconto(row) as number) : "-"}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.garagem !== null ? formatBRL(row.garagem) : "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.vagas_garagem ?? "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.agua !== null ? formatBRL(row.agua) : "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.iptu !== null ? formatBRL(row.iptu) : "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.seguro_incendio !== null ? formatBRL(row.seguro_incendio) : "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums font-medium text-[#1A2B1C]">{formatBRL(row.total)}</td>
                    <td className="px-4 py-3.5 tabular-nums font-medium text-[#1A2B1C]">{formatBRL(getTotalComDesconto(row))}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.comissao !== null ? formatBRL(row.comissao) : "-"}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[#3D4F3F]">{row.repasse !== null ? formatBRL(row.repasse) : "-"}</td>
                    <td className={`px-4 py-3.5 tabular-nums whitespace-nowrap ${row.vencimento && competenciaMesAno && row.vencimento !== competenciaMesAno ? "font-semibold text-[#B45309]" : "text-[#3D4F3F]"}`} title={row.vencimento && competenciaMesAno && row.vencimento !== competenciaMesAno ? "Aluguel referente a mês anterior" : undefined}>
                      {row.vencimento ?? "-"}
                    </td>
                    <td className="min-w-[260px] max-w-[420px] px-4 py-3.5 text-[12px] leading-snug text-[#6B7F6E] whitespace-normal break-words">{row.observacao?.trim() || "-"}</td>
                  </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-[13px] text-[#6B7F6E]">Nenhum imóvel encontrado para os filtros atuais.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#D5DDD6] bg-[#F8FAF8] font-semibold text-[#1A2B1C]">
                <td className="px-4 py-3" colSpan={2}>
                  Total {filtroStatus !== "todos" || filtroTexto ? "Filtrado" : ""}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.aluguel)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.aluguelComDesconto)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.garagem)}</td>
                <td className="px-4 py-3 tabular-nums">{rowTotalsExibicao.vagas}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.agua)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.iptu)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.seguro)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.total)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.totalComDesconto)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.comissao)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBRL(rowTotalsExibicao.repasse)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
          </div>
        </section>
      )}

      {acordosRescisoesRecebidos.length > 0 && (
        <section className="bg-white rounded-xl border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-4 border-b border-[#EEF1EE] flex justify-between items-center">
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Acordos e rescisões recebidos no mês</h3>
            <span className="text-[13px] text-[#6B7F6E]">{acordosRescisoesRecebidos.length} item(ns)</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                  {["Tipo", "Apto", "Inquilino", "Valor", "Competência original", "Recebido em", "Obs"].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acordosRescisoesRecebidos.map((item, index) => (
                  <tr key={`${item.tipo}-${item.inquilino}-${item.valor}-${index}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                    <td className="px-4 py-3 font-medium capitalize text-[#1A2B1C]">{item.tipo}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.apto ?? "-"}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.inquilino ?? "-"}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-[#1A2B1C]">{formatBRL(item.valor)}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.competencia_original ?? "-"}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.competencia_recebimento ?? competencia}</td>
                    <td className="max-w-[320px] px-4 py-3 text-[12px] leading-snug text-[#6B7F6E]">{item.observacao ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {inadimplenciasAcumuladas.length > 0 && (
        <section className="bg-white rounded-xl border border-[#EEF1EE] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-4 border-b border-[#EEF1EE] flex justify-between items-center">
            <div>
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Inadimplência acumulada</h3>
              <p className="text-[12px] text-[#6B7F6E]">Débitos de competências anteriores — não compõem a receita do mês</p>
            </div>
            <span className="text-[13px] font-semibold text-[#991B1B]">{formatBRL(totalInadimplenciaAcumulada)}</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                  {["Apto", "Inquilino", "Valor devido", "Condição", "Obs"].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inadimplenciasAcumuladas.map((item, index) => (
                  <tr key={`${item.apto}-${item.inquilino}-${index}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#FEF5F5]">
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.apto ?? "-"}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.inquilino ?? "-"}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-[#991B1B]">{formatBRL(item.valor)}</td>
                    <td className="max-w-[280px] px-4 py-3 text-[12px] leading-snug text-[#6B7F6E] whitespace-normal break-words">{item.condicao ?? "-"}</td>
                    <td className="max-w-[320px] px-4 py-3 text-[12px] leading-snug text-[#6B7F6E] whitespace-normal break-words">{item.observacao ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-4">
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
          <h3 className="text-[16px] font-bold text-[#1A2B1C] mb-4">Despesas extraídas</h3>
          {despesas && despesas.despesas.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(despesasAgrupadas).map(([categoria, info]) => (
                <div key={categoria} className="border border-[#EEF1EE] rounded-lg overflow-hidden">
                  <div className="bg-[#F8FAF8] px-3 py-2 border-b border-[#EEF1EE] flex justify-between items-center">
                    <span className="text-[13px] font-bold text-[#1A2B1C]">{categoria}</span>
                    <span className="text-[13px] font-bold text-[#1A2B1C] tabular-nums">{formatBRL(info.total)}</span>
                  </div>
                  <div className="divide-y divide-[#EEF1EE]">
                    {info.items.map((despesa, index) => (
                      <div key={index} className="flex justify-between gap-3 p-3 group relative cursor-help" title={`Snippet lido:\n"${despesa.observacao || despesa.tipo}"`}>
                        <div className="flex items-start gap-2">
                          <Info size={14} className="mt-0.5 text-[#C3DEC9] group-hover:text-[#2D8C3A] transition-colors shrink-0" />
                          <div>
                            <p className="text-[13px] font-medium text-[#1A2B1C]">{despesa.fornecedor ?? despesa.tipo}</p>
                            <p className="text-[12px] text-[#6B7F6E]">{despesa.referencia ?? despesa.vencimento ?? "Referência não extraída"}</p>
                          </div>
                        </div>
                        <p className="text-[13px] font-bold tabular-nums text-[#1A2B1C]">{formatBRL(despesa.valor)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[#6B7F6E]">Nenhuma despesa extraída do pacote real.</p>
          )}
        </div>
      </section>

      <section className="bg-white border border-[#EEF1EE] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[#2D8C3A]" />
            <h3 className="text-[16px] font-bold text-[#1A2B1C]">Comentários da Revisão</h3>
          </div>
          <span className="text-[11px] font-medium text-[#6B7F6E] bg-[#F8FAF8] px-2 py-1 rounded">
            {saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" ? "Salvo automaticamente" : saveStatus === "error" ? "Erro ao salvar" : ""}
          </span>
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Adicione notas, ressalvas ou explicações gerais sobre o fechamento..."
          className="w-full min-h-[80px] p-3 text-[13px] text-[#1A2B1C] bg-[#F8FAF8] border border-[#EEF1EE] rounded-lg focus:border-[#2D8C3A] focus:ring-1 focus:ring-[#2D8C3A] focus:outline-none resize-y"
        />
      </section>

      <section className="bg-white border border-[#EEF1EE] rounded-xl p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle
            title="Prévia eGestor"
            description="Lançamentos consolidados para envio após a aprovação do fechamento."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runEgestorAction("preview")}
                disabled={!canPreviewEgestor || egestorAction !== "idle" || hasSentEgestor}
                title={!isApproved ? "Aprove o fechamento primeiro" : "Gerar prévia"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <ReceiptText size={14} />
                {egestorAction === "previewing" ? "Gerando..." : "Gerar prévia"}
              </button>
              <button
                onClick={() => runEgestorAction("send")}
                disabled={!canSendEgestor || egestorAction !== "idle" || hasSentEgestor}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2D8C3A] px-3 text-[13px] font-medium text-white hover:bg-[#1A5C24] disabled:opacity-60"
              >
                <Send size={14} />
                {hasSentEgestor ? "Enviado" : egestorAction === "sending" ? "Enviando..." : "Enviar ao eGestor"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[#EEF1EE] pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
              <button
                onClick={() => runEgestorAction("revalidate")}
                disabled={!hasSentEgestor || egestorAction !== "idle"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] disabled:opacity-60"
              >
                <Search size={14} />
                {egestorAction === "revalidating" ? "Revalidando..." : "Revalidar status"}
              </button>
              <button
                onClick={() => runEgestorAction("retry")}
                disabled={!hasPendingAnexos || egestorAction !== "idle"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE] disabled:opacity-60"
              >
                <Paperclip size={14} />
                {egestorAction === "retrying" ? "Reenviando..." : "Reenviar anexos"}
              </button>
            </div>
          </div>
        </div>
        {egestorError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-[13px] text-[#991B1B]">
            <AlertTriangle size={15} />
            {egestorError}
          </div>
        )}
        {!isApproved ? (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[#F59E0B] bg-[#FEF3C7] p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-[#92400E] shrink-0" />
              <p className="text-[13px] text-[#92400E]">
                <strong>Etapa bloqueada:</strong> Você precisa aprovar o fechamento no topo da tela antes de poder gerar a prévia do eGestor.
              </p>
            </div>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-[#FDE68A] text-[#92400E] text-[12px] font-semibold hover:bg-[#FCD34D] transition-colors whitespace-nowrap"
            >
              Ir para aprovação ↑
            </button>
          </div>
        ) : egestorLancamentos.length === 0 ? (
          <p className="mt-4 text-[13px] text-[#6B7F6E]">Nenhuma prévia gerada ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#EEF1EE]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
                <tr>
                  {["Tipo", "Categoria", "Descrição", "Valor", "Plano", "Status"].map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1EE]">
                {egestorLancamentos.map((lancamento) => (
                  <tr key={lancamento.id}>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.tipo}</td>
                    <td className="px-3 py-2 font-medium text-[#1A2B1C]">{lancamento.categoria}</td>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.descricao}</td>
                    <td className="px-3 py-2 tabular-nums text-[#1A2B1C]">{formatBRL(lancamento.valor)}</td>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.cod_plano_contas ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getEgestorStatusClasses(lancamento.status)}`}>
                        {getEgestorStatusLabel(lancamento)}
                      </span>
                      {lancamento.validacao_mensagem && <p className="mt-1 text-[11px] text-[#991B1B]">{lancamento.validacao_mensagem}</p>}
                      {lancamento.anexo_mensagem && <p className="mt-1 text-[11px] text-[#92400E]">{lancamento.anexo_mensagem}</p>}
                      {lancamento.revalidacao_status && (
                        <p className={`mt-1 text-[11px] ${lancamento.revalidacao_status === "ok" ? "text-[#166534]" : "text-[#991B1B]"}`}>
                          {lancamento.revalidacao_status === "ok" ? "Revalidado" : "Falha na revalidação"}: {lancamento.revalidacao_mensagem ?? lancamento.revalidacao_status}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(egestorEnvios.length > 0 || statusEventos.length > 0) && (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {egestorEnvios.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-[#EEF1EE]">
                <div className="flex items-center gap-2 border-b border-[#EEF1EE] bg-[#F8FAF8] px-3 py-2">
                  <History size={14} className="text-[#2D8C3A]" />
                  <h4 className="text-[13px] font-bold text-[#1A2B1C]">Envios eGestor</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-white text-[11px] uppercase tracking-wide text-[#6B7F6E]">
                      <tr>
                        {["Data", "Ação", "Status", "Erro"].map((header) => (
                          <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1EE]">
                      {egestorEnvios.map((envio) => (
                        <tr key={envio.id}>
                          <td className="px-3 py-2 text-[12px] text-[#3D4F3F]">{formatDateTimeBR(envio.criado_em)}</td>
                          <td className="px-3 py-2 font-medium text-[#1A2B1C]">{envio.acao}</td>
                          <td className="px-3 py-2 text-[#3D4F3F]">{envio.status}</td>
                          <td className={`px-3 py-2 text-[12px] ${envio.erro ? "text-[#991B1B]" : "text-[#6B7F6E]"}`}>{envio.erro ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {statusEventos.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-[#EEF1EE]">
                <div className="flex items-center gap-2 border-b border-[#EEF1EE] bg-[#F8FAF8] px-3 py-2">
                  <ShieldCheck size={14} className="text-[#2D8C3A]" />
                  <h4 className="text-[13px] font-bold text-[#1A2B1C]">Auditoria do fechamento</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-white text-[11px] uppercase tracking-wide text-[#6B7F6E]">
                      <tr>
                        {["Data", "Status", "Usuário", "Motivo"].map((header) => (
                          <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1EE]">
                      {statusEventos.map((evento) => (
                        <tr key={evento.id}>
                          <td className="px-3 py-2 text-[12px] text-[#3D4F3F]">{formatDateTimeBR(evento.criado_em)}</td>
                          <td className="px-3 py-2 font-medium text-[#1A2B1C]">
                            {evento.status_anterior ?? "-"} &gt; {evento.status_novo}
                          </td>
                          <td className="px-3 py-2 text-[#3D4F3F]">{evento.usuario}</td>
                          <td className="px-3 py-2 text-[12px] text-[#6B7F6E]">{evento.motivo ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
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

      <section className="bg-white border border-[#EEF1EE] rounded-xl px-4">
        <Accordion type="multiple">
          {prestacao && (
            <AccordionItem value="document-reading">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-left">
                  <ShieldCheck size={18} className="text-[#2D8C3A]" />
                  <div>
                    <h3 className="text-[15px] font-bold text-[#1A2B1C]">Leitura do documento</h3>
                    <p className="text-[12px] font-normal text-[#6B7F6E]">Seções, estratégia e observações extraídas</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Seções identificadas</p>
                      <div className="flex flex-wrap gap-2">
                        {prestacao.plano_extracao.secoes_identificadas.map((secao) => (
                          <span key={secao} className="rounded-full bg-[#EFF7F1] border border-[#C3DEC9] px-2.5 py-1 text-[11px] text-[#1A5C24]">
                            {secao}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Estratégia de leitura</p>
                      <ul className="space-y-1">
                        {prestacao.plano_extracao.estrategia.map((item) => (
                          <li key={item} className="text-[13px] text-[#3D4F3F]">{item}</li>
                        ))}
                      </ul>
                    </div>
                    {prestacao.observacoes.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Observações</p>
                        <ul className="space-y-1">
                          {prestacao.observacoes.map((item) => (
                            <li key={item} className="text-[13px] text-[#3D4F3F]">{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-[13px]">
                    <dt className="text-[#6B7F6E]">Total das linhas</dt>
                    <dd className="text-right font-medium text-[#1A2B1C]">{formatBRL(resumo?.total_linhas_receitas ?? totalLinhas)}</dd>
                    <dt className="text-[#6B7F6E]">Comissão principal</dt>
                    <dd className="text-right font-medium text-[#1A2B1C]">{resumo?.comissao_administracao === null || resumo?.comissao_administracao === undefined ? "-" : formatBRL(resumo.comissao_administracao)}</dd>
                    <dt className="text-[#6B7F6E]">Outras comissões/despesas</dt>
                    <dd className="text-right font-medium text-[#1A2B1C]">{formatBRL(totals.total_despesas)}</dd>
                    <dt className="text-[#6B7F6E]">Total comissão + despesas</dt>
                    <dd className="text-right font-medium text-[#1A2B1C]">{formatBRL(totals.total_comissao_despesas)}</dd>
                    <dt className="text-[#6B7F6E]">Recebidos locador</dt>
                    <dd className="text-right font-bold text-[#1A2B1C]">{formatBRL(totals.total_receitas)}</dd>
                    <dt className="text-[#6B7F6E]">Total a repassar</dt>
                    <dd className="text-right font-bold text-[#1A2B1C]">{formatBRL(totals.total_a_repassar)}</dd>
                  </dl>
                </div>

                {outrasComissoesDespesas.length > 0 && (
                  <div className="mt-5 border-t border-[#EEF1EE] pt-4">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Outras comissões e despesas no resumo</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {outrasComissoesDespesas.map((item) => (
                        <div key={`${item.descricao}-${item.valor}`} className="flex justify-between gap-3 rounded-lg border border-[#EEF1EE] px-3 py-2">
                          <span className="text-[13px] text-[#3D4F3F]">{item.descricao}</span>
                          <span className="text-[13px] font-bold text-[#1A2B1C] tabular-nums">{formatBRL(item.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="processed-documents" className="last:border-b-0">
            <AccordionTrigger className="py-4 hover:no-underline">
              <div className="flex items-center gap-2 text-left">
                <FileText size={18} className="text-[#2D8C3A]" />
                <div>
                  <h3 className="text-[15px] font-bold text-[#1A2B1C]">Documentos processados</h3>
                  <p className="text-[12px] font-normal text-[#6B7F6E]">{documents.length} arquivo(s) vinculados ao fechamento</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                {documents.map((document) => (
                  <div key={document.fileName} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1A2B1C]">{document.fileName}</p>
                      <p className="text-[12px] text-[#6B7F6E]">{document.reason}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] font-medium text-[#3D4F3F]">{document.documentType}</p>
                      <p className="text-[12px] text-[#6B7F6E]">Qualidade da leitura {Math.round(document.confidence * 100)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

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
            onClick={() => runEgestorAction("approve")}
            disabled={hasBlocking || isApproved || egestorAction !== "idle"}
            className={`h-10 px-4 rounded-lg bg-[#2D8C3A] text-white text-[14px] font-medium inline-flex items-center gap-2 ${
              hasBlocking || isApproved ? "opacity-60 cursor-not-allowed pointer-events-none" : "hover:bg-[#1A5C24]"
            }`}
          >
            <CheckCircle size={14} />
            {isApproved ? "Fechamento aprovado" : egestorAction === "approving" ? "Aprovando..." : "Aprovar fechamento"}
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
