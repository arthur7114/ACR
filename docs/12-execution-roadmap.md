# 12 - Execution Roadmap

## Status geral

Status atual: Etapas 1, 2 e 3 concluídas. O pipeline real de pacote completo está funcional com otimização de custo (gpt-4o-mini e parser XLSX local), resolução manual de divergências com auditoria, regras comerciais por imobiliária + empreendimento, revisão com resumo financeiro agrupado por decisão operacional, acordos/rescisões recebidos no mês e bloqueio para possível pagamento repetido.

O repositório contém o harness `.agent`, o PRD completo em `docs/`, a trilha numerada de execução, o mock em `acr-fechamentos-app` como contrato e o fluxo real de análise da prestação Alive / GM II com Mastra, guardrails e rechecks deterministicos, agora com suporte a Mock Mode offline, Excel parser e conciliação de conflitos.

## Proxima acao recomendada

Aplicar a migration `202607070001_iptu_contas_pagar.sql` no Supabase (evolui `iptu_carnes`/`iptu_parcelas` para contas a pagar: colunas `origem`/`observacoes` no carne e `data_vencimento`/`valor_previsto`/`valor_pago`/`data_baixa`/`observacoes`/`criado_em`/`atualizado_em` na parcela, com backfill de `origem='importacao'` e `data_baixa=registrado_em` das parcelas legadas pagas, indices, e as funcoes RPC `iptu_gerar_lote`/`iptu_baixar_parcelas`). Depois validar no navegador em `/iptu`: gerar carnes em lote (com revisao e alerta de conflito por imovel+ano), editar parcela, ajustar numero de parcelas do carne, baixa individual e em massa, filtros combinados e cards de resumo. Confirmar que nenhuma acao toca eGestor/fechamento.

Aplicar a migration `202606250002_egestor_conta_mmc.sql` no Supabase (colunas `tag_padrao`, `somente_recebimento`, `disponivel_busca` em `egestor_contas`; configura a conta MMC: etiqueta "MMC", somente recebimento, busca do disponivel "06394" e zera o `cod_disponivel_padrao`). Garantir que o token da conta MMC esteja preenchido em Configuracoes (a resolucao do disponivel "Sicredi MMC - 06394 - 0" via API depende dele). Depois gerar a previa eGestor de um fechamento de Maracanau e validar: (1) sobe SOMENTE o recebimento (sem comissao/despesas); (2) etiquetas = ["MMC", empreendimento]; (3) descricao = "MMC <empreendimento> <competencia> - ..."; (4) conta de origem = Sicredi MMC (06394), nao mais "Planilha consolidada"; (5) valor do recebimento = total da receita (`total_receitas`). Se o token estiver ausente ou o disponivel nao casar, o lancamento fica `pendente_config` (sem chute).

Aplicar a migration `202606250001_normalizar_acentos_cadastros.sql` no Supabase (cria `acr_normalize_nome`, desativa duplicatas acento-insensiveis e recria os indices unicos de imobiliarias/empreendimentos). Resolve o empreendimento "Galpao Pompilio Gomes" duplicado no dropdown ("Galpão" vs "Galpao"). Depois validar a revisao da prestacao Cesar Rego "Galpao Pompilio Gomes / Maio 2026" (PDF-imagem, sem camada de texto -> cai na extracao por IA + correcoes deterministicas em `package-rechecks.ts/normalizePrestacao` e regras LAYOUT C reforcadas no `prestacao-alive-agent.ts`): (1) "Outras despesas" nao soma comissoes, TED nem desconto de inquilino; (2) reembolso/desconto do APT. A (113,27) aparece na coluna desconto; (3) IPTU de passagem (193,02 e 149,02) se anula no total; (4) APT. B (pagou referente a 03/2026) aparece como Inadimplente. Recomendacao duravel: rasterizar+OCR o PDF e rotear para o parser deterministico `cesar-rego-parser.ts`, ou obter PDF pesquisavel/planilha da Cesar Rego — elimina a fragilidade da leitura por visao.

Aplicar a migration `202606190001_processamento_background_e_notificacoes.sql` no Supabase e remover o pin `OPENAI_MODEL=gpt-4o` do `.env.local` (restaura `gpt-5.5` na prestacao; agentes leves voltam a `gpt-4o-mini`). Depois validar no navegador: a revisao (herói nao fica vermelho por bloqueio nao-relacionado, 3 grupos de pendencias, confirmacao do envio eGestor, erro de processamento visivel); o processamento em segundo plano (processar um pacote real, fechar a aba e confirmar que o job continua + chega notificacao + sino com badge), a reconexao no reload da tela de processamento, e a guarda de job travado; e a correcao persistente de um valor (tabela e parecer atualizam apos reload e `auditoria_correcoes` recebe a linha). Os scripts `audit-harness.ts`/`dump-pdf-text.ts`/`revalidate.ts`/`excel-test.ts` na raiz sao apoio de auditoria (nao versionar).

Aplicar a migration `202606130001_egestor_multi_conta.sql` (multiplas contas eGestor) no Supabase SQL Editor e, na tela de Configuracoes, colar o token da conta "MMC Participacoes", apontar os empreendimentos da MMC (Grand Messejana/Maracanau/Castelao) para essa conta e preencher o contato da Alive (=41) na conta MMC. Depois gerar a previa eGestor de um fechamento Alive e confirmar que os lancamentos saem `validado` (plano 52/23, contato 41, disponivel 2) em vez de `pendente_config`. Validar tambem que empreendimento sem conta definida (null) continua usando a conta Global.

Rodar a limpeza de cadastros duplicados/nulos em producao (merge de "Cesar Rego"/"Alive Imoveis"/"Galpao Pompilio Gomes" com re-apontamento de fechamentos e regras) e validar o novo CRUD: ocultar/reativar/excluir (cascata) de cadastros e arquivar/excluir de fechamentos, com confirmacao por digitacao do nome. Migration `202606120001_fechamento_arquivado.sql` precisa ser aplicada (coluna `arquivado`).

Validar no navegador a revisao do pacote Cesar Rego "Galpao Pompilio Gomes" (imoveis alugados deixam de aparecer como Vago, desconto abatido na coluna "Valor c/ desc." e nova coluna "Ref." com o mes do aluguel destacado quando de competencia anterior), reprocessar um pacote real para confirmar que a persistencia nao cria imobiliarias duplicadas e habilitar a permissao "Disco Virtual" no eGestor para concluir o retry de anexos pendentes.

## Progresso por etapa

| Etapa | Status | Observacao |
|---|---|---|
| 0 - Governanca e contrato | concluida | Docs, harness e contrato do mock estruturados. |
| 1 - App vivo sem IA | concluida | Schema inicial, Storage, CRUD de cadastros, importação CSV de imóveis e UI conectada aos dados reais. |
| 2 - Extracao basica | concluida | Pacote completo com classificação, extração por tipo, stream NDJSON, rechecks determinísticos e revisão persistida, com Mock Mode para desenvolvimento local offline. |
| 3 - Extracao completa | concluida | Parser local XLSX, migração de agentes para gpt-4o-mini e interface de resolução de conflitos com auditoria (CA10, CA12). |
| 4 - eGestor e layouts futuros | em andamento | Integracao eGestor validada em producao: primeiro envio real executado (recebimento 8751 + pagamento 8750, GM I 04/2026) com revalidacao ok. Anexos pendentes por permissao Disco Virtual na conta eGestor. |

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
- Unidade com "airbnb" no inquilino ou na observacao recebe badge/contagem "Airbnb" e nao conta como vaga nem inadimplente; vagas de garagem sem numero explicito sao contadas por veiculo citado (carro e/ou moto); inadimplencia acumulada (secao INADIMPLENCIAS) e insight separado e nao compoe receita do mes; taxa de intermediacao exibida na revisao vem do documento, nunca do cadastro.
- `garagem` permanece sendo o valor monetario em reais; `vagas_garagem` (inteiro >= 0) e a quantidade de vagas, extraida do texto da observacao pelo agente Alive. Nao inferir vagas a partir do valor monetario.
- Documento avulso (sem fechamento ativo previo) abre modal de alocacao no UploadView antes de iniciar o processamento; o pipeline servidor continua sincrono, sem evento `awaiting_user_action`.
- App passa a usar URLs reais: cada view tem um path proprio em `app/(app)/*`, com Sidebar/Topbar derivados de `usePathname`. Estado compartilhado vive em `lib/contexts/cadastros-context.tsx` e `lib/contexts/processing-context.tsx`. PackageAnalysis completa fica persistida em `fechamentos.analise_completa` (JSONB) para sobreviver a refresh em `/fechamentos/{id}/revisao`.
- Modo Simulado (Mock Mode) via `NEXT_PUBLIC_MOCK_IA=true` adicionado no backend para contornar problemas de cota/limites da OpenAI no desenvolvimento local offline, retornando dados estruturados de GM II a partir de fixture JSON.
- A persistência de pacotes limpa `movimentacoes` e `validacoes` anteriores associadas ao fechamento antes de persistir nova rodada para evitar duplicações na UI.
- Migração de agentes menores (classifier, repasse, despesas, reajuste) para gpt-4o-mini para economia de custos da OpenAI de até 95%.
- Uso de parser local com biblioteca `xlsx` para planilhas `.xlsx` de locação, eliminando chamadas de IA para estes tipos de arquivos.
- Resolução de conflitos financeiros via modal no frontend, registrando o histórico na tabela `auditoria_correcoes` e atualizando o status do fechamento para `processado_com_sucesso` quando não houverem bloqueios pendentes.
- Regras comerciais passam a ser cadastradas por par imobiliaria + empreendimento, com taxa de administracao e taxa de intermediacao.
- Comissao administrativa e validada pela taxa do par sobre o total pago pelo inquilino: aluguel com desconto quando existir, senao aluguel, somado a garagem, agua, IPTU e seguro incendio.
- Taxa de intermediacao fica cadastrada e visivel na revisao, mas nao entra no total a repassar ate existir documento/campo operacional especifico.
- Tela de revisao deve priorizar o contexto do fechamento salvo no banco para imobiliaria, empreendimento e competencia; dados extraidos do documento nao podem sobrescrever o contexto operacional.
- Dashboard da revisao deve agrupar indicadores por decisao financeira, evitando cards soltos para totais relacionados, separando receitas, comissao administrativa, despesas e outras comissoes/despesas.
- Situacao das unidades na revisao deve separar explicitamente apartamentos alugados, inadimplentes e aptos vagos; inadimplencia nao deve ser misturada com vacancia.
- Resumo financeiro deve exibir data do repasse quando houver comprovante extraido.
- Modal de resolucao de pendencia deve usar linguagem operacional, fundo claro, comparacao objetiva dos valores e justificativa de auditoria.
- Resolucao de pendencia nao pode chamar a API sem `databaseId`; a auditoria deve gravar o valor oficial escolhido pelo operador.
- Leitura do documento e documentos processados ficam colapsados no fim da revisao para priorizar o resumo operacional.
- Possivel acordo/rescisao repetido, por tipo + inquilino + competencia + valor, e bloqueante ate resolucao ou justificativa.
- Tela de revisao deve ser retrocompativel com analises persistidas antes de campos novos; arrays opcionais do payload devem ser normalizados para lista vazia na renderizacao.
- Percentual de confianca do parecer automatico e campo tecnico interno, nao indicador operacional; a revisao deve exibir contagem objetiva de bloqueios, alertas e validacoes ok. Percentuais de extracao ficam rotulados como qualidade da leitura.
- Prestacao em PDF no layout C (Extrato de Conta - Consolidado por Lancamentos, Cesar Rego) e extraida pelo parser deterministico `cesar-rego-parser.ts` (texto via pdfjs-dist), nunca pelo agente de visao; o agente de IA fica como fallback apenas se a deteccao/parse local falhar.
- Percentual de comissao realizada e `total_comissoes / total_receitas * 100`; a base de comissao cadastrada continua existindo apenas para validar a taxa comercial esperada.
- Previa eGestor deve lancar o recebimento bruto (`total_receitas`) e lancar comissoes/despesas separadamente como pagamentos, evitando descontar despesas duas vezes.
- Listas e seletores de cadastros ocultam registros `ativo=false` por padrao; fechamentos historicos continuam exibindo nomes via relacionamento salvo.
- No layout C (Cesar Rego) o nome do inquilino nao existe na camada de texto: o parser usa o endereco do imovel como identificacao da unidade na coluna Inquilino (e remove o endereco da observacao), evitando que imoveis alugados (com creditos de ALUGUEL) sejam marcados como Vago; imovel sem lancamentos no mes continua com inquilino vazio. Descontos (debitos `DESCONTO`/`DESC.`, ex.: "DESC. LOCATARIO") viram as colunas `desconto`/`aluguel_com_desconto`, sem confundir com o credito de "ENCARGOS FINANCEIROS POR ATRASO". O mes/ano do lancamento de ALUGUEL alimenta `vencimento`, e a tabela de receitas ganha a coluna `Ref.` destacando quando o aluguel e de competencia anterior (ex.: apto pago com atraso).

