// Relatorio dos Indicadores em PDF (Anexo I, item 5b). Desenha o modelo puro
// de `lib/indicadores-relatorio.ts` com @react-pdf/renderer — gerado no
// servidor, sem navegador, com a fonte e a paleta da ACR embutidas.
//
// O que aparece aqui e o que a tela mostra no mesmo recorte (competencia,
// empresa, empreendimento, imovel): mesmos rotulos, mesmos numeros, mesmo "—"
// para desconhecido. Nada e recalculado neste arquivo.
import path from "node:path"
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import type { IndicadoresData } from "@/lib/indicadores-types"
import {
  montarRelatorioIndicadores,
  type KpiRelatorio,
  type RelatorioIndicadores,
  type TabelaRelatorio,
  type TomRelatorio,
} from "@/lib/indicadores-relatorio"

const CORES = {
  green: "#2d8c3a",
  greenStrong: "#1a5c24",
  ink: "#1a2b1c",
  muted: "#6b7f6e",
  line: "#e3e8e3",
  soft: "#ddeee1",
  tint: "#eff6f0",
  amber: "#b7791f",
  amberSoft: "#fbf3e4",
  red: "#c0432f",
  redSoft: "#fbedea",
}

const FONTE = "DM Sans"
let fontesRegistradas = false

function registrarFontes() {
  if (fontesRegistradas) return
  const pasta = path.join(process.cwd(), "public", "fonts")
  Font.register({
    family: FONTE,
    fonts: [
      { src: path.join(pasta, "DMSans-400.ttf"), fontWeight: 400 },
      { src: path.join(pasta, "DMSans-500.ttf"), fontWeight: 500 },
      { src: path.join(pasta, "DMSans-700.ttf"), fontWeight: 700 },
    ],
  })
  // Sem hifenizacao: "Inadim-plência" quebrado no meio le pior que uma linha a mais.
  Font.registerHyphenationCallback((palavra) => [palavra])
  fontesRegistradas = true
}

const s = StyleSheet.create({
  page: { fontFamily: FONTE, fontSize: 9, color: CORES.ink, paddingTop: 36, paddingBottom: 44, paddingHorizontal: 36 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: CORES.green, paddingBottom: 8, marginBottom: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 30, height: 30, borderRadius: 15, backgroundColor: CORES.greenStrong, alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontSize: 9, fontWeight: 700 },
  h1: { fontSize: 14, fontWeight: 700, color: CORES.greenStrong },
  sub: { fontSize: 8, color: CORES.muted, marginTop: 1 },
  metaRight: { alignItems: "flex-end" },
  metaStrong: { fontSize: 10, fontWeight: 700 },
  meta: { fontSize: 7.5, color: CORES.muted },
  chip: { fontSize: 7.5, fontWeight: 600, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, marginTop: 3 },
  h2: { fontSize: 10.5, fontWeight: 700, color: CORES.greenStrong, marginTop: 12, marginBottom: 5 },
  h2sub: { fontSize: 8, color: CORES.muted, fontWeight: 400 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpi: { width: "23.5%", borderWidth: 1, borderColor: CORES.line, borderTopWidth: 2.5, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8 },
  kpiRotulo: { fontSize: 7, color: CORES.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  kpiValor: { fontSize: 12.5, fontWeight: 700, marginTop: 2 },
  kpiNota: { fontSize: 7, color: CORES.muted, marginTop: 2 },
  duasColunas: { flexDirection: "row", gap: 12 },
  coluna: { flex: 1 },
  tabela: { borderWidth: 1, borderColor: CORES.line, borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: CORES.line, paddingVertical: 3.5, paddingHorizontal: 6 },
  th: { fontSize: 6.5, color: CORES.muted, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, paddingRight: 4 },
  td: { fontSize: 8, paddingRight: 4 },
  tdNum: { textAlign: "right", paddingRight: 0, paddingLeft: 4 },
  destaque: { backgroundColor: CORES.tint, fontWeight: 700 },
  ocupacaoBarra: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 6 },
  legenda: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  legendaItem: { flexDirection: "row", alignItems: "center", gap: 3, fontSize: 7.5, color: CORES.muted },
  legendaCor: { width: 7, height: 7, borderRadius: 2 },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CORES.muted, borderTopWidth: 0.5, borderTopColor: CORES.line, paddingTop: 5 },
})

const COR_TOM: Record<TomRelatorio, { borda: string; texto: string; fundo: string }> = {
  neutro: { borda: CORES.green, texto: CORES.ink, fundo: CORES.tint },
  positivo: { borda: CORES.green, texto: CORES.greenStrong, fundo: CORES.soft },
  alerta: { borda: CORES.amber, texto: CORES.amber, fundo: CORES.amberSoft },
  perigo: { borda: CORES.red, texto: CORES.red, fundo: CORES.redSoft },
}

const COR_OCUPACAO: Record<string, string> = {
  Ocupado: CORES.green,
  "Alugado por app": "#5b3f97",
  Inadimplente: CORES.red,
  "Em rescisão": "#315b88",
  Vago: CORES.amber,
  Desconhecido: "#b9c2ba",
}

function Cabecalho({ r }: { r: RelatorioIndicadores }) {
  const tom = COR_TOM[r.confianca.tom]
  return (
    <View style={s.header} fixed>
      <View style={s.brand}>
        <View style={s.mark}><Text style={s.markText}>ACR</Text></View>
        <View>
          <Text style={s.h1}>{r.titulo} — {r.competenciaLabel}</Text>
          <Text style={s.sub}>{r.escopo.join(" · ")}</Text>
        </View>
      </View>
      <View style={s.metaRight}>
        <Text style={s.metaStrong}>Gerado em {r.geradoEm}</Text>
        <Text style={s.meta}>Dados atualizados em {r.atualizadoEm}</Text>
        <Text style={[s.chip, { backgroundColor: tom.fundo, color: tom.texto }]}>{r.confianca.rotulo}</Text>
      </View>
    </View>
  )
}

