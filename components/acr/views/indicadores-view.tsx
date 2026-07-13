"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Info, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { IndicadoresData } from "@/lib/indicadores-types"
import type { Metric } from "../indicadores/primitives/metric-toggle"
import { ViewGeral } from "../indicadores/tabs/view-geral"
import { ViewReceita } from "../indicadores/tabs/view-receita"
import { ViewMapa, type HeatMetric } from "../indicadores/tabs/view-mapa"
import { ViewRegistro } from "../indicadores/tabs/view-registro"

type SubTab = "geral" | "receita" | "mapa" | "registro"

const TABS: { id: SubTab; label: string }[] = [
  { id: "geral", label: "Visão geral" },
  { id: "receita", label: "Receita & repasse" },
  { id: "mapa", label: "Mapa de calor" },
  { id: "registro", label: "Registro de pagamentos" },
]

export function IndicadoresView() {
  const [data, setData] = useState<IndicadoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<SubTab>("geral")
  const [metric, setMetric] = useState<Metric>("valor")
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("inad")

  const [competencia, setCompetencia] = useState<string | null>(null)
  const [empresaId, setEmpresaId] = useState<string>("")
  const [empreendimentoId, setEmpreendimentoId] = useState<string>("")
  const [imovel, setImovel] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (competencia) params.set("competencia", competencia)
      if (empresaId) params.set("empresa_id", empresaId)
      if (empreendimentoId) params.set("empreendimento_id", empreendimentoId)
      if (imovel) params.set("imovel", imovel)
      const res = await fetch(`/api/indicadores?${params.toString()}`)
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Falha ao carregar indicadores.")
      setData(payload.indicadores as IndicadoresData)
      if (!competencia && payload.indicadores?.competencia) {
        setCompetencia(payload.indicadores.competencia)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar indicadores.")
    } finally {
      setLoading(false)
    }
  }, [competencia, empresaId, empreendimentoId, imovel])

  useEffect(() => {
    void load()
  }, [load])

  const selectCls =
    "rounded-[9px] border border-acr-line-2 bg-white px-3 py-2 text-[12.5px] font-medium text-acr-muted-2 outline-none focus:border-acr-green"

  return (
    <div className="text-acr-ink">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicadores da carteira</h1>
          <p className="mt-1 max-w-[600px] text-[13.5px] leading-relaxed text-acr-muted">
            {data
              ? `Consolidado de ${data.competenciaLabel} · ${data.ocupacao.total} imóveis cadastrados. Todos os números saem dos fechamentos processados e do cadastro de imóveis.`
              : "Consolidado dos fechamentos processados e do cadastro de imóveis."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Competência" className={selectCls} value={competencia ?? ""} onChange={(e) => setCompetencia(e.target.value || null)}>
            {(data?.competenciasDisponiveis ?? []).length === 0 && <option value="">Sem fechamentos</option>}
            {(data?.competenciasDisponiveis ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Empresa" className={selectCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas as empresas</option>
            {(data?.empresas ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select aria-label="Empreendimento" className={selectCls} value={empreendimentoId} onChange={(e) => setEmpreendimentoId(e.target.value)}>
            <option value="">Todos os empreendimentos</option>
            {(data?.empreendimentos ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select aria-label="Imóvel" className={selectCls} value={imovel} onChange={(e) => setImovel(e.target.value)}>
            <option value="">Todos os imóveis</option>
            {(data?.imoveis ?? []).map((i, idx) => (
              <option key={`${i.id}-${idx}`} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav className="mb-[18px] flex gap-6 overflow-x-auto border-b border-acr-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "whitespace-nowrap border-b-2 pb-3 text-[13.5px] font-medium transition-colors",
              tab === t.id
                ? "border-acr-green font-semibold text-acr-green"
                : "border-transparent text-acr-muted hover:text-acr-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && (
        <div className="flex items-center gap-2.5 p-6 text-[13.5px] text-acr-muted">
          <Loader2 className="animate-spin" size={20} /> Carregando indicadores…
        </div>
      )}
      {error && !loading && (
        <div className="flex items-center gap-2.5 p-6 text-[13.5px] text-acr-red">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {!loading && !error && data && data.competencia === "" && data.ocupacao.total === 0 && (
        <div className="flex items-center gap-2.5 p-6 text-[13.5px] text-acr-muted">
          <Info size={18} /> Nenhum fechamento processado nem imóvel cadastrado ainda. Os indicadores aparecem assim que
          o primeiro fechamento for concluído ou o cadastro de imóveis for preenchido.
        </div>
      )}

      {!loading && !error && data && (data.competencia !== "" || data.ocupacao.total > 0) && (
        <>
          {tab === "geral" && <ViewGeral data={data} metric={metric} setMetric={setMetric} />}
          {tab === "receita" && <ViewReceita data={data} metric={metric} setMetric={setMetric} />}
          {tab === "mapa" && <ViewMapa data={data} heatMetric={heatMetric} setHeatMetric={setHeatMetric} />}
          {tab === "registro" && <ViewRegistro data={data} />}
        </>
      )}
    </div>
  )
}
