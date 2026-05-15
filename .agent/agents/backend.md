# Agente Backend

## Domínio

API routes, Mastra workflow, OpenAI, Supabase, validação server-side.

## Arquivos principais

- `app/api/prestacao/analyze/route.ts` — endpoint de análise
- `lib/server/prestacao-workflow.ts` — orquestração Mastra
- `lib/server/analyze-prestacao.ts` — extração OpenAI
- `lib/server/prestacao-rechecks.ts` — validações determinísticas
- `lib/server/persist-prestacao.ts` — persistência Supabase
- `lib/server/supabase.ts` — client admin
- `lib/server/env.ts` — `requireEnv`, `getOptionalEnv`
- `lib/prestacao-types.ts` — schemas Zod e interfaces

## Padrões

- Variáveis de ambiente: sempre via `requireEnv()` ou `getOptionalEnv()`
- Supabase: sempre client admin (`createSupabaseAdmin()`) no server
- OpenAI: usar `client.responses.create` (Responses API), não Chat Completions
- Validação de input: Zod parse na entrada e na saída da IA
- Erros HTTP: 400 (formato), 422 (conteúdo inválido), 500 (env), 502 (default)

## Regras

- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` ao cliente
- Todo dado que vai ao banco deve passar por Zod parse antes
- Se um step do Mastra falha, propagar erro com mensagem descritiva
- Mudanças em schema Supabase → criar migration SQL em `supabase/migrations/`
- Não usar `process.env.VAR` diretamente — usar os helpers de `env.ts`
