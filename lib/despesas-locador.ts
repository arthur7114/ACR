import type { PrestacaoAnalysis, PrestacaoResumoDespesa } from "@/lib/prestacao-types"

// Só comissão de administração e intermediação têm baldes próprios; todo o resto
// (TED/PIX, desconto, reembolso, utilidades) é despesa do locador (ADR-0001).
// "intermedia" é checado ANTES de "comiss" porque "comissão de intermediação"
// pertence ao balde de intermediação.
export type CategoriaLancamento = "comissao" | "intermediacao" | "despesa"

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

export function classificarLancamento(descricao: string): CategoriaLancamento {
  const t = normalizar(descricao)
  if (/intermedia/.test(t)) return "intermediacao"
  if (/comiss/.test(t)) return "comissao"
  return "despesa"
}

const TOLERANCIA = 0.01

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function sum(valores: number[]): number {
  return valores.reduce((total, valor) => total + valor, 0)
}

// Item de crédito no resumo (ex.: "OUTROS CREDITOS") REDUZ a despesa líquida —
// entra com sinal negativo. "Débito" tem prioridade quando a linha cita ambos.
function ehCreditoQueReduz(descricao: string): boolean {
  const t = normalizar(descricao)
  if (/debito/.test(t)) return false
  return /credito|reduz/.test(t)
}

// Subdetector de tarifa bancária dentro do balde "despesa" (TED/PIX/DOC/tarifa).
// NÃO casa a linha-resíduo "Taxas e outros retidos" (não itemizada, fora do
// rateio). A classificação em `classificarLancamento` continua "despesa"
// (ADR-0001); isto só distingue a tarifa para efeito de rateio/eGestor.
export function ehTarifaBancaria(descricao: string): boolean {
  const t = normalizar(descricao)
  return /\bted\b|\bpix\b|\bdoc\b|tarifa|taxa banc/.test(t)
}

// Soma das TEDs/tarifas bancárias itemizadas no resumo reconciliado. Exclui o
// resíduo não itemizado. Zero ⇒ nada a ratear.
export function valorTedItemizada(prestacao: PrestacaoAnalysis): number {
  return arredondar(
    sum(
      (prestacao.resumo_financeiro?.outras_comissoes_despesas ?? [])
        .filter((d) => ehTarifaBancaria(d.descricao))
        .map((d) => d.valor),
    ),
  )
}

