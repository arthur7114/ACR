# Despesa do Locador — receita bruta + itemização das 3 despesas (ADR-0001)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a receita **bruta** do locador e itemizar TODA despesa retida (reembolso, desconto, taxas bancárias) no resumo do fechamento, através de um módulo dedicado `lib/despesas-locador.ts`, implementando o [ADR-0001](../../adr/0001-receita-bruta-despesas-locador.md).

**Architecture:** Hoje o conceito "despesa do locador" vive em três lugares que se contradizem — o prompt da IA, um regex em `package-rechecks.ts` e o agrupamento na `revisao-view.tsx`. Este plano concentra a regra num único **módulo deep** isomórfico (`lib/despesas-locador.ts`): `classificarLancamento()` (comissão / intermediação / despesa) e `reconciliarResumoDespesas()` (reconstrói receita bruta + lista de despesas + consolidado a partir da prestação já extraída, mantendo a equação de repasse fechada). O servidor (`normalizePrestacao`) e a view passam a chamar o mesmo módulo. A extração (IA vision para PDF-imagem; parser local `cesar-rego-parser.ts` para PDF com texto) **não muda** — ela já entrega os campos crus (`recebidos_em_nome_locador`, `comissao_administracao`, `total_a_repassar`, `desconto` por linha); a reconstrução é 100% determinística sobre esses campos.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Zod (`lib/prestacao-types.ts`), `node:test` rodado via `pnpm dlx tsx --test`.

## Global Constraints

- **Gestor de pacotes:** pnpm (`pnpm@11.1.1`). Node ≥ 20 (ambiente atual: v22).
- **Rodar testes:** `pnpm dlx tsx --test <caminho-do-teste>` (não há script `test` no `package.json`; os testes usam `import test from "node:test"` e importam módulos com sufixo `.ts`).
- **Baseline de testes (pré-existente, FORA de escopo):** em `lib/server/package-rechecks.test.ts` já falham 2 testes em `main` limpo — `"gera divergencia real quando soma de comissao completa difere do consolidado"` e `"bloqueia possivel acordo ou rescisao repetido"`. NÃO corrigir aqui. Critério de sucesso = nenhum teste NOVO falha e esses 2 continuam sendo os únicos 2 vermelhos (não aumentar).
- **Dinheiro:** arredondar sempre com `roundMoney` (2 casas). Tolerância de igualdade: `MONEY_TOLERANCE = 0.01`.
- **Semântica:** governada pelo [ADR-0001](../../adr/0001-receita-bruta-despesas-locador.md) e pelo glossário [CONTEXT.md](../../../CONTEXT.md). "Despesa do locador" = tudo retido além da comissão de administração (inclui TED/PIX, desconto, reembolso); exclui comissão e intermediação (baldes próprios). Comissão calculada permanece sobre receita **líquida** (não mexer na base).
- **Escopo GLOBAL:** a regra vale para todas as imobiliárias/layouts, não só Cesar Rego (Pompilio).
- **Banco de produção:** escrita direta é BLOQUEADA pelo classificador. Mudança de código só reflete no dado salvo após REPROCESSAR (re-upload dos PDFs) — feito pelo usuário. Não tentar `update` no banco.
- **Scratch:** apagar quaisquer `scratch-*.ts` / `scratch-*.mjs` antes de `pnpm lint` e antes de qualquer commit (senão o lint quebra).
- **Commits:** commitar localmente a cada task. NÃO fazer `git push` sem OK explícito do usuário (push em `main` = deploy).

## Números de referência (Pompilio, maio/2026 — auditoria já validada em extração real)

Estes são os campos que a extração entrega hoje (`resumo_financeiro` + linhas). Servem de oráculo para os testes:

| Campo (extração) | Valor |
|---|---|
| `resumo_financeiro.recebidos_em_nome_locador` | `14015.38` |
| `resumo_financeiro.comissao_administracao` | `594.12` |
| `resumo_financeiro.total_a_repassar` | `13409.90` |
| `resumo_financeiro.total_comissao_despesas` | `605.48` |
| `resumo_financeiro.outras_comissoes_despesas` | `[]` (vazia) |
| linha APT A `desconto` (reembolso, obs contém "REEMBOLSO") | `113.27` |
| linha APT B `desconto` (desconto simples) | `0.26` |

**Resultado esperado após a reconciliação (Modelo A do ADR-0001):**

