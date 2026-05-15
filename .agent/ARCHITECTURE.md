# Arquitetura ACR

## Visão geral

Aplicação monolítica Next.js (App Router) com estado client-side e processamento server-side via API route.

## Camadas

### Frontend (client)
- `app/page.tsx` — gerencia `currentView`, `analysis`, `analysisResult`, `processing`, `modal`
- `components/acr/views/` — uma view por etapa: fechamentos → novo-fechamento → upload → processando → revisao
- Estado flui de cima para baixo; navegação por callbacks `onNavigate(view)`

### API (server)
- `app/api/prestacao/analyze/route.ts` — único endpoint de análise
- Aceita `multipart/form-data` com campo `file` (PDF, max 20 MB)
- Delega para `runPrestacaoAliveWorkflow(file)`

### Mastra Workflow (server)
Arquivo: `lib/server/prestacao-workflow.ts`

```
validate-file     → checa tipo, tamanho, conteúdo não-vazio
extract-prestacao → OpenAI responses.create com JSON Schema estrito
recheck-determin  → valida totais, confiança, contagem de linhas
persist-result    → Supabase storage + inserts em 5 tabelas
```

### OpenAI (server)
- `lib/server/analyze-prestacao.ts`
- Usa `client.responses.create` (Responses API, não Chat Completions)
- Envia PDF como `input_file` base64 + `input_text` com instrução
- Retorna JSON Schema `prestacao_alive_secao_1` validado por Zod

### Supabase (server)
- Client admin via `SUPABASE_SERVICE_ROLE_KEY`
- Tabelas: `imobiliarias`, `empreendimentos`, `fechamentos`, `documentos_fechamento`, `movimentacoes`, `validacoes`
- Storage bucket: `fechamento-documentos`
- Migrações em `supabase/migrations/`

## Tipos centrais

- `PrestacaoAnalysis` — dados extraídos pela IA
- `TechnicalOpinion` — parecer: aprovado_tecnico | aprovado_com_ressalvas | bloqueado
- `PrestacaoRecheck` — resultado de cada validação determinística
- `AnalyzePrestacaoResponse` — resposta completa do endpoint

## Invariantes

- `analysis` nunca é null na RevisaoView após fluxo completo
- `total_comissoes` e `total_repassar` podem ser null (AI não extraiu)
- Confiança mínima aceita: 0.70 (bloqueado abaixo disso)
- Aprovação desabilitada se `parecer.status === "bloqueado"` ou `failedRechecks.length > 0`
