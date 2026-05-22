# 12 - Execution Roadmap

## Status geral

Status atual: Etapas 1 e 2 em andamento; cadastros imobiliarios reais foram adicionados e pipeline real de pacote completo segue implementado para validacao.

O repositorio contem o harness `.agent`, o PRD completo em `docs/`, a trilha numerada de execucao, o mock em `acr-fechamentos-app` como contrato e o fluxo real de analise da prestacao Alive / GM II com Mastra, guardrails e rechecks deterministicos.

## Proxima acao recomendada

Reprocessar o PDF real pela UI agora com URLs reais: cada tela tem path proprio (`/fechamentos`, `/fechamentos/novo`, `/fechamentos/{id}/upload|processando|revisao`, `/imoveis`, `/configuracoes`); refresh em qualquer rota deve manter contexto, e `/fechamentos/{id}/revisao` deve carregar a analise persistida em `analise_completa` (JSONB) mesmo sem o state em memoria.

## Progresso por etapa

| Etapa | Status | Observacao |
|---|---|---|
| 0 - Governanca e contrato | concluida | Docs, harness e contrato do mock estruturados. |
| 1 - App vivo sem IA | em andamento | Schema inicial, Storage, CRUD de cadastros, importacao CSV de imoveis e UI conectada parcialmente a dados reais. |
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
- Warnings principais da revisao devem mostrar apenas divergencias financeiras reais e documentos obrigatorios ausentes; baixa confianca, documentos opcionais e diagnosticos tecnicos nao devem poluir o alerta operacional.
- Agentes OpenAI do pipeline real devem usar `gpt-5.5` como modelo padrao; `OPENAI_MODEL` pode sobrescrever localmente quando necessario.
- Cadastro de imoveis usa `codigo_imobiliaria` escopado por imobiliaria + empreendimento; exclusao operacional e logica via `ativo=false`.
- A tela `imoveis` deixa de ser placeholder e passa a concentrar os cadastros de imoveis, imobiliarias e empreendimentos.
- Upload, processamento, topbar e persistencia do pacote devem usar o contexto do fechamento ativo; labels demonstrativos fixos nao devem aparecer no fluxo real.
- Badge "Inadimplente" e derivado de `aluguel === 0 || aluguel === null` com inquilino nao-vazio; badge "Vago" e a contrapartida com inquilino vazio/`vago`/`disponivel`. Badges sao puramente derivados na view; nenhum campo de status por linha e persistido.
- `garagem` permanece sendo o valor monetario em reais; `vagas_garagem` (inteiro >= 0) e a quantidade de vagas, extraida do texto da observacao pelo agente Alive. Nao inferir vagas a partir do valor monetario.
- Documento avulso (sem fechamento ativo previo) abre modal de alocacao no UploadView antes de iniciar o processamento; o pipeline servidor continua sincrono, sem evento `awaiting_user_action`.
- App passa a usar URLs reais: cada view tem um path proprio em `app/(app)/*`, com Sidebar/Topbar derivados de `usePathname`. Estado compartilhado vive em `lib/contexts/cadastros-context.tsx` e `lib/contexts/processing-context.tsx`. PackageAnalysis completa fica persistida em `fechamentos.analise_completa` (JSONB) para sobreviver a refresh em `/fechamentos/{id}/revisao`.

## Historico de ciclos

### 2026-05-22 - URLs reais por tela + persistencia de analise completa

Status: done
Job: trocar SPA de view-state por rotas reais Next App Router com IDs na URL, mantendo contexto compartilhado e permitindo bookmark/refresh em qualquer tela.
Outcome entregue: migration `202605220002_fechamento_analise_completa.sql` adiciona `analise_completa JSONB` em `fechamentos`; persist grava a `PackageAnalysis` completa; novo endpoint `GET /api/fechamentos/[id]` retorna o fechamento + analise; novo segment `app/(app)/layout.tsx` envelopa o app com `CadastrosProvider` e `ProcessingProvider`; rotas reais criadas: `/fechamentos`, `/fechamentos/novo`, `/fechamentos/[id]/upload|processando|revisao`, `/imoveis`, `/configuracoes`; `app/page.tsx` agora redireciona para `/fechamentos`; Sidebar com `Link` + `usePathname`; Topbar derivado do pathname; UploadView/ProcessandoView buscam o fechamento por ID e a ProcessandoView lê arquivos pendentes do contexto; RevisaoView aceita `analysisResult` do contexto OU `analise_completa` carregada por GET; `AlocarEmpreendimentoModal` removido (nao faz mais sentido com `/upload` exigindo ID); `components/acr/types.ts` removido (View enum).
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou (rotas listadas); `npx tsx --test lib/server/package-rechecks.test.ts` passou; migration aplicada via pooler `aws-1-us-east-2` e coluna confirmada em `information_schema.columns`.
Decisoes: ProcessingProvider mantem `pendingFiles` em memoria entre `/upload` e `/processando` (arquivos nao sobrevivem a refresh, mas o estado da analise sobrevive porque vem do banco). Refresh em `/processando` sem arquivos mostra mensagem "Nenhum processamento ativo" com botao pra voltar ao upload.
Arquivos/docs impactados: `supabase/migrations/202605220002_*.sql`, `lib/server/persist-package.ts`, `app/api/fechamentos/[id]/route.ts`, `lib/contexts/cadastros-context.tsx`, `lib/contexts/processing-context.tsx`, `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/fechamentos/page.tsx`, `app/(app)/fechamentos/novo/page.tsx`, `app/(app)/fechamentos/[id]/upload/page.tsx`, `app/(app)/fechamentos/[id]/processando/page.tsx`, `app/(app)/fechamentos/[id]/revisao/page.tsx`, `app/(app)/imoveis/page.tsx`, `app/(app)/configuracoes/page.tsx`, `app/page.tsx`, `components/acr/sidebar.tsx`, `components/acr/topbar.tsx`, `components/acr/views/*.tsx`, removidos `components/acr/alocar-empreendimento-modal.tsx` e `components/acr/types.ts`.
Proxima acao: testar manualmente refresh em cada URL, navegar via back/forward do browser, e compartilhar link direto de `/fechamentos/{id}/revisao` para confirmar que carrega via API.

