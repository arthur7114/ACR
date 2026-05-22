# 12 - Execution Roadmap

## Status geral

Status atual: Etapa 2 em andamento com pipeline real de pacote completo implementado para validacao.

O repositorio contem o harness `.agent`, o PRD completo em `docs/`, a trilha numerada de execucao, o mock em `acr-fechamentos-app` como contrato e o fluxo real de analise da prestacao Alive / GM II com Mastra, guardrails e rechecks deterministicos.

## Proxima acao recomendada

Validar pela UI no navegador o processamento streaming do pacote completo com os artefatos reais e conferir a conciliacao deterministica.

## Progresso por etapa

| Etapa | Status | Observacao |
|---|---|---|
| 0 - Governanca e contrato | concluida | Docs, harness e contrato do mock estruturados. |
| 1 - App vivo sem IA | em andamento | Schema inicial, Storage e UI conectada ao fluxo de upload/analise. |
| 2 - Extracao basica | em andamento | Pacote completo com classificacao, extracao por tipo, stream NDJSON, rechecks deterministicos e revisao sem mock implementados para validacao. |
| 3 - Extracao completa | pendente | Depende de regras abertas de inadimplencia parcial e imovel vago. |
| 4 - eGestor e layouts futuros | pendente | Depende de respostas sobre eGestor. |

## Decisoes registradas

- PRD completo permanece como fonte historica/canonica.
- Docs numerados sao a trilha operacional.
- `acr-fechamentos-app` e contrato obrigatorio de UI/UX e fluxo.
- Divergencias contra o mock exigem explicacao previa e atualizacao de docs.
- Roadmap deve ser atualizado ao fim de cada ciclo.
- Primeiro documento real do fluxo e a prestacao Alive / GM II, nao o comprovante de repasse.
- Mastra passa a orquestrar o fluxo de prestacao Alive / GM II; OpenAI fica encapsulada em um step de extracao.
- Totais finais de prestacao sao os recalculados por codigo; a IA nao sobrescreve totais finais.
- Parecer tecnico pode bloquear quando recheck deterministico divergir acima de R$ 0,01.
- Tela de processamento deve consumir eventos reais do backend; progresso hardcoded nao e aceito.
- Tela de revisao nao deve renderizar dados demonstrativos quando nao houver resultado real carregado.
- Extracao da prestacao Alive deve analisar o documento inteiro antes de extrair campos; resumo financeiro final nao pode ser inferido apenas pela soma das linhas por imovel.

## Historico de ciclos

### 2026-05-22 - Extracao integral da prestacao Alive

Status: done
Job: corrigir a modelagem da prestacao para que a IA leia o documento inteiro e extraia o resumo financeiro final alem das linhas por imovel.
Outcome entregue: schema da prestacao passou a exigir `plano_extracao` e `resumo_financeiro`; prompt do agente foi alterado para leitura integral do PDF; validador deterministico passou a usar o resumo financeiro final como fonte do total recebido, comissao/despesas e total a repassar; revisao passou a exibir plano, resumo financeiro e linhas separadamente.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `.agent/scripts/checklist.py .` passou com `PYTHONIOENCODING=utf-8`.
Decisoes: soma das linhas por imovel e resumo financeiro final sao conceitos distintos. O fechamento final deve usar `recebidos_em_nome_locador`, `total_comissao_despesas` e `total_a_repassar` quando presentes no documento.
Arquivos/docs impactados: `acr-fechamentos-app`, `docs/12-execution-roadmap.md`.
Proxima acao: reprocessar o PDF `1. PRESTACAO DE CONTAS MARCO 2026 GM II` e conferir se o resumo financeiro retorna R$ 20.830,41, R$ 3.771,55 e R$ 17.058,86.

### 2026-05-21 - Pipeline real de pacote completo com streaming

Status: done
Job: implementar pacote completo com agentes de extracao, validacao deterministica, progresso real e revisao sem mock.
Outcome entregue: multi-upload real de PDFs, endpoint streaming NDJSON `/api/fechamentos/process/stream`, agentes de classificacao/extracao por tipo, validacao deterministica de totais/repasse/despesas, persistencia reaproveitando tabelas existentes e revisao derivada apenas de `PackageAnalysis`.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `.agent/scripts/checklist.py .` passou com `PYTHONIOENCODING=utf-8`.
Decisoes: IA extrai e classifica evidencias documentais; codigo deterministico decide divergencias, bloqueios e parecer tecnico. Persistencia inicial usa tabelas existentes e `jsonb`, sem nova migracao.
Arquivos/docs impactados: `acr-fechamentos-app`, `docs/12-execution-roadmap.md`.
Proxima acao: validar o fluxo pela UI com os PDFs reais em `docs/Artefatos` e ajustar prompts conforme divergencias observadas.

### 2026-05-21 - Organizacao do prompt da prestacao Alive

