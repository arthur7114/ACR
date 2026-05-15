# ACR — Plataforma de Fechamentos Imobiliários

Aplicação Next.js para gestão e conciliação de prestações de contas imobiliárias com análise por IA.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui
- **Backend:** Next.js API Routes, Mastra workflow (4 steps)
- **IA:** OpenAI `client.responses.create` com structured output JSON Schema
- **Banco:** Supabase (PostgreSQL + Storage)
- **Pacotes:** pnpm

## Comandos

```bash
pnpm dev       # servidor de desenvolvimento
pnpm build     # build de produção
pnpm lint      # ESLint
```

## Variáveis de ambiente

Definidas em `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o          # opcional, padrão no código é gpt-5
```

## Arquitetura de pastas

```
app/
  page.tsx                   # estado global + orquestração de views
  api/prestacao/analyze/     # POST endpoint → dispara Mastra workflow
components/acr/views/        # uma view por etapa do fluxo
lib/server/
  analyze-prestacao.ts       # chamada OpenAI + parse JSON Schema
  prestacao-workflow.ts      # Mastra: validate → extract → recheck → persist
  prestacao-rechecks.ts      # validações determinísticas pós-extração
  persist-prestacao.ts       # inserts no Supabase
lib/prestacao-types.ts       # Zod schemas + interfaces TypeScript
supabase/migrations/         # migrações SQL (aplicar via supabase db push)
docs/                        # PRD, roadmap, contratos de mock
.agent/                      # regras de execução para IAs (ver AGENTS.md)
```

## Fluxo principal

```
Upload PDF → POST /api/prestacao/analyze
  → Mastra: validate-file
  → Mastra: extract-prestacao   (OpenAI vision → JSON)
  → Mastra: recheck-deterministic
  → Mastra: persist-result      (Supabase storage + DB)
  → RevisaoView com dados reais
```

## Regras de execução (resumo do AGENTS.md)

1. Classificar o request: `QUESTION | SIMPLE | COMPLEX | DESIGN`
2. Ler `docs/02-mock-contract.md` antes de alterar qualquer UI
3. Nunca divergir do mock contract sem justificar explicitamente
4. Após qualquer implementação, atualizar `docs/12-execution-roadmap.md`
5. Mudanças em schema Supabase exigem migration SQL em `supabase/migrations/`

Ver `.agent/` para regras detalhadas por domínio.
