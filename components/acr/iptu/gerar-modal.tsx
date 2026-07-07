"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { formatBRL, formatDateOnly } from "@/lib/format"
import type { Empreendimento, Imobiliaria, Imovel } from "@/lib/cadastros-types"
import type { GerarIptuPayload } from "@/lib/iptu-types"
import type { GerarResultado } from "@/lib/contexts/iptu-context"
import { Field, Modal, PrimaryButton, SecondaryButton, SelectInput, TextInput, inputClass, labelClass } from "./ui"

function parseValor(value: string): number {
  const n = Number(value.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/** Adiciona n meses a uma data AAAA-MM-DD preservando o dia (com clamp). */
function addMonthsISO(iso: string, n: number): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return iso
  const [, y, m, d] = match
  const base = new Date(Date.UTC(Number(y), Number(m) - 1 + n, 1))
  const year = base.getUTCFullYear()
  const month = base.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(Number(d), lastDay)
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function GerarModal({
  imobiliarias,
  empreendimentos,
  imoveis,
  anoInicial,
  onClose,
  onGerar,
  onDone,
}: {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  imoveis: Imovel[]
  anoInicial: number
  onClose: () => void
  onGerar: (payload: GerarIptuPayload) => Promise<GerarResultado>
  onDone: (mensagem: string) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [ano, setAno] = useState(String(anoInicial))
  const [imobiliariaId, setImobiliariaId] = useState("")
  const [empreendimentoId, setEmpreendimentoId] = useState("")
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [numeroParcelas, setNumeroParcelas] = useState(10)
  const [vencimentos, setVencimentos] = useState<string[]>(Array(10).fill(""))
  const [valorPadrao, setValorPadrao] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [responsavel, setResponsavel] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [conflitos, setConflitos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const imoveisFiltrados = useMemo(
    () =>
      imoveis.filter(
        (i) =>
          i.ativo &&
          (!imobiliariaId || i.imobiliaria_id === imobiliariaId) &&
          (!empreendimentoId || i.empreendimento_id === empreendimentoId),
      ),
    [imoveis, imobiliariaId, empreendimentoId],
  )

  const imoveisSelecionados = useMemo(
    () => imoveisFiltrados.filter((i) => selecionados.has(i.id)),
    [imoveisFiltrados, selecionados],
  )

  const valorParcela = parseValor(valorPadrao)
  const totalPorImovel = valorParcela * numeroParcelas
  const totalGeral = totalPorImovel * imoveisSelecionados.length
  const conflitoSet = useMemo(() => new Set(conflitos), [conflitos])

  function alterarNumeroParcelas(valor: number) {
    const n = Math.max(1, Math.min(24, valor || 1))
    setNumeroParcelas(n)
    setVencimentos((prev) => {
      const next = prev.slice(0, n)
      while (next.length < n) next.push("")
      return next
    })
  }

  function preencherMensal() {
    const primeiro = vencimentos[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiro)) {
      setErro("Informe o 1º vencimento para preencher os demais.")
      return
    }
    setErro(null)
    setVencimentos(Array.from({ length: numeroParcelas }, (_, i) => addMonthsISO(primeiro, i)))
  }

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSelecionados((prev) =>
      prev.size === imoveisFiltrados.length ? new Set() : new Set(imoveisFiltrados.map((i) => i.id)),
    )
  }

  function validarStep1(): string | null {
    if (!/^\d{4}$/.test(ano)) return "Informe um ano valido."
    if (imoveisSelecionados.length === 0) return "Selecione ao menos um imóvel."
    if (vencimentos.some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v))) return "Preencha todos os vencimentos."
    return null
  }

  function irParaRevisao() {
    const problema = validarStep1()
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)
    setConflitos([])
    setStep(2)
  }

  async function confirmar(confirmarConflitos: boolean) {
    setSalvando(true)
    setErro(null)
    try {
      const payload: GerarIptuPayload = {
        ano: Number(ano),
        imobiliariaId: imobiliariaId || undefined,
        empreendimentoId: empreendimentoId || undefined,
        imovelIds: imoveisSelecionados.map((i) => i.id),
        numeroParcelas,
        vencimentos,
        valorPadrao: valorPadrao ? valorParcela : undefined,
        observacoes: observacoes.trim() || undefined,
        responsavel: responsavel === "inquilino" || responsavel === "proprietario" ? responsavel : undefined,
        confirmarConflitos,
      }
      const resultado = await onGerar(payload)
      if (resultado.conflito) {
        setConflitos(resultado.conflitos)
        setSalvando(false)
        return
      }
      const pulados =
        resultado.imoveisPulados.length > 0
          ? ` (${resultado.imoveisPulados.length} imóvel(is) já tinham carnê e foram ignorados)`
          : ""
      onDone(`${resultado.parcelasCriadas} parcela(s) criadas em ${resultado.carnesCriados} carnê(s)${pulados}.`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao gerar parcelas.")
      setSalvando(false)
    }
  }

  const footer =
    step === 1 ? (
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#6B7F6E]">{imoveisSelecionados.length} imóvel(is) selecionado(s)</span>
        <div className="flex gap-2">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={irParaRevisao}>
            Revisar <ArrowRight size={16} />
          </PrimaryButton>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between">
        <SecondaryButton onClick={() => setStep(1)} disabled={salvando}>
          <ArrowLeft size={16} /> Voltar
        </SecondaryButton>
        <PrimaryButton onClick={() => confirmar(conflitos.length > 0)} disabled={salvando}>
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {conflitos.length > 0 ? "Gerar mesmo assim" : "Confirmar geração"}
        </PrimaryButton>
      </div>
    )

  return (
    <Modal title="Gerar parcelas de IPTU" onClose={onClose} footer={footer} wide>
      {erro && (
        <div className="mb-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">
          {erro}
        </div>
      )}

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ano">
              <TextInput value={ano} onChange={setAno} type="number" />
            </Field>
            <Field label="Nº de parcelas">
              <TextInput
                value={String(numeroParcelas)}
                onChange={(v) => alterarNumeroParcelas(Number(v))}
                type="number"
                min="1"
              />
            </Field>
            <Field label="Valor padrão (por parcela)">
              <TextInput value={valorPadrao} onChange={setValorPadrao} placeholder="0,00" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Imobiliária">
              <SelectInput
                value={imobiliariaId}
                onChange={(v) => {
                  setImobiliariaId(v)
                  setSelecionados(new Set())
                }}
              >
                <option value="">Todas</option>
                {imobiliarias.filter((i) => i.ativo).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Empreendimento">
              <SelectInput
                value={empreendimentoId}
                onChange={(v) => {
                  setEmpreendimentoId(v)
                  setSelecionados(new Set())
                }}
              >
                <option value="">Todos</option>
                {empreendimentos.filter((e) => e.ativo).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelClass}>Imóveis</span>
              <button
                type="button"
                onClick={toggleTodos}
                className="text-[12px] font-medium text-[#2D8C3A] hover:underline"
                disabled={imoveisFiltrados.length === 0}
              >
                {selecionados.size === imoveisFiltrados.length && imoveisFiltrados.length > 0
                  ? "Limpar seleção"
                  : "Selecionar todos"}
              </button>
            </div>
            <div className="max-h-44 overflow-auto rounded-lg border border-[#D5DDD6]">
              {imoveisFiltrados.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-[#6B7F6E]">Nenhum imóvel para os filtros.</p>
              ) : (
                imoveisFiltrados.map((imovel) => (
                  <label
                    key={imovel.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-[#EEF1EE] px-3 py-2 last:border-0 hover:bg-[#EFF7F1]"
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(imovel.id)}
                      onChange={() => toggle(imovel.id)}
                      className="accent-[#2D8C3A]"
                    />
                    <span className="text-[13px] text-[#3D4F3F]">
                      {imovel.unidade}
                      <span className="text-[#6B7F6E]"> · {imovel.inquilino_nome || "sem inquilino"}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelClass}>Vencimentos</span>
              <button
                type="button"
                onClick={preencherMensal}
                className="text-[12px] font-medium text-[#2D8C3A] hover:underline"
              >
                Preencher mensalmente a partir do 1º
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {vencimentos.map((venc, idx) => (
                <div key={idx}>
                  <span className="mb-0.5 block text-[10px] text-[#6B7F6E]">Parcela {idx + 1}</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={venc}
                    onChange={(e) =>
                      setVencimentos((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsável (opcional)">
              <SelectInput value={responsavel} onChange={setResponsavel}>
                <option value="">Não definir</option>
                <option value="inquilino">Inquilino</option>
                <option value="proprietario">Proprietário</option>
              </SelectInput>
            </Field>
            <Field label="Observação (opcional)">
              <TextInput value={observacoes} onChange={setObservacoes} placeholder="Observação do carnê" />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {conflitos.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FEF3C7] px-3 py-2 text-[13px] text-[#92400E]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {conflitos.length} imóvel(is) já possuem carnê em {ano}. Ao confirmar, eles serão ignorados e o carnê será
                criado apenas para os demais.
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-[#F8FAF8] p-3 text-[13px]">
            <div>
              <div className={labelClass}>Ano</div>
              <div className="font-semibold text-[#1A2B1C]">{ano}</div>
            </div>
            <div>
              <div className={labelClass}>Parcelas por imóvel</div>
              <div className="font-semibold text-[#1A2B1C]">{numeroParcelas}</div>
            </div>
            <div>
              <div className={labelClass}>Valor por parcela</div>
              <div className="font-semibold text-[#1A2B1C]">{formatBRL(valorParcela)}</div>
            </div>
          </div>

          <div className="max-h-56 overflow-auto rounded-lg border border-[#EEF1EE]">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[#F8FAF8]">
                <tr className="border-b border-[#EEF1EE]">
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Imóvel</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Parcelas</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-[#6B7F6E]">Total</th>
                </tr>
              </thead>
              <tbody>
                {imoveisSelecionados.map((imovel) => (
                  <tr key={imovel.id} className="border-b border-[#EEF1EE] last:border-0">
                    <td className="px-3 py-2 text-[#3D4F3F]">
                      {imovel.unidade}
                      {conflitoSet.has(imovel.id) && (
                        <span className="ml-2 text-[11px] font-medium text-[#92400E]">conflito</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#3D4F3F]">{numeroParcelas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#3D4F3F]">{formatBRL(totalPorImovel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#6B7F6E]">
              1º vencimento: <strong className="text-[#3D4F3F]">{formatDateOnly(vencimentos[0])}</strong>
            </span>
            <span className="text-[#6B7F6E]">
              Total geral:{" "}
              <strong className="text-[#1A2B1C]">{formatBRL(conflitos.length > 0 ? totalPorImovel * (imoveisSelecionados.length - conflitos.length) : totalGeral)}</strong>
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}