| Campo (pós-reconciliação) | Valor | Origem |
|---|---|---|
| `recebidos_em_nome_locador` (receita bruta) | `14128.65` | `14015.38 + 113.27` (reembolso volta pro bruto) |
| `outras_comissoes_despesas` | 3 itens: `Reembolso — <apto>` 113.27, `Desconto — <apto>` 0.26, `Taxas e outros retidos` 11.10 | reconstrução |
| `total_outras_comissoes_despesas` | `124.63` | soma dos 3 |
| `total_comissao_despesas` | `718.75` | `14128.65 − 13409.90` (= comissão 594.12 + despesas 124.63) |

**Invariante que fecha:** `14128.65 − 594.12 − 124.63 = 13409.90`. E o resumo permanece autoconsistente: `recebidos − total_comissao_despesas = total_a_repassar` → `14128.65 − 718.75 = 13409.90`. ✓

**Álgebra da reconstrução (geral):**
- `receitaBruta = recebidos_impresso + Σ(reembolsos por linha)`
- `novoTotalComissaoDespesas = receitaBruta − total_a_repassar`
- `despesasTotaisAlvo = novoTotalComissaoDespesas − comissao_administracao`
- `residuoTaxas = despesasTotaisAlvo − Σ(itens explícitos: reembolsos + descontos simples + despesas que a IA já trouxe)`
- Se `residuoTaxas > 0.01` → adiciona linha `"Taxas e outros retidos"` com esse valor.
- Se `residuoTaxas < −0.01` → itens explicam a mais: **suprime a lista** e retorna `pendencia` (decisão do grilling). Nunca exibir item negativo inventado.
- Se `|residuoTaxas| ≤ 0.01` → sem linha residual.

## File Structure

- **Criar** `lib/despesas-locador.ts` — módulo deep isomórfico (só importa tipos). Responsável por classificar lançamentos e reconciliar o resumo de despesas.
- **Criar** `lib/despesas-locador.test.ts` — testes unitários do módulo (`node:test`).
- **Modificar** `lib/server/package-rechecks.ts` — `normalizePrestacao` passa a chamar `reconciliarResumoDespesas`; remove `isNaoDespesaLocador` e `isCreditoQueReduzDespesa` (a lógica migra pro módulo).
- **Modificar** `lib/server/package-rechecks.test.ts` — adiciona 1 teste com o shape do Pompilio validando receita bruta + 3 despesas + reconciliação.
- **Modificar** `components/acr/views/revisao-view.tsx` — usa `classificarLancamento` no lugar do regex inline `/intermedia/i`; a lista de exibição continua lendo `resumo.outras_comissoes_despesas` (agora já com os 3 itens).
- **Modificar** `docs/12-execution-roadmap.md` — registrar a implementação (regra do AGENTS.md).

> **Nota sobre o prompt da IA:** não há task para `prestacao-alive-agent.ts`. O prompt do LAYOUT C (linhas 13–15) já extrai os campos crus necessários (reembolso/desconto no campo `desconto` da linha, com observação integral preservada; `recebidos`/`comissão`/`total_liquido` do bloco RESUMO). A reconstrução é determinística sobre esses campos — mexer no prompt seria churn sem ganho (YAGNI).

---

### Task 1: Módulo `lib/despesas-locador.ts` — `classificarLancamento`

**Files:**
- Create: `lib/despesas-locador.ts`
- Test: `lib/despesas-locador.test.ts`

**Interfaces:**
- Consumes: nada (só a string de descrição).
- Produces:
  - `type CategoriaLancamento = "comissao" | "intermediacao" | "despesa"`
  - `function classificarLancamento(descricao: string): CategoriaLancamento`

- [ ] **Step 1: Escrever o teste que falha**

Criar `lib/despesas-locador.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { classificarLancamento } from "./despesas-locador.ts"

test("classifica comissao e intermediacao nos seus proprios baldes", () => {
  assert.equal(classificarLancamento("COMISSAO DA ADMINISTRADORA"), "comissao")
  assert.equal(classificarLancamento("Comissão 7%"), "comissao")
  assert.equal(classificarLancamento("INTERMEDIACAO 60%"), "intermediacao")
  assert.equal(classificarLancamento("Comissão de intermediação"), "intermediacao")
})

test("classifica taxas, descontos, reembolsos e utilidades como despesa do locador", () => {
  assert.equal(classificarLancamento("TED"), "despesa")
  assert.equal(classificarLancamento("Taxa de transferencia PIX"), "despesa")
  assert.equal(classificarLancamento("REEMBOLSO AO INQUILINO"), "despesa")
  assert.equal(classificarLancamento("DESC. LOCATARIO"), "despesa")
  assert.equal(classificarLancamento("CAGECE agua"), "despesa")
})
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm dlx tsx --test lib/despesas-locador.test.ts`
Expected: FAIL — `Cannot find module './despesas-locador.ts'` (arquivo ainda não existe).