function Rodape() {
  return (
    <View style={s.rodape} fixed>
      <Text>ACR Empreendimentos · Plataforma de fechamentos imobiliários</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

function Titulo({ texto, sub }: { texto: string; sub?: string | null }) {
  return (
    <Text style={s.h2}>
      {texto}
      {sub ? <Text style={s.h2sub}>  {sub}</Text> : null}
    </Text>
  )
}

function Kpi({ kpi }: { kpi: KpiRelatorio }) {
  const tom = COR_TOM[kpi.tom ?? "neutro"]
  return (
    <View style={[s.kpi, { borderTopColor: tom.borda }]} wrap={false}>
      <Text style={s.kpiRotulo}>{kpi.rotulo}</Text>
      <Text style={[s.kpiValor, kpi.tom && kpi.tom !== "neutro" ? { color: tom.texto } : {}]}>{kpi.valor}</Text>
      {kpi.nota ? <Text style={s.kpiNota}>{kpi.nota}</Text> : null}
    </View>
  )
}

function Tabela({ t, compacta = false }: { t: TabelaRelatorio; compacta?: boolean }) {
  const larguras = t.larguras ?? t.cabecalho.map(() => 1)
  const total = larguras.reduce((a, b) => a + b, 0)
  const largura = (i: number) => ({ width: `${(larguras[i] / total) * 100}%` })
  const fonte = compacta ? { fontSize: 6.8 } : {}
  return (
    <View>
      <Titulo texto={t.titulo} sub={t.subtitulo} />
      <View style={s.tabela}>
        <View style={[s.tr, { backgroundColor: "#fafbfa" }]} fixed>
          {t.cabecalho.map((c, i) => (
            <Text key={i} style={[s.th, largura(i), t.colunasNumericas.includes(i) ? s.tdNum : {}]}>{c}</Text>
          ))}
        </View>
        {t.linhas.map((linha, li) => {
          const tom = linha.tom && linha.tom !== "neutro" ? COR_TOM[linha.tom] : null
          return (
            <View key={li} style={[s.tr, linha.destaque ? s.destaque : {}]} wrap={false}>
              {linha.celulas.map((c, i) => (
                <Text
                  key={i}
                  style={[
                    s.td,
                    fonte,
                    largura(i),
                    t.colunasNumericas.includes(i) ? s.tdNum : {},
                    linha.destaque ? { fontWeight: 700 } : {},
                    tom && (t.colunasNumericas.includes(i) || t.cabecalho.length <= 3) ? { color: tom.texto, fontWeight: 600 } : {},
                  ]}
                >
                  {c}
                </Text>
              ))}
            </View>
          )
        })}
      </View>
    </View>
  )
}

function Ocupacao({ itens }: { itens: RelatorioIndicadores["ocupacao"] }) {
  const total = itens.reduce((a, b) => a + b.quantidade, 0)
  if (total === 0) return null
  return (
    <View>
      <Titulo texto="Situação das unidades" sub={`${total} imóveis com situação conhecida`} />
      <View style={s.ocupacaoBarra}>
        {itens.map((item) => (
          <View key={item.rotulo} style={{ width: `${(item.quantidade / total) * 100}%`, backgroundColor: COR_OCUPACAO[item.rotulo] ?? CORES.muted }} />
        ))}
      </View>
      <View style={s.legenda}>
        {itens.map((item) => (
          <View key={item.rotulo} style={s.legendaItem}>
            <View style={[s.legendaCor, { backgroundColor: COR_OCUPACAO[item.rotulo] ?? CORES.muted }]} />
            <Text>{item.rotulo} {item.quantidade}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function RelatorioIndicadoresDocument({ relatorio: r }: { relatorio: RelatorioIndicadores }) {
  return (
    <Document title={`${r.titulo} — ${r.competenciaLabel}`} author="ACR Empreendimentos" language="pt-BR">
      <Page size="A4" style={s.page}>
        <Cabecalho r={r} />
        <Titulo texto="Visão geral" />
        <View style={s.kpiGrid}>
          {r.kpis.map((kpi) => <Kpi key={kpi.rotulo} kpi={kpi} />)}
        </View>
        <Ocupacao itens={r.ocupacao} />
        <View style={s.duasColunas}>
          <View style={s.coluna}><Tabela t={r.receitasAoRepasse} /></View>
          <View style={s.coluna}><Tabela t={r.contratoAoRecebido} /></View>
        </View>
        <View style={s.duasColunas} wrap={false}>
          <View style={s.coluna}>{r.acordosRescisoes ? <Tabela t={r.acordosRescisoes} /> : null}</View>
          <View style={s.coluna}><Tabela t={r.despesaDetalhada} /></View>
        </View>
        <Tabela t={r.evolucaoMensal} />
        {r.atencao ? <Tabela t={r.atencao} /> : null}
        <Rodape />
      </Page>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Cabecalho r={r} />
        <Tabela t={r.detalhamento} compacta />
        <Rodape />
      </Page>
    </Document>
  )
}

export async function gerarPdfIndicadores(data: IndicadoresData, agora: Date = new Date()) {
  registrarFontes()
  const relatorio = montarRelatorioIndicadores(data, agora)
  const buffer = await renderToBuffer(<RelatorioIndicadoresDocument relatorio={relatorio} />)
  return { buffer, nomeArquivo: relatorio.nomeArquivo }
}