- Integracao eGestor suporta multiplas contas com roteamento por empreendimento: `empreendimentos.egestor_conta_id` (null = conta Global) decide o token, a conta disponivel, o plano de contas e o contato usados no lancamento. Plano de contas, conta disponivel e contato sao especificos por conta (ex.: codigo 44 e repasse na conta Global, mas "PESSOAS E ENCARGOS" na MMC) - cruzar contas lancaria na conta de plano errada. O singleton `egestor_configuracoes` migra para a conta "Global" (id fixo `...0001`); contato da imobiliaria passa a viver em `egestor_imobiliaria_contatos (imobiliaria_id, conta_id)`, mantendo `imobiliarias.egestor_contato_id` como legado/fallback apenas para a conta Global. Token nunca trafega no GET (so mascarado) nem em migration (so pela UI).

- O modelo padrao da extracao da prestacao e `gpt-5.5` (default do agente); ele corrige a variancia do `gpt-4o` em tabela densa (GCI saiu de 1/22 para 24 linhas, repasse conciliado). `OPENAI_MODEL` e override local: o pin `gpt-4o` no `.env.local` deve ser removido para restaurar o default; agentes leves (classificador, repasse, despesas, reajuste) permanecem em `gpt-4o-mini`.

- O processamento de pacote roda DESTACADO do request (fire-and-forget no servidor Node/EasyPanel, sem `await` antes de responder 202), com snapshot de progresso em `fechamentos.processamento_*` e acompanhamento por polling no endpoint leve `GET /api/fechamentos/[id]/processamento`. O GET principal do fechamento nao depende dessas colunas (busca resiliente), para nao quebrar a revisao se a migration ainda nao foi aplicada. Job sem atualizacao por 15 min e considerado travado. Fechar a aba nao mata o job; a tela reconecta no reload.

- Notificacoes in-app vivem na tabela `notificacoes` e aparecem no sino do topo (badge de nao-lidas) com toast (sonner) e notificacao do SO (Notifications API, permissao pedida no clique do sino); um poller global de 12s detecta conclusao/falha de analise mesmo fora da tela de processamento. A conclusao/falha do workflow cria a notificacao no servidor.

## Historico de ciclos

### 2026-07-07 - IPTU: modulo de contas a pagar manual por imovel

Status: done
Job: transformar `/iptu` de um fluxo passivo de importacao de certidao/PDF em um controle operacional manual de contas a pagar (geracao de carnes em lote, vencimentos, valores, baixa individual e em massa, status calculado e filtros densos), sem tocar eGestor/fechamento.
Outcome entregue: migration `202607070001_iptu_contas_pagar.sql` evolui `iptu_carnes` (`origem`, `observacoes`) e `iptu_parcelas` (`data_vencimento`, `valor_previsto`, `valor_pago`, `data_baixa`, `observacoes`, `criado_em`, `atualizado_em` + trigger), com backfill de compatibilidade (`origem='importacao'`, `data_baixa=registrado_em` das parcelas legadas pagas), indices novos e as RPCs transacionais `iptu_gerar_lote`/`iptu_baixar_parcelas`. Logica pura em `lib/iptu-logic.ts` (`calcularStatusParcela`, `hojeLocalISO`, `gerarParcelasImovel`, `detectarConflitos`, `validarBaixa`, `validarEdicaoParcela`, `planejarAjusteParcelas`) com testes; helper `formatDateOnly` timezone-safe em `lib/format.ts`. Tipos consolidados em `lib/iptu-types.ts` (schemas Zod das rotas). Camada `lib/server/iptu.ts` (listar com filtros+paginacao+resumo, gerar lote, editar, baixar, ajustar parcelas). APIs: `GET /api/iptu` (filtros/paginacao/resumo), `POST /api/iptu/gerar`, `PATCH /api/iptu/parcelas/[id]`, `POST /api/iptu/parcelas/baixa`, `PATCH /api/iptu/carnes/[id]`. Front: `lib/contexts/iptu-context.tsx` reescrito, `components/acr/views/iptu-view.tsx` reescrito (tabela densa, cards de resumo, filtros, selecao e acoes em massa) + modais em `components/acr/iptu/` (gerar com revisao, baixa, editar parcela). Importacao por PDF/certidao mantida como legado (backend intacto, sem acesso na UI).
Validacao: `pnpm exec tsc --noEmit` e `pnpm lint` passaram; `node --test --experimental-strip-types lib/iptu-logic.test.ts lib/iptu-types.test.ts` = 44 testes ok. Validacao visual em `/iptu` e aplicacao da migration pendentes (ver Proxima acao).
Decisoes: status calculado (nunca salvo) a partir de `data_baixa`/`data_vencimento` com comparacao de strings AAAA-MM-DD (timezone-safe); geracao em lote transacional via RPC com revisao previa e alerta de conflito por imovel+ano (confirmacao explicita gera apenas os nao-conflitantes); `responsavel` (inquilino/proprietario) mantido como coluna extra editavel; import por PDF fora do MVP (legado, sem UI); zero acoplamento com eGestor/fechamento.
Arquivos/docs impactados: `supabase/migrations/202607070001_iptu_contas_pagar.sql`, `lib/iptu-logic.ts`, `lib/iptu-types.ts`, `lib/format.ts`, `lib/server/iptu.ts`, `app/api/iptu/route.ts`, `app/api/iptu/gerar/route.ts`, `app/api/iptu/parcelas/[id]/route.ts`, `app/api/iptu/parcelas/baixa/route.ts`, `app/api/iptu/carnes/[id]/route.ts`, `lib/contexts/iptu-context.tsx`, `app/(app)/iptu/page.tsx`, `components/acr/views/iptu-view.tsx`, `components/acr/iptu/*`, `lib/iptu-logic.test.ts`, `lib/iptu-types.test.ts`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: aplicar a migration e fazer a validacao visual completa no navegador.

### 2026-07-07 - Import do cadastro de imoveis das planilhas CAIXA + indicadores sem fechamento

Status: done
Job: alimentar os indicadores com o historico das planilhas "CAIXA ADMINISTRACAO LOCACAO" (Grand Castelao I, Grand Messejana I, Grand Messejana II, LOCMAIS).
Outcome entregue: por decisao do usuario, o banco foi resetado (todos os fechamentos apagados) e o cadastro de `imoveis` dos 4 empreendimentos foi repopulado a partir do ultimo mes (MAR/2026) de cada planilha, preservando os 30 imoveis do GRAND MARACANAU (sem planilha). Parser header-driven (colunas variam por arquivo: LOCMAIS usa IMOVEL/MODALIDADE, GM I sem coluna AGUA); status derivado (DESOCUPADO->vago, INADIMPLENCIA->inadimplente, sem inquilino+aluguel 0->vago, resto->ocupado); `valor_aluguel_esperado` = ultimo aluguel cheio dos ultimos 6 meses (ignora meses proporcionais/rescisao). 83 imoveis inseridos (total 113). Como a tela de Indicadores exigia ao menos um fechamento e caia inteira no estado vazio, o gate foi ajustado para renderizar os KPIs vindos do cadastro (ocupacao, vacancia, faturamento potencial) quando ha imoveis, mesmo sem fechamento; o card "Faturamento potencial" passou a usar o potencial contratado quando nao ha fechamento (senao mostrava so a vacancia); placeholder "Sem fechamentos" no filtro de competencia; key unica no dropdown de imoveis (unidades repetem entre predios).
Validacao: verificado no navegador via preview — Visao geral mostra ocupacao 93,8% (106/113) e situacao dos imoveis (7 vagos, vacancia R$ 2,8k); aba Receita mostra Faturamento potencial R$ 67,3k com cascata coerente; abas Mapa e Registro renderizam estado vazio sem quebrar; ciclo pelas abas gerou 0 erros de console (dup-key resolvido). `pnpm lint` passou.
Decisoes: escopo do historico = so cadastro de imoveis (sem importar fechamentos mensais); reset preserva empreendimentos/contas/regras e os imoveis do MARACANAU; import feito por script one-off em scratchpad via PostgREST (nao versionado, depende de arquivos em ~/Downloads).
Arquivos/docs impactados: `components/acr/views/indicadores-view.tsx`, `lib/server/indicadores.ts`, `docs/12-execution-roadmap.md`; dados: tabelas `fechamentos` (limpa) e `imoveis` (repopulada) no projeto `qeblersdkfzsogqptbdh`.
Proxima acao: se desejado, importar o historico mensal como fechamentos para acender serie mensal, mapa de calor e registro; e estimar aluguel esperado das 3 unidades zeradas (GM I apto 10, GM II apto 3, LOCMAIS SALA 05) em meses mais antigos.