- [ ] **Step 3: Implementar o mínimo**

Criar `lib/despesas-locador.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `pnpm dlx tsx --test lib/despesas-locador.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/despesas-locador.ts lib/despesas-locador.test.ts
git commit -m "feat(despesas): classificarLancamento no modulo despesas-locador"
```

---

### Task 2: `reconciliarResumoDespesas` — receita bruta + itemização

**Files:**
- Modify: `lib/despesas-locador.ts`
- Test: `lib/despesas-locador.test.ts`

**Interfaces:**
- Consumes: `classificarLancamento` (Task 1); tipos `PrestacaoAnalysis`, `PrestacaoResumoDespesa` de `@/lib/prestacao-types`.
- Produces:
  - `interface ResumoDespesasReconciliado { recebidosEmNomeLocador: number | null; outrasComissoesDespesas: PrestacaoResumoDespesa[]; totalOutrasComissoesDespesas: number; totalComissaoDespesas: number | null; pendencia: string | null }`
  - `function reconciliarResumoDespesas(prestacao: PrestacaoAnalysis): ResumoDespesasReconciliado`

**Contexto de tipos** (de `lib/prestacao-types.ts`, já existentes):
- `PrestacaoResumoDespesa = { descricao: string; valor: number; confianca: number }`
- Linha `ReceitaPorImovel` tem `apto: string`, `desconto: number | null`, `observacao: string | null`.
- `resumo_financeiro` tem `recebidos_em_nome_locador`, `comissao_administracao`, `total_a_repassar`, `total_comissao_despesas` (todos `number | null`) e `outras_comissoes_despesas: PrestacaoResumoDespesa[]`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `lib/despesas-locador.test.ts`:

```ts
import { reconciliarResumoDespesas } from "./despesas-locador.ts"
import type { PrestacaoAnalysis } from "@/lib/prestacao-types"

// Shape confirmado da extração real do Pompilio maio/2026 (só os campos que a
// reconciliação lê; os demais são preenchidos com valores neutros válidos).
function pompilio(): PrestacaoAnalysis {
  const linha = (apto: string, aluguel: number, desconto: number | null, obs: string | null) => ({
    apto, inquilino: "", aluguel, desconto,
    aluguel_com_desconto: desconto === null ? null : aluguel - desconto,
    garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null,
    total: aluguel, comissao: null, repasse: null, vencimento: "05/2026", observacao: obs, confianca: 1,
  })
  return {
    tipo_documento: "prestacao_contas",
    imobiliaria: "Cesar Rego Imoveis",
    empreendimento: "Galpao Pompilio Gomes",
    competencia: "2026-05",
    plano_extracao: { documento_lido_integralmente: true, secoes_identificadas: [], estrategia: [], alertas: [] },
    receitas_por_imovel: [
      linha("AP0361/1", 8000, 113.27, "Endereco. REEMBOLSO AO INQUILINO DESC. LOCATARIO 113,27"),
      linha("AP0362/2", 6015.38, 0.26, "Endereco. DESCONTO FORNECIDO 0,26"),
    ],
    acordos_rescisoes_recebidos: [],
    inadimplencias_acumuladas: [],
    resumo_financeiro: {
      total_linhas_receitas: 14015.38, total_linhas_comissoes: 594.12, total_linhas_repasse: 13409.90,
      comissao_administracao: 594.12,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 605.48,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13409.90,
      repasse_embutido: true,
      confianca: 1,
    },
    totais: { total_receitas: 14015.38, total_comissoes: 594.12, total_repassar: 13409.90 },
    campos_ausentes: [], observacoes: [], confianca_geral: 1,
  }
}

