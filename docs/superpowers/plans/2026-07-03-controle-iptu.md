# Controle de Pagamento de IPTU Implementation Plan

> **⚠️ LEGADO / FORA DO MVP (desde 2026-07-07):** este plano descreve o fluxo de importacao de certidao/PDF por IA, que deixou de ser a experiencia principal de `/iptu`. O modulo passou a ser um controle operacional manual de contas a pagar (ver `docs/02-mock-contract.md` → "tela `iptu`" e o ciclo de 2026-07-07 em `docs/12-execution-roadmap.md`). O backend de importacao permanece apenas por compatibilidade, sem acesso na UI. Possivel evolucao futura, nao prioridade.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar, por apartamento, quantas parcelas do carnê anual de IPTU já foram pagas (via importação mensal de uma certidão em PDF enviada pela imobiliária), e classificar cada parcela paga como responsabilidade do inquilino ou do proprietário com base no status do imóvel no momento do registro — como controle histórico/auditoria, sem gerar lançamento automático no eGestor.

**Architecture:** Módulo novo e independente (`/iptu`), seguindo o padrão já usado por `imoveis`/`cadastros` (page client component → view presentacional → context de fetch/estado → API routes → camada de persistência Supabase). Extração do PDF via OpenAI `responses.create` com JSON Schema, nos moldes de `lib/server/analyze-prestacao.ts`, porém sem workflow Mastra. A lógica de negócio (cálculo de responsável, cálculo de novas parcelas por delta, matching de unidade) fica isolada em funções puras testáveis (`lib/iptu-logic.ts`), separada da camada de I/O (`lib/server/persist-iptu.ts`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase (Postgres + Storage), OpenAI SDK (`openai` pacote, `client.responses.create`), Node.js built-in test runner via `npx tsx --test`.

## Global Constraints

- Registro passivo: este módulo NUNCA cria lançamento no eGestor automaticamente (spec, seção "Decisões confirmadas", item 1).
- Responsabilidade calculada pelo `imoveis.status` **no momento da importação**, não retroativamente (spec, item 2).
- Formato de entrada: PDF, extraído via IA; schema de extração deve suportar um PDF cobrindo um ou vários apartamentos (spec, itens 3 e 5).
- Carnê anual com N parcelas fixas por imóvel, configurável por carnê, padrão `IPTU_PARCELAS_PADRAO = 10` (spec, item 4).
- Módulo de navegação independente em `/iptu`, fora do fluxo de prestação de contas (spec, item 6).
- Nomenclatura de colunas de timestamp segue a convenção já usada no projeto: `criado_em` / `atualizado_em` (não `created_at`/`updated_at` como no rascunho inicial do spec — ajustado aqui para consistência com `supabase/migrations/202605220001_cadastros_imobiliarios.sql`).
- Edição manual de `responsavel` só é permitida em parcela com `pago=true`; `numero_parcelas` do carnê não pode ser reduzido abaixo da quantidade já paga (spec, seção 4, tabela de casos de borda).
- Ao construir a UI (Task 10), iterar em ciclo build → subir preview no navegador → screenshot/inspeção → ajuste → rodar testes, em vez de escrever a tela sem verificação visual (decisão registrada no spec, "Decisões confirmadas", item 7).

---

## Contexto de arquivos existentes (referência para todas as tasks)

- Cliente Supabase admin: `lib/server/supabase.ts` — `createSupabaseAdmin()`, importado como `import { createSupabaseAdmin } from "@/lib/server/supabase"`.
- Env helpers: `lib/server/env.ts` — `requireEnv(name)`, `getOptionalEnv(name, fallback)`.
- Retry de chamada OpenAI: `lib/server/openai-responses.ts` — `createResponseWithRetry(client, params)`.
- Validação de payload JSON em rotas: `lib/server/cadastros.ts` — `parseJson<T>(schema, value)` retorna `{ data: T | null, error: string | null }`.
- Tipos de cadastro: `lib/cadastros-types.ts` — `ImovelStatus`, `Imovel`.
- Matching de unidade (padrão a replicar): `lib/server/sync-imoveis.ts:81-115` — chave `imobiliaria_id|empreendimento_id|unidade`, string trimada, sem normalização difusa.
- Trigger de timestamp já existente no banco: `public.set_atualizado_em()` (criado em `supabase/migrations/202605220001_cadastros_imobiliarios.sql`), reutilizável em `before update`.

---

### Task 1: Migration — tabelas de IPTU e bucket de storage

**Files:**
- Create: `supabase/migrations/202607030001_iptu_controle.sql`

**Interfaces:**
- Produces: tabelas `public.iptu_carnes`, `public.iptu_parcelas`, `public.iptu_importacoes`; bucket de storage `iptu-certidoes`. Todas as tasks seguintes dependem desse schema.

- [ ] **Step 1: Escrever a migration**

```sql
-- Controle de pagamento de IPTU: registro passivo de parcelas quitadas por
-- apartamento (importado de certidao mensal da imobiliaria), usado para
-- identificar quais parcelas caem em periodo de vacancia (responsabilidade
-- do proprietario). Nao gera lancamento no eGestor.

insert into storage.buckets (id, name, public)
values ('iptu-certidoes', 'iptu-certidoes', false)
on conflict (id) do nothing;

create table if not exists public.iptu_carnes (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  ano_referencia integer not null,
  numero_parcelas integer not null default 10,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint iptu_carnes_unq unique (imovel_id, ano_referencia)
);

create table if not exists public.iptu_importacoes (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  arquivo_nome text not null,
  arquivo_path text not null,
  competencia_relatorio text not null,
  resultado_bruto jsonb not null default '{}'::jsonb,
  apartamentos_nao_vinculados jsonb not null default '[]'::jsonb,
  anomalias jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.iptu_parcelas (
  id uuid primary key default gen_random_uuid(),
  carne_id uuid not null references public.iptu_carnes(id) on delete cascade,
  numero integer not null,
  pago boolean not null default false,
  responsavel text,
  status_imovel_no_registro text,
  origem_importacao_id uuid references public.iptu_importacoes(id) on delete set null,
  registrado_em timestamptz,
  constraint iptu_parcelas_responsavel_check check (responsavel in ('inquilino', 'proprietario')),
  constraint iptu_parcelas_unq unique (carne_id, numero)
);

create index if not exists idx_iptu_carnes_imovel on public.iptu_carnes (imovel_id);
create index if not exists idx_iptu_parcelas_carne on public.iptu_parcelas (carne_id);
create index if not exists idx_iptu_importacoes_empreendimento on public.iptu_importacoes (empreendimento_id);

drop trigger if exists set_iptu_carnes_atualizado_em on public.iptu_carnes;
create trigger set_iptu_carnes_atualizado_em
before update on public.iptu_carnes
for each row execute function public.set_atualizado_em();
```

- [ ] **Step 2: Aplicar a migration**

Run: `supabase db push`
Expected: saída lista `202607030001_iptu_controle.sql` como aplicada, sem erros.

- [ ] **Step 3: Verificar que as tabelas existem**

Run:
```bash
set -a; source .env.local; set +a
npx tsx -e '
import { createSupabaseAdmin } from "./lib/server/supabase"
const supabase = createSupabaseAdmin()
for (const tabela of ["iptu_carnes", "iptu_parcelas", "iptu_importacoes"]) {
  const { data, error } = await supabase.from(tabela).select("id").limit(1)
  console.log(tabela, { data, error })
}
'
```
Expected: para as três tabelas, `{ data: [], error: null }` (tabela existe e está vazia, sem erro de "relation does not exist").

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607030001_iptu_controle.sql
git commit -m "feat(iptu): cria tabelas de controle de pagamento de IPTU"
```

---

### Task 2: Tipos e schemas Zod (`lib/iptu-types.ts`)

**Files:**
- Create: `lib/iptu-types.ts`
- Test: `lib/iptu-types.test.ts`

**Interfaces:**
- Consumes: `ImovelStatus` de `@/lib/cadastros-types`.
- Produces: `iptuExtracaoSchema`, `IptuExtracao`, `IptuExtracaoApartamento`, `IptuResponsavel`, `IptuCarne`, `IptuParcela`, `IptuAnomaliaTipo`, `IptuAnomalia`, `IptuImportacao`, `iptuParcelaPatchSchema`, `iptuCarnePatchSchema` — usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever o teste de schema**

```typescript
// lib/iptu-types.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { iptuExtracaoSchema } from "./iptu-types.ts"

test("aceita payload valido com um apartamento", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [{ unidade: "AP0361/1", parcelas_pagas: 3, ano_carne: 2026 }],
  }
  const parsed = iptuExtracaoSchema.parse(payload)
  assert.equal(parsed.apartamentos.length, 1)
  assert.equal(parsed.apartamentos[0].parcelas_pagas, 3)
})