### 2026-07-07 - Hotfix erro 500 por chave publica Supabase

Status: done
Job: diagnosticar o `500 Internal Server Error` na abertura do app com a configuracao Supabase atual.
Outcome entregue: reproduzido localmente que o middleware quebrava antes do login por ausencia de `NEXT_PUBLIC_SUPABASE_ANON_KEY`, enquanto o ambiente tinha apenas `SUPABASE_PUBLISHABLE_KEY`. Adicionado helper `requireSupabasePublicKey()` para aceitar `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou o fallback server-side `SUPABASE_PUBLISHABLE_KEY`; clientes Supabase de browser/server e middleware passam a usar o helper. `next.config.mjs` mapeia a publishable key antiga para a variavel publica usada no bundle, e `.env.example` documenta a nova opcao. O escopo de validacao foi ajustado para ignorar artefatos `.claude`/`.next` em lint/API validator.
Validacao: `GET /login` deixou de retornar 500 e respondeu 200; `/` redirecionou para `/login` com 307. `pnpm exec tsc --noEmit`, `pnpm lint`, `python3 .agent/skills/api-patterns/scripts/api_validator.py .` e `pnpm build` passaram. `.agent/scripts/checklist.py .` passou em Security, Lint, Schema e Tests; permaneceu falhando em UX/SEO por pendencias preexistentes fora deste hotfix (`#7C3AED` em telas de revisao/historico, labels em indicadores e metadados SEO em `iptu-view.tsx`).
Decisoes: manter compatibilidade com a nomenclatura antiga `NEXT_PUBLIC_SUPABASE_ANON_KEY` e aceitar a nova publishable key do Supabase sem expor `SUPABASE_SERVICE_ROLE_KEY` no cliente.
Arquivos/docs impactados: `lib/server/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`, `next.config.mjs`, `.env.example`, `eslint.config.mjs`, `.agent/skills/api-patterns/scripts/api_validator.py`, `docs/12-execution-roadmap.md`.
Proxima acao: rotacionar as chaves coladas em conversa e revisar as pendencias UX/SEO do checklist em um ciclo separado.

### 2026-07-03 - Polimento pre-reuniao: login real, Usuarios, previa eGestor editavel, Logs e cards padronizados

Status: done
Job: plano de 18 tasks ("Polimento Pre-Reuniao") para deixar a plataforma apresentavel numa reuniao com o cliente — login real em vez de acesso aberto, tela de gestao de usuarios, edicao completa da previa eGestor, visibilidade de auditoria/notificacoes numa tela dedicada, e consistencia visual (cards com sombra/hover padronizados) em Configuracoes, Indicadores e Imoveis.
Outcome entregue: (Fase 0) classes `.acr-card`/`.acr-card-hover` em `app/globals.css` e componentes `EmptyState`/`ErrorState` em `components/acr/ui/`, usados como base visual do restante do plano. (Fase 1 - login real) dependencia `@supabase/ssr` e env `NEXT_PUBLIC_SUPABASE_ANON_KEY`; clientes `lib/supabase/client.ts` e `lib/supabase/server.ts`; `middleware.ts` na raiz protegendo rotas (redireciona para `/login` se nao autenticado, com fallback de try/catch para nao retornar 500 se `getUser()` falhar); `app/login/page.tsx`; sidebar exibe e-mail do usuario logado e botao de logout (`UserFooter`); avatar placeholder redundante removido da topbar. (Fase 2 - Configuracoes) `lib/server/admin-usuarios.ts` (validacao pura + geracao de senha temporaria, TDD) e `app/api/admin/usuarios/route.ts` (GET lista / POST cria via Supabase Admin API) alimentam nova aba "Usuarios" em `configuracoes-view.tsx` (lista usuarios, cria com senha temporaria de uso unico exibida na UI); cards da conta eGestor existentes migrados para `.acr-card`; `lib/server/egestor.ts` ganhou `buildLancamentoUpdate` (pura) + `updateEgestorLancamentoCampo` substituindo `updateEgestorLancamentoDescricao` (so descricao) — a rota PATCH e a tabela "Previa eGestor" em `revisao-view.tsx` agora editam Valor e Etiquetas inline, alem de Descricao, com o mesmo bloqueio de quando `egestor_codigo` ja foi definido (ja enviado ao eGestor). (Fase 3 - Logs) `lib/server/logs.ts` (`mesclarLogs`, pura, TDD) mesclando `auditoria_correcoes` + `notificacoes`; `app/api/logs/route.ts`; tela `components/acr/views/logs-view.tsx` + rota `app/(app)/logs/page.tsx`; item "Logs" novo na sidebar e breadcrumb na topbar. (Fase 4 - Indicadores) `chart-card.tsx` e `kpi-card.tsx` (primitivos compartilhados) migrados para `.acr-card`/`.acr-card-hover`, propagando para as 4 sub-abas de Indicadores. (Fase 5 - Imoveis) `imoveis-view.tsx` (4 wrappers) e `imovel-historico-drawer.tsx` (3 cards de resumo) migrados para `.acr-card`.
Validacao: as 18 tasks foram implementadas por subagentes isolados e revisadas individualmente (spec compliance + qualidade de codigo) — todas aprovadas ("Approved"), incluindo um pequeno commit suplementar na Task 16 apos retry de orquestracao. Gate final deste ciclo: `pnpm dlx tsx --test lib/server/*.test.ts lib/*.test.ts` — 34/34 testes passam (inclui os novos `admin-usuarios.test.ts`, `logs.test.ts` e os 4 casos novos em `egestor.test.ts`); `pnpm lint` limpo; `pnpm exec tsc --noEmit` limpo; `pnpm build` gerou todas as rotas com sucesso, incluindo `/login`, `/logs` e o Proxy (Middleware). Nenhuma migration Supabase foi necessaria (sem mudanca de schema). Verificacao manual no navegador do fluxo de autenticacao (login/logout, persistencia de sessao) ficou pendente durante todo o ciclo porque este ambiente nao tem projeto Supabase real conectado (sem `.env.local`) — o usuario precisa validar manualmente com credenciais reais antes da reuniao.
Decisoes: middleware trata falha de `getUser()` como nao autenticado (redireciona) em vez de deixar a rota quebrar com 500; edicao inline na previa eGestor continua bloqueada apos o lancamento ja ter `egestor_codigo` (enviado), agora tambem para Valor e Etiquetas, nao so Descricao; tela de Logs e somente leitura (mescla de auditoria + notificacoes), sem acao de escrita.
Arquivos/docs impactados: `app/globals.css`, `components/acr/ui/empty-state.tsx`, `components/acr/ui/error-state.tsx`, `.env.example`, `package.json`, `pnpm-lock.yaml`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`, `app/login/page.tsx`, `components/acr/sidebar.tsx`, `components/acr/topbar.tsx`, `lib/server/admin-usuarios.ts`, `lib/server/admin-usuarios.test.ts`, `app/api/admin/usuarios/route.ts`, `components/acr/views/configuracoes-view.tsx`, `lib/server/egestor.ts`, `lib/server/egestor.test.ts`, `app/api/fechamentos/[id]/egestor/lancamentos/[lancamentoId]/route.ts`, `components/acr/views/revisao-view.tsx`, `lib/server/logs.ts`, `lib/server/logs.test.ts`, `app/api/logs/route.ts`, `components/acr/views/logs-view.tsx`, `app/(app)/logs/page.tsx`, `components/acr/indicadores/primitives/chart-card.tsx`, `components/acr/indicadores/primitives/kpi-card.tsx`, `components/acr/views/imoveis-view.tsx`, `components/acr/views/imovel-historico-drawer.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: criar `.env.local` com um projeto Supabase real (URL, anon key, service role key), criar o primeiro usuario admin via SQL ou pela nova aba Usuarios, e validar manualmente no navegador: login/logout, persistencia de sessao, redirecionamento do middleware para `/login` quando deslogado, criacao de usuario com senha temporaria, edicao de Valor/Etiquetas na previa eGestor, tela de Logs mesclando corretamente auditoria e notificacoes, e o visual (`.acr-card`) em Configuracoes/Indicadores/Imoveis.

### 2026-07-02 - Despesa do locador: receita bruta + itemizacao (ADR-0001)

Status: done
Job: pos-grilling com o cliente sobre o Galpao Pompilio Gomes (Cesar Rego, maio/2026) — "eram pra ser 3 despesas, o reembolso, o desconto e o ted", listadas no resumo, com a conta fechando.
Outcome entregue: modulo dedicado `lib/despesas-locador.ts` concentrando a regra de "despesa do locador" (antes espalhada entre prompt, regex de `package-rechecks.ts` e agrupamento da view): `classificarLancamento` (comissao/intermediacao/despesa) e `reconciliarResumoDespesas` (reconstroi receita bruta somando de volta os reembolsos por linha, itemiza reembolso/desconto/taxas bancarias como despesas do locador com rotulo por apto, e fecha o consolidado retido para a equacao receita-comissao-despesas=repasse continuar batendo; residuo negativo suprime a lista e reporta pendencia em vez de inventar item). `normalizePrestacao` (`package-rechecks.ts`) passa a chamar o modulo; helpers antigos `isNaoDespesaLocador`/`isCreditoQueReduzDespesa` removidos. `revisao-view.tsx` usa `classificarLancamento` no lugar do regex inline de intermediacao. Escopo global (todas as imobiliarias/layouts), nao so Cesar Rego. Documentado em `CONTEXT.md` (glossario) e `docs/adr/0001-receita-bruta-despesas-locador.md`.
Validacao: TDD completo (`pnpm dlx tsx --test`) — 6 testes novos em `lib/despesas-locador.test.ts` (classificacao + reconciliacao, incluindo residuo negativo e ausencia de reembolso) e 1 teste novo em `lib/server/package-rechecks.test.ts` com o shape real do Pompilio (receita 14.128,65; despesas 124,63; repasse 13.409,90 inalterado; 3 itens na lista). Suite completa de `lib/server` + `lib/`: 24/24 passam. `pnpm lint` limpo. Verificacao contra a extracao real (IA vision) do PDF do Pompilio e do LOCMAIS, e reprocesso na UI, ficam pendentes de uma `OPENAI_API_KEY` valida (a atual retorna 401) — gate a ser executado pelo usuario.
Decisoes: Modelo A do grilling (receita bruta 14.128,65, diverge do "Recebidos" impresso no doc de 14.015,38, mas a lista de despesas fica completa); comissao calculada continua sobre a receita liquida (nao muda a base); header mostra so o bruto, sem nota do valor impresso; eGestor herda o bruto automaticamente via `total_receitas` (sem mudanca de codigo no eGestor).
Arquivos/docs impactados: `lib/despesas-locador.ts`, `lib/despesas-locador.test.ts`, `lib/server/package-rechecks.ts`, `lib/server/package-rechecks.test.ts`, `components/acr/views/revisao-view.tsx`, `CONTEXT.md`, `docs/adr/0001-receita-bruta-despesas-locador.md`, `docs/superpowers/plans/2026-07-02-despesa-locador-receita-bruta.md`, `docs/12-execution-roadmap.md`.
Proxima acao: renovar `OPENAI_API_KEY`, rodar a extracao real do Pompilio e do LOCMAIS conferindo os numeros do oraculo, depois reprocessar (re-upload) o fechamento do Pompilio maio/2026 na UI (isso desarquiva o fechamento 029d645d, comportamento esperado) e conferir "Recebidos locador" = 14.128,65 com os 3 itens na secao de despesas.

