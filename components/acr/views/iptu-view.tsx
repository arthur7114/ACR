"use client"

import { useMemo, useState } from "react"
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit3,
  Loader2,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react"
import { formatBRL, formatDateOnly } from "@/lib/format"
import type { Empreendimento, Imobiliaria, Imovel } from "@/lib/cadastros-types"
import type {
  GerarIptuPayload,
  IptuFiltros,
  IptuPaginacao,
  IptuParcelaListItem,
  IptuParcelaPatch,
  IptuResumo,
  IptuStatus,
} from "@/lib/iptu-types"
import type { BaixaResultado, GerarResultado } from "@/lib/contexts/iptu-context"
import { BaixaModal } from "@/components/acr/iptu/baixa-modal"
import { EditarParcelaModal } from "@/components/acr/iptu/editar-parcela-modal"
import { GerarModal } from "@/components/acr/iptu/gerar-modal"
import { IptuStatusBadge, SelectInput, inputClass } from "@/components/acr/iptu/ui"

const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL + 1 - i)

const MESES = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
]

const RESPONSAVEL_LABEL: Record<string, string> = {
  inquilino: "Inquilino",
  proprietario: "Proprietário",
}

interface IptuViewProps {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  imoveis: Imovel[]
  parcelas: IptuParcelaListItem[]
  resumo: IptuResumo | null
  pagination: IptuPaginacao | null
  filtros: IptuFiltros
  loading: boolean
  error: string | null
  onFiltrosChange: (filtros: IptuFiltros) => void
  onPageChange: (page: number) => void
  onGerar: (payload: GerarIptuPayload) => Promise<GerarResultado>
  onEditar: (id: string, patch: IptuParcelaPatch) => Promise<void>
  onBaixar: (payload: {
    parcelaIds: string[]
    dataBaixa: string
    valoresPagos?: Record<string, number>
    observacoes?: string
  }) => Promise<BaixaResultado>
  onAjustarParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
}

