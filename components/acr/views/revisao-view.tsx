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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ResolveConflictModal } from "@/components/acr/resolve-conflict-modal"
import { ImovelHistoricoDrawer } from "./imovel-historico-drawer"

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
    empreendimento_id?: string
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

// Faixa lateral colorida do card de parecer (em vez de tingir o card inteiro).
function getOpinionAccentClass(status: TechnicalOpinion["status"]) {
  if (status === "aprovado_tecnico") return "border-l-[#22C55E]"
  if (status === "aprovado_com_ressalvas") return "border-l-[#F59E0B]"
  return "border-l-[#DC2626]"
}

type RepasseTone = "ok" | "alerta" | "divergente" | "pendente"

// O tom do número-herói vem APENAS da conciliação do repasse (recheck dedicado +
// diferença), nunca de um bloqueio não-relacionado. Assim o valor correto não
// aparece vermelho só porque falta um documento ou uma regra de comissão.
function getRepasseConciliacao(
  rechecks: PrestacaoRecheck[],
  totals: PackageAnalysis["totals"],
): { tone: RepasseTone; message: string } {
  if (totals.valor_comprovado === null) {
    return { tone: "pendente", message: "Comprovante de repasse ainda não conciliado." }
  }
  const check = rechecks.find((c) => c.id === "repasse_conciliation")
  const diff = totals.diferenca_repasse
  const tone: RepasseTone =
    check?.status === "passed"
      ? "ok"
      : check?.status === "warning"
        ? "alerta"
        : check?.status === "failed"
          ? "divergente"
          : diff === null
            ? "pendente"
            : diff <= 0.01
              ? "ok"
              : diff <= 5
                ? "alerta"
                : "divergente"
  if (tone === "ok")
    return {
      tone,
      message: totals.repasse_embutido
        ? "Repasse conforme o total do próprio extrato (sem comprovante separado)."
        : "Repasse conciliado com o comprovante bancário.",
    }
  if (tone === "alerta") return { tone, message: `Diferença de ${formatBRL(diff ?? 0)} dentro da tolerância — confira.` }
  if (tone === "divergente") return { tone, message: `Divergência de ${formatBRL(diff ?? 0)} entre o cálculo e o comprovante.` }
  return { tone, message: "Comprovante de repasse ainda não conciliado." }
}