### 2026-06-24 - Historico por imovel (linha do tempo) + ajustes pos-reuniao

Status: done
Job: pos-reuniao com o cliente — corrigir comissao+despesas/8-itens, espelhar colunas de acordos do PDF, impedir intermediacao fantasma, e iniciar o "gerenciador de imoveis" com historico por imovel.
Outcome entregue: (1) revisao — comissao de administracao passa a somar a comissao retida em acordos/atrasos (display), tabela de acordos/rescisoes ganhou colunas Comissao e Repasse + linha de Total (espelha o PDF). (2) Extracao — guarda deterministica `dropHallucinatedIntermediacoes` em `package-rechecks` descarta itens tipo=intermediacao sem apto/inquilino cujo valor coincide com uma despesa (CAGECE/ENEL); prompt reforcado. GM II reprocessado e batendo com a planilha. (3) Historico por imovel (Nivel 1, derivado de `analise_completa`): `lib/server/imovel-historico.ts` + `GET /api/imoveis/historico`, drawer `ImovelHistoricoDrawer` com linha do tempo de eventos (pago/inadimplente/vago/acordo/rescisao/atraso/intermediacao), resumo e periodos por inquilino; aba Imoveis com unidade clicavel. (4) `lib/server/sync-imoveis.ts` + `POST /api/cadastros/imoveis/sync` + botao "Sincronizar dos fechamentos" que popula/atualiza o cadastro de imoveis (unidade, inquilino, status, aluguel) a partir das prestacoes.
Validacao: `tsc --noEmit`, `pnpm lint` e `pnpm build` passaram; `GET /api/imoveis/historico` retornou a trajetoria real da unidade 8 do GM II (proporcional + rescisao 935,98 com comissao 65,52). Sem migration (apenas leitura/escrita das tabelas existentes). Layout escolhido com o cliente via brainstorm (Versao A — linha do tempo).
Decisoes: Nivel 1 (derivado) primeiro, sem tabela de eventos persistida (Nivel 2 fica para depois); sync nao sobrescreve taxa/observacoes editadas manualmente; populacao em massa do cadastro depende de acao do usuario na tela.
Arquivos/docs impactados: `lib/imovel-historico-types.ts`, `lib/server/imovel-historico.ts`, `lib/server/sync-imoveis.ts`, `app/api/imoveis/historico/route.ts`, `app/api/cadastros/imoveis/sync/route.ts`, `components/acr/views/imovel-historico-drawer.tsx`, `components/acr/views/imoveis-view.tsx`, `app/(app)/imoveis/page.tsx`, `components/acr/views/revisao-view.tsx`, `lib/server/package-rechecks.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: clicar "Sincronizar dos fechamentos" para popular o cadastro; depois, Nivel 2 (tabela de eventos persistida + baixa de parcelas de acordo), relatorio de locacao na analise e valores editaveis.

### 2026-06-24 - Nivel 2: acordos parcelados + baixa de parcelas

Status: done
Job: persistir acordos/rescisoes parcelados e permitir dar baixa nas parcelas (ata: "dar baixa nas parcelas acordadas").
Outcome entregue: migration `202606240001_acordos_parcelas.sql` (tabelas `acordos` + `acordo_parcelas`) aplicada em producao. `lib/server/acordos.ts`: `syncAcordosFromFechamentos` detecta acordos parcelados em `acordos_rescisoes_recebidos` E `inadimplencias_acumuladas` (padrao "PARCELA x/y"), persiste e da baixa automatica nas parcelas recebidas (idempotente; nao desfaz baixa manual). `GET /api/acordos`, `POST /api/acordos/sync`, `PATCH /api/acordos/parcelas` (baixa/estorno manual). Drawer ganhou a secao "Acordos parcelados" com barra de progresso e baixa por parcela; aparece mesmo quando a unidade so tem dados em inadimplencias (timeline vazia). Botao "Sincronizar dos fechamentos" passou a sincronizar imoveis + acordos.
Validacao: migration aplicada via pooler; sync do GM II = 1 acordo, 2 parcelas baixadas; `GET /api/acordos` da unidade 17 (FRANCIVALDO) retornou 7 parcelas, 2 pagas (2/7 e 3/7 em mai/26), valorPago 600 / valorTotal 2100 (estimado); baixa manual da parcela 1 e estorno conferidos; re-sync idempotente (0 baixas novas). `tsc`/`lint`/`build` limpos. Degradacao graciosa antes da migration confirmada.
Decisoes: parcela detectada tanto na secao de acordos quanto na de inadimplencias; valor_total estimado por valor_parcela*total quando o documento nao traz a quebra; baixa manual marca origem='manual' e nao e revertida pelo sync.
Arquivos/docs impactados: `supabase/migrations/202606240001_acordos_parcelas.sql`, `lib/acordos-types.ts`, `lib/server/acordos.ts`, `app/api/acordos/route.ts`, `app/api/acordos/sync/route.ts`, `app/api/acordos/parcelas/route.ts`, `components/acr/views/imovel-historico-drawer.tsx`, `app/(app)/imoveis/page.tsx`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: relatorio de locacao na analise; valores editaveis; alinhar a formula da taxa realizada (6,64%) com o Marcio.

### 2026-06-19 - Tela de Indicadores (KPIs da carteira)

Status: done
Job: transformar o prototipo `dashboard-acr-final.html` numa tela real `/indicadores`, aplicando os 15 ajustes pedidos e usando apenas dados ja existentes no sistema.
Outcome entregue: rota `/indicadores` no route-group `(app)` com `IndicadoresView` (4 sub-abas: Visao geral, Receita & repasse, Mapa de calor, Registro de pagamentos). Camada de agregacao `lib/server/indicadores.ts` + `GET /api/indicadores` que le `fechamentos` (colunas planas + `analise_completa`/PackageTotals), `imoveis` (ocupacao/vacancia/potencial) e `regras_comerciais` (taxas). Ajustes aplicados: KPIs reordenados (ocupacao, receita, despesa, repasse, taxa total) sem inadimplencia; despesa operacional = agua+IPTU+seguro e despesa de venda = intermediacao; totalizadores de despesa por categoria; % de despesa operacional; cascata potencial x realizado reconstruida (recebido + vacancia + descontos) com ofensores explicitos; inadimplencia acumulada como insight separado; grafico com ano (Mai/26); toggle valor x percentual; filtro por empreendimento e por imovel; mapa de calor com escala verde->amarelo->vermelho e linha de media seguindo a escala; novo Registro de pagamentos por apto/inquilino. Itens sem dado (reajustes, historico mensal, cadastro de imoveis vazio) aparecem como "aguardando dados". Sidebar e breadcrumb ganharam o item Indicadores. Helpers `formatBRLk`/`formatPercent`/`formatCompetenciaShort` em `lib/format.ts`.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build` passaram. `next start` + `GET /api/indicadores` retornou dados reais de Maio/2026 (receita R$ 68.049,84, despesa operacional R$ 4.636,68, repasse R$ 55.287,97, taxa R$ 4.557,30, cascata reconciliada em 100%); filtros de competencia e empreendimento conferidos; `/indicadores` carregou (HTTP 200). Sem migration (apenas leitura das tabelas existentes).
Decisoes: aba Insights IA ficou de fora desta entrega; dados ausentes seguem o padrao "aguardando dados"; nenhuma alteracao de schema/extracao.
Arquivos/docs impactados: `app/(app)/indicadores/page.tsx`, `app/api/indicadores/route.ts`, `lib/server/indicadores.ts`, `lib/indicadores-types.ts`, `components/acr/views/indicadores-view.tsx`, `lib/format.ts`, `components/acr/sidebar.tsx`, `components/acr/topbar.tsx`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: cadastrar imoveis (com `valor_aluguel_esperado`) para destravar ocupacao/vacancia/faturamento potencial; opcionalmente construir a aba Insights IA e expandir extracao de reajustes para remover os "aguardando dados".

### 2026-06-19 - Auditoria das analises + UX da revisao, destravar fluxo, correcao persistente, processamento em 2o plano e notificacoes