export function IptuView({
  imobiliarias,
  empreendimentos,
  imoveis,
  parcelas,
  resumo,
  pagination,
  filtros,
  loading,
  error,
  onFiltrosChange,
  onPageChange,
  onGerar,
  onEditar,
  onBaixar,
  onAjustarParcelas,
}: IptuViewProps) {
  const [busca, setBusca] = useState("")
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [gerarAberto, setGerarAberto] = useState(false)
  const [baixaParcelas, setBaixaParcelas] = useState<IptuParcelaListItem[] | null>(null)
  const [editar, setEditar] = useState<IptuParcelaListItem | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  function atualizarFiltro(patch: Partial<IptuFiltros>) {
    onFiltrosChange({ ...filtros, ...patch })
    setSelecionadas(new Set())
  }

  const mesSelecionado = filtros.mesVencimento?.slice(5, 7) ?? ""

  // O mes de vencimento e ancorado ao ano do filtro (ou ao ano atual).
  function alterarAno(value: string) {
    const ano = value ? Number(value) : undefined
    const patch: Partial<IptuFiltros> = { ano }
    if (mesSelecionado) patch.mesVencimento = `${ano ?? ANO_ATUAL}-${mesSelecionado}`
    atualizarFiltro(patch)
  }

  function alterarMes(mes: string) {
    atualizarFiltro({ mesVencimento: mes ? `${filtros.ano ?? ANO_ATUAL}-${mes}` : undefined })
  }

  const parcelasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return parcelas
    return parcelas.filter(
      (p) =>
        p.unidade.toLowerCase().includes(termo) ||
        (p.inquilinoNome ?? "").toLowerCase().includes(termo),
    )
  }, [parcelas, busca])

  const temFiltroAtivo =
    busca.trim().length > 0 ||
    Boolean(
      filtros.imobiliariaId ||
        filtros.empreendimentoId ||
        filtros.imovelId ||
        filtros.ano ||
        filtros.status ||
        filtros.vencimentoInicio ||
        filtros.vencimentoFim ||
        filtros.mesVencimento,
    )

  const selecionaveis = useMemo(() => parcelasVisiveis.filter((p) => p.status !== "pago"), [parcelasVisiveis])
  const selecionadasLista = useMemo(
    () => parcelasVisiveis.filter((p) => selecionadas.has(p.id)),
    [parcelasVisiveis, selecionadas],
  )
  const todasSelecionadas = selecionaveis.length > 0 && selecionaveis.every((p) => selecionadas.has(p.id))

  function toggleTodas() {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(selecionaveis.map((p) => p.id)))
  }

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function feedback(mensagem: string) {
    setFlash(mensagem)
    setGerarAberto(false)
    setBaixaParcelas(null)
    setEditar(null)
    setSelecionadas(new Set())
    window.setTimeout(() => setFlash(null), 6000)
  }

  return (
    <div className="p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF7F1] text-[#2D8C3A]">
            <Receipt size={20} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#1A2B1C]">IPTU</h1>
            <p className="text-[13px] text-[#6B7F6E]">Controle manual de parcelas por imóvel</p>
          </div>
        </div>
        <button
          onClick={() => setGerarAberto(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1A5C24]"
        >
          <Plus size={16} /> Gerar parcelas
        </button>
      </div>

      {flash && (
        <div className="flex items-center gap-2 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-[13px] text-[#166534]">
          <CheckCircle2 size={16} /> {flash}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-[13px] text-[#B91C1C]">{error}</div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <ResumoCard titulo="Em aberto" valor={formatBRL(resumo?.totalAberto ?? 0)} />
        <ResumoCard titulo="Vencido" valor={formatBRL(resumo?.totalVencido ?? 0)} danger={(resumo?.totalVencido ?? 0) > 0} />
        <ResumoCard titulo="Pago" valor={formatBRL(resumo?.totalPago ?? 0)} positivo={(resumo?.totalPago ?? 0) > 0} />
        <ResumoCard
          titulo="Parcelas vencidas"
          valor={String(resumo?.quantidadeVencidas ?? 0)}
          danger={(resumo?.quantidadeVencidas ?? 0) > 0}
        />
        <ResumoCard
          titulo="Próximo vencimento"
          valor={formatDateOnly(resumo?.proximoVencimento)}
          icon={<CalendarClock size={16} />}
        />
      </div>

      {/* Tabela + filtros */}
      <div className="acr-card overflow-hidden">
        <div className="grid grid-cols-[1fr_170px_170px_120px_140px_150px] gap-3 border-b border-[#EEF1EE] p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7F6E]" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Buscar imóvel / inquilino"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <SelectInput
            value={filtros.imobiliariaId ?? ""}
            onChange={(v) => atualizarFiltro({ imobiliariaId: v || undefined })}
          >
            <option value="">Imobiliária</option>
            {imobiliarias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={filtros.empreendimentoId ?? ""}
            onChange={(v) => atualizarFiltro({ empreendimentoId: v || undefined })}
          >
            <option value="">Empreendimento</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </SelectInput>
          <SelectInput value={filtros.ano ? String(filtros.ano) : ""} onChange={alterarAno}>
            <option value="">Ano</option>
            {ANOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={filtros.status ?? ""}
            onChange={(v) => atualizarFiltro({ status: (v || undefined) as IptuStatus | undefined })}
          >
            <option value="">Status</option>
            <option value="aberto">Aberto</option>
            <option value="vencido">Vencido</option>
            <option value="pago">Pago</option>
          </SelectInput>
          <SelectInput value={mesSelecionado} onChange={alterarMes}>
            <option value="">Mês venc.</option>
            {MESES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[#EEF1EE] bg-[#F8FAF8]">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={todasSelecionadas}
                    onChange={toggleTodas}
                    className="accent-[#2D8C3A]"
                    disabled={selecionaveis.length === 0}
                    aria-label="Selecionar todas"
                  />
                </th>
                {[
                  "Imóvel",
                  "Imobiliária",
                  "Empreendimento",
                  "Ano",
                  "Parc.",
                  "Vencimento",
                  "Previsto",
                  "Pago",
                  "Baixa",
                  "Responsável",
                  "Status",
                  "Ações",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && parcelasVisiveis.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-[13px] text-[#6B7F6E]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={15} className="animate-spin" /> Carregando…
                    </span>
                  </td>
                </tr>
              )}
              {!loading && parcelasVisiveis.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-[13px] text-[#6B7F6E]">
                    {temFiltroAtivo ? (
                      "Nenhuma parcela encontrada para os filtros atuais."
                    ) : (
                      <>
                        Nenhuma parcela cadastrada ainda. Use{" "}
                        <span className="font-semibold text-[#3D4F3F]">&ldquo;Gerar parcelas&rdquo;</span> para criar
                        carnês.
                      </>
                    )}
                  </td>
                </tr>
              )}
              {parcelasVisiveis.map((p) => (
                <tr key={p.id} className="border-b border-[#EEF1EE] last:border-0 hover:bg-[#EFF7F1]">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selecionadas.has(p.id)}
                      onChange={() => toggle(p.id)}
                      disabled={p.status === "pago"}
                      className="accent-[#2D8C3A] disabled:opacity-40"
                      aria-label={`Selecionar parcela ${p.numeroParcela}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-[#3D4F3F]">
                    <div className="font-medium">{p.unidade}</div>
                    <div className="text-[12px] text-[#6B7F6E]">{p.inquilinoNome || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[#3D4F3F]">{p.imobiliariaNome ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[#3D4F3F]">{p.empreendimentoNome ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[#3D4F3F]">{p.ano}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[#3D4F3F]">{p.numeroParcela}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[#3D4F3F]">{formatDateOnly(p.dataVencimento)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[#3D4F3F]">{formatBRL(p.valorPrevisto)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[#3D4F3F]">
                    {p.valorPago === null ? "—" : formatBRL(p.valorPago)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[#6B7F6E]">{formatDateOnly(p.dataBaixa)}</td>
                  <td className="px-3 py-2.5 text-[#6B7F6E]">
                    {p.responsavel ? RESPONSAVEL_LABEL[p.responsavel] : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <IptuStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditar(p)}
                        className="rounded-md p-1.5 text-[#6B7F6E] hover:bg-[#EEF1EE] hover:text-[#3D4F3F]"
                        title="Editar"
                      >
                        <Edit3 size={15} />
                      </button>
                      {p.status !== "pago" && (
                        <button
                          onClick={() => setBaixaParcelas([p])}
                          className="rounded-md p-1.5 text-[#2D8C3A] hover:bg-[#EFF7F1]"
                          title="Dar baixa"
                        >
                          <DollarSign size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#EEF1EE] px-4 py-3 text-[13px] text-[#6B7F6E]">
            <span>
              Página {pagination.page} de {pagination.totalPages} · {pagination.total} parcelas
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D5DDD6] px-3 hover:bg-[#EEF1EE] disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D5DDD6] px-3 hover:bg-[#EEF1EE] disabled:opacity-40"
              >
                Próxima <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra de ações em massa */}
      {selecionadasLista.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#EEF1EE] bg-white px-4 py-3 shadow-xl">
          <span className="text-[13px] font-medium text-[#3D4F3F]">
            {selecionadasLista.length} parcela(s) selecionada(s)
          </span>
          <button
            onClick={() => setBaixaParcelas(selecionadasLista)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[13px] font-medium text-white hover:bg-[#1A5C24]"
          >
            <DollarSign size={15} /> Dar baixa
          </button>
          <button
            onClick={() => setSelecionadas(new Set())}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#D5DDD6] px-3 text-[13px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]"
          >
            <X size={14} /> Limpar
          </button>
        </div>
      )}

      {gerarAberto && (
        <GerarModal
          imobiliarias={imobiliarias}
          empreendimentos={empreendimentos}
          imoveis={imoveis}
          anoInicial={filtros.ano ?? ANO_ATUAL}
          onClose={() => setGerarAberto(false)}
          onGerar={onGerar}
          onDone={feedback}
        />
      )}
      {baixaParcelas && baixaParcelas.length > 0 && (
        <BaixaModal
          parcelas={baixaParcelas}
          onClose={() => setBaixaParcelas(null)}
          onBaixar={onBaixar}
          onDone={feedback}
        />
      )}
      {editar && (
        <EditarParcelaModal
          parcela={editar}
          onClose={() => setEditar(null)}
          onEditar={onEditar}
          onAjustarParcelas={onAjustarParcelas}
          onDone={feedback}
        />
      )}
    </div>
  )
}

function ResumoCard({
  titulo,
  valor,
  danger,
  positivo,
  icon,
}: {
  titulo: string
  valor: string
  danger?: boolean
  positivo?: boolean
  icon?: React.ReactNode
}) {
  const cor = danger ? "text-[#B91C1C]" : positivo ? "text-[#166534]" : "text-[#1A2B1C]"
  return (
    <div className="acr-card p-4">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">
        <span>{titulo}</span>
        {icon}
      </div>
      <div className={`text-[20px] font-bold tabular-nums ${cor}`}>{valor}</div>
    </div>
  )
}