// Divide um total (reais) em n partes iguais pelo método do maior resto em
// centavos: soma exata e sobra de 1 centavo distribuída às primeiras partes
// (determinístico). Ex.: 11,10 / 4 ⇒ [2,78, 2,78, 2,77, 2,77].
export function ratearIgualmente(totalReais: number, n: number): number[] {
  if (n <= 0) return []
  const totalCentavos = Math.round(totalReais * 100)
  const base = Math.floor(totalCentavos / n)
  const resto = totalCentavos - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

export interface FatiaTed {
  imovel_id: string | null
  apto: string
  valor: number
}

// Rateia a TED itemizada igualmente entre os imóveis com receita (total > 0).
// Vazio quando não há TED itemizada ou não há imóvel elegível. A soma das fatias
// é exatamente `valorTedItemizada` — é redistribuição, não altera totais.
export function ratearTedPorImovel(prestacao: PrestacaoAnalysis): FatiaTed[] {
  const total = valorTedItemizada(prestacao)
  if (total <= 0) return []
  const imoveis = prestacao.receitas_por_imovel.filter((row) => (row.total ?? 0) > 0)
  if (imoveis.length === 0) return []
  const fatias = ratearIgualmente(total, imoveis.length)
  return imoveis.map((row, i) => ({
    imovel_id: row.imovel_id ?? null,
    apto: row.apto,
    valor: fatias[i],
  }))
}

export interface ResumoDespesasReconciliado {
  recebidosEmNomeLocador: number | null
  outrasComissoesDespesas: PrestacaoResumoDespesa[]
  totalOutrasComissoesDespesas: number
  totalComissaoDespesas: number | null
  pendencia: string | null
}

// Reconstrói a receita bruta e a lista de despesas do locador a partir da
// prestação já extraída (ADR-0001). Puro. Reembolsos por linha voltam pro bruto;
// descontos simples e taxas bancárias ficam retidos; o resíduo (taxas não
// itemizadas) fecha a equação. Ver "Álgebra da reconstrução" no plano.
export function reconciliarResumoDespesas(prestacao: PrestacaoAnalysis): ResumoDespesasReconciliado {
  const resumo = prestacao.resumo_financeiro
  const recebidosImpresso = resumo.recebidos_em_nome_locador
  const repasse = resumo.total_a_repassar
  // A comissao_administracao do resumo cobre so as linhas regulares da tabela.
  // Intermediacao tem balde proprio (ADR-0001) e seu valor bruto costuma vir
  // somado ao recebido do locador pelo proprio documento, mas a comissao retida
  // sobre ela fica de fora de comissao_administracao — some aqui pra nao vazar
  // pra despesa via residuo (confirmado com dado real: LOCMAIS maio/2026).
  const comissaoIntermediacao = arredondar(
    sum(
      (prestacao.acordos_rescisoes_recebidos ?? [])
        .filter((item) => item.tipo === "intermediacao")
        .map((item) => item.comissao ?? 0),
    ),
  )
  const comissao = (resumo.comissao_administracao ?? 0) + comissaoIntermediacao

  // Despesas que a IA já entregou itemizadas (outros layouts): só as que são
  // "despesa" (exclui comissão/intermediação), com sinal de crédito preservado.
  const despesasIA: PrestacaoResumoDespesa[] = resumo.outras_comissoes_despesas
    .filter((d) => classificarLancamento(d.descricao) === "despesa")
    .map((d) => ({
      descricao: d.descricao,
      valor: ehCreditoQueReduz(d.descricao) ? -Math.abs(arredondar(d.valor)) : arredondar(d.valor),
      confianca: d.confianca,
    }))

  // Reembolsos e descontos por linha (LAYOUT C): reconstruir a partir do campo
  // `desconto` de cada imóvel. Reembolso vs desconto simples pela observação.
  const reembolsos: PrestacaoResumoDespesa[] = []
  const descontosSimples: PrestacaoResumoDespesa[] = []
  for (const row of prestacao.receitas_por_imovel) {
    const desconto = row.desconto ?? 0
    if (desconto <= 0) continue
    const ehReembolso = /reembolso/.test(normalizar(row.observacao ?? ""))
    const item: PrestacaoResumoDespesa = {
      descricao: `${ehReembolso ? "Reembolso" : "Desconto"} — ${row.apto}`,
      valor: arredondar(desconto),
      confianca: row.confianca,
    }
    ;(ehReembolso ? reembolsos : descontosSimples).push(item)
  }

  const somaReembolsos = arredondar(reembolsos.reduce((s, d) => s + d.valor, 0))
  // Reembolsos reduziram o crédito de aluguel => voltam pro bruto.
  const receitaBruta = recebidosImpresso === null ? null : arredondar(recebidosImpresso + somaReembolsos)

  // Consolidado retido recalculado para manter o resumo autoconsistente:
  // recebidos(bruto) − total_comissao_despesas = total_a_repassar.
  const novoTotalComissaoDespesas =
    receitaBruta !== null && repasse !== null ? arredondar(receitaBruta - repasse) : resumo.total_comissao_despesas

  // O campo exposto representa "comissao administrativa + despesas reais" —
  // a comissao de intermediacao NUNCA entra aqui (balde proprio). Downstream
  // (calculateTotals) deriva total_despesas = totalComissaoDespesas −
  // comissao_administracao(raw); sem descontar a intermediacao aqui, ela
  // vazaria de volta pro total mesmo com a LISTA ja correta (bug encontrado
  // ao vivo no LOCMAIS: lista batia, total_despesas nao).
  const totalComissaoDespesasExposto =
    novoTotalComissaoDespesas === null ? null : arredondar(novoTotalComissaoDespesas - comissaoIntermediacao)

  const itensExplicitos = [...despesasIA, ...reembolsos, ...descontosSimples]
  const somaExplicitos = arredondar(itensExplicitos.reduce((s, d) => s + d.valor, 0))

  // Sem consolidado confiável: devolve só os itens explícitos (sem inventar bruto/resíduo).
  if (novoTotalComissaoDespesas === null || receitaBruta === null) {
    return {
      recebidosEmNomeLocador: receitaBruta ?? recebidosImpresso,
      outrasComissoesDespesas: itensExplicitos,
      totalOutrasComissoesDespesas: somaExplicitos,
      totalComissaoDespesas: totalComissaoDespesasExposto,
      pendencia: "Resumo incompleto: recebidos ou total a repassar ausentes.",
    }
  }

  const despesasTotaisAlvo = arredondar(novoTotalComissaoDespesas - comissao)
  const residuo = arredondar(despesasTotaisAlvo - somaExplicitos)

  // Itens explicam MAIS que o retido: suprime a lista e reporta (decisão do grilling).
  if (residuo < -TOLERANCIA) {
    return {
      recebidosEmNomeLocador: receitaBruta,
      outrasComissoesDespesas: [],
      totalOutrasComissoesDespesas: 0,
      totalComissaoDespesas: totalComissaoDespesasExposto,
      pendencia: `Despesas itemizadas (${somaExplicitos.toFixed(2)}) excedem o retido (${despesasTotaisAlvo.toFixed(2)}).`,
    }
  }

  const lista = [...itensExplicitos]
  if (residuo > TOLERANCIA) {
    lista.push({ descricao: "Taxas e outros retidos", valor: residuo, confianca: 1 })
  }
  const totalOutras = arredondar(lista.reduce((s, d) => s + d.valor, 0))

  return {
    recebidosEmNomeLocador: receitaBruta,
    outrasComissoesDespesas: lista,
    totalOutrasComissoesDespesas: totalOutras,
    totalComissaoDespesas: totalComissaoDespesasExposto,
    pendencia: null,
  }
}