### 2026-05-22 - Metricas por imovel e alocacao de despesa avulsa

Status: done
Job: adicionar visibilidade de inadimplencia/vagos/medias por imovel na revisao, extrair quantidade de vagas de garagem da observacao e exigir alocacao explicita de empreendimento quando o usuario sobe documentos sem passar por Novo Fechamento.
Outcome entregue: cards Media de aluguel, Media considerando vagos e Ocupacao acrescentados a [revisao-view.tsx](components/acr/views/revisao-view.tsx); badge Inadimplente/Vago na celula do inquilino com criterio `aluguel === 0 || aluguel === null`; coluna Vagas na tabela de receitas; campo `vagas_garagem` adicionado ao `receitaPorImovelSchema` em [lib/prestacao-types.ts](lib/prestacao-types.ts) e prompt do Alive em [prestacao-alive-agent.ts](lib/server/ai-agents/prestacao-alive-agent.ts) atualizado para extrair quantidade da observacao; novo `AlocarEmpreendimentoModal` em [components/acr/alocar-empreendimento-modal.tsx](components/acr/alocar-empreendimento-modal.tsx); `UploadView` dispara o modal quando `activeFechamento === null` e `app/page.tsx` cria fechamento rascunho via `POST /api/fechamentos` antes de encadear o processamento.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `npx tsx --test lib/server/package-rechecks.test.ts` passou com fixture atualizado para `vagas_garagem: null`.
Decisoes: badges derivados na view (sem campo persistido); `vagas_garagem` persiste dentro do JSONB `dados_extraidos` (sem migration estrutural); fluxo avulso valida antes do upload em vez de pausar o workflow servidor.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `components/acr/views/upload-view.tsx`, `components/acr/alocar-empreendimento-modal.tsx`, `app/page.tsx`, `components/acr/views/novo-fechamento-view.tsx`, `lib/prestacao-types.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`, `lib/server/package-rechecks.test.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: reprocessar o PDF real e validar visualmente as 4 entregas.

### 2026-05-22 - Contexto real do fechamento no fluxo

Status: done
Job: remover labels mockados de resultado/fluxo e propagar o fechamento criado para upload, processamento, topbar e persistencia do pacote.
Outcome entregue: `NovoFechamentoView` agora retorna dados relacionais do fechamento criado para `app/page`; upload/processamento/topbar renderizam o contexto ativo; endpoint streaming recebe `fechamentoContext` no multipart; persistencia do pacote prioriza imobiliaria, empreendimento e competencia do fechamento ativo; notificacoes e avatar mockados foram substituidos por estados neutros.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passou.
Decisoes: prompts e testes podem manter referencia Alive / GM II porque representam o layout alvo e fixtures; labels demonstrativos de UI nao devem representar dados reais.
Arquivos/docs impactados: `app/page.tsx`, `app/api/fechamentos/route.ts`, `app/api/fechamentos/process/stream/route.ts`, `components/acr/topbar.tsx`, `components/acr/sidebar.tsx`, `components/acr/notifications-panel.tsx`, `components/acr/views/upload-view.tsx`, `components/acr/views/processando-view.tsx`, `lib/fechamento-context.ts`, `lib/server/package-workflow.ts`, `lib/server/persist-package.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: validar manualmente criar fechamento por cadastro real, enviar pacote completo e conferir se o mesmo contexto aparece em todas as etapas.