test("aceita payload com varios apartamentos e ano_carne nulo", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [
      { unidade: "AP01", parcelas_pagas: 1, ano_carne: null },
      { unidade: "AP02", parcelas_pagas: 5, ano_carne: 2026 },
    ],
  }
  const parsed = iptuExtracaoSchema.parse(payload)
  assert.equal(parsed.apartamentos.length, 2)
})

test("rejeita competencia_relatorio em formato invalido", () => {
  const payload = {
    competencia_relatorio: "2026-03",
    apartamentos: [],
  }
  assert.throws(() => iptuExtracaoSchema.parse(payload))
})

test("rejeita parcelas_pagas negativo", () => {
  const payload = {
    competencia_relatorio: "03/2026",
    apartamentos: [{ unidade: "AP01", parcelas_pagas: -1, ano_carne: null }],
  }
  assert.throws(() => iptuExtracaoSchema.parse(payload))
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx tsx --test lib/iptu-types.test.ts`
Expected: FAIL — `Cannot find module './iptu-types.ts'` (ou `Error: Cannot find package`).

- [ ] **Step 3: Implementar `lib/iptu-types.ts`**

```typescript
import { z } from "zod"

export const iptuExtracaoApartamentoSchema = z
  .object({
    unidade: z.string().trim().min(1),
    parcelas_pagas: z.number().int().nonnegative(),
    ano_carne: z.number().int().nullable(),
  })
  .strict()

export const iptuExtracaoSchema = z
  .object({
    competencia_relatorio: z.string().regex(/^\d{2}\/\d{4}$/),
    apartamentos: z.array(iptuExtracaoApartamentoSchema),
  })
  .strict()

export type IptuExtracaoApartamento = z.infer<typeof iptuExtracaoApartamentoSchema>
export type IptuExtracao = z.infer<typeof iptuExtracaoSchema>

export type IptuResponsavel = "inquilino" | "proprietario"

export type IptuCarne = {
  id: string
  imovel_id: string
  ano_referencia: number
  numero_parcelas: number
  criado_em: string
  atualizado_em: string
}

export type IptuParcela = {
  id: string
  carne_id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  origem_importacao_id: string | null
  registrado_em: string | null
}

export type IptuAnomaliaTipo = "regressao" | "excede_carne"

export type IptuAnomalia = {
  unidade: string
  tipo: IptuAnomaliaTipo
  detalhe: string
}

export type IptuImportacao = {
  id: string
  empreendimento_id: string
  arquivo_nome: string
  arquivo_path: string
  competencia_relatorio: string
  resultado_bruto: IptuExtracao
  apartamentos_nao_vinculados: string[]
  anomalias: IptuAnomalia[]
  criado_em: string
}

export const iptuParcelaPatchSchema = z
  .object({
    responsavel: z.enum(["inquilino", "proprietario"]),
  })
  .strict()

export const iptuCarnePatchSchema = z
  .object({
    numero_parcelas: z.number().int().positive(),
  })
  .strict()
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx tsx --test lib/iptu-types.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/iptu-types.ts lib/iptu-types.test.ts
git commit -m "feat(iptu): schemas e tipos do controle de IPTU"
```

---

### Task 3: Lógica pura (`lib/iptu-logic.ts`)

**Files:**
- Create: `lib/iptu-logic.ts`
- Test: `lib/iptu-logic.test.ts`

**Interfaces:**
- Consumes: `ImovelStatus` de `@/lib/cadastros-types`; `IptuResponsavel`, `IptuAnomaliaTipo` de `@/lib/iptu-types`.
- Produces: `IPTU_PARCELAS_PADRAO` (number), `calcularResponsavel(status: ImovelStatus): IptuResponsavel | null`, `calcularNovasParcelas(parcelasPagasAtual: number, parcelasPagasInformado: number, numeroParcelasCarne: number): { numerosNovos: number[]; anomalia: IptuAnomaliaTipo | null }`, `resolverImovelId(imoveis: ImovelParaResolucao[], imobiliariaId: string, empreendimentoId: string, unidade: string): string | null`, `ImovelParaResolucao` (type `{ id: string; imobiliaria_id: string; empreendimento_id: string; unidade: string }`). Usados por `lib/server/persist-iptu.ts` (Task 5).

- [ ] **Step 1: Escrever os testes**

```typescript
// lib/iptu-logic.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { IPTU_PARCELAS_PADRAO, calcularNovasParcelas, calcularResponsavel, resolverImovelId } from "./iptu-logic.ts"

test("IPTU_PARCELAS_PADRAO e 10", () => {
  assert.equal(IPTU_PARCELAS_PADRAO, 10)
})

test("calcularResponsavel: ocupado, inadimplente e em_negociacao sao do inquilino", () => {
  assert.equal(calcularResponsavel("ocupado"), "inquilino")
  assert.equal(calcularResponsavel("inadimplente"), "inquilino")
  assert.equal(calcularResponsavel("em_negociacao"), "inquilino")
})

test("calcularResponsavel: vago e em_rescisao sao do proprietario", () => {
  assert.equal(calcularResponsavel("vago"), "proprietario")
  assert.equal(calcularResponsavel("em_rescisao"), "proprietario")
})

test("calcularResponsavel: inativo nao determina automaticamente", () => {
  assert.equal(calcularResponsavel("inativo"), null)
})

test("calcularNovasParcelas: delta positivo gera os numeros novos em ordem", () => {
  const r = calcularNovasParcelas(3, 6, 10)
  assert.deepEqual(r.numerosNovos, [4, 5, 6])
  assert.equal(r.anomalia, null)
})

test("calcularNovasParcelas: delta zero e idempotente (reimportacao)", () => {
  const r = calcularNovasParcelas(5, 5, 10)
  assert.deepEqual(r.numerosNovos, [])
  assert.equal(r.anomalia, null)
})

test("calcularNovasParcelas: delta negativo e anomalia de regressao, sem gerar parcelas", () => {
  const r = calcularNovasParcelas(6, 4, 10)
  assert.deepEqual(r.numerosNovos, [])
  assert.equal(r.anomalia, "regressao")
})

test("calcularNovasParcelas: informado excede numero_parcelas do carne, capa no limite", () => {
  const r = calcularNovasParcelas(8, 12, 10)
  assert.deepEqual(r.numerosNovos, [9, 10])
  assert.equal(r.anomalia, "excede_carne")
})

test("resolverImovelId: encontra por imobiliaria+empreendimento+unidade exatos", () => {
  const imoveis = [
    { id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" },
    { id: "im-2", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP02" },
  ]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "AP02"), "im-2")
})

test("resolverImovelId: nao encontrado retorna null", () => {
  const imoveis = [{ id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" }]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "AP99"), null)
})

test("resolverImovelId: ignora espacos ao redor da unidade", () => {
  const imoveis = [{ id: "im-1", imobiliaria_id: "imob-1", empreendimento_id: "emp-1", unidade: "AP01" }]
  assert.equal(resolverImovelId(imoveis, "imob-1", "emp-1", "  AP01  "), "im-1")
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `npx tsx --test lib/iptu-logic.test.ts`
Expected: FAIL — `Cannot find module './iptu-logic.ts'`.

- [ ] **Step 3: Implementar `lib/iptu-logic.ts`**

```typescript
import type { ImovelStatus } from "@/lib/cadastros-types"
import type { IptuAnomaliaTipo, IptuResponsavel } from "@/lib/iptu-types"

export const IPTU_PARCELAS_PADRAO = 10

const RESPONSAVEL_POR_STATUS: Record<ImovelStatus, IptuResponsavel | null> = {
  ocupado: "inquilino",
  inadimplente: "inquilino",
  em_negociacao: "inquilino",
  vago: "proprietario",
  em_rescisao: "proprietario",
  inativo: null,
}

export function calcularResponsavel(status: ImovelStatus): IptuResponsavel | null {
  return RESPONSAVEL_POR_STATUS[status]
}

export interface NovasParcelasResultado {
  numerosNovos: number[]
  anomalia: IptuAnomaliaTipo | null
}

export function calcularNovasParcelas(
  parcelasPagasAtual: number,
  parcelasPagasInformado: number,
  numeroParcelasCarne: number,
): NovasParcelasResultado {
  const delta = parcelasPagasInformado - parcelasPagasAtual

  if (delta <= 0) {
    return { numerosNovos: [], anomalia: delta < 0 ? "regressao" : null }
  }

  const limite = Math.min(parcelasPagasInformado, numeroParcelasCarne)
  const numerosNovos: number[] = []
  for (let numero = parcelasPagasAtual + 1; numero <= limite; numero++) {
    numerosNovos.push(numero)
  }

  return {
    numerosNovos,
    anomalia: parcelasPagasInformado > numeroParcelasCarne ? "excede_carne" : null,
  }
}

export interface ImovelParaResolucao {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  unidade: string
}

export function resolverImovelId(
  imoveis: ImovelParaResolucao[],
  imobiliariaId: string,
  empreendimentoId: string,
  unidade: string,
): string | null {
  const unidadeNormalizada = unidade.trim()
  const encontrado = imoveis.find(
    (imovel) =>
      imovel.imobiliaria_id === imobiliariaId &&
      imovel.empreendimento_id === empreendimentoId &&
      imovel.unidade.trim() === unidadeNormalizada,
  )
  return encontrado?.id ?? null
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `npx tsx --test lib/iptu-logic.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Rodar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/iptu-logic.ts lib/iptu-logic.test.ts
git commit -m "feat(iptu): logica pura de responsavel, delta de parcelas e matching de unidade"
```

---

### Task 4: Extração via IA (`lib/server/analyze-iptu.ts`)

**Files:**
- Create: `lib/server/analyze-iptu.ts`

**Interfaces:**
- Consumes: `iptuExtracaoSchema`, `IptuExtracao` de `@/lib/iptu-types`; `createResponseWithRetry` de `@/lib/server/openai-responses`; `requireEnv`, `getOptionalEnv` de `@/lib/server/env`.
- Produces: `extractIptuFromPdf(input: { fileName: string; fileType: string; fileBase64: string }): Promise<IptuExtracao>`. Consumido pela rota da Task 6.

Este arquivo replica o padrão de `lib/server/analyze-prestacao.ts` (chamada a `client.responses.create` com `text.format.json_schema`), mas com um schema bem menor (sem workflow Mastra, sem recheck determinístico — é registro histórico, não fechamento financeiro). Não há teste automatizado para I/O externo (mesma convenção de `analyze-prestacao.ts`, que também não tem teste unitário dedicado) — a extração real é validada manualmente na Task 10 com um PDF de exemplo.

- [ ] **Step 1: Implementar `lib/server/analyze-iptu.ts`**

```typescript
import OpenAI from "openai"
import { iptuExtracaoSchema, type IptuExtracao } from "@/lib/iptu-types"
import { createResponseWithRetry } from "@/lib/server/openai-responses"
import { getOptionalEnv, requireEnv } from "@/lib/server/env"

const IPTU_AGENT_NAME = "iptu_certidao_mensal"
const IPTU_AGENT_DEFAULT_MODEL = "gpt-5.5"

const IPTU_SYSTEM_PROMPT = [
  "Voce e um agente de extracao de certidoes/relatorios mensais de pagamento de IPTU enviados por imobiliarias brasileiras.",
  "O documento lista, por apartamento/unidade, quantas parcelas do carne anual de IPTU ja foram quitadas ate a data do relatorio.",
  "Extraia APENAS a quantidade cumulativa de parcelas pagas por unidade ate o momento do relatorio — nunca valores monetarios, nunca datas de vencimento individuais.",
  "O campo unidade deve ser copiado exatamente como identifica o apartamento no documento (ex.: codigo do apartamento, numero da unidade).",
  "O campo ano_carne deve ser preenchido somente se o documento indicar explicitamente o ano fiscal do carne de IPTU; caso contrario, retorne null.",
  "O campo competencia_relatorio e o mes/ano de referencia do proprio relatorio (quando ele foi emitido ou a que mes ele se refere), no formato MM/YYYY.",
  "Nao invente, nao estime e nao complete valores ausentes por suposicao.",
  "Responda somente com JSON valido aderente ao schema solicitado.",
].join(" ")

const IPTU_USER_PROMPT = [
  "Analise o PDF anexado como uma certidao/relatorio mensal de pagamento de IPTU.",
  "Retorne um item em apartamentos para cada unidade citada no documento, com a quantidade cumulativa de parcelas pagas ate agora.",
].join(" ")

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["competencia_relatorio", "apartamentos"],
  properties: {
    competencia_relatorio: { type: "string" },
    apartamentos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["unidade", "parcelas_pagas", "ano_carne"],
        properties: {
          unidade: { type: "string" },
          parcelas_pagas: { type: "integer" },
          ano_carne: { type: ["integer", "null"] },
        },
      },
    },
  },
}

export async function extractIptuFromPdf(input: {
  fileName: string
  fileType: string
  fileBase64: string
}): Promise<IptuExtracao> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })
  const fileData = `data:${input.fileType};base64,${input.fileBase64}`

  const response = await createResponseWithRetry(client, {
    model: getOptionalEnv("OPENAI_MODEL", IPTU_AGENT_DEFAULT_MODEL),
    input: [
      { role: "system", content: IPTU_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "input_file", filename: input.fileName, file_data: fileData },
          { type: "input_text", text: IPTU_USER_PROMPT },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: IPTU_AGENT_NAME,
        strict: true,
        schema,
      },
    },
  } as unknown as Parameters<typeof client.responses.create>[0])

  if (!("output_text" in response)) {
    throw new Error("A resposta da IA nao retornou texto estruturado.")
  }

  return iptuExtracaoSchema.parse(JSON.parse(response.output_text))
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/server/analyze-iptu.ts
git commit -m "feat(iptu): extracao de certidao de IPTU via IA"
```

---

### Task 5: Persistência (`lib/server/persist-iptu.ts`)

**Files:**
- Create: `lib/server/persist-iptu.ts`
- Create (smoke test, não faz parte do build): `test-iptu-persist.ts` (raiz do repo, mesmo padrão de `test-egestor.ts`)

**Interfaces:**
- Consumes: `createSupabaseAdmin` de `@/lib/server/supabase`; `calcularNovasParcelas`, `calcularResponsavel`, `resolverImovelId`, `IPTU_PARCELAS_PADRAO` de `@/lib/iptu-logic`; `IptuAnomalia`, `IptuExtracao`, `IptuResponsavel` de `@/lib/iptu-types`; `ImovelStatus` de `@/lib/cadastros-types`.
- Produces:
  - `importarCertidaoIptu(input: ImportarCertidaoInput): Promise<ImportarCertidaoResultado>`
  - `listarIptuPorEmpreendimento(empreendimentoId: string): Promise<IptuCarneComParcelas[]>`
  - `atualizarResponsavelParcela(parcelaId: string, responsavel: IptuResponsavel): Promise<IptuParcelaRow>`
  - `atualizarNumeroParcelasCarne(carneId: string, numeroParcelas: number): Promise<{ id: string; numero_parcelas: number }>`
  - `listarImportacoesPorEmpreendimento(empreendimentoId: string): Promise<IptuImportacao[]>`
  - Tipos: `ImportarCertidaoInput`, `ImportarCertidaoResultado`, `IptuCarneComParcelas`, `IptuParcelaRow`.
  Consumidos pelas rotas da Task 6, 7 e 8.

Este arquivo faz I/O direto com Supabase; seguindo a convenção do projeto (a suíte de testes evita mockar banco — a lógica testável já foi extraída para `lib/iptu-logic.ts` na Task 3), a verificação aqui é um smoke test de integração real contra o banco de desenvolvimento, no mesmo espírito de `test-egestor.ts`.

- [ ] **Step 1: Implementar `lib/server/persist-iptu.ts`**

```typescript
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { IPTU_PARCELAS_PADRAO, calcularNovasParcelas, calcularResponsavel, resolverImovelId } from "@/lib/iptu-logic"
import type { IptuAnomalia, IptuExtracao, IptuImportacao, IptuResponsavel } from "@/lib/iptu-types"
import type { ImovelStatus } from "@/lib/cadastros-types"