Status: done (codigo); pendente aplicar migration e trocar o modelo em producao.
Job: auditar ponta-a-ponta as analises das 7 imobiliarias (03/2026) sob a otica de um gestor que confere repasses; deixar o produto apresentavel; e, apos constatar que o gpt-5.5 (modelo padrao do pipeline) torna a extracao densa lenta, permitir processamento em segundo plano com tempo medio na UI e notificacoes reais.
Outcome entregue:
- Auditoria (harness headless sem persistir, `audit-harness.ts`): na vida real os 7 repasses estao corretos (comprovante = total a repassar do documento). O gpt-4o tem variancia alta em tabela densa (GCI extraia 1/22 linhas); o gpt-5.5 corrige (GCI 24 linhas, repasse 13.088,36 = comprovante, `aprovado_tecnico`). CESAR (parser deterministico, layout C) independe do modelo.
- Fase 1 (UX da revisao): o herói "Total a repassar" deriva o tom da conciliacao do repasse (`getRepasseConciliacao`), nao mais de `hasBlocking` — o valor correto deixa de ficar vermelho por bloqueio nao-relacionado; banner em 3 niveis; pendencias em Bloqueios/Alertas/Resolvidos (accordion); parecer enxuto; confirmacao antes de enviar ao eGestor; erro de processamento exibido; microcopy/acentos.
- Fase 2 (destravar): inadimplencia nunca vira receita (`sanitizeInadimplenciaRows` + reforco de prompt); mismatch do consolidado vira alerta quando o repasse ja concilia (B3); repasse embutido no extrato concilia sem comprovante separado (`repasse_embutido` em CESAR/PLURAL, B4); chave de acordo inclui apto + competencia_original (B7). A rede de seguranca de dinheiro real (conciliacao + formula sem comprovante) segue bloqueante.
- Fase 3 (correcao persistente): o modal real edita o aluguel da linha, re-roda `validatePackage` sem IA, re-persiste totais/validacoes (preservando resolvidas) e grava em `auditoria_correcoes`. O total a repassar permanece ancorado no comprovante/resumo do documento (nao e re-somado pela linha).
- Processamento em segundo plano: `POST /api/fechamentos/process` le os bytes, marca `processando` e dispara o workflow DESTACADO do request (Node persistente/EasyPanel); grava snapshot de progresso no fechamento e, ao concluir/falhar, fecha o status e cria a notificacao. A tela acompanha por polling em `GET /api/fechamentos/[id]/processamento` (endpoint leve e resiliente, separado do GET principal pra nao depender da migration), pode ser fechada (o job continua) e reconecta no reload. Guarda de job travado (15 min). Substituiu o antigo `/process/stream`, que amarrava o job ao request e perdia a analise no disconnect.
- Notificacoes reais (tabela `notificacoes` + `/api/notificacoes` + `notifications-context`): sino com badge de nao-lidas (substitui o placeholder), toast (sonner) e notificacao do SO (Notifications API, com permissao) disparados por um poller global quando uma analise conclui/falha — funciona mesmo fora da tela de processamento.
- Tempo medio: a tela informa que documentos densos levam de 2 a 5 minutos e que pode-se fechar; as colunas `processamento_iniciado_em/atualizado_em` deixam a media data-driven pronta para depois.
Validacao: `tsc --noEmit`, `eslint` e `next build` (Turbopack) passaram; rotas novas registradas. Harness gpt-5.5 confirmou CESAR e GCI (run interrompido manualmente; demais nao re-rodados). Verificacao manual no navegador (revisao, processamento em 2o plano, sino) PENDENTE.
Decisoes: ver entradas adicionadas em "Decisoes registradas".
Arquivos/docs impactados: `supabase/migrations/202606190001_processamento_background_e_notificacoes.sql`, `lib/server/background-processing.ts`, `app/api/fechamentos/process/route.ts`, `app/api/fechamentos/[id]/processamento/route.ts`, `app/api/notificacoes/route.ts`, `app/api/notificacoes/marcar-lidas/route.ts`, `app/api/fechamentos/[id]/corrigir/route.ts`, `lib/contexts/processing-context.tsx`, `lib/contexts/notifications-context.tsx`, `components/acr/views/processando-view.tsx`, `components/acr/views/revisao-view.tsx`, `components/acr/topbar.tsx`, `components/acr/notifications-panel.tsx`, `app/(app)/layout.tsx`, `app/(app)/fechamentos/[id]/revisao/page.tsx`, `components/acr/correction-modal.tsx`, `lib/server/package-rechecks.ts`, `lib/server/cesar-rego-parser.ts`, `lib/server/persist-package.ts`, `lib/prestacao-types.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: (1) aplicar a migration `202606190001` no Supabase; (2) remover o pin `OPENAI_MODEL` do `.env.local` para restaurar `gpt-5.5` na prestacao; (3) validar no navegador conforme a secao "Proxima acao recomendada".

### 2026-06-12 - Multiplas contas eGestor (roteamento por empreendimento)

Status: done
Job: a integracao eGestor usava um unico token global, mas o cliente tem contas distintas (Global e MMC `mmcparticipacoes`). Teste ao vivo no navegador confirmou que o fechamento Alive/GM II fica em `erro_egestor` por falta de contato eGestor da imobiliaria, e que o contato/planos vivem em outra conta. Era preciso rotear conta por empreendimento.
Outcome entregue: migration `202606130001_egestor_multi_conta.sql` cria `egestor_contas`, migra o singleton para a conta "Global", adiciona `conta_id` em `egestor_mapeamentos_categoria` (PK `conta_id,categoria`), `empreendimentos.egestor_conta_id` e a tabela `egestor_imobiliaria_contatos`, e faz seed da conta "MMC Participacoes" (disponivel 2; planos repasse 52/comissao 23/energia 47/agua 13/iptu 69/seguro 51/outras 67) - token e contato pela UI. `lib/server/egestor.ts` ganhou `resolveContaForFechamento`, `getMapeamentos(contaId)`, `resolveContato(imob,conta)` e `getContaById`, com `buildLancamentoRow(conta, codContato)` e as 5 funcoes resolvendo a conta do fechamento; `testEgestorConnection(supabase, contaId)` testa uma conta especifica. `app/api/egestor/config/route.ts` (GET/PATCH) e `lib/egestor-types.ts` viraram multi-conta com fallback resiliente ao singleton pre-migration. `components/acr/views/configuracoes-view.tsx` virou um card por conta (token/disponivel/planos/testar), seletor de conta por empreendimento e contato por conta nas imobiliarias.
Validacao: `pnpm lint`, `pnpm build` e `pnpm exec tsc --noEmit` passaram. Os codigos da conta MMC (disponivel, planos e contato Alive=41) foram lidos da API real do eGestor via token.
Decisoes: ver entrada em "Decisoes registradas" sobre multiplas contas eGestor com roteamento por empreendimento.
Arquivos/docs impactados: `supabase/migrations/202606130001_egestor_multi_conta.sql`, `lib/server/egestor.ts`, `app/api/egestor/config/route.ts`, `lib/egestor-types.ts`, `components/acr/views/configuracoes-view.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: aplicar a migration em producao, colar o token da MMC na UI, apontar os empreendimentos da MMC para a conta e preencher o contato da Alive, depois validar a previa eGestor saindo `validado`.

### 2026-06-11 - Correcoes do layout Cesar Rego (vago, desconto, mes de referencia)

Status: done
Job: corrigir tres falhas reportadas na revisao do pacote "Galpao Pompilio Gomes" (Cesar Rego, 05/2026): todos os imoveis apareciam como "Vago", o desconto vinha so na observacao (sem abater na coluna "Valor c/ desc.") e o mes de referencia do aluguel nao era informado (apto B pago referente a 03/2026).
Outcome entregue: no `cesar-rego-parser.ts`, `buildReceitas` passou a (1) preencher `inquilino` com o endereco do imovel quando nao ha nome na camada de texto e remover o endereco da observacao - imovel com creditos de ALUGUEL deixa de cair como Vago e vira "Alugado"; (2) classificar lancamentos de desconto (`isDescontoLancamento`: debito com `DESCONTO`/`DESC.`) em `desconto`, calculando `aluguel_com_desconto = aluguel - desconto` (clamp >= 0), retirando-os da observacao e sem capturar o credito de encargos por atraso; (3) gravar em `vencimento` o mes/ano do lancamento de ALUGUEL. `buildReceita` foi ampliado para aceitar `desconto`/`aluguel_com_desconto`/`vencimento`. Na `revisao-view.tsx` foi adicionada a coluna "Ref." (header/corpo/rodape/colSpan) exibindo `vencimento`, com destaque ambar quando difere da competencia do fechamento (helper `competenciaParaMesAno` converte "YYYY-MM"/"MM/YYYY"). A subtracao do desconto na coluna "Valor c/ desc." e o badge "Alugado" ja eram suportados pela UI. `scripts/test-cesar-rego-parser.ts` passou a aceitar a competencia como 2o argumento.
Validacao: `npx tsx scripts/test-cesar-rego-parser.ts "PRESTACAO ... GALPAO POMPILIO GOMES CESAR REGO.pdf" 2026-05` retornou os 4 imoveis com inquilino=endereco, desconto 113,27/0,26 e aluguel_com_desconto 1.100,00/787,96, `vencimento` 03/2026 no 0002521 (demais 05/2026), credito de encargos por atraso (94,42) mantido como credito no total 882,64, recebidos 14.015,38 e total liquido 13.409,90 exatos, payload valido no `prestacaoAnalysisSchema`. `pnpm lint`, `pnpm build` e `pnpm exec tsc --noEmit` passaram.
Decisoes: ver entradas adicionadas em "Decisoes registradas" sobre o tratamento de inquilino/endereco, desconto e mes de referencia no layout C.
Arquivos/docs impactados: `lib/server/cesar-rego-parser.ts`, `components/acr/views/revisao-view.tsx`, `scripts/test-cesar-rego-parser.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: validar no navegador a revisao do pacote Galpao Pompilio Gomes (nenhum imovel "Vago", "Valor c/ desc." abatido em A/B, coluna "Ref." com 03/2026 destacado no apto B) e confirmar o lancamento no eGestor.

### 2026-06-10 - Ajustes financeiros, UI de revisao e previa eGestor

Status: done
Job: corrigir taxa de comissao, valor com desconto na tabela, vagas no mini dash, ordem visual de despesas, lancamento bruto no eGestor, deduplicacao de imobiliarias e ocultacao de cadastros inativos.
Outcome entregue: `comissao_realizada_percent` passou a usar comissao sobre total recebido; a previa eGestor passou a criar recebimento bruto e manter comissoes/despesas como pagamentos separados; persistencia de pacote/prestacao passou a localizar cadastros por nome normalizado antes de criar/reactivar; provider de cadastros deixou de carregar inativos por padrao; revisao ganhou coluna "Valor c/ desc.", total de vagas de garagem no mini dash e despesas abaixo do comprovante.
Validacao: `pnpm dlx tsx --test lib/server/package-rechecks.test.ts lib/server/egestor.test.ts` passou (15/15); `pnpm exec tsc --noEmit` passou; `pnpm lint` passou; `pnpm build` passou com warning conhecido de root do Turbopack por lockfiles no workspace raiz e no worktree; `.agent/scripts/checklist.py .` passou em security, lint, schema, tests, UX e SEO.
Decisoes: "valor total com desconto" e exibido como coluna propria sem substituir o total final da linha; vagas sem quantidade explicita contam 1 quando ha valor de garagem; cadastros ocultos sao `ativo=false`.
Arquivos/docs impactados: `lib/server/package-rechecks.ts`, `lib/server/egestor.ts`, `lib/server/persist-package.ts`, `lib/server/persist-prestacao.ts`, `lib/contexts/cadastros-context.tsx`, `components/acr/views/revisao-view.tsx`, testes de package/eGestor, `lib/server/cesar-rego-parser.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: validar a revisao no navegador com um fechamento real e reprocessar pacote real para confirmar deduplicacao/reativacao de imobiliarias.

