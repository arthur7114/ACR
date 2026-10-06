"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react"

import { formatarDataCurta, situacaoPrazo } from "@/lib/contrato-prazo"
import type { ContratosDoImovel, ImovelContrato } from "@/lib/imovel-contratos-types"
import { seloPrazo } from "./prazo-contrato-selo"

const ANTERIORES_VISIVEIS = 2

function hojeLocal() {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`
}

const dia = (valor: string | null | undefined) => (valor ? valor.slice(0, 10) : null)

const campo =
  "h-9 w-full rounded-lg border border-[#D5DDD6] bg-white px-2.5 text-[13px] text-[#1A2B1C] outline-none focus:border-[#2D8C3A]"

/**
 * Contratos do imóvel no detalhe: o vigente em destaque, os anteriores logo
 * abaixo e o cadastro manual. Busca os dados sozinho, para aparecer onde quer
 * que o detalhe abra (Imóveis, Revisão do fechamento, Indicadores).
 */
export function ImovelContratosCard({
  empreendimentoId,
  unidade,
  onChanged,
}: {
  empreendimentoId: string
  unidade: string
  /** Avisa o detalhe que os contratos mudaram, para recarregar a linha do tempo. */
  onChanged: () => void
}) {
  const [dados, setDados] = useState<ContratosDoImovel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [form, setForm] = useState({ locatario: "", inicio: "", termino: "" })
  const hoje = useMemo(() => hojeLocal(), [])

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch(
        `/api/cadastros/imoveis/contratos?empreendimento_id=${encodeURIComponent(empreendimentoId)}&unidade=${encodeURIComponent(unidade)}`,
      )
      const json = await resposta.json()
      if (!resposta.ok) throw new Error(json.error ?? "Falha ao carregar os contratos.")
      setDados(json as ContratosDoImovel)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os contratos.")
    }
  }, [empreendimentoId, unidade])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const imovel = dados?.imovel ?? null
  const inicioVigente = dia(imovel?.contrato_inicio)
  const situacao = imovel ? situacaoPrazo(prazoDoImovel(imovel), hoje) : undefined
  const anteriores = useMemo(
    () => (dados?.contratos ?? []).filter((contrato) => contrato.inicio !== inicioVigente),
    [dados, inicioVigente],
  )
  const vigenteNaLista = (dados?.contratos ?? []).find((contrato) => contrato.inicio === inicioVigente) ?? null
  const visiveis = verTodos ? anteriores : anteriores.slice(0, ANTERIORES_VISIVEIS)

  if (!dados && !erro) return null
  if (!imovel) return erro ? <p className="mb-4 text-[12px] text-[#B91C1C]">{erro}</p> : null

  function abrirForm() {
    setForm({ locatario: imovel?.inquilino_nome ?? "", inicio: "", termino: "" })
    setErroForm(null)
    setFormAberto(true)
  }

  async function salvar() {
    if (!imovel) return
    if (!form.inicio) {
      setErroForm("Informe o início do contrato.")
      return
    }
    setSalvando(true)
    setErroForm(null)
    try {
      const resposta = await fetch("/api/cadastros/imoveis/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovel_id: imovel.id, locatario: form.locatario, inicio: form.inicio, termino: form.termino }),
      })
      const json = await resposta.json()
      if (!resposta.ok) throw new Error(json.error ?? "Falha ao salvar o contrato.")
      setFormAberto(false)
      await carregar()
      onChanged()
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Falha ao salvar o contrato.")
    } finally {
      setSalvando(false)
    }
  }

  async function remover(contrato: ImovelContrato) {
    if (!imovel) return
    const periodo = `${formatarDataCurta(contrato.inicio)} → ${formatarDataCurta(contrato.termino)}`
    if (!window.confirm(`Remover o contrato ${periodo}${contrato.locatario ? ` de ${contrato.locatario}` : ""}?`)) return
    const resposta = await fetch(
      `/api/cadastros/imoveis/contratos?imovel_id=${encodeURIComponent(imovel.id)}&contrato_id=${encodeURIComponent(contrato.id)}`,
      { method: "DELETE" },
    )
    if (!resposta.ok) {
      const json = await resposta.json().catch(() => ({}))
      setErro(json.error ?? "Falha ao remover o contrato.")
      return
    }
    await carregar()
    onChanged()
  }

  const selo = situacao ? seloPrazo(situacao) : null
  const temVigente = situacao && situacao.estado !== "sem_data"

  return (
    <section className="acr-card mb-4 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">
          <CalendarClock size={13} /> Contrato
        </p>
        {!formAberto && (
          <button
            type="button"
            onClick={abrirForm}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[#D5DDD6] bg-white px-2 text-[12px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]"
          >
            <Plus size={13} /> Adicionar
          </button>
        )}
      </div>

      {temVigente ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`tabular-nums text-[15px] font-semibold ${situacao.estado === "outro_inquilino" ? "text-[#9AA89C] line-through" : "text-[#1A2B1C]"}`}
            >
              {formatarDataCurta(imovel.contrato_inicio)} → {formatarDataCurta(imovel.contrato_termino)}
            </span>
            {selo && <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${selo.className}`}>{selo.label}</span>}
            {vigenteNaLista && <BotaoRemover onClick={() => void remover(vigenteNaLista)} />}
          </div>
          {(imovel.contrato_locatario || imovel.contrato_fonte) && (
            <p className="mt-1 text-[12px] text-[#6B7F6E]">
              {[imovel.contrato_locatario ? `Contrato de ${imovel.contrato_locatario}` : null, imovel.contrato_fonte ? `Fonte: ${imovel.contrato_fonte}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-[#9AA89C]">Sem prazo cadastrado.</p>
      )}

      {anteriores.length > 0 && (
        <div className="mt-3 border-t border-[#EEF1EE] pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Contratos anteriores</p>
          <ul className="space-y-1.5">
            {visiveis.map((contrato) => (
              <li key={contrato.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="tabular-nums text-[13px] text-[#3D4F3F]">
                    {formatarDataCurta(contrato.inicio)} → {formatarDataCurta(contrato.termino)}
                  </span>
                  {contrato.termino && contrato.termino < hoje && (
                    <span className="ml-2 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]">Encerrado</span>
                  )}
                  <p className="truncate text-[12px] text-[#6B7F6E]">
                    {[contrato.locatario, contrato.fonte ? `Fonte: ${contrato.fonte}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <BotaoRemover onClick={() => void remover(contrato)} />
              </li>
            ))}
          </ul>
          {anteriores.length > ANTERIORES_VISIVEIS && (
            <button type="button" onClick={() => setVerTodos((aberto) => !aberto)} className="mt-2 text-[12px] font-medium text-[#2D8C3A] hover:underline">
              {verTodos ? "Mostrar menos" : `Ver todos (${anteriores.length})`}
            </button>
          )}
        </div>
      )}

      {formAberto && (
        <div className="mt-3 rounded-lg border border-[#EEF1EE] bg-[#F8FAF8] p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[11px] font-medium text-[#6B7F6E]">
              Locatário
              <input className={`${campo} mt-1`} value={form.locatario} onChange={(e) => setForm((f) => ({ ...f, locatario: e.target.value }))} />
            </label>
            <label className="text-[11px] font-medium text-[#6B7F6E]">
              Início
              <input type="date" className={`${campo} mt-1`} value={form.inicio} onChange={(e) => setForm((f) => ({ ...f, inicio: e.target.value }))} />
            </label>
            <label className="text-[11px] font-medium text-[#6B7F6E]">
              Término
              <input type="date" className={`${campo} mt-1`} value={form.termino} onChange={(e) => setForm((f) => ({ ...f, termino: e.target.value }))} />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#6B7F6E]">
            Mesmo início de um contrato já cadastrado corrige as datas dele. Começando no mesmo dia do vigente ou depois, ele passa a ser o vigente; antes, entra só na lista.
          </p>
          {erroForm && <p className="mt-2 text-[12px] text-[#B91C1C]">{erroForm}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setFormAberto(false)} className="h-8 rounded-md border border-[#D5DDD6] bg-white px-3 text-[12px] font-medium text-[#3D4F3F] hover:bg-[#EEF1EE]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#2D8C3A] px-3 text-[12px] font-medium text-white hover:bg-[#256F2E] disabled:opacity-60"
            >
              {salvando && <Loader2 size={12} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-2 text-[12px] text-[#B91C1C]">{erro}</p>}
    </section>
  )
}

function BotaoRemover({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Remover contrato" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#9AA89C] hover:bg-[#FEF2F2] hover:text-[#B91C1C]">
      <Trash2 size={13} />
    </button>
  )
}

function prazoDoImovel(imovel: NonNullable<ContratosDoImovel["imovel"]>) {
  return {
    contrato_inicio: imovel.contrato_inicio,
    contrato_termino: imovel.contrato_termino,
    contrato_locatario: imovel.contrato_locatario,
    inquilino_nome: imovel.inquilino_nome,
  }
}