const BUCKET = "iptu-certidoes"

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
}

interface ImovelRow {
  id: string
  imobiliaria_id: string
  empreendimento_id: string
  unidade: string
  status: ImovelStatus
}

export interface ImportarCertidaoInput {
  imobiliariaId: string
  empreendimentoId: string
  fileName: string
  fileType: string
  fileBuffer: Buffer
  extracao: IptuExtracao
}

export interface ImportarCertidaoResultado {
  importacaoId: string
  parcelasNovas: number
  apartamentosNaoVinculados: string[]
  anomalias: IptuAnomalia[]
}

export async function importarCertidaoIptu(input: ImportarCertidaoInput): Promise<ImportarCertidaoResultado> {
  const supabase = createSupabaseAdmin()

  const storagePath = `certidoes/${Date.now()}-${sanitizeFilename(input.fileName)}`
  const upload = await supabase.storage.from(BUCKET).upload(storagePath, input.fileBuffer, {
    contentType: input.fileType,
    upsert: false,
  })
  if (upload.error) throw upload.error

  const { data: importacao, error: importacaoError } = await supabase
    .from("iptu_importacoes")
    .insert({
      empreendimento_id: input.empreendimentoId,
      arquivo_nome: input.fileName,
      arquivo_path: storagePath,
      competencia_relatorio: input.extracao.competencia_relatorio,
      resultado_bruto: input.extracao,
      apartamentos_nao_vinculados: [],
      anomalias: [],
    })
    .select("id")
    .single()
  if (importacaoError) throw importacaoError

  const { data: imoveisData, error: imoveisError } = await supabase
    .from("imoveis")
    .select("id, imobiliaria_id, empreendimento_id, unidade, status")
    .eq("imobiliaria_id", input.imobiliariaId)
    .eq("empreendimento_id", input.empreendimentoId)
  if (imoveisError) throw imoveisError

  const imoveis = (imoveisData ?? []) as ImovelRow[]
  const apartamentosNaoVinculados: string[] = []
  const anomalias: IptuAnomalia[] = []
  let parcelasNovas = 0

  for (const apartamento of input.extracao.apartamentos) {
    const imovelId = resolverImovelId(imoveis, input.imobiliariaId, input.empreendimentoId, apartamento.unidade)
    if (!imovelId) {
      apartamentosNaoVinculados.push(apartamento.unidade)
      continue
    }

    const imovel = imoveis.find((i) => i.id === imovelId)!
    const anoReferencia = apartamento.ano_carne ?? Number(input.extracao.competencia_relatorio.split("/")[1])

    const carne = await buscarOuCriarCarne(supabase, imovelId, anoReferencia)

    const { count: parcelasPagasAtual, error: contagemError } = await supabase
      .from("iptu_parcelas")
      .select("id", { count: "exact", head: true })
      .eq("carne_id", carne.id)
      .eq("pago", true)
    if (contagemError) throw contagemError

    const { numerosNovos, anomalia } = calcularNovasParcelas(
      parcelasPagasAtual ?? 0,
      apartamento.parcelas_pagas,
      carne.numero_parcelas,
    )

    if (anomalia) {
      anomalias.push({
        unidade: apartamento.unidade,
        tipo: anomalia,
        detalhe: `parcelas informadas: ${apartamento.parcelas_pagas}, registradas: ${parcelasPagasAtual ?? 0}, carne: ${carne.numero_parcelas}`,
      })
    }

    if (numerosNovos.length > 0) {
      const responsavel = calcularResponsavel(imovel.status)
      const { error: insertError } = await supabase.from("iptu_parcelas").insert(
        numerosNovos.map((numero) => ({
          carne_id: carne.id,
          numero,
          pago: true,
          responsavel,
          status_imovel_no_registro: imovel.status,
          origem_importacao_id: importacao.id,
          registrado_em: new Date().toISOString(),
        })),
      )
      if (insertError) throw insertError
      parcelasNovas += numerosNovos.length
    }
  }

  const { error: updateError } = await supabase
    .from("iptu_importacoes")
    .update({ apartamentos_nao_vinculados: apartamentosNaoVinculados, anomalias })
    .eq("id", importacao.id)
  if (updateError) throw updateError

  return {
    importacaoId: importacao.id,
    parcelasNovas,
    apartamentosNaoVinculados,
    anomalias,
  }
}