### 2026-06-10 - Parser deterministico para o layout C (Cesar Rego - consolidado por lancamentos)

Status: done
Job: substituir o agente de visao pelo parser deterministico no layout C, eliminando a imprecisao do modelo na matematica do razao por linha (saldos por imovel, IPTU credito+debito de passagem) e nos nomes de inquilino.
Outcome entregue: novo `lib/server/cesar-rego-parser.ts` nos moldes do `excel-parser.ts`, extraindo o texto do PDF via `pdfjs-dist` (itens com coordenadas, reconstruidos em linhas/colunas por posicao x/y). Parser cobre as tres secoes: Relacao de Imoveis (codigo, endereco, aluguel, ult. pg, situacao), Lancamentos Efetuados (razao DEBITO/CREDITO classificado pela geometria das colunas do cabecalho, com fallback no indicador D/C; descricoes quebradas em duas linhas sao reanexadas pelo gap vertical; linhas agrupadoras de inquilino sao reconhecidas quando existirem na camada de texto) e RESUMO (rotulos pareados aos valores por coordenada). Mapeamento por imovel: apto=codigo, aluguel=credito de ALUGUEL, comissao=debito de COMISSAO, iptu=IPTU creditado, total=soma dos creditos, repasse=saldo final do razao; imovel da Relacao sem lancamentos vira linha com valores null, total 0 e observacao "Sem lancamentos no mes (ult. pg X)". Resumo: recebidos_em_nome_locador=ALUGUEIS CREDITADOS, total_a_repassar=TOTAL LIQUIDO, total_comissao_despesas=recebidos-liquido, comissao_administracao=COMISSOES, outros debitos/creditos e taxas PIX/TED/TX em outras_comissoes_despesas. `extractPrestacaoAliveFromPdf` detecta o layout C pelo texto do PDF antes de chamar a OpenAI e usa o parser local (fallback para o agente de IA se a deteccao/parse falhar). `serverExternalPackages: ["pdfjs-dist"]` adicionado ao next.config.
Validacao: teste real com `extratoagrupado - cesar rego - REF 03-26 (1).pdf` via `npx tsx scripts/test-cesar-rego-parser.ts` e via `POST /api/fechamentos/process/stream` (log confirma `[CESAR REGO PARSER]`, sem chamada de visao): recebidos 13.132,74 e total liquido 12.566,32 exatos, saldos por imovel 1.039,67/6.409,74/5.128,01 exatos, IPTU creditado 106,65/193,02/149,02, imovel 0002521 sem lancamentos (inadimplente) com observacao correta; rechecks financeiros `total_linhas_receitas` e `resumo_financeiro` passaram, bloqueios remanescentes apenas por comprovante de repasse ausente do pacote (esperado no teste de arquivo unico). `pnpm lint` e `pnpm build` passaram.
Decisoes: no PDF real deste layout os nomes agrupadores de inquilino nao existem na camada de texto (apenas no render visual), entao o parser preenche inquilino="" quando o agrupador nao for extraivel; a heuristica de linha agrupadora permanece para documentos que tragam o nome como texto. Dependencia `pdfjs-dist` adicionada (apenas extracao de texto, sem render).
Arquivos/docs impactados: `lib/server/cesar-rego-parser.ts`, `lib/server/analyze-prestacao.ts`, `next.config.mjs`, `package.json`, `scripts/test-cesar-rego-parser.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: definir conciliacao para imobiliarias sem comprovante bancario separado (o extrato Cesar Rego traz banco/agencia/conta e valor liquido no proprio documento) e validar o parser com outros meses/PDFs do mesmo layout (inclusive um que traga agrupadores de inquilino no texto).

### 2026-06-10 - Suporte aos layouts Plural (extrato agrupado) e Cesar Rego (consolidado por lancamentos)

Status: done (layout B completo; layout C parcial)
Job: Testar o pipeline com PDFs de imobiliarias de layout diferente do Alive e implementar o suporte.
Outcome entregue: classificador atualizado para reconhecer os tres layouts de prestacao de contas e para nao confundir demonstrativo com comprovante bancario (antes o extrato Plural era classificado como comprovante_repasse com 0.9 de confianca e nenhuma receita era extraida). Agente de prestacao agora descreve LAYOUT A (tabela Alive), LAYOUT B (Extrato agrupado simplificado - Plural) e LAYOUT C (Extrato de Conta Consolidado por Lancamentos - Cesar Rego), com mapeamento por bloco/contrato e exemplo concreto. Teste real Plural 03/2026: classificacao correta, 2 contratos extraidos com valores exatos (alugueis 3000/3200, taxas 355,34/256, repasses 2580,56/2944), resumo perfeito (6200 - 675,44 = 5524,56) e unicos bloqueios remanescentes legitimos (comprovante bancario ausente do pacote). Teste real Cesar Rego 03/2026: classificacao correta, 4 imoveis extraidos incluindo o sem lancamentos no mes (inadimplente, ultimo pg 12/2025), recebidos (13.132,74) e total liquido (12.566,32) exatos; porem a matematica do razao por linha (saldos, creditos IPTU de passagem) e os nomes de inquilino (vieram do endereco, nao do agrupador) ainda saem imprecisos e os rechecks bloqueiam corretamente.
Validacao: `pnpm exec tsc --noEmit`, testes 14/14, processamentos reais via `/api/fechamentos/process/stream` com contexto de fechamento para Plural (d756ee76) e Cesar Rego (ceab6a67).
Decisoes: extrato agrupado/consolidado das imobiliarias e prestacao_contas (nao comprovante_repasse); comprovante_repasse fica reservado a recibo bancario de transferencia. Layout C (razao contabil) deve evoluir para parser deterministico proprio (como o excel-parser) em vez de mais iteracao de prompt.
Arquivos/docs impactados: `lib/server/ai-agents/document-classifier-agent.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: parser deterministico para o layout C e definicao de conciliacao para imobiliarias sem comprovante bancario separado (o proprio extrato traz banco/agencia/conta e valor liquido).

### 2026-06-10 - Primeiro envio real eGestor + correcoes pos-reuniao (Airbnb, vagas, null, inadimplencia acumulada)

Status: done
Job: Validar a integracao eGestor de ponta a ponta com lancamentos reais e implementar as correcoes da reuniao: Airbnb nao e vago/inadimplente, vagas de garagem contadas por veiculo, "null" literal na revisao, desconto visivel na tabela, observacao completa, inadimplencia acumulada como insight e taxa de intermediacao derivada do documento.
Outcome entregue: smoke test eGestor criou e excluiu recebimentos reais (8748/8749, confirmados 410 apos delete); envio real do fechamento GM I 04/2026 criou recebimento 8751 (R$ 11.257,04) e pagamento 8750 (R$ 726,13), com status `lancado_egestor`, auditoria em `egestor_envios` e revalidacao ok; anexos ficaram `anexo_pendente` porque o usuario do token nao tem permissao Disco Virtual no eGestor (GET /v1/discoVirtual retorna 401 "Usuario nao possui acesso"), nao e bug de codigo. Na revisao: novo status/badge/filtro/contador Airbnb derivado de "airbnb" em inquilino/observacao (GRAND MARACANAU valida 15 alugadas + 1 inadimplente + 1 vago + 13 airbnb); `displayInquilino` sanitiza strings "null"/": null"; coluna Obs sem truncamento; celula Aluguel mostra "desconto R$ X" quando houver; chip Intermediacao agora deriva de linha de intermediacao em `outras_comissoes_despesas` do documento (sem fallback de cadastro); nova secao + card "Inadimplencia acumulada" com `inadimplencias_acumuladas` adicionado ao schema zod, ao JSON Schema da OpenAI e ao prompt do agente Alive; prompt tambem passou a contar vagas por veiculo ("CARRO E MOTO" = 2, "GARAGEM PARA CARRO" = 1) e a proibir strings "null"; `parseVagasGaragem` do parser XLSX acompanha a mesma regra.
Validacao: smoke test real `npx tsx test-egestor.ts` passou; envio real via `POST /api/fechamentos/{id}/egestor/send` passou; revalidacao via `POST .../egestor/revalidar` passou; `npx tsx --test lib/server/egestor.test.ts lib/server/package-rechecks.test.ts` 14/14; `pnpm lint` e `pnpm build` passaram; UI validada via preview no navegador em `/fechamentos/1242c468-aa49-4aa2-bf8c-d66ec56498d2/revisao`.
Decisoes: unidade com "airbnb" na observacao/inquilino nao conta como vaga nem inadimplente e tem contagem propria; inadimplencia acumulada e divida de meses anteriores e nunca compoe receita do mes; taxa de intermediacao exibida vem exclusivamente do documento; lancamento eGestor permanece consolidado por categoria (1 recebimento de repasse conciliavel com o comprovante bancario).
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `lib/prestacao-types.ts`, `lib/server/analyze-prestacao.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`, `lib/server/excel-parser.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: habilitar permissao Disco Virtual no eGestor e rodar retry de anexos; reprocessar PDF Alive para validar novas extracoes em producao.

Atualizacao operacional 2026-06-10 (E2E de upload): pacote completo GM II marco/2026 (4 PDFs reais) processado pelo `/api/fechamentos/process/stream` com contexto do fechamento `83b319f8`. Classificador acertou os 4 tipos (prestacao_contas, comprovante_repasse, relatorio_reajuste, despesas_comprovantes). Comprovante de repasse extraido perfeito (R$ 17.058,86, 15/04/2026, protocolo 447512390) e conciliado com diferenca zero. Prestacao: 27/27 linhas, soma da coluna TOTAL correta (20.046,19), vagas por veiculo ok (apto 23 = 2), inadimplencias acumuladas extraidas parcialmente (5 linhas). Prompt do agente Alive reforcado (coluna TOTAL por linha, todas as linhas da secao INADIMPLENCIAS, conferencia do resumo e do numero de linhas) apos uma rodada com extracao parcial — modelo apresenta variancia em documento denso e os rechecks deterministicos bloquearam corretamente as divergencias residuais (consolidado com digito trocado, ENEL ausente nas outras despesas). Revisao validada no navegador com a nova secao de inadimplencia acumulada. Pendente: validar layout "extrato agrupado" (Cesar Rego/Plural), que ainda nao tem agente proprio.

### 2026-06-05 - Correcoes UX e bug bloqueio na Revisao

Status: done
Job: Corrigir a lógica de bloqueio da revisão para ignorar rechecks resolvidos manualmente e tornar mais explícita a necessidade de aprovação antes da prévia do eGestor.
Outcome entregue: Atualizada a lógica em `RevisaoView` para que `hasBlocking` desconsidere bloqueios marcados como resolvidos; substituído o texto descritivo por um banner de alerta amarelo sobre o bloqueio da prévia e adicionado botão para rolar até a aprovação; removida a coluna "Q. Leitura" da tabela de receitas por imóvel. Corrigido erro de tipagem no script temporário `test-egestor.ts`. No backend, endpoints de aprovação e resolução de pendências foram ajustados para ignorar `guardrails` inativos que travavam a aprovação de fechamentos resolvidos manualmente.
Validacao: `pnpm lint` e `pnpm build` passaram localmente.
Decisoes: O frontend confia na contagem de bloqueios não resolvidos (`validationSummary.blocked > 0`) para ditar o travamento da tela, não ficando refém apenas do status estático gerado pela análise automática. Guardrails de sumarização não são interativos e não devem impedir o fluxo se as pendências acionáveis já foram resolvidas.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `lib/server/egestor.ts`, `app/api/validacoes/[id]/resolver/route.ts`, `test-egestor.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: Validar o destravamento visualmente após a resolução de uma pendência bloqueante e realizar o ciclo completo.