test("Pompilio: receita bruta = 14128.65 e 3 despesas somando 124.63", () => {
  const r = reconciliarResumoDespesas(pompilio())
  assert.equal(r.recebidosEmNomeLocador, 14128.65)
  assert.equal(r.totalComissaoDespesas, 718.75)
  assert.equal(r.totalOutrasComissoesDespesas, 124.63)
  assert.equal(r.outrasComissoesDespesas.length, 3)
  const porDescricao = Object.fromEntries(r.outrasComissoesDespesas.map((d) => [d.descricao, d.valor]))
  assert.equal(porDescricao["Reembolso — AP0361/1"], 113.27)
  assert.equal(porDescricao["Desconto — AP0362/2"], 0.26)
  assert.equal(porDescricao["Taxas e outros retidos"], 11.1)
  assert.equal(r.pendencia, null)
})

test("Pompilio: a equacao de repasse fecha em 13409.90", () => {
  const r = reconciliarResumoDespesas(pompilio())
  const repasse = r.recebidosEmNomeLocador! - 594.12 - r.totalOutrasComissoesDespesas
  assert.ok(Math.abs(repasse - 13409.90) <= 0.01, `esperava 13409.90, veio ${repasse}`)
})

test("resumo sem reembolso e sem descontos por linha nao inventa despesas", () => {
  const base = pompilio()
  const semDescontos: PrestacaoAnalysis = {
    ...base,
    receitas_por_imovel: base.receitas_por_imovel.map((row) => ({ ...row, desconto: null, aluguel_com_desconto: null, observacao: "Endereco." })),
    resumo_financeiro: {
      ...base.resumo_financeiro,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13421.02, // 14015.38 - 594.12 - 0 (so comissao retida)
      total_comissao_despesas: 594.12,
    },
  }
  const r = reconciliarResumoDespesas(semDescontos)
  assert.equal(r.recebidosEmNomeLocador, 14015.38) // sem reembolso, bruto = impresso
  assert.equal(r.outrasComissoesDespesas.length, 0)
  assert.equal(r.pendencia, null)
})