### 2026-05-22 - CRUD de cadastros imobiliarios

Status: done
Job: implementar cadastros de imobiliarias, empreendimentos e imoveis com importacao CSV e criacao real de fechamento rascunho.
Outcome entregue: migration de cadastros criada; APIs `/api/cadastros/*` adicionadas; importacao CSV de imoveis com validacao por linha e upsert por codigo da imobiliaria; tela `Imoveis` substituiu o placeholder com abas operacionais; `NovoFechamentoView` passou a carregar cadastros reais e criar fechamento `rascunho` antes do upload.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou; `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passou; `curl -I http://localhost:3000` retornou 200. `npx supabase db push` nao aplicou porque o CLI nao encontrou project ref linkado; `npx supabase status` tambem nao validou banco local porque o Docker daemon nao esta acessivel.
Decisoes: codigo oficial do imovel neste ciclo e `codigo_imobiliaria`; desativacao logica preserva historico; campos eGestor ficam preparatorios e opcionais.
Arquivos/docs impactados: `supabase/migrations/202605220001_cadastros_imobiliarios.sql`, `app/api/cadastros/*`, `app/api/fechamentos/route.ts`, `app/page.tsx`, `components/acr/views/novo-fechamento-view.tsx`, `components/acr/views/imoveis-view.tsx`, `lib/cadastros-types.ts`, `lib/server/cadastros.ts`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: linkar/aplicar Supabase e testar manualmente criar/editar/desativar cadastros, importar CSV e criar fechamento rascunho pela UI.

### 2026-05-22 - Retry para instabilidade OpenAI 522

Status: done
Job: tratar a falha `522 status code (no body)` observada durante processamento com GPT-5.5.
Outcome entregue: chamadas `responses.create` passaram a usar helper com retry para 408/409/429/5xx/522 e mensagem operacional amigavel quando a OpenAI interrompe a resposta sem corpo; extrações de classificacao, prestacao, repasse, despesas e reajuste usam o mesmo helper.
Validacao: teste direto com `gpt-5.5` respondeu `OK`; smoke test com PDF e `input_file` retornou JSON; endpoint `/api/fechamentos/process/stream` processou o PDF real de repasse ate `workflow_completed`; `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou.
Decisoes: manter `gpt-5.5`; erro 522 e tratado como instabilidade temporaria do provedor, nao como divergencia de negocio.
Arquivos/docs impactados: `lib/server/openai-responses.ts`, `lib/server/analyze-package-documents.ts`, `lib/server/analyze-prestacao.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: reprocessar o pacote completo pela UI; se houver nova falha, a tela deve exibir mensagem amigavel e o backend tentara novamente antes de interromper.

### 2026-05-22 - Modelo GPT-5.5 no pipeline OpenAI

Status: done
Job: trocar o modelo padrao dos agentes OpenAI para GPT-5.5.
Outcome entregue: defaults dos agentes de classificacao, prestacao, repasse, despesas e reajuste atualizados para `gpt-5.5`; `.env.local` local ajustado para `OPENAI_MODEL=gpt-5.5`.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou.
Decisoes: `gpt-5.5` passa a ser o modelo padrao do pipeline real; override por ambiente continua suportado via `OPENAI_MODEL`.
Arquivos/docs impactados: `lib/server/ai-agents/*`, `.env.local` local, `docs/12-execution-roadmap.md`.
Proxima acao: reprocessar os PDFs reais e comparar qualidade/custo/latencia da extracao com o baseline anterior.

### 2026-05-22 - Warnings compactos e operacionais na revisao

Status: done
Job: reduzir a verticalidade dos warnings e evitar alertas financeiros falsos quando o recalculo deterministico usa colunas incompletas.
Outcome entregue: revisao passou a exibir warnings reais em acordeao compacto; frontend filtra apenas divergencias financeiras/documentos obrigatorios; rechecks de comissao e repasse por linha agora exigem coluna completa antes de comparar contra consolidado; mensagens foram reescritas com valor correto, consolidado e diferenca; documentos opcionais e baixa confianca permanecem como diagnostico tecnico sem alterar o parecer operacional.
Validacao: `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `node --test lib/server/package-rechecks.test.ts` passou com 4 testes; `pnpm build` passou; `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passou. O comando `python .agent/scripts/checklist.py .` falhou porque `python` nao existe no PATH local; `python3` foi usado.
Decisoes: soma parcial de coluna nao e base suficiente para divergencia financeira. O alerta principal da revisao e operacional; diagnosticos tecnicos continuam no payload, mas nao contam como warning principal.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `lib/server/package-rechecks.ts`, `lib/server/package-rechecks.test.ts`, `tsconfig.json`, `docs/12-execution-roadmap.md`.
Proxima acao: abrir a UI com os PDFs reais e confirmar visualmente o acordeao fechado/aberto na tela de revisao.

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