async function buscarOuCriarCarne(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  imovelId: string,
  anoReferencia: number,
) {
  const { data: existente, error: buscaError } = await supabase
    .from("iptu_carnes")
    .select("id, numero_parcelas")
    .eq("imovel_id", imovelId)
    .eq("ano_referencia", anoReferencia)
    .maybeSingle()
  if (buscaError) throw buscaError
  if (existente) return existente as { id: string; numero_parcelas: number }

  const { data: criado, error: criaError } = await supabase
    .from("iptu_carnes")
    .insert({ imovel_id: imovelId, ano_referencia: anoReferencia, numero_parcelas: IPTU_PARCELAS_PADRAO })
    .select("id, numero_parcelas")
    .single()
  if (criaError) throw criaError
  return criado as { id: string; numero_parcelas: number }
}

export interface IptuParcelaRow {
  id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  registrado_em: string | null
}

export interface IptuCarneComParcelas {
  id: string
  imovel_id: string
  unidade: string
  inquilino_nome: string | null
  ano_referencia: number
  numero_parcelas: number
  parcelas: IptuParcelaRow[]
}

export async function listarIptuPorEmpreendimento(empreendimentoId: string): Promise<IptuCarneComParcelas[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("iptu_carnes")
    .select(
      `
      id,
      imovel_id,
      ano_referencia,
      numero_parcelas,
      imoveis!inner ( unidade, inquilino_nome, empreendimento_id ),
      iptu_parcelas ( id, numero, pago, responsavel, status_imovel_no_registro, registrado_em )
    `,
    )
    .eq("imoveis.empreendimento_id", empreendimentoId)
    .order("ano_referencia", { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => {
    const imovel = row.imoveis as unknown as { unidade: string; inquilino_nome: string | null }
    const parcelas = (row.iptu_parcelas ?? []) as IptuParcelaRow[]
    return {
      id: row.id,
      imovel_id: row.imovel_id,
      unidade: imovel.unidade,
      inquilino_nome: imovel.inquilino_nome,
      ano_referencia: row.ano_referencia,
      numero_parcelas: row.numero_parcelas,
      parcelas: [...parcelas].sort((a, b) => a.numero - b.numero),
    }
  })
}

export async function atualizarResponsavelParcela(
  parcelaId: string,
  responsavel: IptuResponsavel,
): Promise<IptuParcelaRow> {
  const supabase = createSupabaseAdmin()
  const { data: parcela, error: buscaError } = await supabase
    .from("iptu_parcelas")
    .select("id, pago")
    .eq("id", parcelaId)
    .single()
  if (buscaError) throw buscaError
  if (!parcela.pago) {
    throw new Error("So e possivel definir responsavel em parcelas pagas.")
  }

  const { data, error } = await supabase
    .from("iptu_parcelas")
    .update({ responsavel })
    .eq("id", parcelaId)
    .select("id, numero, pago, responsavel, status_imovel_no_registro, registrado_em")
    .single()
  if (error) throw error
  return data as IptuParcelaRow
}

export async function atualizarNumeroParcelasCarne(
  carneId: string,
  numeroParcelas: number,
): Promise<{ id: string; numero_parcelas: number }> {
  const supabase = createSupabaseAdmin()
  const { count, error: countError } = await supabase
    .from("iptu_parcelas")
    .select("id", { count: "exact", head: true })
    .eq("carne_id", carneId)
    .eq("pago", true)
  if (countError) throw countError
  if ((count ?? 0) > numeroParcelas) {
    throw new Error("numero_parcelas nao pode ser menor que a quantidade ja paga.")
  }

  const { data, error } = await supabase
    .from("iptu_carnes")
    .update({ numero_parcelas: numeroParcelas })
    .eq("id", carneId)
    .select("id, numero_parcelas")
    .single()
  if (error) throw error
  return data
}

export async function listarImportacoesPorEmpreendimento(empreendimentoId: string): Promise<IptuImportacao[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("iptu_importacoes")
    .select("id, empreendimento_id, arquivo_nome, arquivo_path, competencia_relatorio, resultado_bruto, apartamentos_nao_vinculados, anomalias, criado_em")
    .eq("empreendimento_id", empreendimentoId)
    .order("criado_em", { ascending: false })
  if (error) throw error
  return (data ?? []) as IptuImportacao[]
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Escrever o smoke test de integração**

```typescript
// test-iptu-persist.ts
import { createSupabaseAdmin } from "./lib/server/supabase"
import { importarCertidaoIptu } from "./lib/server/persist-iptu"

async function run() {
  const supabase = createSupabaseAdmin()

  const { data: imobiliaria } = await supabase
    .from("imobiliarias")
    .select("id")
    .eq("nome", "Alive Imoveis")
    .single()
  const { data: empreendimento } = await supabase
    .from("empreendimentos")
    .select("id")
    .eq("nome", "Grand Messejana II")
    .single()

  if (!imobiliaria || !empreendimento) {
    throw new Error("Fixtures 'Alive Imoveis' / 'Grand Messejana II' nao encontradas — ajuste os nomes antes de rodar.")
  }

  const unidadeTeste = `TESTE-IPTU-${Date.now()}`
  const { data: imovel, error: imovelError } = await supabase
    .from("imoveis")
    .insert({
      imobiliaria_id: imobiliaria.id,
      empreendimento_id: empreendimento.id,
      codigo_imobiliaria: unidadeTeste,
      unidade: unidadeTeste,
      status: "vago",
    })
    .select("id")
    .single()
  if (imovelError) throw imovelError

  try {
    const resultado = await importarCertidaoIptu({
      imobiliariaId: imobiliaria.id,
      empreendimentoId: empreendimento.id,
      fileName: "teste-certidao.pdf",
      fileType: "application/pdf",
      fileBuffer: Buffer.from("PDF FAKE PARA TESTE"),
      extracao: {
        competencia_relatorio: "03/2026",
        apartamentos: [{ unidade: unidadeTeste, parcelas_pagas: 3, ano_carne: 2026 }],
      },
    })

    console.log("Resultado da importacao:", resultado)
    if (resultado.parcelasNovas !== 3) throw new Error(`Esperava 3 parcelas novas, veio ${resultado.parcelasNovas}`)
    if (resultado.apartamentosNaoVinculados.length !== 0) throw new Error("Nao deveria ter apartamento nao vinculado")

    const { data: carne } = await supabase.from("iptu_carnes").select("id").eq("imovel_id", imovel.id).single()
    const { data: parcelas } = await supabase
      .from("iptu_parcelas")
      .select("numero, pago, responsavel, status_imovel_no_registro")
      .eq("carne_id", carne!.id)
      .order("numero")

    console.log("Parcelas criadas:", parcelas)
    if (parcelas?.length !== 3) throw new Error(`Esperava 3 parcelas, vieram ${parcelas?.length}`)
    if (parcelas.some((p) => p.responsavel !== "proprietario")) {
      throw new Error("Imovel vago deveria gerar responsavel=proprietario em todas as parcelas")
    }

    console.log("OK: smoke test de importacao de IPTU passou.")
  } finally {
    await supabase.from("imoveis").delete().eq("id", imovel.id)
  }
}

run().catch((error) => {
  console.error("FALHOU:", error)
  process.exit(1)
})
```

- [ ] **Step 4: Rodar o smoke test**

Run:
```bash
set -a; source .env.local; set +a
npx tsx test-iptu-persist.ts
```
Expected: log `OK: smoke test de importacao de IPTU passou.`, sem lançar erro. Se as fixtures `"Alive Imoveis"` / `"Grand Messejana II"` não existirem no banco de desenvolvimento usado, ajuste os nomes no script para uma imobiliária/empreendimento existentes antes de rodar.

- [ ] **Step 5: Commit**

```bash
git add lib/server/persist-iptu.ts test-iptu-persist.ts
git commit -m "feat(iptu): persistencia de importacao, listagem e edicao manual de IPTU"
```

---

### Task 6: Rota de importação (`POST /api/iptu/importar`)

**Files:**
- Create: `app/api/iptu/importar/route.ts`

**Interfaces:**
- Consumes: `extractIptuFromPdf` de `@/lib/server/analyze-iptu`; `importarCertidaoIptu` de `@/lib/server/persist-iptu`.
- Produces: rota `POST /api/iptu/importar`, `multipart/form-data` com campos `file`, `imobiliaria_id`, `empreendimento_id`. Resposta `201` com `ImportarCertidaoResultado` (ver Task 5) ou `400`/`500` com `{ error: string }`. Consumida por `lib/contexts/iptu-context.tsx` (Task 9).

- [ ] **Step 1: Implementar a rota**

```typescript
import { NextResponse } from "next/server"
import { extractIptuFromPdf } from "@/lib/server/analyze-iptu"
import { importarCertidaoIptu } from "@/lib/server/persist-iptu"

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  const imobiliariaId = formData.get("imobiliaria_id")
  const empreendimentoId = formData.get("empreendimento_id")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo e obrigatorio." }, { status: 400 })
  }
  if (typeof imobiliariaId !== "string" || typeof empreendimentoId !== "string") {
    return NextResponse.json({ error: "imobiliaria_id e empreendimento_id sao obrigatorios." }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  try {
    const extracao = await extractIptuFromPdf({
      fileName: file.name,
      fileType: file.type,
      fileBase64: fileBuffer.toString("base64"),
    })

    const resultado = await importarCertidaoIptu({
      imobiliariaId,
      empreendimentoId,
      fileName: file.name,
      fileType: file.type,
      fileBuffer,
      extracao,
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao importar certidao." },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Rodar typecheck e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/iptu/importar/route.ts
git commit -m "feat(iptu): rota de importacao de certidao mensal"
```

---

### Task 7: Rotas de listagem (`GET /api/iptu` e `GET /api/iptu/importacoes`)

**Files:**
- Create: `app/api/iptu/route.ts`
- Create: `app/api/iptu/importacoes/route.ts`

**Interfaces:**
- Consumes: `listarIptuPorEmpreendimento`, `listarImportacoesPorEmpreendimento` de `@/lib/server/persist-iptu`.
- Produces: `GET /api/iptu?empreendimento_id=...` → `{ carnes: IptuCarneComParcelas[] }`; `GET /api/iptu/importacoes?empreendimento_id=...` → `{ importacoes: IptuImportacao[] }`. Ambas `400`/`500` com `{ error: string }` em caso de falha. Consumidas por `lib/contexts/iptu-context.tsx` (Task 9).

- [ ] **Step 1: Implementar `app/api/iptu/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { listarIptuPorEmpreendimento } from "@/lib/server/persist-iptu"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")

  if (!empreendimentoId) {
    return NextResponse.json({ error: "empreendimento_id e obrigatorio." }, { status: 400 })
  }

  try {
    const carnes = await listarIptuPorEmpreendimento(empreendimentoId)
    return NextResponse.json({ carnes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar controle de IPTU." },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Implementar `app/api/iptu/importacoes/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { listarImportacoesPorEmpreendimento } from "@/lib/server/persist-iptu"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const empreendimentoId = params.get("empreendimento_id")

  if (!empreendimentoId) {
    return NextResponse.json({ error: "empreendimento_id e obrigatorio." }, { status: 400 })
  }

  try {
    const importacoes = await listarImportacoesPorEmpreendimento(empreendimentoId)
    return NextResponse.json({ importacoes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar historico de importacoes." },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 3: Rodar typecheck e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/api/iptu/route.ts app/api/iptu/importacoes/route.ts
git commit -m "feat(iptu): rotas de listagem de carnes e historico de importacoes"
```

---

### Task 8: Rotas de edição manual (`PATCH /api/iptu/parcelas/[id]` e `PATCH /api/iptu/carnes/[id]`)

**Files:**
- Create: `app/api/iptu/parcelas/[id]/route.ts`
- Create: `app/api/iptu/carnes/[id]/route.ts`

**Interfaces:**
- Consumes: `iptuParcelaPatchSchema`, `iptuCarnePatchSchema` de `@/lib/iptu-types`; `parseJson` de `@/lib/server/cadastros`; `atualizarResponsavelParcela`, `atualizarNumeroParcelasCarne` de `@/lib/server/persist-iptu`.
- Produces: `PATCH /api/iptu/parcelas/[id]` (body `{ responsavel: "inquilino" | "proprietario" }`, resposta `{ parcela: IptuParcelaRow }`); `PATCH /api/iptu/carnes/[id]` (body `{ numero_parcelas: number }`, resposta `{ carne: { id, numero_parcelas } }`). Ambas usadas por `lib/contexts/iptu-context.tsx` (Task 9).

- [ ] **Step 1: Implementar `app/api/iptu/parcelas/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { iptuParcelaPatchSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { atualizarResponsavelParcela } from "@/lib/server/persist-iptu"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const input = parseJson(iptuParcelaPatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const parcela = await atualizarResponsavelParcela(id, input.data.responsavel)
    return NextResponse.json({ parcela })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar parcela." },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 2: Implementar `app/api/iptu/carnes/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { iptuCarnePatchSchema } from "@/lib/iptu-types"
import { parseJson } from "@/lib/server/cadastros"
import { atualizarNumeroParcelasCarne } from "@/lib/server/persist-iptu"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const input = parseJson(iptuCarnePatchSchema, await request.json())
  if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!input.data) return NextResponse.json({ error: "Payload invalido." }, { status: 400 })

  try {
    const carne = await atualizarNumeroParcelasCarne(id, input.data.numero_parcelas)
    return NextResponse.json({ carne })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar carne." },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 3: Rodar typecheck e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/api/iptu/parcelas/[id]/route.ts app/api/iptu/carnes/[id]/route.ts
git commit -m "feat(iptu): rotas de edicao manual de responsavel e numero de parcelas"
```

---

### Task 9: Context React (`lib/contexts/iptu-context.tsx`)

**Files:**
- Create: `lib/contexts/iptu-context.tsx`

**Interfaces:**
- Consumes: `IptuCarneComParcelas` (formato retornado por `GET /api/iptu`, igual ao tipo definido em `lib/server/persist-iptu.ts`); `IptuImportacao` (formato retornado por `GET /api/iptu/importacoes`).
- Produces: `IptuProvider`, `useIptu()` retornando `{ carnes, importacoes, loading, error, empreendimentoId, setEmpreendimentoId, importarCertidao, atualizarResponsavel, atualizarNumeroParcelas, ultimoResultadoImportacao }`. Consumido por `app/(app)/iptu/page.tsx` (Task 10).

- [ ] **Step 1: Implementar o context**

```typescript
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type IptuResponsavel = "inquilino" | "proprietario"

export type IptuParcelaRow = {
  id: string
  numero: number
  pago: boolean
  responsavel: IptuResponsavel | null
  status_imovel_no_registro: string | null
  registrado_em: string | null
}

export type IptuCarneComParcelas = {
  id: string
  imovel_id: string
  unidade: string
  inquilino_nome: string | null
  ano_referencia: number
  numero_parcelas: number
  parcelas: IptuParcelaRow[]
}

export type ImportarCertidaoResultado = {
  importacaoId: string
  parcelasNovas: number
  apartamentosNaoVinculados: string[]
  anomalias: Array<{ unidade: string; tipo: "regressao" | "excede_carne"; detalhe: string }>
}

export type IptuImportacao = {
  id: string
  empreendimento_id: string
  arquivo_nome: string
  arquivo_path: string
  competencia_relatorio: string
  apartamentos_nao_vinculados: string[]
  anomalias: Array<{ unidade: string; tipo: "regressao" | "excede_carne"; detalhe: string }>
  criado_em: string
}

interface IptuContextValue {
  carnes: IptuCarneComParcelas[]
  importacoes: IptuImportacao[]
  loading: boolean
  error: string | null
  empreendimentoId: string | null
  setEmpreendimentoId: (id: string | null) => void
  importarCertidao: (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => Promise<ImportarCertidaoResultado>
  atualizarResponsavel: (parcelaId: string, responsavel: IptuResponsavel) => Promise<void>
  atualizarNumeroParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
  ultimoResultadoImportacao: ImportarCertidaoResultado | null
}

const IptuContext = createContext<IptuContextValue | null>(null)

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Falha na requisicao.")
  }
  return payload
}

export function IptuProvider({ children }: { children: React.ReactNode }) {
  const [empreendimentoId, setEmpreendimentoId] = useState<string | null>(null)
  const [carnes, setCarnes] = useState<IptuCarneComParcelas[]>([])
  const [importacoes, setImportacoes] = useState<IptuImportacao[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimoResultadoImportacao, setUltimoResultadoImportacao] = useState<ImportarCertidaoResultado | null>(null)

  const reload = useCallback(async () => {
    if (!empreendimentoId) {
      setCarnes([])
      setImportacoes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [carnesPayload, importacoesPayload] = await Promise.all([
        fetchJson(`/api/iptu?empreendimento_id=${encodeURIComponent(empreendimentoId)}`),
        fetchJson(`/api/iptu/importacoes?empreendimento_id=${encodeURIComponent(empreendimentoId)}`),
      ])
      setCarnes(carnesPayload.carnes ?? [])
      setImportacoes(importacoesPayload.importacoes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar controle de IPTU.")
    } finally {
      setLoading(false)
    }
  }, [empreendimentoId])

  useEffect(() => {
    void reload()
  }, [reload])

  const importarCertidao = useCallback(
    async (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => {
      setError(null)
      const formData = new FormData()
      formData.append("file", input.file)
      formData.append("imobiliaria_id", input.imobiliariaId)
      formData.append("empreendimento_id", input.empreendimentoId)
      const resultado = (await fetchJson("/api/iptu/importar", {
        method: "POST",
        body: formData,
      })) as ImportarCertidaoResultado
      setUltimoResultadoImportacao(resultado)
      await reload()
      return resultado
    },
    [reload],
  )

  const atualizarResponsavel = useCallback(
    async (parcelaId: string, responsavel: IptuResponsavel) => {
      setError(null)
      await fetchJson(`/api/iptu/parcelas/${parcelaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel }),
      })
      await reload()
    },
    [reload],
  )

  const atualizarNumeroParcelas = useCallback(
    async (carneId: string, numeroParcelas: number) => {
      setError(null)
      await fetchJson(`/api/iptu/carnes/${carneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_parcelas: numeroParcelas }),
      })
      await reload()
    },
    [reload],
  )

  const value = useMemo(
    () => ({
      carnes,
      importacoes,
      loading,
      error,
      empreendimentoId,
      setEmpreendimentoId,
      importarCertidao,
      atualizarResponsavel,
      atualizarNumeroParcelas,
      ultimoResultadoImportacao,
    }),
    [
      carnes,
      importacoes,
      loading,
      error,
      empreendimentoId,
      importarCertidao,
      atualizarResponsavel,
      atualizarNumeroParcelas,
      ultimoResultadoImportacao,
    ],
  )

  return <IptuContext.Provider value={value}>{children}</IptuContext.Provider>
}

export function useIptu() {
  const value = useContext(IptuContext)
  if (!value) throw new Error("useIptu must be used within IptuProvider")
  return value
}
```

- [ ] **Step 2: Rodar typecheck e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/contexts/iptu-context.tsx
git commit -m "feat(iptu): context react de fetch/estado do controle de IPTU"
```

---

### Task 10: Tela, rota de página e link de navegação

**Files:**
- Create: `components/acr/views/iptu-view.tsx`
- Create: `app/(app)/iptu/page.tsx`
- Modify: `components/acr/sidebar.tsx`

**Interfaces:**
- Consumes: `useIptu` de `@/lib/contexts/iptu-context`; `useCadastros` de `@/lib/contexts/cadastros-context` (para as listas de imobiliárias/empreendimentos); tipos `IptuCarneComParcelas`, `IptuImportacao`, `IptuResponsavel`, `ImportarCertidaoResultado` de `@/lib/contexts/iptu-context`.
- Produces: página navegável em `/iptu`, link "IPTU" na sidebar.

Esta task é validada visualmente: build, subir o dev server, abrir a página no navegador, tirar screenshot/inspecionar, ajustar, repetir (conforme decisão registrada no spec).

- [ ] **Step 1: Implementar `components/acr/views/iptu-view.tsx`**

```typescript
"use client"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, FileUp, Loader2, Receipt } from "lucide-react"
import type { Empreendimento, Imobiliaria } from "@/lib/cadastros-types"
import type { ImportarCertidaoResultado, IptuCarneComParcelas, IptuImportacao, IptuResponsavel } from "@/lib/contexts/iptu-context"

interface IptuViewProps {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  carnes: IptuCarneComParcelas[]
  importacoes: IptuImportacao[]
  loading: boolean
  error: string | null
  empreendimentoId: string | null
  ultimoResultadoImportacao: ImportarCertidaoResultado | null
  onSelectEmpreendimento: (id: string | null) => void
  onImportar: (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => Promise<void>
  onAtualizarResponsavel: (parcelaId: string, responsavel: IptuResponsavel) => Promise<void>
  onAtualizarNumeroParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
}

export function IptuView({
  imobiliarias,
  empreendimentos,
  carnes,
  importacoes,
  loading,
  error,
  empreendimentoId,
  ultimoResultadoImportacao,
  onSelectEmpreendimento,
  onImportar,
  onAtualizarResponsavel,
  onAtualizarNumeroParcelas,
}: IptuViewProps) {
  const [imobiliariaId, setImobiliariaId] = useState<string>("")
  const [importando, setImportando] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalPorApartamento = useMemo(
    () =>
      carnes.map((carne) => ({
        carne,
        pagas: carne.parcelas.filter((p) => p.pago).length,
        doProprietario: carne.parcelas.filter((p) => p.responsavel === "proprietario").length,
        doInquilino: carne.parcelas.filter((p) => p.responsavel === "inquilino").length,
      })),
    [carnes],
  )

  async function handleFileSelected(file: File) {
    if (!imobiliariaId || !empreendimentoId) {
      setImportError("Selecione imobiliaria e empreendimento antes de importar.")
      return
    }
    setImportando(true)
    setImportError(null)
    try {
      await onImportar({ file, imobiliariaId, empreendimentoId })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Falha ao importar certidao.")
    } finally {
      setImportando(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center gap-3">
        <Receipt size={24} className="text-[#2D8C3A]" />
        <h1 className="text-2xl font-bold text-[#1A2B1C]">Controle de IPTU</h1>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={imobiliariaId}
          onChange={(event) => setImobiliariaId(event.target.value)}
        >
          <option value="">Imobiliaria...</option>
          {imobiliarias.map((imob) => (
            <option key={imob.id} value={imob.id}>
              {imob.nome}
            </option>
          ))}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={empreendimentoId ?? ""}
          onChange={(event) => onSelectEmpreendimento(event.target.value || null)}
        >
          <option value="">Empreendimento...</option>
          {empreendimentos.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nome}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-black/[0.03]">
          {importando ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
          <span>Importar certidao (PDF)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={importando}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFileSelected(file)
            }}
          />
        </label>
      </div>

      {importError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} />
          <span>{importError}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {ultimoResultadoImportacao && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 space-y-1">
          <p>{ultimoResultadoImportacao.parcelasNovas} parcela(s) nova(s) registrada(s).</p>
          {ultimoResultadoImportacao.apartamentosNaoVinculados.length > 0 && (
            <p>
              Unidades nao vinculadas: {ultimoResultadoImportacao.apartamentosNaoVinculados.join(", ")}
            </p>
          )}
          {ultimoResultadoImportacao.anomalias.length > 0 && (
            <p>
              Anomalias: {ultimoResultadoImportacao.anomalias.map((a) => `${a.unidade} (${a.tipo})`).join(", ")}
            </p>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-black/50">Carregando...</p>}

      {!loading && empreendimentoId && carnes.length === 0 && (
        <p className="text-sm text-black/50">Nenhum carne de IPTU registrado para este empreendimento ainda.</p>
      )}

      <div className="space-y-3">
        {totalPorApartamento.map(({ carne, pagas, doProprietario, doInquilino }) => (
          <div key={carne.id} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              onClick={() => setExpandido(expandido === carne.id ? null : carne.id)}
            >
              <div>
                <p className="font-medium text-sm">
                  {carne.unidade} — {carne.inquilino_nome ?? "sem inquilino"}
                </p>
                <p className="text-xs text-black/50">
                  Carne {carne.ano_referencia}: {pagas}/{carne.numero_parcelas} parcelas pagas — {doProprietario} do
                  proprietario, {doInquilino} do inquilino
                </p>
              </div>
            </button>

            {expandido === carne.id && (
              <div className="border-t px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span>Numero de parcelas do carne:</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={carne.numero_parcelas}
                    className="border rounded px-2 py-1 w-16"
                    onBlur={(event) => {
                      const valor = Number(event.target.value)
                      if (valor && valor !== carne.numero_parcelas) {
                        void onAtualizarNumeroParcelas(carne.id, valor)
                      }
                    }}
                  />
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-black/50">
                      <th className="py-1">Parcela</th>
                      <th className="py-1">Status</th>
                      <th className="py-1">Responsavel</th>
                      <th className="py-1">Registrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carne.parcelas.map((parcela) => (
                      <tr key={parcela.id} className="border-t">
                        <td className="py-1">{parcela.numero}</td>
                        <td className="py-1">{parcela.pago ? "Paga" : "Pendente"}</td>
                        <td className="py-1">
                          {parcela.pago ? (
                            <select
                              className="border rounded px-1 py-0.5"
                              value={parcela.responsavel ?? ""}
                              onChange={(event) =>
                                void onAtualizarResponsavel(parcela.id, event.target.value as IptuResponsavel)
                              }
                            >
                              <option value="">indefinido</option>
                              <option value="inquilino">inquilino</option>
                              <option value="proprietario">proprietario</option>
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1">
                          {parcela.registrado_em ? new Date(parcela.registrado_em).toLocaleDateString("pt-BR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {empreendimentoId && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
            onClick={() => setMostrarHistorico((v) => !v)}
          >
            <span className="text-sm font-medium">Histórico de importações ({importacoes.length})</span>
          </button>

          {mostrarHistorico && (
            <div className="border-t px-4 py-3">
              {importacoes.length === 0 ? (
                <p className="text-xs text-black/50">Nenhuma certidão importada ainda para este empreendimento.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-black/50">
                      <th className="py-1">Data</th>
                      <th className="py-1">Arquivo</th>
                      <th className="py-1">Competência do relatório</th>
                      <th className="py-1">Não vinculados</th>
                      <th className="py-1">Anomalias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importacoes.map((importacao) => (
                      <tr key={importacao.id} className="border-t">
                        <td className="py-1">{new Date(importacao.criado_em).toLocaleString("pt-BR")}</td>
                        <td className="py-1">{importacao.arquivo_nome}</td>
                        <td className="py-1">{importacao.competencia_relatorio}</td>
                        <td className="py-1">
                          {importacao.apartamentos_nao_vinculados.length === 0
                            ? "—"
                            : importacao.apartamentos_nao_vinculados.join(", ")}
                        </td>
                        <td className="py-1">
                          {importacao.anomalias.length === 0
                            ? "—"
                            : importacao.anomalias.map((a) => `${a.unidade} (${a.tipo})`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar `app/(app)/iptu/page.tsx`**

```typescript
"use client"

import { IptuView } from "@/components/acr/views/iptu-view"
import { useCadastros } from "@/lib/contexts/cadastros-context"
import { IptuProvider, useIptu } from "@/lib/contexts/iptu-context"

function IptuPageContent() {
  const { cadastros } = useCadastros()
  const {
    carnes,
    importacoes,
    loading,
    error,
    empreendimentoId,
    setEmpreendimentoId,
    importarCertidao,
    atualizarResponsavel,
    atualizarNumeroParcelas,
    ultimoResultadoImportacao,
  } = useIptu()

  return (
    <IptuView
      imobiliarias={cadastros.imobiliarias}
      empreendimentos={cadastros.empreendimentos}
      carnes={carnes}
      importacoes={importacoes}
      loading={loading}
      error={error}
      empreendimentoId={empreendimentoId}
      ultimoResultadoImportacao={ultimoResultadoImportacao}
      onSelectEmpreendimento={setEmpreendimentoId}
      onImportar={async (input) => {
        await importarCertidao(input)
      }}
      onAtualizarResponsavel={atualizarResponsavel}
      onAtualizarNumeroParcelas={atualizarNumeroParcelas}
    />
  )
}

export default function IptuPage() {
  return (
    <IptuProvider>
      <IptuPageContent />
    </IptuProvider>
  )
}
```

- [ ] **Step 3: Adicionar o link "IPTU" na sidebar**

Em `components/acr/sidebar.tsx`, importar o ícone `Receipt` e adicionar um item ao array `mainItems`:

```typescript
import { FileText, Building2, BarChart3, Settings, Receipt } from "lucide-react"
```

```typescript
const mainItems: NavItem[] = [
  {
    href: "/fechamentos",
    label: "Fechamentos",
    icon: FileText,
    matches: (pathname) => pathname === "/" || pathname.startsWith("/fechamentos"),
  },
  {
    href: "/imoveis",
    label: "Imóveis",
    icon: Building2,
    matches: (pathname) => pathname.startsWith("/imoveis"),
  },
  {
    href: "/iptu",
    label: "IPTU",
    icon: Receipt,
    matches: (pathname) => pathname.startsWith("/iptu"),
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    icon: BarChart3,
    matches: (pathname) => pathname.startsWith("/indicadores"),
  },
]
```

- [ ] **Step 4: Rodar typecheck e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Rodar build de produção**

Run: `pnpm build`
Expected: build conclui com sucesso e lista `/iptu` entre as rotas geradas.

- [ ] **Step 6: Subir o dev server e verificar visualmente**

Usar as ferramentas de preview do navegador (`preview_start` com o servidor `dev` já configurado em `.claude/launch.json`, ou criar essa configuração se não existir, apontando para `npm run dev` na porta padrão do Next).

1. Iniciar o servidor de dev e abrir `/iptu` no preview.
2. Tirar um screenshot da tela vazia (sem empreendimento selecionado) e conferir que os seletores de imobiliária/empreendimento e o botão de importar aparecem corretamente.
3. Selecionar uma imobiliária e empreendimento reais (usar dados já existentes no cadastro) e conferir na aba de rede que `GET /api/iptu?empreendimento_id=...` retorna `200` com `{ carnes: [] }` (nenhum carnê ainda).
4. Fazer upload de um PDF de certidão de IPTU real ou de teste e conferir visualmente o resumo pós-importação (parcelas novas, não vinculados, anomalias) e a tabela de apartamentos atualizada.
5. Expandir um apartamento, editar manualmente o `responsavel` de uma parcela paga e o `numero_parcelas` do carnê, e confirmar visualmente que a mudança persiste após reload da página.
6. Ajustar espaçamento/estilo conforme necessário (classes Tailwind) e repetir screenshot até o layout ficar consistente com o restante do app (comparar com `/imoveis`).

Expected: nenhum erro no console do navegador (`preview_console_logs`), nenhuma requisição falhando (`preview_network` com filtro `failed`), fluxo de importação e edição funcionando ponta a ponta.

- [ ] **Step 7: Commit**

```bash
git add components/acr/views/iptu-view.tsx "app/(app)/iptu/page.tsx" components/acr/sidebar.tsx
git commit -m "feat(iptu): tela de controle de IPTU e link de navegacao"
```

---

## Self-Review (registro)

**Cobertura do spec:** escopo eGestor passivo → nenhuma task cria lançamento eGestor (confirmado, apenas registro); fonte de ocupação por status atual → `calcularResponsavel` usa `imovel.status` no momento do import (Task 3/5); formato PDF com N apartamentos → `iptuExtracaoSchema.apartamentos` é array (Task 2/4); carnê anual N parcelas → `iptu_carnes.numero_parcelas` + `IPTU_PARCELAS_PADRAO` (Task 1/3); módulo independente → rota `/iptu` fora do fluxo de fechamentos (Task 10); casos de borda (não vinculado, regressão, excede carnê, inativo, edição manual, reimportação idempotente, redução de numero_parcelas) → cobertos em `lib/iptu-logic.ts` (Task 3) e nas validações de `lib/server/persist-iptu.ts` (Task 5); testes → Tasks 2, 3 e smoke test da Task 5; UI → Task 10 com verificação visual explícita; **histórico de importações e pendências de vínculo** (spec, seção 5) → inicialmente ausente na primeira redação deste plano, adicionado via `listarImportacoesPorEmpreendimento` (Task 5), `GET /api/iptu/importacoes` (Task 7), estado `importacoes` no context (Task 9) e seção expansível "Histórico de importações" na view (Task 10).

**Placeholders:** nenhum "TBD"/"TODO" — todo código está completo e executável.

**Consistência de tipos:** `IptuResponsavel`, `IptuAnomaliaTipo`, `IptuExtracao`, `IptuCarneComParcelas`, `IptuParcelaRow`, `IptuImportacao` são definidos uma única vez no server (`lib/iptu-types.ts` Task 2, `lib/server/persist-iptu.ts` Task 5) e reimportados sem renomear nas rotas; `lib/contexts/iptu-context.tsx` duplica as formas `IptuCarneComParcelas`/`IptuParcelaRow`/`IptuResponsavel`/`IptuImportacao` como tipos client-side (arquivo client não pode importar `lib/server/*`), mantendo os mesmos nomes e shapes retornados pelas rotas para não haver ambiguidade entre as camadas.