### 2026-06-05 - Integracao eGestor V1

Status: in progress
Job: Implementar fluxo seguro ACR -> eGestor com configuracao local, previa dry-run, envio controlado e auditoria tecnica.
Outcome entregue: migration da integracao criada; tela `Configuracoes` passou a configurar token, conta disponivel, planos de contas, contatos e tags; camada server-side `egestor` autentica no eGestor, gera previa consolidada, aprova fechamento, envia recebimentos/pagamentos de forma idempotente e tenta anexar documentos via `discoVirtual`; revisao exibe painel de previa eGestor e a listagem reflete `preparado_egestor`, `lancado_egestor` e `erro_egestor`.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `npx --yes tsx --test lib/server/egestor.test.ts lib/server/package-rechecks.test.ts`, `pnpm build` e `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passaram. `npx supabase db push --dry-run` nao validou porque o checkout nao esta linkado a um project ref Supabase.
Decisoes: V1 consolidada por fechamento; repasse como recebimento; comissao/despesas como pagamentos; mapeamentos oficiais no ACR; contato eGestor por imobiliaria; anexos sao pos-lancamento e nao desfazem financeiro.
Arquivos/docs impactados: `supabase/migrations/202606050001_egestor_integracao.sql`, `lib/server/egestor.ts`, `lib/server/egestor-client.ts`, `app/api/egestor/config/route.ts`, `app/api/fechamentos/[id]/aprovar/route.ts`, `app/api/fechamentos/[id]/egestor/*`, `components/acr/views/configuracoes-view.tsx`, `components/acr/views/revisao-view.tsx`, `components/acr/views/fechamentos-view.tsx`, `.env.example`, docs numerados da Etapa 4.
Proxima acao: resolver pendencias bloqueantes de um fechamento real e executar o primeiro dry-run eGestor pela revisao antes de qualquer envio real.

Atualizacao operacional 2026-06-05: migration `202606050001_egestor_integracao.sql` aplicada no Supabase remoto via pooler `aws-1-us-east-2`; configuracao eGestor gravada com token ativo, conta disponivel padrao `2`, planos de contas reais (`repasse_mensal=44`, `comissao_administrativa=23`, `energia=18`, `agua=13`, `iptu=73`, `seguro=72`, `outras_despesas=26`) e contatos por imobiliaria (`Alive=233`, `Cesar Rego=15`, `Plural=19`); teste de conexao eGestor passou. Dry-run real nao foi executado porque nao ha fechamento elegivel sem bloqueios abertos no banco atual.

### 2026-06-05 - Operacao eGestor: retry, revalidacao e auditoria

Status: done
Job: Implementar os cinco pontos pos-V1: retry de anexos pendentes, revalidacao de status eGestor, auditoria de aprovacao/status, teste mockado do fluxo e observabilidade de `egestor_envios`.
Outcome entregue: migration operacional adiciona auditoria de status e campos de revalidacao; backend expoe endpoints de revalidacao, retry de anexos e historico de envios; revisao mostra botoes pos-envio, mensagens de revalidacao, historico tecnico e trilha de status; testes mockados cobrem auth, retry 429/5xx e escrita autenticada do cliente eGestor.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `npx --yes tsx --test lib/server/egestor.test.ts lib/server/package-rechecks.test.ts`, `pnpm build` e `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passaram. Migration `202606050002_egestor_operacao.sql` aplicada no Supabase remoto via `supabase db push`; schema remoto validado pela API Supabase para colunas de revalidacao, auditoria de status e aprovacao. `supabase migration list` falhou no pooler por prepared statement duplicado e na porta direta por IPv6 sem rota, entao a validacao final foi por REST com service role.
Decisoes: revalidar status nunca reenviara financeiro; retry de anexo opera somente em lancamentos `anexo_pendente`; auditoria de aprovacao grava usuario operacional V1 como `Operador`; historico de envios fica limitado aos 50 eventos mais recentes na API de fechamento.
Arquivos/docs impactados: `supabase/migrations/202606050002_egestor_operacao.sql`, `lib/server/egestor.ts`, `lib/server/egestor-client.ts`, `lib/egestor-types.ts`, `app/api/fechamentos/[id]/route.ts`, `app/api/fechamentos/[id]/egestor/revalidar/route.ts`, `app/api/fechamentos/[id]/egestor/retry-anexos/route.ts`, `app/api/fechamentos/[id]/egestor/envios/route.ts`, `app/(app)/fechamentos/[id]/revisao/page.tsx`, `components/acr/views/revisao-view.tsx`, `lib/server/egestor.test.ts`, docs numerados da Etapa 4.
Proxima acao: gerar um fechamento elegivel sem bloqueios para executar dry-run real e, depois, teste controlado de envio/revalidacao/anexo em conta eGestor.

### 2026-06-03 - Hotfix revisão 404 em análises antigas

Status: done
Job: Corrigir queda da página de revisão em produção ao abrir fechamento salvo antes do campo `acordos_rescisoes_recebidos`.
Outcome entregue: `RevisaoView` passou a normalizar arrays opcionais (`documents`, `rechecks`, `motivos` e `acordos_rescisoes_recebidos`) antes de renderizar, evitando erro client-side em payloads historicos.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` e validação local no navegador em `/fechamentos/d756ee76-178b-46a1-a970-a973a99cc19d/revisao` passaram.
Decisoes: compatibilidade com analises persistidas antigas deve ser garantida na view, sem exigir reprocessamento para abrir revisão.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: aguardar deploy do EasyPanel e reabrir a URL de produção para confirmar que o 404/queda sumiu.

### 2026-06-03 - Correcoes pos-reuniao: resolucao, resumo e duplicidades

Status: done
Job: Implementar anotacoes da ultima reuniao: corrigir erro ao resolver pendencias, clarear resumo financeiro, destacar comissao/despesas, colapsar leitura documental, detectar acordos/rescisoes repetidos e corrigir cadastros duplicados/inativos.
Outcome entregue: API e modal de resolucao passam a validar id persistido e salvar valor oficial escolhido; revisao separa receitas, comissao, despesas e outras comissoes/despesas, exibe comissao realizada em percentual e taxa cadastrada, adiciona cabecalhos fixos, observacoes e acordos/rescisoes; extração da prestacao aceita acordos/rescisoes recebidos no mes; rechecks bloqueiam possivel pagamento repetido e alertam competencias diferentes; cadastros reativam registros equivalentes e ocultam inativos dos fluxos por padrao.
Validacao: `pnpm exec tsc --noEmit`, `npx --yes tsx --test lib/server/package-rechecks.test.ts`, `pnpm lint`, `pnpm build` e `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passaram. `npx supabase db push --dry-run` nao validou porque o CLI nao encontrou project ref linkado neste checkout.
Decisoes: pagamento repetido de acordo/rescisao e bloqueante; cadastros inativos permanecem para historico, mas fluxos ativos usam apenas `ativo=true`; leitura documental fica colapsada no fim da revisao.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `components/acr/resolve-conflict-modal.tsx`, `app/api/validacoes/[id]/resolver/route.ts`, `app/api/cadastros/*`, `lib/prestacao-types.ts`, `lib/server/package-rechecks.ts`, `lib/server/package-workflow.ts`, `lib/server/persist-package.ts`, `supabase/migrations/202606030001_cadastros_normalizados.sql`, `docs/02-mock-contract.md`, `docs/03-domain-model.md`, `docs/04-user-flows.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: validar visualmente com PDF Alive e Cesar Rego/Natan no navegador, confirmando pendencia bloqueante e resolucao sem erro.

### 2026-06-03 - Design review do resumo financeiro e unidades

Status: done
Job: Revisar UX do resumo financeiro para melhorar observacao dos dados e incorporar feedback sobre despesas, comissao, data de repasse, inadimplencia e vacancia.
Outcome entregue: card de total a repassar exibe data do repasse; resumo separa comissao administrativa, outras despesas e total comissao + despesas; situacao das unidades foi separada em Alugadas, Inadimplentes e Aptos vagos; aluguel medio passa a considerar unidades alugadas com valor, sem misturar inadimplentes e vacancia.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build` passaram.
Decisoes: "Aptos vagos" representa vacancia de apartamentos, nao quantidade de vagas de garagem; para GM II abril/26, vacancia pode aparecer como 0 sem ser confundida com os 2 inadimplentes.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: validar visualmente o dashboard de revisao com o fechamento GM II abril/26.

### 2026-05-29 - Indicadores objetivos no Parecer Automático

Status: done
Job: Remover o destaque "Confiança XX%" da revisao porque o percentual vinha de regra interna fixa do parecer e nao explicava a situacao operacional.
Outcome entregue: Parecer automatico passou a mostrar contagem objetiva de bloqueios, alertas e validacoes ok; copy explica que o resumo vem das validacoes automaticas do fechamento; documentos e linhas extraidas passam a rotular percentuais como qualidade da leitura.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `python3 .agent/skills/frontend-design/scripts/ux_audit.py .` e `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passaram. UX audit retornou warnings gerais preexistentes, mas status final PASS.
Decisoes: Manter `parecer.confianca` no contrato interno por compatibilidade, mas nao exibi-lo como confianca do fechamento.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: Validar visualmente a revisao em um fechamento bloqueado, um com alerta e um sem bloqueios quando houver dados para os tres estados.

### 2026-05-29 - UX da Revisao e Modal de Resolucao

Status: done
Job: Melhorar a UX da revisao apos feedback de que os indicadores estavam espalhados e o modal de resolver problemas estava confuso.
Outcome entregue: Resumo financeiro reorganizado em um unico painel com total a repassar, recebido, descontos, diferenca, composicao do recebido e metricas operacionais; microcopy trocada de "warnings" e "IA" para termos operacionais; modal de resolucao redesenhado em fundo claro com valores comparados, escolha do valor oficial e justificativa para auditoria.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` e `python3 .agent/skills/frontend-design/scripts/ux_audit.py .` passaram. UX audit retornou warnings gerais preexistentes, mas status final PASS.
Decisoes: Manter a paleta operacional verde/cinza do contrato e reduzir a densidade cognitiva por agrupamento, nao por esconder valores.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `components/acr/resolve-conflict-modal.tsx`, `docs/02-mock-contract.md`, `docs/12-execution-roadmap.md`.
Proxima acao: Conferir visualmente no navegador a revisao com dados reais e ajustar espaçamento fino se houver overflow em telas menores.

### 2026-05-29 - Regras Comerciais, Totalizadores e Contexto de Empreendimento

Status: done
Job: Implementar regras comerciais por imobiliaria + empreendimento, validar comissao administrativa sobre o total pago pelo inquilino, corrigir contexto de empreendimento na revisao e adicionar totalizadores de receitas.
Outcome entregue: Nova tabela `regras_comerciais` com seeds dos 8 pares solicitados; API e aba de cadastro de regras comerciais; pipeline carrega a regra do fechamento e gera recheck de comissao administrativa; revisao prioriza o empreendimento/imobiliaria do fechamento salvo; cards de aluguel, garagem, agua, IPTU e seguro incendio adicionados; tabela de receitas ganhou seguro, comissao, repasse e rodape totalizador.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `npx --yes tsx --test lib/server/package-rechecks.test.ts` e `PYTHONIOENCODING=utf-8 python3 .agent/scripts/checklist.py .` passaram. `npx supabase db push` sem link falhou; aplicacao via `--db-url` no pooler remoto passou e consulta via Supabase confirmou 8 regras comerciais.
Decisoes: Seed usa nomes ASCII/camel case consistentes com os cadastros existentes para evitar duplicidade por acento. Intermediacao permanece informativa nesta etapa.
Arquivos/docs impactados: `supabase/migrations/202605290001_regras_comerciais.sql`, `app/api/cadastros/regras-comerciais/route.ts`, `lib/server/regras-comerciais.ts`, `lib/server/package-rechecks.ts`, `lib/server/package-workflow.ts`, `components/acr/views/revisao-view.tsx`, `components/acr/views/imoveis-view.tsx`, `docs/02-mock-contract.md`, `docs/03-domain-model.md`, `docs/12-execution-roadmap.md`.
Proxima acao: Validar manualmente no browser um fechamento GC I/Alive ou outro empreendimento nao-GM II para confirmar que a revisao nao mostra Grand Messejana II indevidamente.

### 2026-05-26 - Etapa 3: Otimização de Custos e Reconciliação Manual de Divergências

Status: done
Job: Implementar otimização de custos com modelos mais leves e leitura de planilha local, e criar interface e backend de reconciliação de divergências financeiras.
Outcome entregue: Migrados agentes menores para `gpt-4o-mini`; adicionado parser local `xlsx` para ler planilhas deterministicamente; implementada API de resolução de divergências com escrita de histórico na tabela `auditoria_correcoes`; criado o componente `ResolveConflictModal` e integrado na `RevisaoView` com bloqueio inteligente de aprovação.
Validacao: `pnpm build`, `pnpm lint`, `pnpm exec tsc --noEmit` e o Master Checklist (`checklist.py`) passaram com 100% de sucesso.
Decisoes: Resolver conflitos via modal no frontend, salvando justificativa textual de forma obrigatória no banco de dados e desbloqueando aprovações automaticamente.
Arquivos/docs impactados: `lib/prestacao-types.ts`, `lib/server/excel-parser.ts`, `app/api/fechamentos/[id]/route.ts`, `app/api/validacoes/[id]/resolver/route.ts`, `components/acr/views/revisao-view.tsx`, `app/(app)/fechamentos/[id]/revisao/page.tsx`, `docs/12-execution-roadmap.md`, `docs/walkthrough.md`, `task.md`.
Proxima acao: Validar manualmente com dados mockados/reais no navegador e prosseguir com o deploy.

### 2026-05-26 - Execução da Validação do Repositório e Auditoria UX

Status: done
Job: Executar verificação geral do repositório (Master Checklist) e corrigir falsos positivos no script de Auditoria UX para garantir a conformidade com as diretrizes do AG Kit.
Outcome entregue: Correção da detecção de formulários e arquivos CSS em `.agent/skills/frontend-design/scripts/ux_audit.py` e do binário de execução python no checklist; execução bem-sucedida do Master Checklist com 100% de sucesso (Security, Lint, Schema, Tests, UX, SEO) e build de produção concluído.
Validacao: `pnpm build` e checklist de validação rodados localmente com sucesso.
Decisoes: Ajustar a validação de formulários para basear-se em tags reais (`<form`, `<input`, `<textarea`, `<select`) reduzindo falsos positivos em arquivos utilitários e CSS.
Arquivos/docs impactados: `.agent/scripts/checklist.py`, `.agent/skills/frontend-design/scripts/ux_audit.py`, `docs/12-execution-roadmap.md`.
Proxima acao: Prosseguir para deploy no EasyPanel com Nixpacks.

### 2026-05-26 - Modo Simulado (Mock Mode) + Correção de Duplicação no Reprocessamento

Status: done
Job: Fechar o fluxo de análise do documento contornando a falha de cota/rate limit da OpenAI e corrigir a inserção de registros duplicados em movimentações e validações ao reprocessar.
Outcome entregue: Implementado o modo `MOCK_IA` para interceptar as chamadas do classificador e dos extratores de prestação/repasse/despesas/reajuste, retornando os dados reais do Grand Messejana II a partir de um fixture JSON local; adicionada a exclusão prévia de movimentações e validações antigas associadas ao fechamento antes de persistir uma nova análise.
Validacao: Executado script de teste da pipeline com sucesso; testes unitários e build de produção passaram sem erros.
Decisoes: Utilizar a variável de ambiente `NEXT_PUBLIC_MOCK_IA=true` para rodar localmente sem bater na API da OpenAI; limpar movimentações e validações computadas a cada nova persistência para manter consistência.
Arquivos/docs impactados: `lib/server/analyze-prestacao.ts`, `lib/server/analyze-package-documents.ts`, `lib/server/persist-package.ts`, `lib/server/mock-gmii-analysis.json`, `docs/12-execution-roadmap.md`.
Proxima acao: Testar o fluxo via interface do navegador local com `NEXT_PUBLIC_MOCK_IA=true` habilitado e prosseguir para deploy.

### 2026-05-26 - Atualizacao da stack de agente (AG Kit 2026.5.13)

Status: done
Job: Atualizar a stack de agente do repositorio para o AG Kit 2026.5.13 para habilitar novos recursos (memory-system, context-compression, coordinator-mode, parallel execution) preservando regras, agentes e workflows customizados do projeto.
Outcome entregue: Copiados 45 novos skills, 20 novos specialist agents, 14 novos workflows/slash commands e scripts de validacao (verify_all.py, checklist.py); regras customizadas fundidas ao topo do novo `.agent/rules/GEMINI.md`; `lint_runner.py` modificado para suportar `pnpm` dinamicamente com base em `pnpm-lock.yaml`.
Validacao: Executado `python3 .agent/skills/lint-and-validate/scripts/lint_runner.py .` que auto-detectou `pnpm` e passou com sucesso tanto no `pnpm lint` quanto no `tsc`.
Decisoes: Preservar `backend.md` e `frontend.md` em `.agent/agents/` e `docs-maintenance.md` e `execute-next.md` em `.agent/workflows/` para garantir retrocompatibilidade total com as diretrizes do projeto.
Arquivos/docs impactados: `.agent/rules/GEMINI.md`, `.agent/agents/*`, `.agent/workflows/*`, `.agent/skills/*`, `.agent/scripts/*`, `docs/12-execution-roadmap.md`.
Proxima acao: Retomar implementacoes do projeto conforme roteiro.

### 2026-05-22 - Limpeza do DB e prep de deploy EasyPanel

Status: done
Job: zerar fechamentos/movimentacoes/validacoes/storage do banco para tirar a sujeira dos testes, deduplicar imobiliarias e empreendimentos, e deixar o repo pronto pra deployar em EasyPanel (Nixpacks).
Outcome entregue: 7 fechamentos, 10 documentos, 156 movimentacoes, 76 validacoes e 10 PDFs do bucket `fechamento-documentos` apagados; imobiliarias reduzidas de 5 para 3 (mantida `Alive Imoveis` do seed inicial); empreendimentos reduzidos de 4 para 3 (mantido `Grand Messejana II` em camel case); `package.json` ganhou `packageManager: "pnpm@11.1.1"`, `engines.node: >=20` e `start` agora roda `next start -H 0.0.0.0 -p ${PORT:-3000}` para containers; `.env.example` documenta as 5 variaveis necessarias; `nixpacks.toml` define provider node, install com corepack/pnpm@11.1.1, build com `pnpm build` e start com `pnpm start`.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build` passaram com a nova config; storage cleanup feito via Storage REST API porque trigger `storage.protect_delete()` bloqueia DELETE direto na tabela; tabelas pos-limpeza confirmadas via SELECT count(*) zerado para fechamentos/docs/movs/vals/storage_objects.
Decisoes: `Alive Imoveis` (sem acento, igual ao seed da migration inicial) foi mantida para evitar drift entre seed e dados reais; `Grand Messejana II` em camel case ganhou da versao caixa alta por ser o que o PDF da prestacao real usa.
Arquivos/docs impactados: `package.json`, `.env.example`, `nixpacks.toml`, `docs/12-execution-roadmap.md` (sem migration nova; cleanup foi data-only).
Proxima acao: criar app no EasyPanel apontando para a branch master, popular envs do `.env.example`, deployar e reprocessar o PDF real pelo dominio publicado.

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
