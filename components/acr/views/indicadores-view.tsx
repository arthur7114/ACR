"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Info, Loader2 } from "lucide-react"
import { formatBRL, formatBRLk, formatPercent } from "@/lib/format"
import type { HeatRow, IndicadoresData } from "@/lib/indicadores-types"

type SubTab = "geral" | "receita" | "mapa" | "registro"
type Metric = "valor" | "pct"
type HeatMetric = "inad" | "vac"

const TABS: { id: SubTab; label: string }[] = [
  { id: "geral", label: "Visão geral" },
  { id: "receita", label: "Receita & repasse" },
  { id: "mapa", label: "Mapa de calor" },
  { id: "registro", label: "Registro de pagamentos" },
]

// Escala de cores verde -> amarelo -> vermelho (6 faixas)
function heatClass(value: number | null, max: number): string {
  if (value === null) return "cell-empty"
  const r = value / max
  if (r <= 0.1) return "q0"
  if (r <= 0.25) return "q1"
  if (r <= 0.45) return "q2"
  if (r <= 0.65) return "q3"
  if (r <= 0.85) return "q4"
  return "q5"
}

function realizColor(pct: number): string {
  if (pct >= 95) return "var(--green)"
  if (pct >= 85) return "#7FC98C"
  if (pct >= 70) return "var(--amber)"
  return "var(--red)"
}

function realizTag(pct: number): [string, string] {
  if (pct >= 95) return ["ok", "Integral"]
  if (pct >= 85) return ["ok", "Saudável"]
  if (pct >= 70) return ["mid", "Parcial"]
  return ["bad", "Atenção"]
}

const fmt1 = (v: number) => v.toFixed(1).replace(".", ",")