Status: done
Job: esclarecer se a tela de processamento e mockada ou real e tornar o prompt do agente de extracao mais facil de localizar.
Outcome entregue: prompt e metadados do agente de extracao Alive / GM II movidos para `acr-fechamentos-app/lib/server/ai-agents/prestacao-alive-agent.ts`, sem alterar o comportamento do workflow.
Validacao: `pnpm exec tsc --noEmit` passou em `acr-fechamentos-app`.
Decisoes: a tela `processando` segue com frases e progresso hardcoded no frontend; o processamento real roda no endpoint `/api/prestacao/analyze` via workflow Mastra, mas ainda nao transmite progresso granular para a UI.
Arquivos/docs impactados: `acr-fechamentos-app/lib/server/analyze-prestacao.ts`, `acr-fechamentos-app/lib/server/ai-agents/prestacao-alive-agent.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: conectar a tela de processamento a eventos reais de progresso do workflow se for necessario exibir cada etapa com fidelidade.

### 2026-05-15 - Parecer tecnico Mastra para prestacao Alive

Status: done
Job: migrar a analise da prestacao para workflow Mastra com guardrails, rechecks deterministicos e parecer tecnico.
Outcome entregue: `@mastra/core` instalado, workflow server-side criado, API `/api/prestacao/analyze` mantida, totais recalculados por codigo, parecer/rechecks/guardrails retornados pela API e exibidos na revisao, migracao `parecer_tecnico` aplicada no Supabase.
Validacao: commit-base `5c3eb95` criado; `pnpm install` passou apos aprovar build scripts de `sharp` e `unrs-resolver`; `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `npx supabase db push` aplicou `202605150002_parecer_tecnico.sql`; API validada com `docs/Artefatos/1. PRESTACAO DE CONTAS MARCO 2026 GM II (1).pdf`, retornando 27 imoveis, parecer `bloqueado` por divergencia deterministica de R$ 0,05 em `total_receitas`; API validada com arquivo nao PDF retornando 400.
Decisoes: o parecer e tecnico e revisa a confiabilidade da extracao/OCR; aprovacao contabil final permanece humana. Tolerancia de totais fixada em R$ 0,01.
Arquivos/docs impactados: `acr-fechamentos-app`, `docs/12-execution-roadmap.md`, `docs/13-current-state-audit.md`.
Proxima acao: testar o fluxo no navegador pela UI e implementar comprovante de repasse para conciliacao contra o total a repassar.

### 2026-05-15 - Primeiro fluxo real de prestacao Alive

Status: done
Job: permitir upload real da prestacao Alive / GM II e extrair a Secao 1 por IA.
Outcome entregue: API Next para analisar PDF, servico OpenAI, persistencia Supabase, migracao inicial, UI de upload/processamento/revisao conectada ao resultado real.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm build` passou; Supabase MCP instalado/autenticado; Supabase CLI linkado ao projeto `qeblersdkfzsogqptbdh`; `supabase db push` aplicou a migracao; API `/api/prestacao/analyze` processou o PDF real, extraiu 27 imoveis e gravou Storage/documento/movimentacoes. `pnpm lint` nao rodou porque o projeto tem script `eslint .`, mas nao possui ESLint instalado/configurado.
Decisoes: artefato principal e `docs/Artefatos/1. PRESTACAO DE CONTAS MARCO 2026 GM II (1).pdf`; `.env` local real sera usado e ignorado pelo Git; MCP Supabase fica instalado como `supabase`.
Arquivos/docs impactados: `acr-fechamentos-app`, `docs/12-execution-roadmap.md`, `docs/13-current-state-audit.md`.
Proxima acao: validar pela UI no navegador, adicionar validacao deterministica de totais e preparar o slice do comprovante de repasse.

### 2026-05-15 - Docs, roadmap e contrato do mock

Status: done
Job: quebrar o PRD em docs executaveis e tornar o mock contrato obrigatorio.
Outcome entregue: trilha numerada em `docs/`, regra de contrato do mock em `AGENTS.md` e `.agent/rules/GEMINI.md`, roadmap inicial e auditoria do estado atual.
Validacao: paths citados pelo harness conferidos; `pnpm lint` e `pnpm exec eslint .` tentados no mock, mas bloqueados pelo `pnpm` por build script pendente de aprovacao para `sharp`.
Decisoes: `acr-fechamentos-app` e contrato de UI/UX e fluxo; divergencias exigem explicacao previa e atualizacao de docs.
Arquivos/docs impactados: `docs/`, `AGENTS.md`, `.agent/rules/GEMINI.md`, `acr-fechamentos-app`.
Proxima acao: iniciar Etapa 1 com Supabase, schema inicial e conexao progressiva do mock a dados reais.

### 2026-05-15 - Harness inicial

Status: done
Job: tornar o harness acessivel no repositorio.
Outcome entregue: `.agent` e `AGENTS.md` copiados e commitados.
Validacao: `git status` limpo apos commit.
Decisoes: repositório Git inicializado em `ACR`.
Arquivos/docs impactados: `.agent`, `AGENTS.md`.
Proxima acao: estruturar docs do PRD e contrato do mock.

## Como atualizar este doc

Ao final de cada ciclo, adicione uma entrada no historico e atualize:

- `Status geral`;
- `Proxima acao recomendada`;
- tabela `Progresso por etapa`;
- `Decisoes registradas`, quando houver decisao nova.