test("residuo negativo suprime a lista e reporta pendencia", () => {
  const base = pompilio()
  // Consolidado retido MENOR que comissao + itens por linha => residuo negativo.
  const inconsistente: PrestacaoAnalysis = {
    ...base,
    resumo_financeiro: { ...base.resumo_financeiro, total_a_repassar: 13900, total_comissao_despesas: 228.65, recebidos_em_nome_locador: 14015.38 },
  }
  const r = reconciliarResumoDespesas(inconsistente)
  assert.equal(r.outrasComissoesDespesas.length, 0)
  assert.ok(r.pendencia && r.pendencia.length > 0)
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm dlx tsx --test lib/despesas-locador.test.ts`
Expected: FAIL — `reconciliarResumoDespesas is not a function` / import indefinido.

- [ ] **Step 3: Implementar**

Adicionar em `lib/despesas-locador.ts`:

```ts
const TOLERANCIA = 0.01

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

// Item de crédito no resumo (ex.: "OUTROS CREDITOS") REDUZ a despesa líquida —
// entra com sinal negativo. "Débito" tem prioridade quando a linha cita ambos.
function ehCreditoQueReduz(descricao: string): boolean {
  const t = normalizar(descricao)
  if (/debito/.test(t)) return false
  return /credito|reduz/.test(t)
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
  const comissao = resumo.comissao_administracao ?? 0

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

  const itensExplicitos = [...despesasIA, ...reembolsos, ...descontosSimples]
  const somaExplicitos = arredondar(itensExplicitos.reduce((s, d) => s + d.valor, 0))

  // Sem consolidado confiável: devolve só os itens explícitos (sem inventar bruto/resíduo).
  if (novoTotalComissaoDespesas === null || receitaBruta === null) {
    return {
      recebidosEmNomeLocador: receitaBruta ?? recebidosImpresso,
      outrasComissoesDespesas: itensExplicitos,
      totalOutrasComissoesDespesas: somaExplicitos,
      totalComissaoDespesas: novoTotalComissaoDespesas,
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
      totalComissaoDespesas: novoTotalComissaoDespesas,
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
    totalComissaoDespesas: novoTotalComissaoDespesas,
    pendencia: null,
  }
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm dlx tsx --test lib/despesas-locador.test.ts`
Expected: PASS (6 testes: 2 da Task 1 + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/despesas-locador.ts lib/despesas-locador.test.ts
git commit -m "feat(despesas): reconciliarResumoDespesas (receita bruta + itemizacao)"
```

---

### Task 3: Ligar a reconciliação em `normalizePrestacao`

**Files:**
- Modify: `lib/server/package-rechecks.ts:85-172` (função `normalizePrestacao` + remoção de `isNaoDespesaLocador`/`isCreditoQueReduzDespesa`)
- Test: `lib/server/package-rechecks.test.ts`

**Interfaces:**
- Consumes: `reconciliarResumoDespesas` (Task 2).
- Produces: `normalizePrestacao` passa a devolver `resumo_financeiro` com `recebidos_em_nome_locador`, `outras_comissoes_despesas`, `total_outras_comissoes_despesas` e `total_comissao_despesas` vindos da reconciliação. Downstream (`calculateTotals`) já lê esses campos — não muda.

**Por que downstream fecha sozinho:** `calculateTotals` (`package-rechecks.ts:305-323`) usa `recebidos_em_nome_locador` como `total_receitas`, `total_comissao_despesas` como `consolidadoRetido` e deriva `total_despesas = consolidadoRetido − comissão`. Com os novos valores: `total_receitas = 14128.65`, `total_despesas = 718.75 − 594.12 = 124.63`, `total_a_repassar = 13409.90` (do resumo, inalterado). A base da comissão (`totalAluguel` via `aluguel_com_desconto`) NÃO muda — comissão permanece líquida.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `lib/server/package-rechecks.test.ts` (usa o helper `createPrestacao` já existente no arquivo, `requiredDocuments` e `validatePackage`):

```ts
test("Pompilio: validatePackage expoe receita bruta e 3 despesas itemizadas", () => {
  const prestacao = createPrestacao({
    imobiliaria: "Cesar Rego Imoveis",
    competencia: "2026-05",
    receitas_por_imovel: [
      { apto: "AP0361/1", inquilino: "", aluguel: 8000, desconto: 113.27, aluguel_com_desconto: 7886.73, garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null, total: 8000, comissao: null, repasse: null, vencimento: "05/2026", observacao: "Endereco. REEMBOLSO AO INQUILINO DESC. LOCATARIO 113,27", confianca: 1 },
      { apto: "AP0362/2", inquilino: "", aluguel: 6015.38, desconto: 0.26, aluguel_com_desconto: 6015.12, garagem: null, vagas_garagem: null, agua: null, iptu: null, seguro_incendio: null, total: 6015.38, comissao: null, repasse: null, vencimento: "05/2026", observacao: "Endereco. DESCONTO FORNECIDO 0,26", confianca: 1 },
    ],
    resumo_financeiro: {
      total_linhas_receitas: 14015.38, total_linhas_comissoes: 594.12, total_linhas_repasse: 13409.90,
      comissao_administracao: 594.12,
      outras_comissoes_despesas: [],
      total_outras_comissoes_despesas: 0,
      total_comissao_despesas: 605.48,
      recebidos_em_nome_locador: 14015.38,
      total_a_repassar: 13409.90,
      repasse_embutido: true,
      confianca: 1,
    },
  })
  const result = validatePackage({ documents: requiredDocuments, prestacao, repasse: null, despesas: null, reajuste: null })

  assert.equal(result.totals.total_receitas, 14128.65)
  assert.equal(result.totals.total_despesas, 124.63)
  assert.equal(result.totals.total_a_repassar, 13409.90)
  const lista = result.prestacao?.resumo_financeiro.outras_comissoes_despesas ?? []
  assert.equal(lista.length, 3)
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm dlx tsx --test lib/server/package-rechecks.test.ts`
Expected: o novo teste FALHA — hoje `total_receitas` = `14015.38` e `outras_comissoes_despesas` volta vazia (a IA não populou e o código atual só filtra, não reconstrói). Os 2 testes vermelhos pré-existentes continuam vermelhos (baseline).

- [ ] **Step 3: Implementar — importar o módulo**

No topo de `lib/server/package-rechecks.ts`, após o import de `regras-comerciais` (linha 13), adicionar:

```ts
import { reconciliarResumoDespesas } from "@/lib/despesas-locador"
```

- [ ] **Step 4: Implementar — reescrever `normalizePrestacao`**

Substituir o corpo de `normalizePrestacao` (de `lib/server/package-rechecks.ts:85` até o `}` na linha `155`) por:

```ts
function normalizePrestacao(analysis: PrestacaoAnalysis): PrestacaoAnalysis {
  const competenciaFechamento = normalizeCompetenciaKey(analysis.competencia)

  // Normaliza as linhas ANTES de reconciliar, para a reconstrução ler os valores
  // finais (IPTU de passagem anulado, inadimplência marcada) de `desconto`/`observacao`.
  const linhasNormalizadas = analysis.receitas_por_imovel.map((row) => {
    const base = {
      ...row,
      total: roundMoney(row.total),
      aluguel: nullableMoney(row.aluguel),
      desconto: nullableMoney(row.desconto),
      aluguel_com_desconto: nullableMoney(row.aluguel_com_desconto),
      garagem: nullableMoney(row.garagem),
      agua: nullableMoney(row.agua),
      iptu: nullableMoney(row.iptu),
      seguro_incendio: nullableMoney(row.seguro_incendio),
      comissao: nullableMoney(row.comissao),
      repasse: nullableMoney(row.repasse),
      confianca: clampConfidence(row.confianca),
    }
    // #3 IPTU de passagem: crédito e débito de mesmo valor se anulam.
    const semIptuDePassagem = anularIptuDePassagem(base)
    // #4 Inadimplência por competência: aluguel de mês anterior => inadimplente no mês.
    return marcarInadimplenciaPorCompetencia(semIptuDePassagem, competenciaFechamento)
  })

  // ADR-0001: receita BRUTA + desconto/reembolso/taxas itemizados como despesa do
  // locador. A regra vive no módulo dedicado; aqui só aplicamos o resultado.
  const reconciliado = reconciliarResumoDespesas({ ...analysis, receitas_por_imovel: linhasNormalizadas })

  return {
    ...analysis,
    confianca_geral: clampConfidence(analysis.confianca_geral),
    resumo_financeiro: {
      ...analysis.resumo_financeiro,
      total_linhas_receitas: nullableMoney(analysis.resumo_financeiro.total_linhas_receitas),
      total_linhas_comissoes: nullableMoney(analysis.resumo_financeiro.total_linhas_comissoes),
      total_linhas_repasse: nullableMoney(analysis.resumo_financeiro.total_linhas_repasse),
      comissao_administracao: nullableMoney(analysis.resumo_financeiro.comissao_administracao),
      recebidos_em_nome_locador: reconciliado.recebidosEmNomeLocador,
      outras_comissoes_despesas: reconciliado.outrasComissoesDespesas,
      total_outras_comissoes_despesas: reconciliado.totalOutrasComissoesDespesas,
      total_comissao_despesas: reconciliado.totalComissaoDespesas,
      total_a_repassar: nullableMoney(analysis.resumo_financeiro.total_a_repassar),
      confianca: clampConfidence(analysis.resumo_financeiro.confianca),
    },
    receitas_por_imovel: linhasNormalizadas,
    acordos_rescisoes_recebidos: dropHallucinatedIntermediacoes(
      (analysis.acordos_rescisoes_recebidos ?? []).map((item) => ({
        ...item,
        valor: roundMoney(item.valor),
        comissao: item.comissao === null || item.comissao === undefined ? item.comissao ?? null : roundMoney(item.comissao),
        confianca: clampConfidence(item.confianca),
      })),
      analysis.resumo_financeiro.outras_comissoes_despesas ?? [],
    ),
  }
}
```

> Observação: `dropHallucinatedIntermediacoes` continua recebendo a lista ORIGINAL da IA (`analysis.resumo_financeiro.outras_comissoes_despesas`), não a reconciliada — a detecção de intermediação-fantasma compara contra o que a IA trouxe.

- [ ] **Step 5: Implementar — remover os helpers mortos**

Deletar de `lib/server/package-rechecks.ts` as funções `isNaoDespesaLocador` (linhas ~157-163) e `isCreditoQueReduzDespesa` (linhas ~165-172) e seus comentários — a lógica migrou para o módulo. Confirmar que não há outros usos:

Run: `grep -n "isNaoDespesaLocador\|isCreditoQueReduzDespesa" lib/server/package-rechecks.ts`
Expected: sem resultados após a remoção.

- [ ] **Step 6: Rodar os testes**

Run: `pnpm dlx tsx --test lib/server/package-rechecks.test.ts`
Expected: o novo teste "Pompilio" PASSA; os 2 vermelhos pré-existentes (baseline) continuam sendo os únicos 2 `fail`. Nenhum teste novo quebrado.

- [ ] **Step 7: Lint**

Run: `pnpm lint`
Expected: sem erros (garanta que não sobrou nenhum `scratch-*` no repo).

- [ ] **Step 8: Commit**

```bash
git add lib/server/package-rechecks.ts lib/server/package-rechecks.test.ts
git commit -m "feat(revisao): normalizePrestacao usa reconciliarResumoDespesas (ADR-0001)"
```

---

### Task 4: View consome `classificarLancamento`

**Files:**
- Modify: `components/acr/views/revisao-view.tsx:738-754`

**Interfaces:**
- Consumes: `classificarLancamento` (Task 1). A lista de exibição (`outrasDespesasExibicao`, linha 742) e a seção "Outras comissões e despesas no resumo" (linha 1899) já leem `resumo.outras_comissoes_despesas` — que agora chega com os 3 itens. Só trocamos o regex inline por chamada ao módulo (locality: uma definição de "o que é intermediação").

- [ ] **Step 1: Importar o módulo**

No bloco de imports de `components/acr/views/revisao-view.tsx`, adicionar:

```ts
import { classificarLancamento } from "@/lib/despesas-locador"
```

- [ ] **Step 2: Trocar o regex inline pela classificação do módulo**

Em `revisao-view.tsx:742`, trocar:

```ts
  const outrasDespesasExibicao = outrasComissoesDespesas.filter((d) => !/intermedia/i.test(d.descricao))
```

por:

```ts
  const outrasDespesasExibicao = outrasComissoesDespesas.filter((d) => classificarLancamento(d.descricao) !== "intermediacao")
```

E em `revisao-view.tsx:747`, dentro de `intermediacaoDocumento`, trocar:

```ts
    const item = outrasComissoesDespesas.find((d) => /intermedia/i.test(d.descricao))
```

por:

```ts
    const item = outrasComissoesDespesas.find((d) => classificarLancamento(d.descricao) === "intermediacao")
```

- [ ] **Step 3: Verificar que compila (type-check via build parcial)**

Run: `pnpm dlx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "revisao-view\|despesas-locador" | head`
Expected: sem erros nas linhas alteradas (pode haver ruído pré-existente noutros arquivos; foque nos dois nomes).

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add components/acr/views/revisao-view.tsx
git commit -m "refactor(revisao): view usa classificarLancamento do modulo despesas-locador"
```

---

### Task 5: Atualizar o roadmap de execução

**Files:**
- Modify: `docs/12-execution-roadmap.md`

- [ ] **Step 1: Registrar a entrega**

Ler `docs/12-execution-roadmap.md`, localizar a seção de itens concluídos (padrão de datas/checkboxes do arquivo) e acrescentar uma entrada, seguindo o formato já usado no arquivo, com o texto:

```
- [x] 2026-07-02 — Despesa do locador (ADR-0001): receita bruta + itemização de reembolso/desconto/taxas no resumo, via módulo `lib/despesas-locador.ts` (classificarLancamento + reconciliarResumoDespesas). Escopo global. Reconciliação do repasse validada (Pompilio maio/2026: 14.128,65 − 594,12 − 124,63 = 13.409,90).
```

- [ ] **Step 2: Commit**

```bash
git add docs/12-execution-roadmap.md
git commit -m "docs(roadmap): registra despesa do locador (ADR-0001)"
```

---

### Task 6: Verificação em extração real + reprocesso (executada pelo usuário)

> Esta task NÃO é código — é o gate de verificação com dados reais, que o handoff exige antes de dar como resolvido. Requer `OPENAI_API_KEY` **válida** em `.env.local` (a chave atual retorna 401 — precisa ser renovada). Não commita nada; se algo divergir, volta pro código.

- [ ] **Step 1: Renovar a chave OpenAI**

Atualizar `OPENAI_API_KEY` em `.env.local` com uma chave válida. Confirmar `OPENAI_MODEL=gpt-5.5`.

- [ ] **Step 2: Rodar a extração real do Pompilio e conferir os números**

Criar `scratch-verify.ts` (apagar depois):

```ts
import { readFileSync } from "node:fs"
import { extractPrestacaoAliveFromPdf } from "@/lib/server/analyze-prestacao"
import { validatePackage } from "@/lib/server/package-rechecks"
import type { ClassifiedDocument } from "@/lib/prestacao-types"

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

async function main() {
  const pdf = "/Users/arthurbrito/Downloads/1. PRESTAÇÃO DE CONTAS LOCAÇÃO MAIO 2026 - CESAR REGO (1).pdf"
  const fileBase64 = readFileSync(pdf).toString("base64")
  const prestacao = await extractPrestacaoAliveFromPdf({ fileName: "p.pdf", fileType: "application/pdf", fileBase64 }, "2026-05")
  const documents: ClassifiedDocument[] = [{ fileName: "p.pdf", fileType: "application/pdf", fileSize: 1, documentType: "prestacao_contas", confidence: 1, reason: "single" }]
  const r = validatePackage({ documents, prestacao, repasse: null, despesas: null, reajuste: null })
  console.log("receita bruta:", r.totals.total_receitas, "(esperado 14128.65)")
  console.log("despesas:", r.totals.total_despesas, "(esperado 124.63)")
  console.log("repasse:", r.totals.total_a_repassar, "(esperado 13409.90)")
  console.log("diferenca_repasse:", r.totals.diferenca_repasse, "(esperado 0)")
  console.log("itens:", JSON.stringify(r.prestacao?.resumo_financeiro.outras_comissoes_despesas, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
```

Run: `pnpm dlx tsx scratch-verify.ts`
Expected: `receita bruta: 14128.65`, `despesas: 124.63`, `repasse: 13409.90`, `diferenca_repasse: 0`, e 3 itens na lista. Se os campos crus da extração divergirem do oráculo (tabela "Números de referência"), PARE e reconcilie o oráculo/regra antes de seguir.

- [ ] **Step 2b: Repetir para o LOCMAIS (escopo global — não regredir intermediação)**

Rodar o mesmo script apontando para o PDF do LOCMAIS e confirmar: intermediação continua `tipo=intermediacao` (não vira despesa), e a reconciliação do repasse continua fechando. A mudança é matematicamente imune quando não há reembolso/desconto por linha, mas confirme na prática.

- [ ] **Step 3: Apagar o scratch**

Run: `rm -f scratch-verify.ts`

- [ ] **Step 4: Reprocessar no app**

Após deploy (push combinado com o usuário), re-upload dos PDFs do Pompilio maio/2026 no app (isso desarquiva o fechamento 029d645d — comportamento esperado). Conferir na `RevisaoView`: "Recebidos locador" = 14.128,65; seção "Outras comissões e despesas no resumo" lista os 3 itens; a conta fecha em 13.409,90.

---

## Self-Review

**1. Cobertura do spec (grilling + ADR-0001):**
- Receita bruta 14.128,65 → Task 2/3 (`recebidosEmNomeLocador`). ✓
- 3 despesas itemizadas (reembolso, desconto, TED) → Task 2 (reconstrução) + Task 4 (exibição). ✓
- Escopo global → módulo sem ramo por imobiliária; Task 6 valida LOCMAIS. ✓
- eGestor no bruto → `buildEgestorDrafts` já usa `total_receitas` (`egestor.ts:362`), que passa a ser o bruto; sem task extra necessária (comportamento herda a mudança). ✓
- Header só o bruto, sem nota → Task 4 não adiciona nota; header lê `totals.total_receitas`. ✓
- Rótulos com origem ("Reembolso — <apto>") + residual "Taxas e outros retidos" → Task 2. ✓
- Itemizar + linha de sobra explícita; resíduo negativo suprime + pendência → Task 2 (testado). ✓
- Base da comissão permanece líquida → não mexemos em `commissionBase`/`aluguel_com_desconto`; nota na Task 3. ✓
- Reprocesso desarquiva → Task 6 Step 4. ✓

**2. Placeholders:** varredura feita — todo passo de código tem código real; sem "TODO"/"etc."/"similar a". ✓

**3. Consistência de tipos:** `classificarLancamento(descricao: string): CategoriaLancamento` e `reconciliarResumoDespesas(prestacao: PrestacaoAnalysis): ResumoDespesasReconciliado` usados idênticos entre Tasks 1–4. Campos de `ResumoDespesasReconciliado` (`recebidosEmNomeLocador`, `outrasComissoesDespesas`, `totalOutrasComissoesDespesas`, `totalComissaoDespesas`, `pendencia`) batem entre a definição (Task 2) e o consumo (Task 3). `PrestacaoResumoDespesa = {descricao, valor, confianca}` respeitado em todas as construções de item. ✓

**Riscos conhecidos:**
- A distinção reembolso-vs-desconto por `/reembolso/` na observação é a chave para reproduzir 14.128,65 (vs 14.128,91 se todos os descontos voltassem pro bruto). Task 6 confirma contra a extração real.
- A chave OpenAI atual está expirada (401) — Task 6 depende de renovação; os números do oráculo vêm da auditoria já validada no handoff.