export function IndicadoresView() {
  const [data, setData] = useState<IndicadoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<SubTab>("geral")
  const [metric, setMetric] = useState<Metric>("valor")
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("inad")

  const [competencia, setCompetencia] = useState<string | null>(null)
  const [empreendimentoId, setEmpreendimentoId] = useState<string>("")
  const [imovel, setImovel] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (competencia) params.set("competencia", competencia)
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
  }, [competencia, empreendimentoId, imovel])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="indic">
      <style>{INDIC_CSS}</style>

      <div className="ph">
        <div>
          <h1>Indicadores da carteira</h1>
          <p>
            {data
              ? `Consolidado de ${data.competenciaLabel} · ${data.ocupacao.total} imóveis cadastrados. Todos os números saem dos fechamentos processados e do cadastro de imóveis.`
              : "Consolidado dos fechamentos processados e do cadastro de imóveis."}
          </p>
        </div>
        <div className="filters">
          <select value={competencia ?? ""} onChange={(e) => setCompetencia(e.target.value || null)}>
            {(data?.competenciasDisponiveis ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select value={empreendimentoId} onChange={(e) => setEmpreendimentoId(e.target.value)}>
            <option value="">Todos os empreendimentos</option>
            {(data?.empreendimentos ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select value={imovel} onChange={(e) => setImovel(e.target.value)}>
            <option value="">Todos os imóveis</option>
            {(data?.imoveis ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav className="subtabs">
        {TABS.map((t) => (
          <button key={t.id} className={`subtab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {loading && (
        <div className="state">
          <Loader2 className="spin" size={20} /> Carregando indicadores…
        </div>
      )}
      {error && !loading && (
        <div className="state err">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {!loading && !error && data && data.competencia === "" && (
        <div className="state">
          <Info size={18} /> Nenhum fechamento processado ainda. Os indicadores aparecem assim que o primeiro fechamento
          for concluído.
        </div>
      )}

      {!loading && !error && data && data.competencia !== "" && (
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

/* ============ TOGGLE valor/percentual ============ */
function MetricToggle({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  return (
    <div className="seg">
      <button className={metric === "valor" ? "on" : ""} onClick={() => setMetric("valor")}>
        <span className="d" /> Valor (R$)
      </button>
      <button className={metric === "pct" ? "on" : ""} onClick={() => setMetric("pct")}>
        <span className="d" /> Percentual
      </button>
    </div>
  )
}

/* ============ VISÃO GERAL ============ */
function ViewGeral({
  data,
  metric,
  setMetric,
}: {
  data: IndicadoresData
  metric: Metric
  setMetric: (m: Metric) => void
}) {
  const receita = data.receita
  const pctOfReceita = (v: number) => (receita > 0 ? (v / receita) * 100 : 0)
  const showFin = (v: number) => (metric === "pct" ? formatPercent(pctOfReceita(v)) : formatBRLk(v))
  const maxSerie = Math.max(1, ...data.serieMensal.map((s) => s.receita))

  return (
    <>
      <div className="kpi-head">
        <MetricToggle metric={metric} setMetric={setMetric} />
      </div>

      {/* KPIs principais: ocupação, receita, despesa, repasse, taxa total (sem inadimplência) */}
      <div className="grid g5">
        <div className="card kpi">
          <div className="k">
            <span className="d" style={{ background: "var(--green)" }} /> Taxa de ocupação
          </div>
          <div className="v">{formatPercent(data.ocupacao.pct)}</div>
          <div className="s">
            {data.ocupacao.ocupados} de {data.ocupacao.total} imóveis ocupados
          </div>
        </div>
        <div className="card kpi">
          <div className="k">
            <span className="d" style={{ background: "var(--amber)" }} /> Receita do mês
          </div>
          <div className="v">{metric === "pct" ? "100%" : formatBRLk(receita)}</div>
          <div className="s">recebido em nome do locador</div>
        </div>
        <div className="card kpi">
          <div className="k">
            <span className="d" style={{ background: "var(--red)" }} /> Despesa total
          </div>
          <div className="v">{showFin(data.despesaOperacional)}</div>
          <div className="s">água + IPTU + seguro (operacional)</div>
        </div>
        <div className="card kpi">
          <div className="k">
            <span className="d" style={{ background: "var(--muted2)" }} /> Total repassado
          </div>
          <div className="v">{showFin(data.totalRepassar)}</div>
          <div className="s">após comissões e despesas</div>
        </div>
        <div className="card kpi">
          <div className="k">
            <span className="d" style={{ background: "var(--blue)" }} /> Taxa total
          </div>
          <div className="v">{showFin(data.taxaTotal)}</div>
          <div className="s">comissão de administração</div>
        </div>
      </div>

      <div className="sect">Ocupação &amp; vacância</div>
      <div className="grid g2">
        <div className="card">
          <h3>Evolução do faturamento</h3>
          <div className="cd">
            Receita realizada — últimos {data.serieMensal.length} fechamentos ·{" "}
            <span className="src">fonte: fechamentos processados</span>
          </div>
          <div className="bars">
            {data.serieMensal.map((s, i) => {
              const h = Math.round((s.receita / maxSerie) * 100)
              const hl = i === data.serieMensal.length - 1
              return (
                <div className="bc" key={s.competencia}>
                  <div className={`col ${hl ? "hl" : ""}`} style={{ height: `${Math.max(h, 4)}%` }}>
                    <span className="t">{formatBRLk(s.receita)}</span>
                  </div>
                  <div className="x">{s.label}</div>
                </div>
              )
            })}
            {data.serieMensal.length === 0 && <div className="empty">Sem histórico mensal ainda.</div>}
          </div>
        </div>
        <div className="card">
          <h3>Situação dos imóveis</h3>
          <div className="cd">
            {data.competenciaLabel} · <span className="src">fonte: cadastro de imóveis (status)</span>
          </div>
          <div className="dw">
            <div className="donut" style={{ ["--p" as string]: data.ocupacao.pct }}>
              <div className="h">
                <b>{data.ocupacao.ocupados}</b>
                <span>de {data.ocupacao.total}</span>
              </div>
            </div>
            <div className="leg">
              <div className="it">
                <span className="dot" style={{ background: "var(--green)" }} /> Ocupados{" "}
                <b>
                  {data.ocupacao.ocupados} · {formatPercent(data.ocupacao.pct)}
                </b>
              </div>
              <div className="it">
                <span className="dot" style={{ background: "var(--green-soft)" }} /> Vagos{" "}
                <b>
                  {data.ocupacao.vagos} ·{" "}
                  {formatPercent(data.ocupacao.total > 0 ? (data.ocupacao.vagos / data.ocupacao.total) * 100 : 0)}
                </b>
              </div>
              <div className="it" style={{ marginTop: 6 }}>
                Vacância em valor <b style={{ color: "var(--red)" }}>{formatBRLk(data.ocupacao.vacanciaValor)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sect">Movimentações do mês</div>
      <div className="card">
        <div className="quads">
          <Quad t="Acordos recebidos" n={String(data.movimentacoes.acordos.count)} x={formatBRLk(data.movimentacoes.acordos.valor)} />
          <Quad t="Rescisões" n={String(data.movimentacoes.rescisoes.count)} x={formatBRLk(data.movimentacoes.rescisoes.valor)} />
          <Quad
            t="Reajustes (unidades)"
            n={data.movimentacoes.reajustes.pending ? "—" : String(data.movimentacoes.reajustes.count)}
            x={data.movimentacoes.reajustes.pending ? "aguardando dados" : "unidades reajustadas"}
            pending={data.movimentacoes.reajustes.pending}
          />
          <Quad t="Desconto aplicado" n={formatBRLk(data.movimentacoes.descontos)} amber x="no mês" />
          <Quad t="IPTU" n={formatBRLk(data.movimentacoes.despesaPorCategoria.iptu)} x="despesa do mês" />
          <Quad t="Água" n={formatBRLk(data.movimentacoes.despesaPorCategoria.agua)} x="despesa do mês" />
          <Quad t="Seguro incêndio" n={formatBRLk(data.movimentacoes.despesaPorCategoria.seguro)} x="despesa do mês" />
          <Quad
            t="Despesa operacional"
            n={formatBRLk(data.despesaOperacional)}
            x={`${formatPercent(data.percentuais.despesaOperacionalPct)} da receita`}
          />
        </div>
        <div className="note">
          <Info size={15} />
          <span>Acordos, rescisões, descontos e despesas vêm direto da extração da prestação de contas.</span>
        </div>
      </div>

      <div className="sect">Financeiro — taxas &amp; despesas</div>
      <div className="grid g2">
        <div className="card">
          <h3>Despesa operacional &amp; de venda</h3>
          <div className="cd">
            Operacional (repasses) e de venda (intermediação) · <span className="src">fonte: prestação + regras comerciais</span>
          </div>
          <div className="rows">
            <Row label="Taxa de administração" value={formatBRL(data.taxaTotal)} sub={data.percentuais.administracaoPct !== null ? formatPercent(data.percentuais.administracaoPct) : undefined} />
            <Row
              label="Despesa operacional"
              value={formatBRL(data.despesaOperacional)}
              sub={`${formatPercent(data.percentuais.despesaOperacionalPct)} da receita`}
              danger
            />
            <Row
              label="Despesa de venda (intermediação)"
              value={data.despesas.vendaPct !== null ? `${formatPercent(data.despesas.vendaPct)}` : "aguardando dados"}
              sub={data.despesas.venda === null ? "valor por contrato não extraído" : undefined}
              pending={data.despesas.venda === null}
            />
          </div>
        </div>
        <div className="card">
          <h3>Percentuais aplicados</h3>
          <div className="cd">
            Parâmetros do fechamento · <span className="src">fonte: regras comerciais</span>
          </div>
          <Bar label="% Administração" value={data.percentuais.administracaoPct} width={data.percentuais.administracaoPct ?? 0} />
          <Bar label="% Intermediação" value={data.percentuais.intermediacaoPct} width={data.percentuais.intermediacaoPct ?? 0} />
          <Bar label="% Ocupação" value={data.percentuais.ocupacaoPct} width={data.percentuais.ocupacaoPct} />
          <Bar label="% Despesa operacional" value={data.percentuais.despesaOperacionalPct} width={data.percentuais.despesaOperacionalPct} amber />
        </div>
      </div>

      <Pendencias data={data} />
    </>
  )
}

/* ============ RECEITA & REPASSE ============ */
function ViewReceita({
  data,
  metric,
  setMetric,
}: {
  data: IndicadoresData
  metric: Metric
  setMetric: (m: Metric) => void
}) {
  const { potencial, realizado, realizadoPct, ofensores } = data.cascata
  const showVal = (v: number, pct: number) => (metric === "pct" ? formatPercent(pct) : formatBRLk(v))

  return (
    <>
      <div className="kpi-head">
        <MetricToggle metric={metric} setMetric={setMetric} />
      </div>

      <div className="sect">Cascata de receita — do potencial ao recebido</div>
      <div className="card">
        <div className="hh">
          <div>
            <h3>Faturamento potencial × realizado</h3>
            <div className="cd">
              {data.competenciaLabel} · <span className="src">aluguel esperado vs. vacância + inadimplência + desconto</span>
            </div>
          </div>
        </div>
        <div className="wf">
          <div className="wcol">
            <div className="wbox base" style={{ height: "100%" }}>
              <span className="amt" style={{ color: "var(--ink)" }}>
                {metric === "pct" ? "100%" : formatBRLk(potencial)}
              </span>
            </div>
            <div className="xl">
              Faturamento
              <br />
              potencial
            </div>
            <div className="pct">100%</div>
          </div>
          {ofensores.map((o) => {
            const lossH = potencial > 0 ? (o.valor / potencial) * 100 : 0
            const spacerH = Math.max(0, realizadoPct + cumulativeBelow(ofensores, o, potencial))
            return (
              <div className="wcol" key={o.key}>
                <div className="wbox spacer" style={{ height: `${spacerH}%` }} />
                <div className={`wbox loss ${o.pending ? "pending" : ""}`} style={{ height: `${Math.max(lossH, o.pending ? 0 : 0.6)}%` }}>
                  <span className="amt" style={{ color: "var(--red)" }}>
                    {o.pending ? "s/ dados" : `− ${showVal(o.valor, o.pct)}`}
                  </span>
                </div>
                <div className="xl">{o.label}</div>
                <div className="pct">{o.pending ? "—" : `−${fmt1(o.pct)}%`}</div>
              </div>
            )
          })}
          <div className="wcol">
            <div className="wbox fin" style={{ height: `${Math.max(realizadoPct, 4)}%` }}>
              <span className="amt" style={{ color: "var(--green)" }}>
                {metric === "pct" ? formatPercent(realizadoPct) : formatBRLk(realizado)}
              </span>
            </div>
            <div className="xl">
              Recebido
              <br />
              de fato
            </div>
            <div className="pct" style={{ color: "var(--green)", fontWeight: 700 }}>
              {formatPercent(realizadoPct)}
            </div>
          </div>
        </div>
        <div className="note">
          <Info size={15} />
          <span>
            <b style={{ color: "var(--ink)" }}>
              {formatBRLk(potencial - realizado)} ({formatPercent(potencial > 0 ? ((potencial - realizado) / potencial) * 100 : 0)})
            </b>{" "}
            de receita não realizada no mês (vacância + descontos). Os ofensores acima mostram onde o percentual é corroído.
          </span>
        </div>
        {data.cascata.inadimplenciaAcumulada > 0 && (
          <div className="note" style={{ marginTop: 6 }}>
            <AlertTriangle size={15} style={{ color: "var(--amber)" }} />
            <span>
              Inadimplência <b>acumulada</b> de{" "}
              <b style={{ color: "var(--red)" }}>{formatBRLk(data.cascata.inadimplenciaAcumulada)}</b> — é um saldo de
              meses anteriores (insight), não entra na cascata do mês.
            </span>
          </div>
        )}
      </div>

      <div className="sect">Realização de receita por imóvel</div>
      <div className="card">
        <div className="hh">
          <div>
            <h3>Quanto cada imóvel entregou do esperado</h3>
            <div className="cd">
              Recebido ÷ aluguel esperado · <span className="src">fonte: cadastro + prestação</span>
            </div>
          </div>
          <div className="scale">
            <span>Atenção</span>
            <div className="bar">
              <i style={{ background: "#C0432F" }} />
              <i style={{ background: "#E8A15A" }} />
              <i style={{ background: "#F4D58A" }} />
              <i style={{ background: "#7FC98C" }} />
              <i style={{ background: "var(--green)" }} />
            </div>
            <span>Realizado</span>
          </div>
        </div>
        <div className="rank">
          {data.ranking.length === 0 && <div className="empty">Sem linhas de receita para os filtros atuais.</div>}
          {data.ranking.map((it, i) => {
            const [cls, lbl] = realizTag(it.pct)
            const color = realizColor(it.pct)
            return (
              <div className="ri" key={`${it.empreendimento}-${it.apto}-${i}`}>
                <div className="pos">{i + 1}</div>
                <div className="nm">
                  <b>
                    {it.apto} · {it.inquilino}
                  </b>
                  <span>{it.empreendimento}</span>
                </div>
                <div className="barwrap">
                  <div className="bar">
                    <i style={{ width: `${Math.min(it.pct, 100)}%`, background: color }} />
                  </div>
                </div>
                <div className="yld" style={{ color }}>
                  {Math.round(it.pct)}%
                </div>
                <div className={`tg ${cls}`}>{lbl}</div>
              </div>
            )
          })}
        </div>
      </div>

      <Pendencias data={data} />
    </>
  )
}

// soma os ofensores abaixo (na pilha) do ofensor atual, em % do potencial
function cumulativeBelow(ofensores: IndicadoresData["cascata"]["ofensores"], current: { key: string }, potencial: number): number {
  let acc = 0
  let passed = false
  for (const o of ofensores) {
    if (o.key === current.key) {
      passed = true
      continue
    }
    if (passed) acc += potencial > 0 ? (o.valor / potencial) * 100 : 0
  }
  return acc
}

/* ============ MAPA DE CALOR ============ */
function ViewMapa({
  data,
  heatMetric,
  setHeatMetric,
}: {
  data: IndicadoresData
  heatMetric: HeatMetric
  setHeatMetric: (m: HeatMetric) => void
}) {
  const meses = data.heat.meses
  const rows: HeatRow[] = heatMetric === "inad" ? data.heat.inad : data.heat.vac
  const max = heatMetric === "inad" ? data.heat.inadMax : data.heat.vacMax
  const mediaCarteira = heatMetric === "inad" ? data.heat.inadMediaCarteira : data.heat.vacMediaCarteira
  const titulo =
    heatMetric === "inad"
      ? "Inadimplência acumulada (% da receita do mês) por empreendimento"
      : "Vacância (%) por empreendimento"

  return (
    <>
      <div className="ph sub">
        <div>
          <h2>{heatMetric === "inad" ? "Mapa de inadimplência" : "Mapa de vacância"}</h2>
          <p>Por empreendimento, mês a mês — preenche conforme os fechamentos mensais são processados.</p>
        </div>
        <div className="seg">
          <button className={heatMetric === "inad" ? "on" : ""} onClick={() => setHeatMetric("inad")}>
            <span className="d" style={{ background: "var(--red)" }} /> Inadimplência
          </button>
          <button className={heatMetric === "vac" ? "on" : ""} onClick={() => setHeatMetric("vac")}>
            <span className="d" style={{ background: "var(--amber)" }} /> Vacância
          </button>
        </div>
      </div>

      <div className="card">
        <div className="hh">
          <div>
            <h3>{titulo}</h3>
            <div className="cd">
              Passe o mouse nas células para o valor exato · <span className="src">fonte: fechamentos mensais</span>
            </div>
          </div>
          <div className="scale">
            <span>0%</span>
            <div className="bar">
              <i style={{ background: "#EFF6F0" }} />
              <i style={{ background: "#BFE3C6" }} />
              <i style={{ background: "#7FC98C" }} />
              <i style={{ background: "#F4D58A" }} />
              <i style={{ background: "#E8A15A" }} />
              <i style={{ background: "#C0432F" }} />
            </div>
            <span>{max}%+</span>
          </div>
        </div>

        <div className="heat-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th className="row">Empreendimento</th>
                {meses.map((m) => (
                  <th key={m.value}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.empreendimento}>
                  <td className="lbl">
                    {r.empreendimento}
                    <small>{r.media !== null ? `média ${fmt1(r.media)}%` : "—"}</small>
                  </td>
                  {r.valores.map((v, j) => (
                    <td
                      key={j}
                      className={`cellc ${heatClass(v, max)}`}
                      title={`${r.empreendimento} · ${meses[j]?.label}: ${v === null ? "sem dados" : fmt1(v) + "%"}`}
                    >
                      {v === null ? "" : fmt1(v)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="lbl" colSpan={meses.length + 1}>
                    Sem dados para esta métrica ainda.
                  </td>
                </tr>
              )}
              <tr className="totals">
                <td className="lbl">Carteira (média)</td>
                {mediaCarteira.map((v, j) => (
                  <td
                    key={j}
                    className={`cellc ${heatClass(v, max)} bold`}
                    title={`Carteira · ${meses[j]?.label}: ${v === null ? "sem dados" : fmt1(v) + "%"}`}
                  >
                    {v === null ? "" : fmt1(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="note">
          <Info size={15} />
          <span>
            Verde = saudável · vermelho = atenção. A linha inferior consolida a carteira em cada mês e segue a mesma escala
            de cores. {heatMetric === "vac" ? "Vacância usa o estado atual do cadastro (sem histórico mensal ainda)." : ""}
          </span>
        </div>
      </div>
    </>
  )
}

/* ============ REGISTRO DE PAGAMENTOS ============ */
function ViewRegistro({ data }: { data: IndicadoresData }) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return data.registro
    return data.registro.filter(
      (r) =>
        r.apto.toLowerCase().includes(t) ||
        r.inquilino.toLowerCase().includes(t) ||
        r.empreendimento.toLowerCase().includes(t),
    )
  }, [q, data.registro])

  return (
    <>
      <div className="sect">Registro de pagamentos por apto e inquilino</div>
      <div className="card">
        <div className="hh">
          <div>
            <h3>Pagamentos extraídos</h3>
            <div className="cd">
              Todas as competências processadas · <span className="src">fonte: prestação de contas (receitas por imóvel)</span>
            </div>
          </div>
          <input className="search" placeholder="Buscar apto, inquilino ou empreendimento…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="reg-wrap">
          <table className="reg">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Apto</th>
                <th>Inquilino</th>
                <th>Empreendimento</th>
                <th className="r">Aluguel</th>
                <th className="r">Desconto</th>
                <th className="r">Total pago</th>
                <th className="r">Repasse</th>
                <th>Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.competencia}-${r.apto}-${i}`}>
                  <td>{r.competenciaLabel}</td>
                  <td className="b">{r.apto}</td>
                  <td>{r.inquilino}</td>
                  <td className="muted">{r.empreendimento}</td>
                  <td className="r">{r.aluguel !== null ? formatBRL(r.aluguel) : "—"}</td>
                  <td className="r">{r.desconto ? formatBRL(r.desconto) : "—"}</td>
                  <td className="r b">{formatBRL(r.total)}</td>
                  <td className="r">{r.repasse !== null ? formatBRL(r.repasse) : "—"}</td>
                  <td>{r.vencimento ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted center">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="note">
          <Info size={15} /> <span>{filtered.length} lançamento(s) · um por imóvel/competência extraído da prestação.</span>
        </div>
      </div>
    </>
  )
}

/* ============ helpers de UI ============ */
function Quad({ t, n, x, amber, pending }: { t: string; n: string; x?: string; amber?: boolean; pending?: boolean }) {
  return (
    <div className={`q ${pending ? "pending" : ""}`}>
      <div className="t">{t}</div>
      <div className="n" style={amber ? { color: "var(--amber)" } : undefined}>
        {n}
      </div>
      {x && <div className="x">{x}</div>}
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  danger,
  pending,
}: {
  label: string
  value: string
  sub?: string
  danger?: boolean
  pending?: boolean
}) {
  return (
    <div className="rw">
      <div className="l">{label}</div>
      <div className="vv" style={danger ? { color: "var(--red)" } : pending ? { color: "var(--muted)" } : undefined}>
        {value}
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

function Bar({ label, value, width, amber }: { label: string; value: number | null; width: number; amber?: boolean }) {
  return (
    <div className="pr">
      <div className="top">
        <span>{label}</span>
        <b>{value !== null ? formatPercent(value) : "—"}</b>
      </div>
      <div className="track">
        <i style={{ width: `${Math.min(Math.max(width, 0), 100)}%`, background: amber ? "var(--amber)" : "var(--green)" }} />
      </div>
    </div>
  )
}

function Pendencias({ data }: { data: IndicadoresData }) {
  if (data.pendencias.length === 0) return null
  return (
    <>
      <div className="sect">Aguardando dados</div>
      <div className="future">
        <h3>Indicadores que preenchem com o tempo</h3>
        <div className="cd">Dependem de dados ainda não extraídos. Aparecem automaticamente conforme novos fechamentos.</div>
        <ul>
          {data.pendencias.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    </>
  )
}

/* ============ CSS (escopado em .indic) ============ */
const INDIC_CSS = `
.indic{
  --ink:#1A2B1C; --card:#fff; --green:#2D8C3A; --green-d:#1A2B1C; --green-soft:#DDEEE1; --green-tint:#EFF6F0;
  --muted:#6B7F6E; --muted2:#3D4F3F; --line:#EEF1EE; --line2:#E2E8E3;
  --amber:#B7791F; --amber-soft:#FBF3E4; --red:#C0432F; --red-soft:#FBEDEA; --blue:#3A6EA5;
  color:var(--ink);
}
.indic h1{font-size:23px;font-weight:700;letter-spacing:-.4px}
.indic h2{font-size:19px;font-weight:700;letter-spacing:-.3px}
.indic .ph{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px}
.indic .ph p{font-size:13.5px;color:var(--muted);margin-top:4px;max-width:600px;line-height:1.5}
.indic .ph.sub{margin-top:4px}
.indic .filters{display:flex;gap:8px;flex-wrap:wrap}
.indic .filters select,.indic .search{font:inherit;font-size:12.5px;font-weight:500;color:var(--muted2);background:#fff;border:1px solid var(--line2);border-radius:9px;padding:8px 12px;cursor:pointer;outline:none}
.indic .search{min-width:280px;cursor:text}
.indic .filters select:focus,.indic .search:focus{border-color:var(--green)}

.indic .subtabs{display:flex;gap:24px;border-bottom:1px solid var(--line);margin-bottom:18px;overflow-x:auto}
.indic .subtab{padding:0 0 12px;font-size:13.5px;font-weight:500;color:var(--muted);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
.indic .subtab:hover{color:var(--ink)}
.indic .subtab.on{color:var(--green);border-bottom-color:var(--green);font-weight:600}

.indic .state{display:flex;align-items:center;gap:10px;padding:24px;color:var(--muted);font-size:13.5px}
.indic .state.err{color:var(--red)}
.indic .spin{animation:indic-spin 1s linear infinite}
@keyframes indic-spin{to{transform:rotate(360deg)}}

.indic .kpi-head{display:flex;justify-content:flex-end;margin-bottom:14px}
.indic .seg{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:10px;padding:3px}
.indic .seg button{border:none;background:none;font:inherit;font-size:12.5px;font-weight:500;color:var(--muted);padding:7px 15px;border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:7px}
.indic .seg button .d{width:8px;height:8px;border-radius:3px;background:var(--line2)}
.indic .seg button.on{background:var(--green);color:#fff}.indic .seg button.on .d{background:#fff}

.indic .sect{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:600;margin:26px 2px 12px;display:flex;align-items:center;gap:10px}
.indic .sect::after{content:"";flex:1;height:1px;background:var(--line)}

.indic .grid{display:grid;gap:16px}
.indic .g5{grid-template-columns:repeat(5,1fr)}.indic .g2{grid-template-columns:1.5fr 1fr}
.indic .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.indic .card h3{font-size:14.5px;font-weight:600;letter-spacing:-.2px}
.indic .card .cd{font-size:12px;color:var(--muted);margin-top:2px;margin-bottom:16px}
.indic .src{font-size:11px;color:var(--muted);font-weight:500;opacity:.85}
.indic .hh{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px}
.indic .hh h3{margin:0}.indic .hh .cd{margin:0}
.indic .empty{color:var(--muted);font-size:12.5px;padding:8px 2px}

.indic .kpi .k{font-size:12.5px;color:var(--muted);font-weight:500;display:flex;align-items:center;gap:8px}
.indic .kpi .k .d{width:8px;height:8px;border-radius:3px}
.indic .kpi .v{font-size:26px;font-weight:700;letter-spacing:-1px;margin-top:13px;line-height:1}
.indic .kpi .s{font-size:12px;color:var(--muted);margin-top:7px}

.indic .bars{display:flex;align-items:flex-end;gap:16px;height:170px}
.indic .bc{flex:1;display:flex;flex-direction:column;align-items:center;gap:9px;justify-content:flex-end;height:100%}
.indic .bc .col{width:60%;max-width:40px;border-radius:7px 7px 0 0;background:var(--green-soft);position:relative;display:flex;justify-content:center}
.indic .bc .col.hl{background:var(--green)}
.indic .bc .col .t{position:absolute;top:-20px;font-size:10.5px;font-weight:600;color:var(--ink);white-space:nowrap}
.indic .bc .x{font-size:11px;color:var(--muted);font-weight:500}

.indic .dw{display:flex;align-items:center;gap:24px}
.indic .donut{width:140px;height:140px;border-radius:50%;background:conic-gradient(var(--green) calc(var(--p,0)*1%),var(--green-soft) 0);display:flex;align-items:center;justify-content:center;flex:none}
.indic .donut .h{width:102px;height:102px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.indic .donut .h b{font-size:27px;font-weight:700}.indic .donut .h span{font-size:11px;color:var(--muted)}
.indic .leg{display:flex;flex-direction:column;gap:12px}
.indic .leg .it{font-size:13px;display:flex;align-items:center;gap:9px;color:var(--muted2)}.indic .leg .it b{color:var(--ink)}
.indic .leg .dot{width:11px;height:11px;border-radius:4px;flex:none}

.indic .quads{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.indic .q{background:#fff;padding:15px}
.indic .q.pending{background:repeating-linear-gradient(45deg,#fff,#fff 8px,#fcfdfc 8px,#fcfdfc 16px)}
.indic .q .t{font-size:11px;color:var(--muted);font-weight:500}.indic .q .n{font-size:20px;font-weight:700;letter-spacing:-.5px;margin-top:6px}.indic .q .x{font-size:10.5px;color:var(--muted);margin-top:2px}

.indic .rows{display:flex;flex-direction:column}
.indic .rw{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.indic .rw:first-child{padding-top:0}.indic .rw:last-child{border:none;padding-bottom:0}
.indic .rw .l{font-weight:500}
.indic .rw .vv{font-weight:700;font-size:15px;text-align:right}.indic .rw .vv small{display:block;font-size:11px;color:var(--muted);font-weight:500}

.indic .pr{margin-top:18px}.indic .pr:first-child{margin-top:4px}
.indic .pr .top{display:flex;justify-content:space-between;font-size:13px;font-weight:500}.indic .pr .top b{font-weight:700}
.indic .track{height:8px;background:var(--green-soft);border-radius:999px;margin-top:8px;overflow:hidden}.indic .track i{display:block;height:100%;border-radius:999px;background:var(--green)}

.indic .wf{display:flex;align-items:flex-end;gap:8px;height:280px;padding-top:24px}
.indic .wcol{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;gap:10px;position:relative}
.indic .wbox{width:78%;border-radius:7px;position:relative;display:flex;align-items:flex-start;justify-content:center}
.indic .wbox .amt{position:absolute;top:-21px;font-size:11px;font-weight:700;white-space:nowrap}
.indic .wbox.base{background:var(--green-d)}.indic .wbox.fin{background:var(--green)}
.indic .wbox.loss{background:var(--red)}.indic .wbox.loss.pending{background:var(--line2)}.indic .wbox.spacer{background:transparent}
.indic .wcol .xl{font-size:11px;color:var(--muted2);font-weight:600;text-align:center;line-height:1.35}
.indic .wcol .pct{font-size:10.5px;color:var(--muted);font-weight:500}

.indic .rank{display:flex;flex-direction:column}
.indic .ri{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.indic .ri:last-child{border:none}
.indic .ri .pos{width:24px;font-size:13px;font-weight:700;color:var(--muted);text-align:center}
.indic .ri .nm{flex:1;min-width:0}.indic .ri .nm b{font-size:13.5px;font-weight:600;display:block}.indic .ri .nm span{font-size:11.5px;color:var(--muted)}
.indic .ri .barwrap{flex:1.4;max-width:240px}.indic .ri .bar{height:9px;background:var(--green-soft);border-radius:999px;overflow:hidden}.indic .ri .bar i{display:block;height:100%;border-radius:999px}
.indic .ri .yld{width:56px;text-align:right;font-size:15px;font-weight:700}
.indic .ri .tg{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;width:max-content}
.indic .tg.ok{background:var(--green-tint);color:var(--green)}.indic .tg.mid{background:var(--amber-soft);color:var(--amber)}.indic .tg.bad{background:var(--red-soft);color:var(--red)}

.indic .scale{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted)}
.indic .scale .bar{display:flex;border-radius:5px;overflow:hidden;height:12px;width:150px}.indic .scale .bar i{flex:1}
.indic .heat-wrap,.indic .reg-wrap{overflow-x:auto}
.indic .heat{width:100%;border-collapse:separate;border-spacing:4px}
.indic .heat th{font-size:11px;color:var(--muted);font-weight:600;padding:4px;text-align:center}
.indic .heat th.row{text-align:left;width:180px}
.indic .heat td.lbl{font-size:12.5px;font-weight:500;text-align:left;padding-right:8px;white-space:nowrap}
.indic .heat td.lbl small{display:block;font-size:10.5px;color:var(--muted);font-weight:400}
.indic .cellc{height:36px;min-width:42px;border-radius:7px;text-align:center;font-size:11.5px;font-weight:600;transition:transform .08s}
.indic .cellc.bold{font-weight:700}
.indic .cellc:hover{transform:scale(1.09);box-shadow:0 2px 8px rgba(26,43,28,.18)}
.indic .cell-empty{background:repeating-linear-gradient(45deg,#fafbfa,#fafbfa 5px,#f1f4f1 5px,#f1f4f1 10px);color:transparent}
.indic .q0{background:#EFF6F0;color:#3D4F3F}.indic .q1{background:#BFE3C6;color:#1A2B1C}.indic .q2{background:#7FC98C;color:#143b1a}
.indic .q3{background:#F4D58A;color:#5c4410}.indic .q4{background:#E8A15A;color:#fff}.indic .q5{background:#C0432F;color:#fff}
.indic .heat tr.totals td{border-top:2px solid var(--line);padding-top:8px}

.indic .reg{width:100%;border-collapse:collapse;font-size:12.5px}
.indic .reg th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line)}
.indic .reg th.r{text-align:right}
.indic .reg td{padding:9px 10px;border-bottom:1px solid var(--line)}
.indic .reg td.r{text-align:right}.indic .reg td.b{font-weight:600}.indic .reg td.muted{color:var(--muted)}.indic .reg td.center{text-align:center}
.indic .reg tr:hover td{background:var(--green-tint)}

.indic .note{font-size:12px;color:var(--muted);margin-top:14px;display:flex;align-items:center;gap:8px}.indic .note svg{color:var(--green);flex:none}
.indic .future{border:1px dashed var(--line2);border-radius:13px;padding:20px;background:repeating-linear-gradient(45deg,#fff,#fff 10px,#fcfdfc 10px,#fcfdfc 20px)}
.indic .future h3{font-size:14px;font-weight:600}
.indic .future .cd{font-size:12px;color:var(--muted);margin:3px 0 12px}
.indic .future ul{margin:0;padding-left:18px;color:var(--muted2);font-size:12.5px;line-height:1.7}

@media(max-width:1100px){.indic .g5{grid-template-columns:repeat(2,1fr)}.indic .g2{grid-template-columns:1fr}.indic .quads{grid-template-columns:repeat(2,1fr)}}
`