function getHeroToneClasses(tone: RepasseTone) {
  if (tone === "alerta") return { card: "border-[#FDE68A] bg-[#FFFBEB]", value: "text-[#B45309]" }
  if (tone === "divergente") return { card: "border-[#FCA5A5] bg-[#FEF2F2]", value: "text-[#DC2626]" }
  return { card: "border-[#BFE4C7] bg-[#F4F9F5]", value: "text-[#2D8C3A]" }
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

// Linha de INTERMEDIACAO na tabela (apto com observacao 'INTERMEDIACAO'): tem
// categoria propria (tabela de Intermediacao). Nao e alugada, vaga nem inadimplente.
function isIntermediacaoRow(row: ReceitaPorImovel) {
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return /intermedia/.test(text)
}

function isVacantRow(row: ReceitaPorImovel) {
  if (isAirbnbRow(row) || isIntermediacaoRow(row)) return false
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  if (/\b(vago|vacancia|vacância|disponivel|disponível)\b/.test(text)) return true
  // Unidade que recebeu aluguel (ou tem total > 0) NAO e vaga, mesmo sem o nome
  // do inquilino na linha — no extrato consolidado (Cesar Rego) o inquilino vem
  // como agrupador e nem sempre e preenchido por linha. So tratamos inquilino
  // vazio como vacancia quando tambem nao ha receita na linha.
  if ((row.aluguel ?? 0) > 0 || row.total > 0) return false
  return isInquilinoVazio(row.inquilino)
}

function isDelinquentRow(row: ReceitaPorImovel) {
  if (isAirbnbRow(row) || isIntermediacaoRow(row)) return false
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return !isVacantRow(row) && ((row.aluguel === null || row.aluguel === 0) || /inadimpl/.test(text))
}

function isRentedCurrentRow(row: ReceitaPorImovel) {
  return !isAirbnbRow(row) && !isIntermediacaoRow(row) && !isVacantRow(row) && !isDelinquentRow(row)
}

// Linha explicitamente marcada como INADIMPLENCIA (vigencia do mes nao paga). Um
// acordo de mes anterior (ex.: pagou abril) nao descaracteriza essa inadimplencia.
function isExplicitInadimplencia(row: ReceitaPorImovel) {
  if (isAirbnbRow(row)) return false
  const text = `${row.inquilino ?? ""} ${row.observacao ?? ""}`.toLowerCase()
  return /inadimpl/.test(text)
}

function getRowBadge(row: ReceitaPorImovel, acordoAptos: Set<string> = new Set()) {
  if (isAirbnbRow(row)) {
    return {
      label: "Aplicativo",
      classes: "border-[#99F6E4] bg-[#CCFBF1] text-[#0F766E]",
    }
  }

  if (isIntermediacaoRow(row)) {
    return {
      label: "Intermediação",
      classes: "border-[#E9D5FF] bg-[#F3E8FF] text-[#7C3AED]",
    }
  }

  if (isVacantRow(row)) {
    return {
      label: "Vago",
      classes: "border-[#D5DDD6] bg-[#EEF1EE] text-[#6B7F6E]",
    }
  }

  if (isDelinquentRow(row)) {
    // Linha marcada INADIMPLENCIA e sempre inadimplente, mesmo que o apto tenha um
    // acordo (de mes anterior) recebido no mes — sao competencias distintas.
    if (acordoAptos.has(aptoKey(row.apto)) && !isExplicitInadimplencia(row)) {
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

// Linha de uma pendência (bloqueio, alerta ou resolvido). Extraída para reuso
// nos três grupos da seção de pendências.
function RecheckRow({
  check,
  onResolve,
  onRefresh,
}: {
  check: PrestacaoRecheck
  onResolve: (check: PrestacaoRecheck) => void
  onRefresh?: () => void
}) {
  const isResolved = isResolvedCheck(check)
  return (
    <div className="flex items-start justify-between gap-4 py-3">
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
        {!isResolved &&
          (check.databaseId ? (
            <button
              onClick={() => onResolve(check)}
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
          ))}
      </div>
    </div>
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

// Percentual de intermediação: usa o impresso no documento; quando ausente,
// calcula a taxa retida sobre a base (comissão ÷ valor).
function intermediacaoPercentDe(item: AcordoRescisaoRecebido) {
  if (typeof item.percentual === "number") return item.percentual
  if (typeof item.comissao === "number" && item.valor > 0) {
    return Math.round((item.comissao / item.valor) * 10000) / 100
  }
  return null
}

// Rotulo do tipo de recebimento do mes. "atraso" = aluguel de mes anterior
// quitado agora (inadimplencia paga); distinto de acordo/rescisao negociados.
function labelTipoAcordo(tipo: AcordoRescisaoRecebido["tipo"]) {
  switch (tipo) {
    case "atraso":
      return "Inadimplência paga"
    case "intermediacao":
      return "Intermediação"
    case "rescisao":
      return "Rescisão"
    case "acordo":
      return "Acordo"
    default:
      return "Outro"
  }
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
  const [historicoUnidade, setHistoricoUnidade] = useState<string | null>(null)

  const [comentario, setComentario] = useState(fechamento?.comentario_operador ?? "")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [egestorAction, setEgestorAction] = useState<"idle" | "approving" | "previewing" | "sending" | "retrying" | "revalidating">("idle")
  const [egestorError, setEgestorError] = useState<string | null>(null)
  const [editandoDescricaoId, setEditandoDescricaoId] = useState<string | null>(null)
  const [descricaoEdicao, setDescricaoEdicao] = useState("")
  const [salvandoDescricao, setSalvandoDescricao] = useState(false)

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
  const actionableRechecks = rechecks.filter(isActionableWarning)
  const failedRechecks = actionableRechecks.filter((check) => check.status === "failed" && !isResolvedCheck(check))
  const warningRechecks = actionableRechecks.filter((check) => check.status === "warning" && !isResolvedCheck(check))
  const validationSummary = getValidationSummary(rechecks)
  const hasBlocking = validationSummary.blocked > 0
  const isApproved = ["aprovado", "preparado_egestor", "lancado_egestor", "erro_egestor"].includes(fechamento?.status ?? "")
  const canPreviewEgestor = isApproved && !hasBlocking
  const canSendEgestor = canPreviewEgestor && egestorLancamentos.length > 0 && egestorLancamentos.every((l) => l.status === "validado")
  const hasSentEgestor = egestorLancamentos.some((l) => l.egestor_codigo !== null)
  const hasPendingAnexos = egestorLancamentos.some((l) => l.anexo_status === "pendente")
  const repasseConciliacao = getRepasseConciliacao(rechecks, totals)
  const heroTone = getHeroToneClasses(repasseConciliacao.tone)
  const bannerState: "blocked" | "warning" | "ok" = hasBlocking ? "blocked" : validationSummary.warnings > 0 ? "warning" : "ok"
  const resolvedRechecks = actionableRechecks.filter(isResolvedCheck)
  const pendenciasDefault = failedRechecks.length > 0 ? ["bloqueios"] : warningRechecks.length > 0 ? ["alertas"] : []

  const openResolve = (check: PrestacaoRecheck) => {
    setActiveValidation({
      id: check.databaseId || "",
      fechamento_id: fechamentoId,
      tipo_validacao: check.id,
      mensagem: check.message,
      valor_esperado: check.expected ?? null,
      valor_encontrado: check.actual ?? null,
      diferenca: check.difference ?? null,
    })
    setIsResolveModalOpen(true)
  }

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

  function iniciarEdicaoDescricao(lancamentoId: string, descricaoAtual: string) {
    setEgestorError(null)
    setEditandoDescricaoId(lancamentoId)
    setDescricaoEdicao(descricaoAtual)
  }

  async function salvarDescricaoEgestor(lancamentoId: string) {
    setSalvandoDescricao(true)
    setEgestorError(null)
    const response = await fetch(`/api/fechamentos/${fechamentoId}/egestor/lancamentos/${lancamentoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descricao: descricaoEdicao }),
    })
    const payload = await response.json()
    setSalvandoDescricao(false)
    if (!response.ok || payload.error) {
      setEgestorError(payload.error ?? "Falha ao editar a descrição.")
      return
    }
    setEditandoDescricaoId(null)
    if (onRefresh) await onRefresh()
  }

  const empreendimentoNome = fechamento?.empreendimentos?.nome ?? prestacao?.empreendimento ?? "Empreendimento não identificado"
  const empreendimentoId = fechamento?.empreendimento_id ?? null
  const imobiliariaNome = fechamento?.imobiliarias?.nome ?? prestacao?.imobiliaria ?? "Imobiliária não identificada"
  const competencia = prestacao?.competencia ?? fechamento?.competencia ?? "Competência não identificada"
  const competenciaMesAno = competenciaParaMesAno(prestacao?.competencia ?? fechamento?.competencia)
  const title = `${empreendimentoNome} - ${competencia}`
  const resumo = prestacao?.resumo_financeiro
  const linhasImoveis = prestacao?.receitas_por_imovel ?? []
  const acordosRescisoesRecebidosTodos = prestacao?.acordos_rescisoes_recebidos ?? []
  // Intermediacao tem categoria propria (tabela separada acima das receitas).
  const intermediacoes = acordosRescisoesRecebidosTodos.filter((item) => item.tipo === "intermediacao")
  // Acordos/rescisoes "puros" (sem intermediacao) para a tabela de acordos.
  const acordosRescisoesRecebidos = acordosRescisoesRecebidosTodos.filter((item) => item.tipo !== "intermediacao")
  // Aptos quitados via acordo/rescisao do PROPRIO mes nao contam como inadimplentes;
  // acordos de competencia anterior (ex.: pagou abril, devendo maio) NAO removem a inadimplencia.
  const acordoAptos = new Set(acordosRescisoesRecebidos.map((item) => aptoKey(item.apto)).filter(Boolean))
  // #3: comissao retida nos acordos/rescisoes do mes soma-se a comissao de administracao.
  const acordosComissao = acordosRescisoesRecebidos.reduce((sum, item) => sum + (item.comissao ?? 0), 0)
  // Totais para o rodape da tabela de acordos (espelha o TOTAL impresso no documento).
  const acordosValorTotal = acordosRescisoesRecebidos.reduce((sum, item) => sum + (item.valor ?? 0), 0)
  const acordosRepasseTotal = acordosValorTotal - acordosComissao
  // Total da intermediacao (taxa retida) e seu percentual, quando houver.
  const intermediacaoValor = intermediacoes.reduce((sum, item) => sum + (item.comissao ?? item.valor ?? 0), 0)
  const intermediacaoPercent = (() => {
    for (const item of intermediacoes) {
      const p = intermediacaoPercentDe(item)
      if (p !== null) return p
    }
    return null
  })()
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
  // A intermediação tem categoria própria (acima das receitas). Quando ela aparece
  // dentro de outras_comissoes_despesas (dado antigo), removemos da lista/contagem
  // de "outras despesas" — o total monetario do documento ja a desconsidera.
  const outrasDespesasExibicao = outrasComissoesDespesas.filter((d) => !/intermedia/i.test(d.descricao))
  // Intermediação: categoria própria (acordos tipo "intermediacao"). Fallback para
  // dado antigo que ainda trazia intermediação dentro de outras_comissoes_despesas.
  const intermediacaoDocumento = (() => {
    if (intermediacoes.length > 0) return { percent: intermediacaoPercent, valor: intermediacaoValor }
    const item = outrasComissoesDespesas.find((d) => /intermedia/i.test(d.descricao))
    if (!item) return null
    const matchPercent = (texto: string | null | undefined) => {
      const m = texto?.match(/(\d+(?:[.,]\d+)?)\s*%/)
      return m ? Number(m[1].replace(",", ".")) : null
    }
    return { percent: matchPercent(item.descricao), valor: item.valor }
  })()
  // #3: comissão de administração exibida = total de comissões do documento (inclui a
  // comissão sobre recebimentos de acordos/atrasos). Fallback: comissão das linhas +
  // comissão dos acordos, quando o documento não trouxer o consolidado.
  const comissaoAdminExibida = resumo?.comissao_administracao ?? rowTotals.comissao + acordosComissao
  // Parte da comissão que vem além das linhas regulares (acordos/atrasos do mês).
  const comissaoOutras = Math.max(Math.round((comissaoAdminExibida - rowTotals.comissao) * 100) / 100, 0)
  const linhasAlugadas = linhasImoveis.filter(isRentedCurrentRow)
  const linhasAluguelValido = linhasAlugadas.filter((row): row is ReceitaPorImovel & { aluguel: number } => row.aluguel !== null && row.aluguel > 0)
  const mediaAluguel = linhasAluguelValido.length > 0
    ? linhasAluguelValido.reduce((sum, row) => sum + row.aluguel, 0) / linhasAluguelValido.length
    : 0
  const isInadimplenteEfetivo = (row: ReceitaPorImovel) =>
    isDelinquentRow(row) && (isExplicitInadimplencia(row) || !acordoAptos.has(aptoKey(row.apto)))
  const inadimplentes = linhasImoveis.filter(isInadimplenteEfetivo).length
  const vagos = linhasImoveis.filter(isVacantRow).length
  const airbnb = linhasImoveis.filter(isAirbnbRow).length
  // Unidades de intermediacao: contadas a parte (nao sao alugadas/vagas/inadimplentes).
  // Usa as linhas marcadas INTERMEDIACAO; se nao houver linha, cai na contagem de
  // acordos de intermediacao do mes.
  const intermediadasRows = linhasImoveis.filter(isIntermediacaoRow).length
  const intermediadas = intermediadasRows > 0 ? intermediadasRows : intermediacoes.length

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
          bannerState === "blocked"
            ? "bg-[#FEE2E2] border-[#DC2626]"
            : bannerState === "warning"
              ? "bg-[#FFFBEB] border-[#F59E0B]"
              : "bg-[#EFF7F1] border-[#2D8C3A]"
        }`}
      >
        <div className="flex items-center gap-2">
          {bannerState === "blocked" ? (
            <AlertTriangle size={18} className="text-[#DC2626] shrink-0" />
          ) : bannerState === "warning" ? (
            <AlertTriangle size={18} className="text-[#B45309] shrink-0" />
          ) : (
            <CheckCircle size={18} className="text-[#2D8C3A] shrink-0" />
          )}
          <span
            className={`text-[14px] ${
              bannerState === "blocked" ? "text-[#991B1B]" : bannerState === "warning" ? "text-[#92400E]" : "text-[#1A5C24]"
            }`}
          >
            {bannerState === "blocked"
              ? `${pluralize(validationSummary.blocked, "pendência bloqueante", "pendências bloqueantes")} a resolver antes de aprovar${
                  validationSummary.warnings > 0 ? ` · ${pluralize(validationSummary.warnings, "alerta", "alertas")}` : ""
                }.`
              : bannerState === "warning"
                ? `Sem bloqueios · ${pluralize(validationSummary.warnings, "alerta", "alertas")} para revisar antes de aprovar.`
                : "Sem pendências bloqueantes no fechamento."}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1A2B1C] tracking-tight">{title}</h1>
          <p className="text-[14px] text-[#6B7F6E] mt-1">{imobiliariaNome} - conciliação da competência</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium mt-2 border ${getOpinionClasses(parecer.status)}`}>
            {parecer.status === "aprovado_tecnico" ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
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

      <div className={`bg-white border border-[#EEF1EE] border-l-4 rounded-xl p-5 ${getOpinionAccentClass(parecer.status)}`}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#3D4F3F]" />
          <div className="flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Parecer automático</h3>
              <span className="w-fit rounded-full border border-[#D5DDD6] bg-[#F8FAF8] px-2.5 py-1 text-[12px] font-medium text-[#3D4F3F]">
                {getValidationSummaryLabel(validationSummary)}
              </span>
            </div>
            <p className="text-[13px] text-[#3D4F3F] mt-2">{getObjectiveOpinionCopy(validationSummary)}</p>
            <p className="text-[12px] text-[#6B7F6E] mt-1">
              Este resumo vem das validações automáticas do fechamento, não da confiança da IA.
            </p>
            {actionableRechecks.length > 0 && (
              <button
                type="button"
                onClick={() => document.getElementById("pendencias-revisao")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2D8C3A] hover:underline"
              >
                Ver pendências →
              </button>
            )}
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
                Intermediação {formatBRL(intermediacaoDocumento.valor)}
                {intermediacaoDocumento.percent !== null ? ` · ${formatPercent(intermediacaoDocumento.percent)}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
            {/* Equação de fluxo: Receitas − Comissão − Intermediação − Despesas = Repasse */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-3 rounded-xl border border-[#EEF1EE] bg-[#F8FAF8] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2D8C3A]">Receitas</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#2D8C3A]">{formatBRL(totals.total_receitas)}</p>
                <p className="text-[11px] text-[#6B7F6E]">Em nome do locador</p>
              </div>
              <span className="px-1 text-[18px] font-light text-[#A0B2A3]">−</span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4F46E5]">Comissão</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#4F46E5]">{formatBRL(comissaoAdminExibida)}</p>
                <p className="text-[11px] text-[#6B7F6E]">{formatPercent(comissaoRealizadaPercent)} realizada</p>
              </div>
              {intermediacaoDocumento && intermediacaoDocumento.valor > 0 && (
                <>
                  <span className="px-1 text-[18px] font-light text-[#A0B2A3]">−</span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7C3AED]">Intermediação</p>
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#7C3AED]">{formatBRL(intermediacaoDocumento.valor)}</p>
                    <p className="text-[11px] text-[#6B7F6E]">{intermediacaoDocumento.percent !== null ? `${formatPercent(intermediacaoDocumento.percent)} retida` : "taxa retida"}</p>
                  </div>
                </>
              )}
              <span className="px-1 text-[18px] font-light text-[#A0B2A3]">−</span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#D97706]">Despesas</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#D97706]">{formatBRL(totals.total_despesas)}</p>
                <p className="text-[11px] text-[#6B7F6E]">{outrasDespesasExibicao.length} item(ns)</p>
              </div>
              <span className="px-1 text-[18px] font-light text-[#A0B2A3]">=</span>
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${hasBlocking ? "text-[#DC2626]" : "text-[#2D8C3A]"}`}>Repasse</p>
                <p className={`mt-0.5 text-[15px] font-bold tabular-nums ${hasBlocking ? "text-[#DC2626]" : "text-[#2D8C3A]"}`}>{formatBRL(totals.total_a_repassar)}</p>
                <p className="text-[11px] text-[#6B7F6E]">
                  {totals.diferenca_repasse === null
                    ? "Comprovante pendente"
                    : totals.diferenca_repasse === 0
                    ? "Comprovante confere"
                    : `Diferença: ${formatBRL(totals.diferenca_repasse)}`}
                </p>
              </div>
            </div>

            {/* Três grupos: Receitas | Comissão | Despesas */}
            {linhasImoveis.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Receitas */}
                <div className="rounded-xl border border-[#EEF1EE] bg-white p-4" style={{ borderTop: "2px solid #2D8C3A" }}>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#2D8C3A]">Receitas</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Aluguel</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_aluguel ?? rowTotals.aluguelComDesconto)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Garagem</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_garagem ?? rowTotals.garagem)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Água</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_agua ?? rowTotals.agua)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">IPTU</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_iptu ?? rowTotals.iptu)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Seguro incêndio</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_seguro_incendio ?? rowTotals.seguro)}</span>
                    </div>
                  </div>
                </div>

                {/* Comissão */}
                <div className="rounded-xl border border-[#EEF1EE] bg-white p-4" style={{ borderTop: "2px solid #4F46E5" }}>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4F46E5]">Comissão de administração</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Taxa realizada</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatPercent(comissaoRealizadaPercent)}</span>
                    </div>
                    {taxaAdministracao && (
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#6B7F6E]">Taxa cadastrada</span>
                        <span className="font-medium tabular-nums text-[#1A2B1C]">{formatPercent(taxaAdministracao)}</span>
                      </div>
                    )}
                    {comissaoCalculada !== null && (
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#6B7F6E]">Valor calculado</span>
                        <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(comissaoCalculada)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Comissão das linhas</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{formatBRL(rowTotals.comissao)}</span>
                    </div>
                    {comissaoOutras > 0 && (
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#6B7F6E]">Comissão de acordos/atrasos</span>
                        <span className="font-medium tabular-nums text-[#1A2B1C]">+ {formatBRL(comissaoOutras)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-[#EEF1EE] pt-2.5 text-[13px]">
                    <span className="font-semibold text-[#4F46E5]">Abatido do repasse</span>
                    <span className="font-bold tabular-nums text-[#4F46E5]">− {formatBRL(comissaoAdminExibida)}</span>
                  </div>
                </div>

                {/* Despesas */}
                <div className="rounded-xl border border-[#EEF1EE] bg-white p-4" style={{ borderTop: "2px solid #D97706" }}>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#D97706]">Outras despesas</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Itens no resumo</span>
                      <span className="font-medium tabular-nums text-[#1A2B1C]">{outrasDespesasExibicao.length}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B7F6E]">Diferença cálculo x comprovante</span>
                      <span className={`font-medium tabular-nums ${totals.diferenca_repasse ? "text-[#DC2626]" : "text-[#2D8C3A]"}`}>
                        {totals.diferenca_repasse === null ? "—" : formatBRL(totals.diferenca_repasse)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-[#EEF1EE] pt-2.5 text-[13px]">
                    <span className="font-semibold text-[#D97706]">Abatido do repasse</span>
                    <span className="font-bold tabular-nums text-[#D97706]">− {formatBRL(totals.total_despesas)}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Fallback sem linhas de imóveis */
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Comissão admin." value={formatBRL(rowTotals.comissao)} subtext={`${formatPercent(comissaoRealizadaPercent)} realizada`} tooltip={taxaAdministracao ? `Taxa cadastrada: ${formatPercent(taxaAdministracao ?? 0)}\nBase de cálculo (total): ${formatBRL(baseComissao ?? 0)}\nValor calculado: ${formatBRL(comissaoCalculada ?? 0)}` : "Comissão das linhas da tabela ÷ total da tabela."} />
                <MetricTile label="Outras despesas" value={formatBRL(totals.total_despesas)} subtext={`${outrasDespesasExibicao.length} item(ns) no resumo`} tooltip="Soma de outras retenções ou despesas, descontadas do repasse final." />
                <MetricTile label="Comissão + despesas" value={formatBRL(totals.total_comissao_despesas)} subtext="Total abatido do repasse" tooltip="Valor consolidado retido pela imobiliária antes de efetuar o repasse." />
                <MetricTile
                  label="Diferença"
                  value={totals.diferenca_repasse === null ? "-" : formatBRL(totals.diferenca_repasse)}
                  tone={totals.diferenca_repasse ? "danger" : "positive"}
                  subtext="Entre cálculo e comprovante"
                  tooltip="Diferença entre o Total a Repassar (calculado) e o valor pago encontrado no comprovante de repasse."
                />
              </div>
            )}
            </div>

            {/* Lateral: total a repassar + recebido (conforme o layout aprovado) */}
            <aside className="space-y-4">
              <div className={`rounded-xl border p-5 ${heroTone.card}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Total a repassar</p>
                <p className={`mt-2 text-[30px] font-bold leading-none tabular-nums ${heroTone.value}`}>
                  {formatBRL(totals.total_a_repassar)}
                </p>
                <div className="mt-3 flex items-start gap-1.5">
                  {repasseConciliacao.tone === "ok" ? (
                    <CheckCircle size={14} className="mt-0.5 shrink-0 text-[#2D8C3A]" />
                  ) : repasseConciliacao.tone === "pendente" ? (
                    <Info size={14} className="mt-0.5 shrink-0 text-[#6B7F6E]" />
                  ) : (
                    <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${repasseConciliacao.tone === "divergente" ? "text-[#DC2626]" : "text-[#B45309]"}`} />
                  )}
                  <p className="text-[13px] leading-relaxed text-[#3D4F3F]">{repasseConciliacao.message}</p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[#6B7F6E]">
                  {totals.valor_comprovado !== null ? `Comprovante: ${formatBRL(totals.valor_comprovado)} · ` : ""}
                  Data do repasse: <span className="font-semibold text-[#1A2B1C]">{formatDateBR(repasse?.data)}</span>
                </p>
              </div>

              <div className="rounded-xl border border-[#EEF1EE] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Recebido</p>
                <p className="mt-2 text-[24px] font-bold leading-none tabular-nums text-[#1A2B1C]">{formatBRL(totals.total_receitas)}</p>
                <p className="mt-1 text-[12px] text-[#6B7F6E]">Em nome do locador</p>
              </div>
            </aside>
          </div>

          {linhasImoveis.length > 0 && (
            <div className="space-y-3">
              <SectionTitle title="Situação das unidades" description="Aluguel ativo, inadimplência, vacância, aplicativos e intermediação são contagens separadas." />
              <div className={`grid grid-cols-2 gap-3 md:grid-cols-6 ${intermediadas > 0 ? "lg:grid-cols-7" : ""}`}>
                <MetricTile label="Alugadas" value={`${linhasAlugadas.length}`} subtext="Com cobrança ativa" tone="positive" />
                <MetricTile label="Inadimplentes" value={`${inadimplentes}`} subtext="Aluguel zerado/obs" tone={inadimplentes > 0 ? "danger" : "default"} />
                <MetricTile label="Aptos vagos" value={`${vagos}`} subtext="Disponíveis" tone={vagos > 0 ? "warning" : "default"} />
                <MetricTile label="Aplicativos" value={`${airbnb}`} subtext="Não contam como vagos" />
                {intermediadas > 0 && (
                  <MetricTile label="Intermediação" value={`${intermediadas}`} subtext="Categoria à parte" />
                )}
                <MetricTile label="Vagas garagem" value={`${vagasTotais}`} subtext="Total de vagas" />
                <MetricTile
                  label="Aluguel médio"
                  value={linhasAluguelValido.length > 0 ? formatBRL(mediaAluguel) : "-"}
                  subtext={`${linhasAluguelValido.length} unidade(s) com valor`}
                />
              </div>
              {inadimplenciasAcumuladas.length > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-[#FEF2F2] px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#DC2626]">Inadimplência acumulada</p>
                    <p className="mt-0.5 text-[12px] text-[#991B1B]">{inadimplenciasAcumuladas.length} débito(s) de meses anteriores</p>
                  </div>
                  <p className="text-[20px] font-bold tabular-nums text-[#DC2626]">{formatBRL(totalInadimplenciaAcumulada)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section id="pendencias-revisao" className={`bg-white border rounded-xl px-4 ${hasBlocking ? "border-[#DC2626]" : "border-[#D5DDD6]"}`}>
        {actionableRechecks.length > 0 ? (
          <Accordion type="multiple" defaultValue={pendenciasDefault}>
            {failedRechecks.length > 0 && (
              <AccordionItem value="bloqueios" className="border-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex w-full items-center gap-3">
                    <AlertTriangle size={16} className="text-[#DC2626]" />
                    <div className="min-w-0 text-left">
                      <h3 className="text-[14px] font-bold leading-tight text-[#1A2B1C]">Bloqueios</h3>
                      <p className="text-[12px] font-normal leading-tight text-[#6B7F6E]">Impedem a aprovação — resolva primeiro</p>
                    </div>
                    <span className="ml-auto mr-2 inline-flex h-7 shrink-0 items-center rounded-full bg-[#FEE2E2] px-3 text-[12px] font-semibold text-[#991B1B]">
                      {pluralize(failedRechecks.length, "bloqueio", "bloqueios")}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                    {failedRechecks.map((check, index) => (
                      <div key={check.id} className={index === 0 ? "border-l-2 border-[#DC2626] bg-[#FEF2F2] pl-3" : ""}>
                        {index === 0 && (
                          <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-[#DC2626]">Resolva primeiro</p>
                        )}
                        <RecheckRow check={check} onResolve={openResolve} onRefresh={onRefresh} />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            {warningRechecks.length > 0 && (
              <AccordionItem value="alertas" className="border-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex w-full items-center gap-3">
                    <AlertTriangle size={16} className="text-[#F59E0B]" />
                    <div className="min-w-0 text-left">
                      <h3 className="text-[14px] font-bold leading-tight text-[#1A2B1C]">Alertas</h3>
                      <p className="text-[12px] font-normal leading-tight text-[#6B7F6E]">Revise antes de aprovar — não bloqueiam</p>
                    </div>
                    <span className="ml-auto mr-2 inline-flex h-7 shrink-0 items-center rounded-full bg-[#FEF3C7] px-3 text-[12px] font-semibold text-[#92400E]">
                      {pluralize(warningRechecks.length, "alerta", "alertas")}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                    {warningRechecks.map((check) => (
                      <RecheckRow key={check.id} check={check} onResolve={openResolve} onRefresh={onRefresh} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            {resolvedRechecks.length > 0 && (
              <AccordionItem value="resolvidos" className="border-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex w-full items-center gap-3">
                    <CheckCircle size={16} className="text-[#2D8C3A]" />
                    <div className="min-w-0 text-left">
                      <h3 className="text-[14px] font-bold leading-tight text-[#1A2B1C]">Resolvidos</h3>
                      <p className="text-[12px] font-normal leading-tight text-[#6B7F6E]">Pendências já justificadas</p>
                    </div>
                    <span className="ml-auto mr-2 inline-flex h-7 shrink-0 items-center rounded-full bg-[#E6F4EA] px-3 text-[12px] font-semibold text-[#137333]">
                      {pluralize(resolvedRechecks.length, "resolvido", "resolvidos")}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                    {resolvedRechecks.map((check) => (
                      <RecheckRow key={check.id} check={check} onResolve={openResolve} onRefresh={onRefresh} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        ) : (
          <p className="py-3 text-[13px] text-[#3D4F3F]">
            Nenhuma pendência financeira ou ausência de documento obrigatório foi encontrada.
          </p>
        )}
      </section>

      {intermediacoes.length > 0 && (
        <section className="bg-white rounded-xl border border-[#E9D5FF] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EEF1EE] bg-[#FAF5FF] p-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#1A2B1C]">Intermediação</h3>
              <p className="text-[12px] text-[#6B7F6E]">Comissão de intermediação recebida no mês — categoria separada das receitas e da inadimplência</p>
            </div>
            <span className="text-[13px] font-semibold text-[#7C3AED] tabular-nums">{formatBRL(intermediacaoValor)}</span>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                  {["Apto", "Inquilino", "Valor recebido", "Comissão interm.", "%", "Competência", "Obs"].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intermediacoes.map((item, index) => (
                  <tr key={`interm-${item.apto}-${item.inquilino}-${index}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#FAF5FF]">
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.apto ?? "-"}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.inquilino ?? "-"}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-[#1A2B1C]">{formatBRL(item.valor)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-[#7C3AED]">{typeof item.comissao === "number" ? formatBRL(item.comissao) : "-"}</td>
                    <td className="px-4 py-3 tabular-nums text-[#3D4F3F]">{formatPercent(intermediacaoPercentDe(item))}</td>
                    <td className="px-4 py-3 text-[#3D4F3F]">{item.competencia_recebimento ?? item.competencia_original ?? competencia}</td>
                    <td className="max-w-[320px] px-4 py-3 text-[12px] leading-snug text-[#6B7F6E]">{item.observacao ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
                    {status === "airbnb" ? "Aplicativos" : status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F8FAF8] border-b border-[#EEF1EE]">
                {["Apto", "Inquilino", "Aluguel", "Valor c/ desc.", "Garagem (R$)", "Vagas", "Água", "IPTU", "Seg. inc.", "Total", "Comissão", "Repasse", "Ref.", "Obs"].map((header) => (
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
                    <td className="px-4 py-3.5 text-[#1A2B1C] font-medium">
                      {empreendimentoId && row.apto?.trim() ? (
                        <button
                          onClick={() => setHistoricoUnidade(row.apto)}
                          className="text-[#2D8C3A] hover:underline"
                          title="Ver histórico do imóvel"
                        >
                          {row.apto}
                        </button>
                      ) : (
                        row.apto
                      )}
                    </td>
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
                  <td colSpan={14} className="px-4 py-8 text-center text-[13px] text-[#6B7F6E]">Nenhum imóvel encontrado para os filtros atuais.</td>
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
            <span className="text-[13px] text-[#6B7F6E]">{pluralize(acordosRescisoesRecebidos.length, "item", "itens")}</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                  {["Tipo", "Apto", "Inquilino", "Competência original", "Valor", "Comissão", "Repasse", "Recebido em", "Obs"].map((header) => (
                    <th key={header} className={`px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E] ${["Valor", "Comissão", "Repasse"].includes(header) ? "text-right" : "text-left"}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acordosRescisoesRecebidos.map((item, index) => {
                  const temComissao = typeof item.comissao === "number"
                  const repasse = temComissao ? item.valor - (item.comissao ?? 0) : null
                  return (
                    <tr key={`${item.tipo}-${item.inquilino}-${item.valor}-${index}`} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                      <td className="px-4 py-3 font-medium text-[#1A2B1C]">{labelTipoAcordo(item.tipo)}</td>
                      <td className="px-4 py-3 text-[#3D4F3F]">
                        {empreendimentoId && item.apto?.trim() ? (
                          <button onClick={() => setHistoricoUnidade(item.apto as string)} className="text-[#2D8C3A] hover:underline" title="Ver histórico do imóvel">
                            {item.apto}
                          </button>
                        ) : (
                          item.apto ?? "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#3D4F3F]">{item.inquilino ?? "-"}</td>
                      <td className="px-4 py-3 text-[#3D4F3F]">{item.competencia_original ?? "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1A2B1C]">{formatBRL(item.valor)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3D4F3F]">{temComissao ? formatBRL(item.comissao ?? 0) : "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A2B1C]">{repasse !== null ? formatBRL(repasse) : "-"}</td>
                      <td className="px-4 py-3 text-[#3D4F3F]">{item.competencia_recebimento ?? competencia}</td>
                      <td className="max-w-[320px] px-4 py-3 text-[12px] leading-snug text-[#6B7F6E]">{item.observacao ?? "-"}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="border-t border-[#EEF1EE] bg-[#F8FAF8] font-semibold text-[#1A2B1C]">
                  <td className="px-4 py-3" colSpan={4}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(acordosValorTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{acordosComissao > 0 ? formatBRL(acordosComissao) : "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{acordosComissao > 0 ? formatBRL(acordosRepasseTotal) : "-"}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
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
            <p className="text-[13px] text-[#991B1B]">Comprovante não extraído no pacote real.</p>
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={!canSendEgestor || egestorAction !== "idle" || hasSentEgestor}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2D8C3A] px-3 text-[13px] font-medium text-white hover:bg-[#1A5C24] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Send size={14} />
                    {hasSentEgestor ? "Enviado" : egestorAction === "sending" ? "Enviando..." : "Enviar ao eGestor"}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar envio ao eGestor</AlertDialogTitle>
                    <AlertDialogDescription>
                      {pluralize(egestorLancamentos.length, "lançamento será enviado", "lançamentos serão enviados")} ao eGestor, somando{" "}
                      {formatBRL(egestorLancamentos.reduce((sum, l) => sum + l.valor, 0))}. Esta ação é externa e não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => runEgestorAction("send")}
                      className="bg-[#2D8C3A] hover:bg-[#1A5C24]"
                    >
                      Confirmar envio
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
                <tr>
                  {["Tipo", "Categoria", "Descrição", "Valor", "Conta de origem", "Etiquetas", "Contato", "Plano", "Status"].map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1EE]">
                {egestorLancamentos.map((lancamento) => (
                  <tr key={lancamento.id}>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.tipo}</td>
                    <td className="px-3 py-2 font-medium text-[#1A2B1C]">{lancamento.categoria}</td>
                    <td className="px-3 py-2 text-[#3D4F3F]">
                      {editandoDescricaoId === lancamento.id ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="text"
                            maxLength={200}
                            autoFocus
                            value={descricaoEdicao}
                            onChange={(e) => setDescricaoEdicao(e.target.value)}
                            className="w-full min-w-[220px] rounded-md border border-[#BBD6BE] px-2 py-1 text-[13px] focus:border-[#2D8C3A] focus:outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => salvarDescricaoEgestor(lancamento.id)}
                              disabled={salvandoDescricao || descricaoEdicao.trim().length === 0}
                              className="rounded-md bg-[#2D8C3A] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              {salvandoDescricao ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoDescricaoId(null)}
                              disabled={salvandoDescricao}
                              className="rounded-md px-2 py-1 text-[11px] font-medium text-[#6B7F6E] hover:text-[#1A2B1C]"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="flex-1">{lancamento.descricao}</span>
                          {lancamento.egestor_codigo == null && (
                            <button
                              type="button"
                              onClick={() => iniciarEdicaoDescricao(lancamento.id, lancamento.descricao)}
                              className="shrink-0 text-[11px] font-medium text-[#2D8C3A] underline underline-offset-2 hover:text-[#1A6B27]"
                            >
                              editar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[#1A2B1C]">{formatBRL(lancamento.valor)}</td>
                    <td className="px-3 py-2 text-[#3D4F3F]">
                      {lancamento.disponivel_nome
                        ? lancamento.disponivel_nome
                        : lancamento.cod_disponivel != null
                          ? `Disponível #${lancamento.cod_disponivel}`
                          : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {lancamento.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {lancamento.tags.map((tag) => (
                            <span key={tag} className="inline-flex rounded-full bg-[#EEF1EE] px-2 py-0.5 text-[11px] font-medium text-[#3D4F3F]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#6B7F6E]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.cod_contato ?? "-"}</td>
                    <td className="px-3 py-2 text-[#3D4F3F]">{lancamento.cod_plano_contas ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getEgestorStatusClasses(lancamento.status)}`}>
                        {getEgestorStatusLabel(lancamento)}
                      </span>
                      {lancamento.validacao_mensagem && (
                        lancamento.status === "pendente_config" ? (
                          <p className="mt-1 text-[11px]">
                            <Link href="/configuracoes" className="text-[#991B1B] underline underline-offset-2">
                              {lancamento.validacao_mensagem}
                            </Link>
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-[#991B1B]">{lancamento.validacao_mensagem}</p>
                        )
                      )}
                      {lancamento.anexo_status === "pendente" && lancamento.anexo_mensagem && (
                        <p className="mt-1 text-[11px] text-[#9AA79B]">{lancamento.anexo_mensagem}</p>
                      )}
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
                  {item.apto ?? "Apto não identificado"} - {item.inquilino ?? "Inquilino não identificado"}
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

                {outrasDespesasExibicao.length > 0 && (
                  <div className="mt-5 border-t border-[#EEF1EE] pt-4">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Outras comissões e despesas no resumo</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {outrasDespesasExibicao.map((item) => (
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
          Voltar à lista
        </Link>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-lg bg-white border border-[#D5DDD6] text-[#3D4F3F] text-[14px] font-medium hover:bg-[#EEF1EE] inline-flex items-center gap-2 transition-colors">
            <Download size={14} />
            Exportar relatório
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

      {empreendimentoId && historicoUnidade && (
        <ImovelHistoricoDrawer
          empreendimentoId={empreendimentoId}
          empreendimentoNome={empreendimentoNome}
          unidade={historicoUnidade}
          onClose={() => setHistoricoUnidade(null)}
        />
      )}
    </div>
  )
}
