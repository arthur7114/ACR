# 12 - Execution Roadmap

## Status geral

Status atual: Etapas 1, 2 e 3 concluídas. A revisão v2 de confiabilidade de `/indicadores` foi aplicada ao Supabase fornecido para o rollout: backup lógico íntegro, migrations aditivas, 104 documentos com SHA-256, reparo transacional dos fechamentos e 731 snapshots materializados. O verificador remoto cobre 731/731 chaves, sem duplicidade, checksum inválido, linha sem vínculo ou falha de reconciliação; o reparador idempotente retorna 53 fechamentos sem mudança, zero divergentes e 1 explicitamente incompleto (César Rêgo janeiro, sem fechamento de destino para 0002520/0002521). As 13 unidades Airbnb estão classificadas como receita variável, sem aluguel fixo zero. QA autenticada passou nas quatro abas em 360, 390, 768, 1024, 1280 e 1440 px, incluindo teclado, foco, toque e CSV. O mapa de riscos agora apresenta cada unidade como histórico mensal, separando meses registrados de meses com status definido e sem repetir a origem recomposta em cada célula. A revisão dos fechamentos usa breakdowns estáveis: acordos/rescisões entram na quebra de receitas e outras despesas mantêm categorias e itens mesmo sem linhas por imóvel. Após a integração com as correções recentes da `main`, suíte completa 276/276, typecheck, lint, build e checklist 6/6 estão verdes. Em 2026-08-05 começou a Fase 0 + Fase 1 de um plano próprio para os indicadores baterem com as planilhas do cliente em junho/2026 (fundação de contratos de locação). Em 2026-08-07 o ciclo foi concluído e ampliado: as quatro abas de `/indicadores` foram redesenhadas (hierarquia explícita, definição só em tooltip, gráficos no lugar de listas de contagem, mapa por empreendimento) e cinco defeitos de classificação foram corrigidos com TDD, incluindo o falso-positivo de inadimplência que marcava o ocupante atual pela dívida de um ex-locatário — o P0 diagnosticado antes e nunca corrigido no nível do status. Em 2026-08-11, os dois fechamentos César Rêgo de julho foram reparados no Supabase: TED R$ 5,55 por empreendimento, João com 1 ocupado + 1 inadimplente, Pompílio com 2 ocupados, nenhuma diferença de reconciliação e segunda execução idempotente. A prévia não enviada de Pompílio foi regenerada com vencimento/crédito/pagamento em 10/08/2026; o lançamento 9041 de João foi preservado para correção manual no eGestor. Todas as escritas no Supabase foram feitas com autorização explícita. Nenhum valor do gabarito é citado nesta trilha (repositório público).

O repositório contém o harness `.agent`, o PRD completo em `docs/`, a trilha numerada de execução, o mock em `acr-fechamentos-app` como contrato e o fluxo real de análise da prestação Alive / GM II com Mastra, guardrails e rechecks deterministicos, agora com suporte a Mock Mode offline, Excel parser e conciliação de conflitos.

Em 2026-08-12, o dry-run de julho regenerou validações para os três fechamentos da competência: João Cordeiro, Galpão Pompílio Gomes e Galpão José Walter. Os três reconciliaram sem diferença; os valores financeiros permaneceram inalterados e somente os rechecks/pareceres atuais foram propostos.

Ainda em 2026-08-12, as vigências contratuais de julho do Galpão Pompílio Gomes foram corrigidas com base na prestação César Rêgo 41460: R$ 6.896,75 para o imóvel 0002526 e R$ 5.517,41 para o 0002527. O histórico anterior foi preservado até junho, a mudança recebeu auditoria e vínculo ao PDF-fonte, e os dois snapshots de julho foram recalculados. O indicador passou de R$ 12.032,74 para R$ 12.414,16, igual ao aluguel recebido da competência; o repasse permaneceu R$ 11.898,36.

Em 2026-08-13, a identidade contratual Plural foi corrigida: `GA0002/2` passa a resolver para o cadastro canônico `GA0002` na sincronização, no vínculo do fechamento, nos snapshots e na cobertura dos indicadores. O fechamento José Walter de julho foi reparado atomicamente e auditado sem alterar os totais nem o lançamento eGestor; a API passou a retornar aluguel recebido de R$ 3.348,52, comissão de R$ 267,88, repasse de R$ 3.080,64, ocupação de 100% e zero linha sem vínculo. A segunda execução do reparador retornou `unchanged`.

Ainda em 2026-08-13, o mesmo vínculo histórico foi reparado em junho: a linha
`GA0002/2`, que ainda apontava para o UUID do cadastro duplicado removido, foi
religada ao `GA0002` ativo. O snapshot agora registra aluguel recebido de
R$ 3.200,00, 1 imóvel ocupado e ocupação/cobertura de 100%; comissão de
R$ 256,00 e repasse de R$ 3.389,95 foram preservados, com diferença financeira
zero. O reparador também sincroniza o marcador de repasse embutido no resumo da
prestação para não reabrir indevidamente o alerta de comprovante.

## Proxima acao recomendada

Com autorização explícita do usuário, corrigir o cadastro de três unidades do
Grand Maracanaú que têm aluguel zerado em `imoveis.valor_aluguel_esperado` e em
`imovel_vigencias.aluguel_contratado` embora tenham contrato ativo (os valores
corretos estão nas planilhas do cliente). Isso fecha o último indicador
monetário de junho. Em paralelo, e sem depender de autorização: montar o
gabarito de maio a partir das mesmas planilhas (`tmp/gabaritos/`, não
versionado), tornar rescisão distinguível na derivação para que ela ganhe
indicador próprio em vez de ficar dentro de "outros", e escrever o `DESIGN.md`
do sistema visual das quatro abas de `/indicadores`.

Publicar o código validado no ambiente da aplicação e executar um smoke no
domínio implantado. Para encerrar a única incompletude documental, obter o
fechamento de destino de César Rêgo de janeiro para as unidades 0002520/0002521;
até lá, manter o estado `Incompleto`, sem rateio ou zero inventado. Os valores
de aluguel ainda sem classificação continuam bloqueando `Confirmado` e devem
ser resolvidos somente com evidência documental por imóvel.

Quando LOCMAIS II sair de obras e entrar em operação, processar o primeiro fechamento real rotulado "LOCMAIS II" e confirmar que resolve para o `empreendimento_id` de "LOCMAIS" (`ae2d3019-b916-4511-9294-55eab91ba812`) via o alias já gravado, recebendo a regra comercial Alive (7% admin / 60% intermediação) em vez de criar um empreendimento novo sem regra.

A TED/tarifa bancária itemizada é rateada igualmente entre os imóveis dentro de cada fechamento. Em extrato César Rêgo consolidado, a tarifa global é antes dividida igualmente entre os empreendimentos; julho/2026 foi reparado e validado com R$ 5,55 para João e R$ 5,55 para Pompílio.

Publicar a correção do gate de aprovação para receitas legadas sem competência original e repetir o smoke autenticado no fechamento `e6f5cd8a-1081-4294-82ce-205883a2cfe8`. A aprovação deve ficar disponível porque a ausência de competência é aceita pelo contrato vigente; movimentação ausente e vínculo de imóvel divergente continuam bloqueantes.

Aplicar primeiro a migration `202607140001_correcoes_fechamento_atomicas.sql` em staging. Em seguida executar `node --import tsx scripts/repair-fechamentos-operacionais.ts` em dry-run, revisar o relatório dos fechamentos Terreno Castelão, João Cordeiro, Galpão Pompílio Gomes e Grand Messejana II de maio/2026 e somente então repetir com `--commit`. Validar na revisão: março como competência original onde documentado, maio como recebimento, `10` como dia, IPTU do Pompílio em R$ 342,04 apenas na discriminação, comissão GM II 1.218,45 + 65,52 = 1.283,97, despesas detalhadas e bloqueio de aprovação por vínculo de imóvel pendente (competência ausente não bloqueia mais — ajuste de 2026-07-15). Confirmar auditoria antes/depois e nenhuma alteração em indicadores ou eGestor.

Aplicar a migration `202607070001_iptu_contas_pagar.sql` no Supabase (evolui `iptu_carnes`/`iptu_parcelas` para contas a pagar: colunas `origem`/`observacoes` no carne e `data_vencimento`/`valor_previsto`/`valor_pago`/`data_baixa`/`observacoes`/`criado_em`/`atualizado_em` na parcela, com backfill de `origem='importacao'` e `data_baixa=registrado_em` das parcelas legadas pagas, indices, e as funcoes RPC `iptu_gerar_lote`/`iptu_baixar_parcelas`). Depois validar no navegador em `/iptu`: gerar carnes em lote (com revisao e alerta de conflito por imovel+ano), editar parcela, ajustar numero de parcelas do carne, baixa individual e em massa, filtros combinados e cards de resumo. Confirmar que nenhuma acao toca eGestor/fechamento.

Aplicar a migration `202606250002_egestor_conta_mmc.sql` no Supabase (colunas `tag_padrao`, `somente_recebimento`, `disponivel_busca` em `egestor_contas`; configura a conta MMC: etiqueta "MMC", somente recebimento, busca do disponivel "06394" e zera o `cod_disponivel_padrao`). Garantir que o token da conta MMC esteja preenchido em Configuracoes (a resolucao do disponivel "Sicredi MMC - 06394 - 0" via API depende dele). Depois gerar a previa eGestor de um fechamento de Maracanau e validar: (1) sobe SOMENTE o recebimento (sem comissao/despesas); (2) etiquetas = ["MMC", empreendimento]; (3) descricao = "MMC <empreendimento> <competencia> - ..."; (4) conta de origem = Sicredi MMC (06394), nao mais "Planilha consolidada"; (5) valor do recebimento = total da receita (`total_receitas`). Se o token estiver ausente ou o disponivel nao casar, o lancamento fica `pendente_config` (sem chute).

Aplicar a migration `202606250001_normalizar_acentos_cadastros.sql` no Supabase (cria `acr_normalize_nome`, desativa duplicatas acento-insensiveis e recria os indices unicos de imobiliarias/empreendimentos). Resolve o empreendimento "Galpao Pompilio Gomes" duplicado no dropdown ("Galpão" vs "Galpao"). Depois validar a revisao da prestacao Cesar Rego "Galpao Pompilio Gomes / Maio 2026": reembolso/desconto do APT. A aparece na coluna desconto; IPTU de passagem 193,02 + 149,02 aparece na discriminação de Receitas e se anula nos totais; APT. B preserva 03/2026 como competência original recebida em maio, sem inferir inadimplência corrente apenas por esse atraso.

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
| Indicadores operacionais | v2 aplicada e validada | Migrations, hashes, reparo e 731 snapshots aplicados no Supabase fornecido; 54/54 pontes reconciliadas, 1 fechamento incompleto explícito; QA autenticada 4 abas × 6 larguras e gates verdes. O histórico mensal por unidade foi simplificado e diferencia registro, status definido e ausência. Falta apenas publicar este código no host da aplicação. |
| Fechamentos operacionais | codigo concluido; rollout pendente | Competência, IPTU, despesas, comissão e vínculos implementados; falta aplicar migration, executar reparo real e QA autenticada. |
| Indicadores — modelo de contratos | fundacao em codigo; aplicacao pendente | Migration `202608050001_contratos_locacao.sql`, função de derivação (`lib/contratos-derive.ts`) e backfill idempotente (`scripts/backfill-contratos.ts`) prontos; dry-run read-only validado contra o banco real. Falta aplicar a migration e rodar o backfill com `--apply` (autorização do usuário) e só então rodar `scripts/verify-competencia.ts` contra o gabarito. |

## Decisoes registradas

- PRD completo permanece como fonte historica/canonica.
- Docs numerados sao a trilha operacional.
- `acr-fechamentos-app` e contrato obrigatorio de UI/UX e fluxo.
- Divergencias contra o mock exigem explicacao previa e atualizacao de docs.
- Extrato César Rêgo consolidado divide a tarifa global igualmente entre os empreendimentos antes do rateio interno por imóvel; `SIT=ALUG` sem lançamento é inadimplência explícita.
- A prévia eGestor mantém automáticos consolidados, mas aceita manuais repetidos por meio de `origem_chave`; lançamentos já enviados não são alterados pelo reparo.
- Documentos opcionais ausentes e despesas confirmadas em zero não são pendências operacionais. Rechecks César Rêgo são gerados somente depois do recorte por empreendimento; valores consolidados nunca podem aparecer na revisão individual.
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
- Taxa de intermediacao cadastrada permanece como regra comercial; o lançamento documentado é a fonte operacional da comissão efetivamente retida.
- Intermediacao documentada preserva o aluguel como base percentual; IPTU entra no total recebido e no repasse da linha, com base, IPTU, total, comissao, percentual e repasse exibidos separadamente.
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
- Competência original da receita, competência do recebimento e dia de vencimento são campos independentes; referência de IPTU nunca preenche competência de aluguel e um atraso pago não implica inadimplência corrente sem evidência explícita.
- (2026-07-15) A competência original é somente leitura na revisão: a coluna `Ref.` exibe o valor extraído do documento em MM/AAAA e a ausência não bloqueia aprovação. O campo editável, o endpoint de correção pontual e o recheck `receitas_competencias` de 2026-07-14 foram revertidos por extrapolar a anotação original ("era pra ser o mês/ano" — exibição, não edição).
- (2026-07-15) A série mensal dos indicadores atribui receita e aluguel recebido à competência original do aluguel (reatribuição pura na agregação, sem tocar snapshots/checksums): linhas com `competencia_original` anterior e acordos `tipo=atraso` movem valor do mês do recebimento para o mês original. Resumo, ponte financeira e repasse seguem por caixa. Acordos de atraso movem só receita — nunca compuseram o aluguel recebido de mês algum.
- (2026-07-31) Imóvel de receita variável (Airbnb) sem linha na prestação do mês deixa de ser classificado como `desconhecido` e passa a `ocupado`, com `status_origem = cadastro_receita_variavel`. Motivo: as 13 unidades Airbnb do Grand Maracanaú não são listadas nos fechamentos quando não há aluguel fixo a receber; sem linha, a classificação caía em `desconhecido` e poluía a cobertura de jan–mai (a prestação de junho passou a listar as 30 unidades, e por isso só junho classificava). A regra (`classifyOccupancy` recebe `isVariableRevenue`, derivado de `modelo_receita` da vigência) recorre ao cadastro apenas quando não há evidência de rescisão, inadimplência, vacância ou recebimento; nenhum valor financeiro é inventado (aluguel esperado, recebido e receita seguem nulos). Unidade de modelo fixo sem linha continua `desconhecido` (depende do documento). Impacto medido: 65 snapshots (13 Airbnb × jan–mai) saem de `desconhecido`; 31 snapshots sem linha de modelo fixo permanecem `desconhecido`. Reprocessamento pelo backfill preserva `origem=processamento` e só atualiza os checksums afetados (dry-run: 67 updates, 0 insert, fontes intactas).
- (2026-07-31) Ocupação ganha a categoria de apresentação `alugado_app` (rótulo "Alugado por app"): snapshot `ocupado` com `modelo_receita = variavel` é exibido como locação por app, com etiqueta e contagem próprias em Visão geral, Detalhamento por imóvel e Riscos por imóvel, contando como ocupado no numerador. `presentOccupancyStatus` faz a reclassificação apenas na saída do agregador; o status persistido segue `ocupado` (sem migration, sem tocar o enum do banco). Vacância/inadimplência/rescisão explícitas têm prioridade. Verificado no banco: junho exibe 9 unidades do Grand Maracanaú como "Alugado por app" (as 4 Airbnb restantes seguem inadimplentes por marca explícita); maio só passa a exibir as 13 após o backfill da Rota B ser aplicado aos dados.
- (2026-07-31) A reatribuição por competência só ocorre quando a competência de origem tem lastro no histórico exibível (fechamento ou snapshot ≤ mês de referência). Antes, um atraso com `competencia_original` fora da janela (ex.: 04/2025 quitado em 05/2026) criava um mês-fantasma na série mensal — ponto isolado, não selecionável no filtro e com valor 100% de realocação. Agora esse valor permanece no mês do recebimento (sem vazamento; a soma da série é preservada) e a série só materializa competências com lastro. `buildCompetenciaReallocations` recebe o conjunto de meses elegíveis e ignora origens ausentes dele. Diagnóstico: as divergências resumo(caixa)×série(competência) de receita e aluguel recebido são intencionais (decisão de 2026-07-15), não bug; a soma de `receitasPorImovel` (snapshots) < `total_receitas` (fechamento) no mês corrente é esperada — reflete receita não atribuível a imóvel (acordos/atrasos/intermediação sem `imovel_id`).
- Receita sem `imovel_id` persistido permanece pendente mesmo quando código/unidade coincide textualmente; a aprovação exige vínculo explícito e o drawer nunca sobrescreve cadastro sem opção marcada pelo operador.
- Correções operacionais de competência e vínculo usam a RPC transacional `aplicar_correcao_fechamento`; análise, movimentações, validações, eventual imóvel e auditoria confirmam juntas ou sofrem rollback.

- Integracao eGestor suporta multiplas contas com roteamento por empreendimento: `empreendimentos.egestor_conta_id` (null = conta Global) decide o token, a conta disponivel, o plano de contas e o contato usados no lancamento. Plano de contas, conta disponivel e contato sao especificos por conta (ex.: codigo 44 e repasse na conta Global, mas "PESSOAS E ENCARGOS" na MMC) - cruzar contas lancaria na conta de plano errada. O singleton `egestor_configuracoes` migra para a conta "Global" (id fixo `...0001`); contato da imobiliaria passa a viver em `egestor_imobiliaria_contatos (imobiliaria_id, conta_id)`, mantendo `imobiliarias.egestor_contato_id` como legado/fallback apenas para a conta Global. Token nunca trafega no GET (so mascarado) nem em migration (so pela UI).

- O modelo padrao da extracao da prestacao e `gpt-5.5` (default do agente); ele corrige a variancia do `gpt-4o` em tabela densa (GCI saiu de 1/22 para 24 linhas, repasse conciliado). `OPENAI_MODEL` e override local: o pin `gpt-4o` no `.env.local` deve ser removido para restaurar o default; agentes leves (classificador, repasse, despesas, reajuste) permanecem em `gpt-4o-mini`.

- O processamento de pacote roda DESTACADO do request (fire-and-forget no servidor Node/EasyPanel, sem `await` antes de responder 202), com snapshot de progresso em `fechamentos.processamento_*` e acompanhamento por polling no endpoint leve `GET /api/fechamentos/[id]/processamento`. O GET principal do fechamento nao depende dessas colunas (busca resiliente), para nao quebrar a revisao se a migration ainda nao foi aplicada. Job sem atualizacao por 15 min e considerado travado. Fechar a aba nao mata o job; a tela reconecta no reload.

- Notificacoes in-app vivem na tabela `notificacoes` e aparecem no sino do topo (badge de nao-lidas) com toast (sonner) e notificacao do SO (Notifications API, permissao pedida no clique do sino); um poller global de 12s detecta conclusao/falha de analise mesmo fora da tela de processamento. A conclusao/falha do workflow cria a notificacao no servidor.
- Indicadores sao operacionais-financeiros, nao de investimento. A quarta aba e "Receitas por imovel" porque a fonte e a prestacao da competencia, nao um ledger bancario.
- Competencias parciais permanecem visiveis, mas exibem cobertura e qualidade. Ocupacao historica vem de `imovel_competencias`; cadastro atual aparece apenas como "Hoje".
- A lista de fechamentos usa consulta local imediata sobre a colecao carregada: busca e filtros combinaveis, ordenacao em todas as colunas de dados, 25 itens por pagina e estado completo persistido na URL. A tabela preserva alinhamento financeiro e rolagem interna sem causar overflow da pagina.
- O contrato completo de elegibilidade, formulas, snapshots, API, responsividade, testes e rollout esta em `docs/PLAN-indicadores-operacionais.md`.
- `deriveContracts` reconstroi contratos de locacao a partir do historico mensal de ocupacao ja existente do imovel (nao exige reprocessar fechamentos) e exclui imoveis de receita variavel (Airbnb) da derivacao, coerente com a classificacao de ocupacao ja registrada (2026-07-31).
- `lancamentos_competencia` grava competencia de origem e competencia de recebimento como duas colunas independentes por lancamento, dando lastro no fato financeiro ao principio ja registrado (2026-07-15) de que essas competencias nao se confundem.
- A verificacao do modelo de contratos contra o gabarito do cliente usa um arquivo local nao versionado (`tmp/gabaritos/`, nunca commitado) com tolerancia de R$ 0,02; nenhum valor do gabarito e citado neste roadmap (repositorio publico).

- A planilha do cliente e a fonte da verdade dos indicadores. Indicador que a planilha nao traz e reportado como SEM FONTE, nunca comparado contra numero derivado; `aluguelContratado` foi removido do gabarito por ter sido derivado de outro indicador do proprio gabarito (conferia contra si mesmo).
- "Recuperacao de atrasados" na planilha do cliente soma acordo de atraso e acordo de rescisao. Decidido separar: o indicador conta so atraso.
- Divida de competencia anterior nao descreve o ocupante atual quando o devedor e outro ou quando o mes corrente foi quitado. Divida da propria competencia continua prioritaria.
- Linha listada na prestacao sem inquilino, sem aluguel e sem texto de vacancia conta como vago, com procedencia propria (`prestacao_sem_inquilino`) e sem preencher `status_mensal_explicito` -- vacancia inferida nao se passa por explicita.
- Inquilino nomeado na prestacao significa ocupacao. Pagar atrasado descreve pagamento, nao ocupacao.
- Atraso e sempre de mes anterior: origem desconhecida grava nulo (`lancamentos_competencia.competencia_origem` e nullable), nunca a competencia corrente. O mes de origem e lido do campo do acordo e, quando vazio, do texto "VIGENCIA DE <MES> <ANO>" da observacao, exigindo mes unico citado.
- `contrato_valores` guarda uma linha por mudanca de aluguel (acompanha reajuste), nao um valor unico por contrato.

## Historico de ciclos

### 2026-08-11 - César Rêgo julho: escopo, inadimplência, TED, datas eGestor e manuais repetidos

Status: código, migrations e reparo de dados aplicados; correção externa do 9041 pendente.
Job: corrigir os quatro problemas apresentados pelo cliente nos fechamentos César Rêgo de julho e liberar recebimentos manuais repetidos na prévia eGestor.
Outcome entregue: parser marca `SIT=ALUG` sem lançamento como `INADIMPLENCIA` e extrai número/emissão/vencimento do cabeçalho; escopo por empreendimento recalcula totais antes de qualquer consumidor; TED R$ 11,10 é dividida em R$ 5,55 por empreendimento; payload de recebimento usa 10/08/2026 em vencimento/crédito/pagamento quando não há comprovante, sem liquidar automaticamente pagamentos; `origem_chave` substitui a unicidade tipo/categoria e permite vários manuais. Migrations `202608110001`, `202608110002` e `202608110003` aplicadas no Supabase remoto. O reparo v4 grava análise, totais, receitas, rateio TED, snapshots, validações e auditoria na mesma transação e bloqueia todo o commit se houver fechamento incompleto. Pompílio ficou com receita R$ 12.414,16, comissão R$ 510,25, TED R$ 5,55 e repasse R$ 11.898,36; João ficou com receita R$ 1.237,05, comissão R$ 61,85, TED R$ 5,55 e repasse R$ 1.169,65. Snapshots: Pompílio 2 ocupados; João 1 ocupado e 1 inadimplente. A prévia não enviada de Pompílio foi regenerada; o 9041 permaneceu imutável.
Validacao: migrations executadas em transação com rollback e depois aplicadas; dry-run real `2 repaired / 0 divergent`; commit `2 repaired`; dry-run endurecido `0 repaired / 2 unchanged`; smoke transacional da RPC v4 gravou 3 movimentações, 2 snapshots e 10 validações e sofreu rollback; teste transacional confirmou duas linhas `recebimento + repasse_mensal`; PDF real confirmou cabeçalho 10/08/2026 e reconciliação exata; suíte completa `390/390`, typecheck, lint, build, `git diff --check`, validador de schema e checklist mestre passaram.
Decisoes: automático permanece consolidado; manuais podem repetir; comprovante externo prevalece em crédito/pagamento; lançamento já enviado é corrigido manualmente fora do sistema.
Arquivos/docs impactados: parser/tipos, reparo financeiro, eGestor, revisão, reparador, três migrations, testes e docs `02/03/04/06/12`.
Proxima acao: publicar o código da aplicação e editar manualmente o lançamento eGestor 9041 para vencimento, crédito e pagamento em 10/08/2026.

### 2026-08-07 - Indicadores: redesenho das quatro abas e correcao do falso-positivo de inadimplencia

Status: done (codigo e escritas no banco aplicadas; tres itens de dado seguem pendentes de decisao do usuario)
Job: Duas frentes no mesmo ciclo. Primeiro, reimaginar visual e copy da tela de Indicadores (pedido explicito: "muito texto", hierarquia e escolha de graficos). Depois, fazer junho/2026 bater com as planilhas do cliente, tratando a planilha como fonte da verdade.
Outcome entregue: UI das quatro abas reescrita. A Visao geral virou um parecer com ordem de leitura unica: resultado do mes em escala dominante, inadimplencia e ocupacao em segundo posto, valores de apoio numa faixa densa. Sairam nove blocos de prosa (subtitulo da pagina, cinco frases sob os KPIs, tres descricoes de painel); definicao passou a viver exclusivamente em tooltip. A distribuicao de status virou barra segmentada proporcional, comparavel competencia-vs-hoje (antes eram duas listas de contagem); a serie mensal virou linhas sobre o tempo (antes 18 barras com rotulos repetidos tres vezes por linha). Na Conciliacao financeira, o jargao do motor de conciliacao saiu da interface (entradas/saidas de passagem, diferenca nao explicada, ajustes classificados, valores sem classificacao) e o bloco de repasse virou uma conferencia que compara o par comparavel -- calculado com comprovante contra confirmado pelo banco. Em Riscos por imovel, o mapa abre por empreendimento e expande para as unidades (antes uma linha por unidade), a celula agregada conta unidades em risco entre as que tem dado, e a escala virou verde->vermelho sem branco no meio. No Detalhamento, prosa removida e pluralizacao real na contagem. Primitivas `Kpi` e `DataNote` removidas por ficarem orfas.
No dado, cinco defeitos de classificacao corrigidos com TDD. (1) `inadimplencias_acumuladas` chega chaveada so pelo numero do apto e, com competencia nula, marcava como inadimplente o ocupante ATUAL -- pessoa diferente de quem deve. Era o P0 diagnosticado antes e nunca corrigido no nivel do status; das unidades marcadas inadimplentes em junho no escopo do gabarito, a maioria havia pago o mes integral ou era Airbnb. Divida de competencia anterior passa a ceder a tres situacoes: vacancia explicita, devedor diferente do ocupante, e mes corrente quitado. (2) Linha listada na prestacao sem inquilino, sem aluguel e sem texto de vacancia passa a contar como vago (decisao revista do usuario), com procedencia `prestacao_sem_inquilino` distinta de `prestacao_vacancia`. (3) Movimento de passagem passou a se chamar IPTU recebido/pago, porque so IPTU trafega por esses campos hoje. (4) Atraso vindo de acordo nao nasce mais com origem no mes corrente, e a origem passa a ser lida do campo do acordo e, quando ele vem vazio, do texto "VIGENCIA DE <MES> <ANO>" da observacao. (5) A serie de valores do contrato acompanha reajuste: uma linha de `contrato_valores` por mudanca de aluguel, em vez de um valor unico por contrato que descartava o ultimo mes da janela as cegas.
Validacao: suite completa passa (379 testes ao fim do ciclo), typecheck, lint, build de producao e detector de design da skill sem apontamentos. Verificacao contra o gabarito local de junho subiu de 2 para 5 de 7 indicadores verificaveis dentro da tolerancia. Escritas no banco real feitas com autorizacao explicita, uma a uma: migration `202608050001_contratos_locacao.sql`, rematerializacao de `imovel_competencias` (o script confirma `sourceTablesUnchanged: true` em toda execucao), `scripts/backfill-contratos.ts --apply`, e as migrations `202608070001_lancamento_origem_desconhecida.sql` e `202608070002_atraso_competencia_origem.sql`. Nenhum valor do gabarito ou nome de cliente e citado aqui (repositorio publico); duas mensagens de commit que traziam valor monetario foram reescritas antes do push.
Decisoes: a planilha do cliente e a fonte da verdade -- indicador sem numero na planilha e reportado como SEM FONTE em vez de acusar divergencia contra expectativa fabricada, e `aluguelContratado` saiu do gabarito por ser circular (havia sido derivado de outro indicador do proprio gabarito). "Recuperacao de atrasados" na planilha do cliente soma acordo de atraso e de rescisao; decidido separar, com o indicador contando so atraso. Vacancia inferida nunca se passa por explicita: procedencia propria e sem preencher `status_mensal_explicito`. Origem de atraso desconhecida grava nulo (`competencia_origem` virou nullable) em vez da competencia corrente, porque atraso e sempre de mes anterior. Inquilino nomeado na prestacao significa ocupacao: pagar atrasado descreve pagamento, nao ocupacao.
Arquivos/docs impactados: `components/acr/indicadores/**` (quatro abas, primitivas, dois graficos novos), `components/acr/views/indicadores-view.tsx`, `app/globals.css`, `lib/indicadores-domain.ts`, `lib/contratos-derive.ts`, `lib/server/indicadores-snapshots.ts`, `scripts/backfill-contratos.ts`, `scripts/backfill-indicadores-snapshots.ts`, `scripts/verify-competencia.ts`, `supabase/migrations/202608070001_lancamento_origem_desconhecida.sql`, `supabase/migrations/202608070002_atraso_competencia_origem.sql`, `docs/12-execution-roadmap.md`.
Proxima acao: tres unidades do Grand Maracanau tem aluguel zerado em `imoveis.valor_aluguel_esperado` e em `imovel_vigencias.aluguel_contratado` embora tenham contrato ativo; corrigir o cadastro (valores lidos da planilha do cliente) fecha o ultimo indicador monetario de junho e depende de autorizacao do usuario, por ser escrita em dado de cliente. Depois: montar o gabarito de maio a partir das mesmas planilhas, tornar rescisao distinguivel na derivacao para ganhar indicador proprio, e escrever o `DESIGN.md` do sistema visual das quatro abas.

### 2026-08-05 - Fundação de contratos de locação para os indicadores

Status: done (fundação em código; aplicação no banco pendente de autorização do usuário)
Job: Fase 0 + Fase 1 de um plano próprio (`tmp/plans/2026-08-05-junho-bate-indicadores.md`, plano local não versionado) para os indicadores baterem com as planilhas de referência do cliente em junho/2026: substituir a heurística de ocupação/aluguel contratado por uma entidade explícita de contrato, e aproveitar o ciclo para limpar quatro pontos de UI acumulados na tela de Indicadores.
Outcome entregue: na UI, removido o denominador "dos classificados" dos cards de ocupação (jargão sem explicação), as linhas de proveniência "Fonte: ..." deixaram de renderizar em `PanelHeader`/`Kpi` (a prop `source` continua existindo só como documentação de código), o banner de cobertura/confiança do topo da página (`CoverageBanner` e seus helpers exclusivos) foi removido por completo, e o painel "Retenções e inadimplência" foi renomeado para "Despesas e inadimplência". No modelo de dados, a migration `supabase/migrations/202608050001_contratos_locacao.sql` cria três tabelas novas — `contratos_locacao` (histórico de locação por imóvel), `contrato_valores` (linha do tempo de valor por contrato) e `lancamentos_competencia` (fatos financeiros com competência de origem e competência de recebimento como colunas independentes) —; `lib/contratos-derive.ts` (`deriveContracts`) é uma função pura que reconstrói períodos de contrato a partir do histórico de ocupação mensal já existente do imóvel; `scripts/backfill-contratos.ts` é um script idempotente (dry-run por padrão, flag `--apply` para gravar) que popula as três tabelas a partir dos dados atuais; `scripts/verify-competencia.ts` compara os agregados das novas tabelas contra um gabarito local (`tmp/gabaritos/`, nunca commitado) com tolerância de R$ 0,02.
Validação: dry-run (somente leitura, já executado contra o banco real) leu 121 imóveis, 120 ativos, identificou 13 unidades Airbnb (corretamente excluídas da derivação de contrato por serem receita variável) e derivou 113 contratos, 111 valores de contrato conhecidos e 1100 lançamentos financeiros no portfólio — contagens plausíveis e consistentes com o volume esperado. `scripts/verify-competencia.ts` foi escrito e passa no typecheck, mas ainda não rodou contra dado populado (depende da migration e do backfill serem aplicados). Migration e backfill `--apply` NÃO foram executados nesta sessão: aguardam autorização explícita do usuário antes de qualquer escrita no banco real, seguindo a regra já estabelecida do projeto sobre operações de escrita no Supabase.
Decisões: `deriveContracts` reconstrói contratos a partir do histórico mensal já existente (não exige reprocessamento de fechamentos) e exclui imóveis de receita variável (Airbnb) da derivação, coerente com a classificação de ocupação já registrada (2026-07-31). `lancamentos_competencia` grava competência de origem e competência de recebimento como duas colunas independentes por lançamento, dando lastro no fato financeiro ao princípio já registrado (2026-07-15) de que essas competências não se confundem. A verificação contra o gabarito usa um arquivo local não versionado (`tmp/gabaritos/`) e tolerância de R$ 0,02; nenhum valor do gabarito é citado neste roadmap (repositório público).
Arquivos/docs impactados: `supabase/migrations/202608050001_contratos_locacao.sql`, `lib/contratos-derive.ts`, `scripts/backfill-contratos.ts`, `scripts/verify-competencia.ts`, componentes `PanelHeader`/`Kpi`/`CoverageBanner` e o painel "Despesas e inadimplência" na tela de Indicadores, `docs/12-execution-roadmap.md`.
Próxima ação: com autorização explícita do usuário, aplicar a migration `202608050001_contratos_locacao.sql` no Supabase e rodar `scripts/backfill-contratos.ts --apply`; depois rodar `scripts/verify-competencia.ts` contra o gabarito de junho e iterar nas divergências antes de iniciar a Fase 2 (API/views lendo as novas tabelas).

### 2026-07-31 - Mapa de riscos: percentual só aparece quando carrega informação real

Status: done
Job: durante o smoke autenticado do resumo de inadimplência, o usuário notou que células "Ocupado" no mapa mostravam "0% de inadimplência" e "R$ 0,00 não recebido" — obriga o leitor a decodificar uma dupla negativa para descobrir que está tudo em dia, e é redundante já que "Ocupado" sozinho já diz isso.
Outcome entregue: `describeHeatCellDetail` (pura, testada) decide o que mostrar sob o status de cada célula do mapa. Vacância nunca mostra percentual (é binária — 0/100, ver `HeatLegend` — o status já expressa o estado). Inadimplência com 0% e nada em aberto também não mostra número (kind `"oculto"`); só mostra percentual/valor quando carrega informação real: inadimplência parcial/total, ou uma diferença residual mesmo com percentual zerado (preservado o caso "0% mas com diferença", que não é "em dia"). `HeatCell` em `view-mapa.tsx` foi simplificado para consumir o resultado.
Validacao: testes 309/309 (5 novos cobrindo sem_calculo, vac sempre oculto, inad em dia oculto, inad parcial detalhado, 0%-com-diferença detalhado), `tsc`, `lint`, `build`, `api_validator` e checklist verdes. Verificado ao vivo no navegador autenticado: células "Ocupado" em dia (GA0002, 0002526, 0002527) agora mostram só o status, sem "0%"/"R$ 0,00"; células com dado genuinamente ausente continuam mostrando "Sem cálculo financeiro" normalmente.
Decisoes: percentual só aparece quando muda a decisão do leitor (quanto falta, se é parcial ou total); status sozinho já responde "está tudo bem?" sem precisar de número.
Arquivos/docs impactados: `components/acr/indicadores/lib/presentation.ts`, `components/acr/indicadores/lib/presentation.test.ts`, `components/acr/indicadores/tabs/view-mapa.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: observado durante o smoke (fora de escopo desta correção) um número alto de unidades marcadas "inadimplente" na competência com valor em aberto R$ 0,00 ou "—" na lista de resumo — investigar se é qualidade de dado no snapshot (aluguel esperado ausente/zero) antes de tratar como sinal real de inadimplência.

### 2026-07-31 - Pente fino de nomenclatura: tooltips nas colunas abreviadas da revisão

Status: done
Job: na reunião de 30/07 (12:12), o Júnior (em treinamento, cuida do dia a dia com a MMC) achou a nomenclatura confusa, sem lista específica de termos. Levantamento próprio feito contra o código (sem lista externa): as colunas abreviadas das tabelas de receitas por imóvel e intermediação, na tela de revisão, são texto puro sem nenhum `title`/tooltip — uma pessoa nova não tem como saber o que significam sem perguntar.
Outcome entregue: adicionado `title` explicativo a 6 cabeçalhos abreviados (Valor c/ desc., Seg. inc., Ref., Obs, Aluguel/base, Comissão interm.) nas duas tabelas da revisão, sem renomear nenhum rótulo — `Ref.` e `Aluguel/base` são nomes travados pelo mock contract e não podem divergir sem justificativa; os demais não são travados, mas manter a abreviação com tooltip evita reduzir a densidade da tabela (já larga, `min-w-[1320px]`/`min-w-[1180px]`). O subtexto "Aluguel zerado/obs" do card "Inadimplentes" (esse não travado pelo contrato) foi reescrito para "Sem aluguel recebido no mês".
Validacao: testes 304/304 (sem mudança de lógica, só JSX), `tsc`, `lint`, `build`, `api_validator` e checklist verdes. Verificação visual fica para o smoke autenticado (mesma limitação de login já registrada nos ciclos anteriores).
Decisoes: preferir tooltip a renomear quando o rótulo já é curto e a tabela é densa; só reescrever texto livre (subtextos, não cabeçalhos de coluna com posição fixa) quando a abreviação some sem perda de contexto.
Arquivos/docs impactados: `components/acr/views/revisao-view.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: smoke autenticado cobrindo os 8 itens acumulados desta rodada (Ignorar, tooltip de comissão, mapa de inadimplência, tooltips de nomenclatura, César Rêgo sem duplicatas).

### 2026-07-31 - eGestor: um documento quebrado não bloqueia mais o anexo dos demais

Status: done (parcial — depende de ação externa para desbloquear os casos reais)
Job: investigar os anexos pendentes do eGestor (herdado do handoff anterior): 5 fechamentos por permissão `Disco Virtual` e 1 por documento ausente no Storage (`45d0ea82…`, Grand Messejana II junho).
Investigação (read-only, sem escrita no banco nem chamada à API do eGestor):
- Reconferido o estado atual: 5 lançamentos pendentes por `Disco Virtual` (Grand Messejana I entrou na lista desde o handoff anterior) + 1 por documento ausente. Nenhum mudou desde o handoff — ambos os problemas continuam em aberto.
- Para o documento ausente (`45d0ea82…`): baixado o registro dos 2 documentos (`prestacao_contas`, `comprovante_repasse`) e testado o download real do Storage — ambos retornam 404 "Object not found". Listado o bucket inteiro (179 objetos) e a janela exata de tempo em que esses uploads deveriam ter ocorrido (28/07 ~19:58) — nenhum objeto existe sob nenhum nome nessa janela (os uploads de GM I, feitos minutos antes, e de Grand Maracanaú, feitos depois, estão lá normalmente). Não há cópia local em `tmp/pdfs`. Conclusão: os bytes originais não estão em lugar nenhum acessível; não é bug de código recuperável, é reenvio necessário.
- Causa raiz separada e corrigível encontrada: `uploadAnexos` parava no **primeiro** documento que falhasse ao baixar/anexar e nunca tentava os seguintes — um documento quebrado bloqueava o lote inteiro para sempre, mesmo que outro documento do mesmo fechamento fosse perfeitamente anexável.
Outcome entregue: `uploadAnexos` agora tenta todos os documentos do fechamento independentemente uns dos outros; `summarizeAttachmentAttempts` (função pura, testada) decide o resultado final — `enviado` só quando todos anexam, `pendente` com mensagem detalhando quantos/quais falharam e por quê caso contrário. Não altera `status` do lançamento (o financeiro já foi enviado antes; isto é só o anexo).
Validacao: testes 304/304 (4 novos cobrindo sucesso parcial, sucesso total, falha total e zero documentos), `tsc`, `lint`, `build`, `api_validator` e checklist verdes.
Decisoes: não rodar `retry-anexos` nem tocar nos 6 lançamentos reais nesta sessão — a permissão `Disco Virtual` (5 casos) e o reenvio do documento (1 caso) são ações externas que só o usuário pode fazer (configuração de conta no eGestor e reprocessamento do fechamento com o PDF correto); rodar o retry antes disso só repetiria a mesma falha já diagnosticada.
Arquivos/docs impactados: `lib/server/egestor.ts`, `lib/server/egestor.test.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: usuário habilita `Disco Virtual` na conta eGestor correta e reenvia/reprocessa o fechamento `45d0ea82…` com os PDFs corretos de junho/2026 (GM II); depois rodar `retry-anexos` nos 6 lançamentos e confirmar `anexo_status = enviado` sem novo lançamento financeiro.

### 2026-07-31 - Resumo de inadimplência no mapa de riscos por imóvel

Status: done
Job: no feedback da reunião de 30/07, o mapa de riscos ("aquele mapa tá fraco") não respondia direto: qual é a inadimplência, quais apartamentos, em quais meses, e qual a situação de cada um — exigia escanear a grade mês a mês inteira. Shape confirmado com o usuário antes de codar: mostrar mês atual e acumulado separados mas juntos (com total somado), complementando o heatmap existente (sem substituí-lo).
Outcome entregue: `buildDelinquencySummary` (components/acr/indicadores/lib/presentation.ts) deriva, só a partir de `data.heat.linhas` já carregado (nenhuma chamada nova), a inadimplência do mês (soma do valor não pago na competência selecionada), reaproveita `resumo.inadimplenciaAcumulada` já existente para a acumulada, e soma os dois para o total em aberto — sem inventar zero quando falta o aluguel esperado de alguma unidade (usa `sumKnownValues`, mesma disciplina do resto do painel). Um novo painel em `view-mapa.tsx`, visível só no toggle Inadimplência, mostra os três KPIs e lista apenas as unidades inadimplentes na competência selecionada, cada uma com situação (`StatusChip`), os meses em que ficou inadimplente (dentro da janela visível) e o valor em aberto; clicar na unidade rola até a linha correspondente no heatmap abaixo, com respeito a `prefers-reduced-motion`.
Validacao: testes 300/300 (3 novos cobrindo o agregado, incluindo o caso de valor indisponível e o de lista vazia), `tsc`, `lint`, `build`, `api_validator` e checklist verdes. Verificação visual não foi possível nesta sessão (a página exige login autenticado, sem credenciais disponíveis); fica para o smoke autenticado.
Decisoes: inadimplência do mês e acumulada são naturezas diferentes (não pago este mês vs. dívida documental de meses anteriores) e nunca se substituem uma pela outra, mas o total somado é útil e correto de mostrar. A lista só traz quem está inadimplente AGORA (na competência selecionada); quem já quitou não aparece, mesmo com meses inadimplentes no histórico — isso é intencional (a pergunta é "quem está inadimplente", não "quem já esteve").
Arquivos/docs impactados: `components/acr/indicadores/lib/presentation.ts`, `components/acr/indicadores/lib/presentation.test.ts`, `components/acr/indicadores/tabs/view-mapa.tsx`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: smoke autenticado (login necessário) confirmando os três KPIs, a lista e o scroll-to-row; depois eGestor (anexos pendentes) e pente fino de nomenclatura.

### 2026-07-31 - Validação: leitura do Pompílio Gomes é determinística, não é visão computacional

Status: done
Job: na reunião de 30/07 (21:00), levantou-se a hipótese de que a divergência da comissão do Pompílio Gomes viesse de leitura inconsistente do PDF via visão computacional a cada processamento; pediu-se reprocessar o documento 5 vezes para checar.
Outcome: baixado o PDF real do fechamento (`0c41aee2…`, César Rego junho/2026) e rodado o pipeline exato de produção (`extractPdfTextLines` + `parseCesarRegoPrestacao`, o mesmo caminho que `extractPrestacaoAliveFromPdf` usa) 5 vezes sobre os mesmos bytes. As 5 execuções produziram hash SHA-256 idêntico (5 linhas, total 15.022,33, sem variação). A hipótese está descartada: o parser da César Rego é determinístico por design — `isCesarRegoConsolidado` detecta o layout e desvia para o parser de texto/regex puro **antes** de qualquer chamada à OpenAI; não há visão computacional nesse caminho. A causa real da divergência (593,84 vs 494,99) já havia sido encontrada e corrigida no ciclo "Comissão de administração" (base de comissão não recalculada no reparo por empreendimento), não uma inconsistência de leitura.
Validacao: 5/5 execuções com hash idêntico sobre o documento real de produção.
Decisoes: não migrar a César Rego para ingestão via Excel (pedido nas notas da reunião) só por causa desta hipótese — ela não se confirmou; a decisão de formato de documento fica em aberto por outros motivos, se houver.
Arquivos/docs impactados: `docs/12-execution-roadmap.md` (nenhum código alterado).
Proxima acao: redesenho do mapa de inadimplência dos indicadores; itens 6-8 do plano de 30/07 (smoke autenticado, eGestor, nomenclatura).

### 2026-07-31 - Contagem de acordos/rescisões não é mais tratada como valor monetário

Status: done
Job: no vídeo do GM I junho/2026, o alerta "competências de acordos e rescisões" mostrava 3 acordos, mas ao resolver o modal pedia um valor — o operador não sabia se colocava "o valor dos acordos" ou zero. A transcrição da reunião de 30/07 confirma que, no Grand Maracanaú, a equipe efetivamente digitou um valor zerado para se livrar do alerta.
Causa raiz: os rechecks `acordos_competencias` e `duplicate_agreement_payment` usavam `actual`/`expected` — campos monetários formatados como R$ em toda a UI (lista de pendências e modal de resolução) — para guardar uma contagem. "3 acordos" virava "R$ 3,00".
Outcome entregue: os dois rechecks pararam de popular `actual`/`expected`; a contagem já está no texto da mensagem. Sem valor, a pendência aciona automaticamente o fluxo "Ignorar pendência" (entrega de 2026-07-29). Escaneados os 54 fechamentos ativos: todos tinham o campo contaminado (a maioria com 0, cosmético); 6 tinham valor real (>0) causando confusão de verdade, incluindo o GM I junho do vídeo (ainda aberto) e o Maracanaú (já "resolvido" com valor zerado). Reparo de dado aplicado via `scripts/repair-rechecks-contagem.ts`, que toca apenas o array `rechecks` (com concorrência otimista), sem alterar prestação, totais ou status.
Validacao: testes 297/297, `tsc`, `lint`, `build`, `api_validator` e checklist verdes. Reparo aplicado (54/54 fechamentos); dry-run subsequente confirma 0 afetados (idempotente). Recheck do GM I junho verificado ao vivo: `actual: null, expected: null`, mensagem preserva "3 acordo(s)...".
Decisoes: campos monetários (`actual`/`expected`/`difference`) nunca carregam contagem; uma contagem se comunica só pelo texto da mensagem.
Arquivos/docs impactados: `lib/server/package-rechecks.ts`, `lib/server/package-rechecks.test.ts`, `lib/rechecks-contagem.ts`, `lib/rechecks-contagem.test.ts`, `scripts/repair-rechecks-contagem.ts`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: reprocessamento 5× do Pompílio para confirmar leitura consistente e redesenho do mapa de inadimplência dos indicadores.

### 2026-07-31 - Rescisão proporcional não vira desconto integral quando a coluna vem em branco

Status: done
Job: nas anotações da reunião de 30/07, o apto 202 do Grand Maracanaú junho/2026 (rescisão proporcional de 1 dia, R$ 13,33) apareceu classificado como "desconto" de 100%, quando na verdade era aluguel proporcional recebido; a coluna DESCONTO do documento estava em branco para essa linha.
Outcome entregue: `repararDescontoIntegralInconsistente` (package-rechecks.ts) detecta o sinal determinístico — `desconto === aluguel` (100%) e `aluguel_com_desconto + demais componentes` não reconciliando com o `total` da linha, algo que nunca acontece num desconto real (confirmado contra um caso legítimo do mesmo documento, apto 112) — e corrige `desconto` para 0 e `aluguel_com_desconto` para o valor do aluguel. Escaneados todos os fechamentos ativos: o caso era isolado (só essa linha). Reparo do dado histórico aplicado via `scripts/repair-linha-desconto-inconsistente.ts`, que reaproveita `validatePackage` e aborta se qualquer total já confirmado/enviado ao eGestor mudar (guarda de invariância); confirmado que total_receitas, total_despesas, total_comissoes, total_comissao_despesas, total_a_repassar e valor_comprovado permaneceram bit-a-bit idênticos (6.559,24 / 88,88 / 459,15 / 548,03 / 6.011,21 / 6.011,21).
Validacao: testes 295/295, `tsc`, `lint`, `build`, `api_validator` e checklist verdes. Reparo aplicado e verificado idempotente (segunda execução: `unchanged`); scan geral pós-reparo confirma 0 linhas inconsistentes no sistema.
Decisoes: desconto extraído só é confiável quando reconcilia com o total da própria linha; divergência é tratada como erro de leitura, não como fato financeiro. Reparo de dado histórico só é aplicado quando prova, por reconstrução do pipeline real, que nenhum total já comunicado externamente muda.
Arquivos/docs impactados: `lib/server/package-rechecks.ts`, `lib/server/package-rechecks.test.ts`, `scripts/repair-linha-desconto-inconsistente.ts`, `scripts/repair-linha-desconto-inconsistente.test.ts`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: alerta de acordos/rescisões tratando contagem como valor (GM I junho), reprocessamento 5× do Pompílio para confirmar leitura consistente e redesenho do mapa de inadimplência dos indicadores.

### 2026-07-31 - Comissão de administração: base com IPTU e recálculo no reparo por empreendimento

Status: done
Job: na reunião de 30/07, o "Valor calculado" da comissão do Pompílio Gomes junho aparecia como 593,84 sem ninguém conseguir reproduzir a conta; a comissão real era 494,99. Dois problemas: o reparo César Rêgo não recalculava a base ao separar o extrato consolidado por empreendimento (herdava a base do documento inteiro, deixando "aluguel" maior que a receita do fechamento), e a conferência precisava refletir que a imobiliária cobra 4% sobre aluguel + IPTU (apontado pelo cliente e confirmado: 4% × (12.032,74 + 342,04) = 494,99 exato).
Outcome entregue: helper único `lib/comissao.ts` (base = aluguel com desconto quando houver + garagem + água + IPTU + seguro incêndio) usado por `calculateTotals` e pelo reparo; `applyFinancialDimensions` agora recalcula `total_aluguel/garagem/agua/iptu/seguro`, `base_comissao_administracao` e `comissao_administracao_calculada` a partir das linhas restritas do empreendimento. Re-reparo aplicado no Supabase (9 fechamentos César regravados; dry-run subsequente 0 repaired / 54 unchanged). Tooltip no "Valor calculado" da revisão decompõe a base, mostra a taxa e orienta conferir contra a tabela — divergência de leitura fica visível na hora. Relatório do reparador passou a registrar base e comissão calculada no antes/depois.
Validacao: Pompílio junho no banco: base 14.845,97 → 12.374,78 e valor calculado 593,84 → 494,99 (= comissão real). Testes 291/291, `tsc`, `lint` e `eslint` no arquivo da revisão verdes.
Decisoes: a base da comissão nunca é herdada de documento consolidado; é sempre recalculada das linhas do próprio fechamento e inclui o IPTU. A taxa cadastrada da César Rego permanece 4% (a conta fecha com a base correta).
Arquivos/docs impactados: `lib/comissao.ts`, `lib/comissao.test.ts`, `lib/indicadores-repair.ts`, `lib/indicadores-repair.test.ts`, `lib/server/package-rechecks.ts`, `scripts/repair-indicadores-confiabilidade.ts`, `components/acr/views/revisao-view.tsx`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: apto 202 Maracanaú junho (proporcional de rescisão classificado como desconto), alerta de acordos/rescisões tratando contagem como valor, reprocessamento 5× do Pompílio para confirmar leitura consistente e redesenho do mapa de inadimplência dos indicadores.

### 2026-07-29 - Revisão: "Ignorar" pendência sem valor no modal de resolução

Status: done
Job: no feedback da reunião (César Rêgo/Pompílio e José Walter), os alertas de documento opcional (relatório de locação/reajuste, despesas e comprovantes) são falso-positivos para imobiliárias com extrato consolidado, e o modal de resolução forçava informar um valor manual — botar zero sujava a auditoria e passava a impressão de alterar a prestação.
Outcome entregue: o `ResolveConflictModal` detecta pendência sem valor a decidir (sem valor esperado/encontrado/diferença) e passa a exibir apenas a justificativa e o botão "Ignorar pendência", enviando `valor_oficial: null`. O endpoint `/api/validacoes/[id]/resolver` já não altera a prestação (só atualiza status e grava auditoria), então "Ignorar" apenas libera a pendência de forma rastreável, sem gravar valor espúrio.
Validacao: testes 288/288, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, checklist e `git diff --check` verdes. Verificação visual do modal fica para o smoke autenticado (o Mock Mode cobre só a extração da IA, não a revisão).
Decisoes: pendência sem número não deve forçar valor; a ação é ignorar com justificativa, sem tocar na prestação. Renomear os alertas por imobiliária (feedback inicial) foi descartado em favor de resolver a raiz no fluxo de resolução.
Arquivos/docs impactados: `components/acr/resolve-conflict-modal.tsx`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: itens restantes do feedback da reunião — inadimplência acumulada puxando coluna errada (GM I junho), transparência da comissão administrativa calculada (593,84 vs soma das linhas) e contagem de acordos/rescisões tratada como valor. Smoke autenticado do "Ignorar" numa revisão César Rêgo/José Walter com alerta de documento.

### 2026-07-28 - César Rêgo: fonte única de mapeamento, guarda de escopo e commit do reparo

Status: done
Job: impedir que a revisão peça para criar/vincular unidades César Rêgo já cadastradas (que gerava duplicatas na tela de imóveis), reparar os vínculos históricos e remover os cadastros incorretos.
Outcome entregue: mapeamento canônico código→empreendimento consolidado em `lib/cesar-rego-properties.ts` (0002520/0002521 → João Cordeiro; 0002526/0002527 → Galpão Pompílio Gomes), consumido por `indicadores-repair` e pela guarda de criação em `vincular-imovel-fechamento` (bloqueia criar código César Rêgo no empreendimento errado com HTTP 409 e mensagem acionável). O reparo histórico passou a vincular as linhas aos cadastros existentes e a reparar a parcela reconciliada mesmo quando outra parcela não tem fechamento de destino. O reparo foi commitado no Supabase (8 fechamentos reparados, idempotente na segunda execução) e os 2 cadastros incorretos (`ec28fc98…`, `eac046a2…`) foram excluídos após reconferência (0 movimentações/acordos/IPTU), cascateando 12 snapshots + 2 vigências sem tocar os 4 canônicos.
Causa raiz e correção adicional: o `--commit` falhava com erro mascarado (`[object Object]`). Causa real: a RPC `aplicar_reparo_indicadores_v2` só aceita `receita_aluguel` em `p_receitas`, mas `commitRecords` enviava também as linhas de rateio da TED (tipo `despesa`) produzidas por `buildPrestacaoMovimentacoes`. Corrigido com `buildReparoReceitas`, que filtra `p_receitas` para `receita_aluguel` (as despesas de TED ficam a cargo do reprocessamento completo); `toError` deixou de achatar erros do Supabase em `[object Object]`.
Validacao: testes 280/280, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `api_validator` (4 passed, 0 critical), checklist mestre 6/6 e `git diff --check` verdes. Verificação remota read-only pós-reparo: 0 receitas César Rêgo sem vínculo válido (era 16) e 0 cadastros no empreendimento errado (era 2); os 4 cadastros César ativos batem com o empreendimento canônico, sem duplicatas.
Decisoes: o mapeamento César Rêgo é fonte única; criar código canônico no empreendimento errado é bloqueado no servidor, não corrigido silenciosamente. Janeiro mantém 0002520/0002521 como lacuna de cobertura (sem fechamento de destino), sem rateio nem zero inventado.
Arquivos/docs impactados: `lib/cesar-rego-properties.ts`, `lib/cesar-rego-properties.test.ts`, `lib/indicadores-repair.ts`, `lib/server/persist-package.ts`, `lib/server/vincular-imovel-fechamento.ts`, `scripts/repair-indicadores-confiabilidade.ts`, `scripts/repair-indicadores-confiabilidade.test.ts`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: smoke autenticado nas revisões César Rêgo de janeiro, março e junho (sem banner para criar/vincular unidade já cadastrada e sem duplicatas na busca de imóveis); concluir os anexos pendentes no eGestor (permissão Disco Virtual + arquivo ausente no Storage do fechamento `45d0ea82-6eca-428b-846c-34614f65b011`).

### 2026-07-28 - Fechamentos: breakdown consistente de receitas e despesas

Status: done
Job: eliminar a variação do breakdown de “Outras despesas” entre fechamentos e incluir acordos/rescisões na quebra superior de receitas.
Outcome entregue: os cards de Receitas, Comissão de administração e Outras despesas agora usam a mesma estrutura em todo fechamento, inclusive quando não há linhas por imóvel. Acordos, Rescisões, Inadimplência paga e Outros recebimentos são derivados de `acordos_rescisoes_recebidos`; Intermediação continua em categoria própria. Para despesas, o documento específico é priorizado quando define o total; caso só exista o consolidado, a parcela não discriminada aparece explicitamente em “Outros”. Comissão e intermediação legadas são excluídas do balde de despesas. A contagem do fluxo usa os itens efetivamente apresentados.
Validacao: testes focados 26/26 e suíte completa 276/276 passaram, além de `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build`. QA autenticada no fechamento Grand Messejana II maio/2026 confirmou Rescisões de R$ 935,98 na quebra de receitas, cinco categorias e oito itens de despesas fechando R$ 3.320,95, popover acessível com descrição/referência/valor, página sem overflow e zero erro no console. `ux_audit.py` passou; o checker estático manteve 9 achados preexistentes fora do escopo. Checklist mestre passou Segurança, Lint, Schema, Testes, UX e SEO (6/6).
Decisoes: breakdown é contrato visual estável, não fallback opcional. Valores de acordos/rescisões são apenas apresentados como componentes da receita consolidada e não são somados novamente aos totais. Quando a fonte não discrimina despesas, a interface explicita a limitação sem inventar categorias.
Arquivos/docs impactados: `lib/fechamento-operacional.ts`, `lib/fechamento-operacional.test.ts`, `components/acr/expense-breakdown.tsx`, `components/acr/views/revisao-view.tsx`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: publicar a `main` e repetir o smoke no domínio implantado em um fechamento com acordo e outro com apenas total consolidado de despesas.

### 2026-07-28 - Indicadores: histórico mensal por unidade legível

Status: done
Job: remover a repetição de “Histórico reconstruído” no mapa de riscos e tornar evidente o histórico mensal de cada unidade.
Outcome entregue: cada linha resume meses registrados e meses com status definido; as células priorizam o estado mensal, explicam ausência com “Sem dados no mês” e distinguem indisponibilidade de zero. O selo repetitivo saiu do mapa e do banner. A origem necessária para auditoria passou a se chamar “Importado de documentos” no detalhamento e no CSV. Qualidade parcial e ausência de vínculo usam “Dados parciais” e “Vínculo pendente”. O mapa preserva a coluna “Hoje” e a rolagem horizontal interna.
Validacao: teste focado 5/5, suíte completa 273/273, `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build` passaram. QA autenticada em 1280 px confirmou ausência de overflow da página, rolagem interna do mapa, foco na região rolável, alternância inadimplência/vacância, ausência do termo removido e nenhum erro no console. `ux_audit.py` passou; o verificador estático de acessibilidade manteve 9 apontamentos preexistentes fora dos arquivos alterados. Checklist mestre passou Segurança, Lint, Schema, Testes, UX e SEO (6/6).
Decisoes: “Histórico reconstruído” não deve ocupar cada célula nem o banner de confiança. A leitura principal é o estado da unidade em cada competência; registros sem status ficam explícitos e não contam como histórico classificado.
Arquivos/docs impactados: `components/acr/indicadores/tabs/view-mapa.tsx`, `components/acr/indicadores/tabs/view-registro.tsx`, `components/acr/indicadores/primitives/dashboard-ui.tsx`, `components/acr/indicadores/lib/presentation.ts`, `components/acr/indicadores/lib/presentation.test.ts`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: publicar a `main` e executar smoke no domínio implantado em “Riscos por imóvel”, verificando uma unidade com meses ausentes e outra com registros sem status.

### 2026-07-28 - Indicadores: correção de overflow e simplificação do banner

Status: concluído e validado localmente.
Job: corrigir o corte horizontal dos quatro filtros e da cobertura em `/indicadores`, além de retirar do banner a ressalva técnica sobre valores sem classificação.
Outcome entregue: o título só divide a linha com os filtros em telas extra largas; entre tablet e desktop os campos usam a largura disponível em grade responsiva. O banner passou de `flex` com grade rígida para duas colunas flexíveis, e a cobertura usa 2, 3 ou 4 colunas conforme o espaço. Os motivos técnicos continuam no DTO e na conciliação, mas deixam de ser repetidos no topo para o cliente.
Validação: navegador autenticado em 1280 px confirmou filtros completos, cobertura sem corte, `scrollWidth = clientWidth = 1280`, texto retirado e zero erro de console. Suíte completa 272/272, typecheck, lint e build passaram. A auditoria UX passou; o checker geral de acessibilidade não apontou ocorrência nos arquivos alterados e manteve 9 achados preexistentes fora deste escopo.
Decisões: não esconder `Com divergência`, contagens ou lacunas; remover apenas a justificativa técnica redundante. A quebra responsiva é orientada pela área útil após a sidebar, não apenas pela largura total da viewport.
Arquivos/docs impactados: `components/acr/views/indicadores-view.tsx`, `components/acr/indicadores/primitives/dashboard-ui.tsx`, teste de apresentação e docs 02/06/12.
Próxima ação: publicar a correção e repetir o smoke no domínio implantado.

### 2026-07-28 - Correções a partir de vídeos de revisão (vínculo, referência multi-mês, vencimento, lançamento manual)

Status: concluído e validado em produção. Migrations aplicadas, dias de vencimento configurados e fluxo exercitado em navegador com fechamento real.
Job: quatro correções levantadas em vídeos do operador — (B) busca de vínculo de imóvel não casava código com zeros à esquerda; (C) inquilino pagando 2 meses de aluguel tinha só 1 competência registrada; (D) sem comprovante, o vencimento no eGestor caía na própria competência; (A) não havia como adicionar um lançamento manual à prévia eGestor.
Outcome entregue:
- **B**: `lib/codigo-imovel.ts` (`normalizeCodigoImovel`, remove zeros à esquerda de sequências de dígitos) aplicada no auto-vínculo (`fechamento-imoveis.ts` `findExactCandidates`) e na busca do drawer (`fechamento-vinculos-drawer-state.ts` `filterCandidates`). `normalizeCadastroKey` (nomes) intacta.
- **C**: `cesar-rego-parser.ts` `buildReceitas` passa a emitir UMA linha por mês de aluguel quando o inquilino paga 2+ meses (split), atribuindo receita/aluguel à competência certa nos indicadores; caminho comum (0-1 mês) idêntico ao anterior. Display: `key` da linha inclui competência; contagens de ocupação/média usam lista deduplicada por apto (totais somados seguem sobre todas as linhas). +3 testes.
- **D**: nova coluna `regras_comerciais.dia_vencimento_padrao` (migration `202607280001`); `egestor.ts` `buildPayload` calcula `dtVenc` no dia configurado do mês seguinte à competência quando não há comprovante (fallback = competência, comportamento antigo); helper `proximoVencimento` (+4 testes) e `getDiaVencimentoPadrao` (resiliente). Campo exposto no form/tabela de regras comerciais (`imoveis-view.tsx`, schema `cadastros.ts`, rota `regras-comerciais`).
- **A**: coluna `egestor_lancamentos.origem_manual` (migration `202607280002`); helpers `addManualEgestorLancamento`/`deleteManualEgestorLancamento`; rotas `POST .../egestor/lancamentos` e `DELETE .../egestor/lancamentos/[lancamentoId]`; "Gerar prévia" preserva linhas manuais; UI de adicionar/remover linha na prévia (`revisao-view.tsx`).
Validação: `pnpm test` 233/233 (+7 novos), `npx tsc --noEmit` sem erros novos (persiste apenas o erro pré-existente `persist-package.ts(354)`, tolerado por `ignoreBuildErrors`), `pnpm lint` e `pnpm build` limpos. Migrations `202607280001`/`202607280002` aplicadas via psql/pooler; dias de vencimento gravados nas regras comerciais (Galpao Jose Walter=12, Galpão Pompilio Gomes=10). Validado em navegador no fechamento real Galpao Jose Walter/Mai-2026: prévia eGestor gerou `dtVenc=2026-06-12` (dia 12 do mês seguinte, sem comprovante) com `dtComp=2026-05-01`; lançamento manual IPTU R$445,95 criado (`origem_manual=true`, validado), preservado ao regenerar a prévia e removido pela lixeira; gate de aprovação sem competência original também confirmado. Estado de teste revertido ao original ao final (nada enviado ao eGestor).
Decisões: C resolvido por **split de linhas** (atribuição correta por mês), não por string combinada — `competencia_original` é chave de mês único consumida por persistência/indicadores/gates e regex ancorado quebraria com 2 meses. D **por regra comercial** (imobiliária × empreendimento), não hardcode — o dia varia por empreendimento. Caminho da IA (layouts não-Cesar-Rego) não recebeu o split nesta passada (evitar instabilidade de extração difícil de verificar).
Arquivos/docs impactados: `lib/codigo-imovel.ts`, `lib/server/fechamento-imoveis.ts`, `components/acr/fechamento-vinculos-drawer-state.ts`, `lib/server/cesar-rego-parser.ts` (+test), `components/acr/views/revisao-view.tsx`, `components/acr/views/imoveis-view.tsx`, `lib/cadastros-types.ts`, `lib/server/cadastros.ts`, `app/api/cadastros/regras-comerciais/route.ts`, `lib/server/egestor.ts` (+test), `lib/egestor-types.ts`, `app/api/fechamentos/[id]/egestor/lancamentos/route.ts` (+ `[lancamentoId]`), `supabase/migrations/202607280001_*.sql`, `supabase/migrations/202607280002_*.sql`.
Próxima ação: nada bloqueante. Falta apenas exercitar em navegador o split de competência (C) quando aparecer um fechamento real com aluguel atrasado de 2+ meses (via parser Cesar Rego) — coberto por testes unitários, mas ainda não visto na tela. Avaliar depois se o caminho da IA (layouts não-Cesar-Rego) também deve emitir o split.

### 2026-07-24 - Rateio da TED (tarifa bancária) igual por imóvel

Status: código concluído; rollout depende de reprocessar fechamentos com TED itemizada.
Job: ratear a TED/tarifa bancária itemizada igualmente entre os imóveis da prestação, refletindo nas movimentações por imóvel e como despesa agregada no eGestor (reverte a decisão anterior de "sem rateio").
Outcome entregue: funções puras em `lib/despesas-locador.ts` (`ehTarifaBancaria`, `valorTedItemizada`, `ratearIgualmente` por maior resto, `ratearTedPorImovel`); `buildPrestacaoMovimentacoes` passa a anexar uma movimentação `despesa/tarifa_bancaria` por imóvel (soma exata da TED, sem alterar totais); `buildEgestorDrafts` inclui uma despesa agregada "Tarifa bancaria (TED)" (categoria `outras_despesas`), fora de contas `somente_recebimento`.
Validação: `pnpm lint`, `pnpm test` (226/226, +10 novos) e `pnpm build` passaram. Confirmado que indicadores/gates/vínculo filtram por `tipo_movimentacao` específico e usam `analise_completa`, então as novas movimentações de despesa não afetam esses números.
Decisões: base **igual por imóvel**; escopo **só tarifa bancária**; rateia **só quando a TED vem itemizada** (resíduo "Taxas e outros retidos" não rateia); eGestor permanece agregado (TED como uma despesa). ADR-0001 permanece (TED continua despesa do locador).
Arquivos/docs impactados: `lib/despesas-locador.ts` (+test), `lib/server/persist-package.ts` (+test), `lib/server/egestor.ts` (+test), `CONTEXT.md`, `docs/12-execution-roadmap.md`.
Próxima ação: fechamentos já fechados só passam a ratear se reprocessados; novos já saem rateados. Reprocessar histórico é opcional e caso a caso.

### 2026-07-24 - Rollout em produção do alias LOCMAIS/LOCMAIS II

Status: done.
Job: aplicar em produção a migration `202607240001_empreendimento_aliases.sql` e o alias real de "LOCMAIS II" para a regra comercial de LOCMAIS.
Outcome entregue: migration aplicada (coluna `aliases` confirmada via `information_schema`). A investigação em produção revelou uma divergência do plano original: existem três registros "locmais" — "LOCMAIS" (`ae2d3019...`, ativo, com a regra comercial real 7%/60% e 6 fechamentos vinculados), "Locmais" (`cdff2cdc...`, inativo desde a dedup de acentos de 2026-06-25) e "LOCMAIS II" (`6a4d2927...`, ativo, criado em 2026-07-16, órfão — zero vínculos em `imoveis`/`fechamentos`/`regras_comerciais`). O alias foi gravado no registro correto e ativo ("LOCMAIS", não "Locmais" como o plano assumia); o registro órfão "LOCMAIS II" foi desativado (`ativo=false`, reversível).
Validação: `select` de conferência confirmou os três registros no estado esperado após as escritas.
Decisões: LOCMAIS II ainda está em obras — só LOCMAIS (fase I) está em operação hoje. O alias foi aplicado preventivamente mesmo sem uso imediato, para que o primeiro fechamento real de LOCMAIS II já resolva para a regra comercial correta em vez de repetir o footgun. Cada escrita em produção (alias + desativação do órfão) foi autorizada nomeadamente pelo operador antes de rodar, dado que investigação revelou dados diferentes do que o plano previa.
Arquivos/docs impactados: dado de produção (fora do Git) em `public.empreendimentos`; `docs/12-execution-roadmap.md`.
Próxima ação: nenhuma pendente — revisitar apenas quando LOCMAIS II entrar em operação (ver "Proxima acao recomendada").

### 2026-07-24 - Alias de empreendimento (LOCMAIS II herda a regra de LOCMAIS)

Status: código concluído; aplicação da migration e do dado de alias em produção pendentes.
Job: responder se a regra comercial de LOCMAIS vale para "LOCMAIS II" — hoje não valia: o rótulo "LOCMAIS II" não batia com o nome normalizado "Locmais" e o sistema criava silenciosamente um empreendimento novo sem `regras_comerciais`, pulando a conferência da comissão de administração.
Outcome entregue: nova coluna `aliases text[]` em `empreendimentos`; helper `matchesEmpreendimento` (`lib/server/cadastros.ts`) casa um rótulo tanto pelo nome quanto por qualquer alias cadastrado, ambos normalizados; as duas trilhas de resolução (`findOrCreateEmpreendimento` em `lib/server/persist-prestacao.ts` e `lib/server/persist-package.ts`, antes duplicadas byte a byte) passam a usar o helper compartilhado.
Validação: `pnpm lint`, suíte completa (`pnpm test`, 216/216, incluindo os novos casos de `matchesEmpreendimento`) e `pnpm build` passaram.
Decisões: LOCMAIS e LOCMAIS II são o mesmo empreendimento para efeito de regras comerciais — LOCMAIS II deve resolver para o mesmo `empreendimento_id`/regra de LOCMAIS (Alive, 7% admin / 60% intermediação), não um registro próprio. A decisão sobre a TED de R$ 11,10 permanece em aberto e continua como bloqueio explícito, sem rateio automático. Um guardrail genérico para empreendimento novo sem regra comercial (hoje pula a conferência em silêncio) ficou fora de escopo por decisão do operador. O alias real (`LOCMAIS II` apontando para o registro `Locmais`) é dado de produção, aplicado fora do Git (repositório é público).
Arquivos/docs impactados: `supabase/migrations/202607240001_empreendimento_aliases.sql`, `lib/server/cadastros.ts`, `lib/server/cadastros.test.ts`, `lib/server/persist-prestacao.ts`, `lib/server/persist-package.ts`, `docs/12-execution-roadmap.md`.
Próxima ação: aplicar a migration em produção e, via psql (pooler us-east-2, autorização explícita por operação de escrita), gravar `aliases = array['LOCMAIS II']` no registro `Locmais`; depois processar um fechamento real rotulado "LOCMAIS II" e confirmar que resolve para o mesmo empreendimento e que a comissão de administração é conferida (7%/60%), não pulada.

### 2026-07-17 - Aprovação de receita legada sem competência original

Status: código concluído; publicação pendente.
Job: corrigir o fechamento Plural / Galpão José Walter / maio de 2026, que aparecia sem bloqueios na revisão mas não aprovava.
Outcome entregue: o gate de consistência continua exigindo movimentação e vínculo de imóvel compatíveis, mas deixa de comparar `data_competencia` quando o documento não trouxe `competencia_original`, conforme a decisão vigente de que essa ausência não bloqueia aprovação. Um teste de regressão cobre a combinação legada `competencia_original=null` com movimentação já persistida no mês do fechamento.
Validação: o teste focado falhou antes da correção e passou depois (2/2); o gate foi executado contra o fechamento real `e6f5cd8a-1081-4294-82ce-205883a2cfe8` e retornou `READY`, sem escrita ou aprovação remota. A suíte completa passou 211/211, assim como `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build`. O checklist mestre passou 5/6; o único gate vermelho foi um débito preexistente e fora do escopo no SEO de `indicadores-view.tsx` (meta description e Open Graph ausentes).
Decisões: ausência de competência original não invalida uma movimentação já vinculada; movimentação ausente e `imovel_id` divergente permanecem bloqueantes.
Arquivos/docs impactados: `lib/server/fechamento-approval-gates.ts`, `lib/server/fechamento-approval-gates.test.ts`, `docs/12-execution-roadmap.md`.
Próxima ação: publicar a branch, repetir o clique autenticado no deployment e confirmar a mudança de status sem erro.

### 2026-07-14 - Hotfix de arquivo rejeitado na classificação

Status: código concluído; novo upload real pendente.
Job: corrigir o erro `400 The file you uploaded is badly formatted or corrupted` ocorrido em Cesar Rego / Galpão Pompílio Gomes / maio de 2026 antes da classificação do primeiro documento.
Outcome entregue: o upload não reutiliza mais MIME vazio ou incorreto do navegador. PDF e Excel são identificados pela extensão/tipo e validados pela assinatura binária; arquivos válidos recebem MIME canônico antes da chamada à IA, enquanto conteúdo incompatível é bloqueado localmente. Rejeições externas agora informam em português qual arquivo precisa ser exportado novamente.
Validação: reprodução mínima confirmou que um PDF válido com MIME vazio seguia como `data:;base64`; o teste ficou verde após a normalização. Suíte completa 211/211, typecheck, lint, build de produção e checklist mestre 6/6 passaram.
Decisões: não alterar o contrato visual da tela de processamento; a correção fica na fronteira de entrada do backend e melhora a mensagem existente. O arquivo original da tentativa falha não é persistido antes da classificação, portanto não foi possível provar remotamente se ele tinha MIME vazio ou estava realmente corrompido; ambos os casos agora têm tratamento determinístico.
Arquivos/docs impactados: `lib/server/package-workflow.ts`, teste de regressão, critérios de aceitação e este roadmap.
Próxima ação: publicar o hotfix e repetir o upload do mesmo pacote; se o conteúdo estiver realmente danificado, exportar apenas o arquivo nominalmente indicado pela nova mensagem.

### 2026-07-28 - Confiabilidade documental e correção integral dos indicadores

Status: rollout de dados e QA autenticada concluídos; publicação externa do
código pendente no host da aplicação.

Job: tornar `/indicadores` apresentável ao cliente com fonte rastreável,
conceitos estáveis, números exatos e lacunas explícitas.

Outcome entregue: migration aditiva com vigências históricas, modelos de receita
e AP0361/Fernando Rocha até março com aluguel desconhecido `null`; canonização
segura de Alive; fonte documental SHA-256 compartilhável e vínculos duplicados
preservados; persistência idempotente; snapshots v2; DTO/API com
`statusConfianca`, cobertura de fechamentos/contratos/comprovantes e separação
de aluguel da competência, atrasos, outros recebimentos e passagem. O parser
César Rêgo usa `ALUGUÉIS CREDITADOS`, inclui tarifas e distribui unidades; GM II
março preserva R$ 707,37 de fevereiro e R$ 705,89 inadimplentes em março; Plural
maio/junho separa saída R$ 891,90 e entrada R$ 445,95 de IPTU. Junho deixa de
contabilizar o mesmo extrato César Rêgo duas vezes. A UI usa nomenclatura final,
moeda completa, banner único, ajuda e tooltips/popovers acessíveis.

Validação executada: antes da escrita foi criado o backup lógico
`tmp/backups/acr-qeblersdkfzsogqptbdh-pre-indicadores-20260728T1820Z.dump`
(SHA-256
`039c3d435451aa07b500d725b265b402311b802457048519dfa3d74bb1d25778`).
As migrations pendentes e as migrations
`202607280003_indicadores_confiabilidade.sql` e
`202607280004_airbnb_receita_variavel.sql` foram aplicadas. O hash documental
cobriu 104/104 documentos, 46 fontes únicas, 35 redundâncias no mesmo fechamento
e 0 falhas. O reparo passou pelos canários de março e junho e terminou
idempotente: 0 novos reparos, 53 sem mudança, 1 incompleto e 0 divergentes. O
backfill final contém 731 snapshots (625 com linha documental e 106 imóveis
esperados sem linha), 731/731 chaves disponíveis, 0 duplicidades, 0 checksums
inválidos, 0 linhas sem vínculo e 54/54 pontes reconciliadas; a repetição propôs
0 inserts e 0 updates. A suíte da implementação fechou 246/246 e, após a
integração com as correções recentes da `main`, fechou 272/272; typecheck, lint,
build e checklist 6/6 passaram. A QA autenticada percorreu as quatro abas em
360, 390, 768, 1024, 1280
e 1440 px; clique, setas, Enter, Escape, foco, toque, popovers, moeda completa,
ausência/zero/não aplicável e CSV foram verificados.

Na integração com `main`, essas duas migrations de indicadores foram
renumeradas de `001`/`002` para `003`/`004`, sem alterar o SQL, para não colidir
com as migrations já existentes de vencimento comercial e lançamento manual.

Decisões: fechamento aprovado é verdade financeira; comprovante bancário é
verdade do pagamento; vigência histórica é verdade do contrato; diferença
acima de R$ 0,01 impede confirmação. César Rêgo janeiro permanece
`Incompleto`, pois 0002520/0002521 não têm fechamento de destino — nenhum zero
ou rateio inventado. A tarifa de R$ 11,10 de César Rêgo junho é subtraída uma
única vez; a ponte consolidada fecha em R$ 0,00. Treze unidades Airbnb são
receita variável e exibem `Não se aplica`. O painel mantém `Com divergência`
quando a realização do aluguel possui valor sem classificação, mesmo com a
ponte financeira reconciliada.

Arquivos/docs impactados: migration
`202607280003_indicadores_confiabilidade.sql`,
`202607280004_airbnb_receita_variavel.sql`, persistência e backfill
documental, parser César Rêgo, reparador de indicadores, domínio/agregação/API,
quatro abas e docs 02/03/06/12/PLAN.

Próxima ação: publicar o código validado no host da aplicação e executar smoke
no domínio implantado; solicitar apenas a documentação que falta para César
Rêgo janeiro e para classificar os gaps mensais remanescentes.

### 2026-07-14 - Fechamentos operacionais, competências e vínculos

Status: código concluído; rollout e QA autenticada pendentes.
Job: priorizar o fechamento operacional e corrigir competência de receitas atrasadas, IPTU recebido no Pompílio, despesas sem discriminação, comissão GM II, imóveis não vinculados e cópia de extração por IA, sem alterar indicadores ou eGestor.
Outcome entregue: receitas agora separam competência original, recebimento e dia de vencimento; `10` isolado não vira mês/ano e referências de IPTU não preenchem aluguel. Competência ausente aparece como “Não informada” e bloqueia aprovação. Movimentações de aluguel usam a competência original. O Pompílio reconhece IPTU de passagem novo ou legado e mostra R$ 342,04 apenas na quebra de Receitas. Despesas são agrupadas com detalhe acessível; GM II discrimina comissão regular e de acordos; o drawer resolve um vínculo de imóvel por vez com comparação e opt-in de atualização. Aprovação exige `imovel_id` persistido. Correções manuais e o reparo determinístico usam transação única com auditoria e trava de invariância financeira.
Validacao: 207/207 testes passaram com o runner compatível com o sandbox; `pnpm exec tsc --noEmit`, `pnpm lint` e checklist mestre 6/6 passaram. A revisão final adicionou identidade persistida por linha de receita, preservação dos bloqueios históricos de acordo e guardas contra referências de IPTU confundidas com competência ou valor recebido. O validador de schema não detectou arquivos pelo padrão próprio, portanto a migration ainda requer aplicação/validação real em staging. `next build` não concluiu porque o sandbox não acessa Google Fonts; servidor local e Supabase remoto também ficaram indisponíveis no ambiente, logo QA visual e dry-run real permanecem gates explícitos. Nenhuma escrita remota foi executada.
Decisoes: março pode ser competência original de uma receita recebida no fechamento de maio; isso não altera o caixa de maio nem cria inadimplência corrente automaticamente. IPTU de passagem é explicação operacional, não mudança de total. Vínculo por semelhança textual não basta. Indicadores, eGestor e o módulo autônomo de IPTU ficaram fora deste ciclo.
Arquivos/docs impactados: domínio de competência/fechamento, persistência e rechecks, APIs de correção e aprovação, drawer de vínculos, revisão, script de reparo, migration `202607140001_correcoes_fechamento_atomicas.sql`, `CONTEXT.md` e docs 02/03/04/06/12.
Proxima acao: aplicar a migration em staging, rodar o reparo em dry-run, revisar o relatório e só então usar `--commit`; depois validar os quatro fechamentos no navegador em desktop/mobile/teclado.

### 2026-07-14 - Refinamento dos dados principais dos indicadores

Status: done
Job: corrigir os principais pontos de confiança identificados na auditoria individual dos indicadores.
Outcome entregue: diferenca de repasse preserva `comprovado externo - apurado` com extrato separado; filtro por imovel identifica a origem snapshot; lacunas listam pares, imoveis e unidades afetados; outros ajustes mostram valor, percentual e acao; referencia numerica vira `Dia N` na tela/CSV; vacancia usa escala binaria 0/100.
Validacao: 73/73 testes focados e 172/172 na suite completa; typecheck, lint, build e checklist 6/6; verificador confirmou 565/565 snapshots, zero duplicidade, checksums validos, 45/45 reconciliacoes e fontes intactas; navegador autenticado confirmou dados reais, filtro isolado, CSV, escala de vacancia, 390 px sem overflow e console limpo.
Decisoes: valores informados no extrato nao apagam a comparacao do comprovante externo; escala continua de seis faixas fica exclusiva da inadimplencia.
Arquivos/docs impactados: agregacao e tipos de indicadores, servidor, quatro abas, testes de apresentacao, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md` e `docs/PLAN-indicadores-operacionais.md`.
Proxima acao: corrigir na origem os seis pares ausentes, os 19 snapshots desconhecidos e as seis linhas sem vinculo exibidas em 05/2026.

### 2026-07-13 - Consulta operacional da lista de fechamentos

Status: done.
Job: melhorar a tabela de `/fechamentos` com busca, filtros, ordenacao, paginacao e persistencia da consulta.
Outcome entregue: a lista ganhou busca sem acento por imobiliaria, empreendimento e status; filtros combinaveis por status, competencia, imobiliaria e empreendimento; ordenacao crescente/decrescente nas sete colunas de dados, com competencia mais recente como padrao e valores ausentes ao final; paginacao em lotes de 25; contagem de intervalo e total; limpeza individual/global dos filtros; estado vazio recuperavel; e persistencia de busca, filtros, ordenacao, pagina e inclusao de arquivados na URL. A API passou a expor os UUIDs dos cadastros relacionados para filtros sem ambiguidade de nomes. Cabecalhos usam `aria-sort`, acoes por icone receberam nomes acessiveis, valores financeiros ficaram alinhados e a regiao da tabela ganhou scroll interno em larguras menores.
Validacao: testes direcionados 12/12 e suite completa 167/167 passaram; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, detector do Impeccable e checklist mestre 6/6 passaram. QA autenticada em dados reais confirmou busca persistente, filtro/estado vazio, ordenacao monetaria ascendente, pagina 2 com 20 de 45 registros e URL restauravel. Em 1024 e 1280 px nao houve overflow da pagina; filtros reorganizaram em uma ou duas linhas e somente a tabela rolou quando necessario.
Decisoes: filtros, ordenacao e paginacao permanecem client-side porque a colecao atual e pequena e ja e carregada integralmente; filtros de cadastro usam UUID, enquanto busca usa rotulos normalizados. O contrato visual existente foi ampliado sem mudar o fluxo ou as regras financeiras.
Arquivos/docs impactados: `components/acr/views/fechamentos-view.tsx`, `lib/fechamentos-table.ts`, `lib/fechamentos-table.test.ts`, `app/api/fechamentos/route.ts`, `docs/02-mock-contract.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`, `melhorar-tabela-fechamentos.md`.
Proxima acao: validar a mesma consulta no deployment do EasyPanel e, se a colecao crescer a ponto de afetar tempo de carregamento, migrar filtros e paginacao para a API preservando os mesmos parametros de URL.

### 2026-07-13 - Rollout e QA autenticada dos indicadores (Slice 8)

Status: done.
Job: concluir migration, canario, backfill, verificacao e percurso autenticado responsivo de `/indicadores` sem usar producao como primeiro ambiente.
Outcome entregue: as 21 migrations foram aplicadas em Supabase descartavel completo; o dry-run sintetico nao escreveu, o canario inseriu 3 snapshots e a repeticao produziu 3 skips. O verificador descartavel passou com cobertura integral, checksums validos, reconciliacao financeira e fontes intactas. No remoto, o historico foi auditado e um dry-run isolado confirmou que somente `202607130001_indicadores_snapshots.sql` seria aplicada; a migration IPTU pendente permaneceu intocada. O canario real de Grand Messejana II / marco de 2026 inseriu 27 snapshots com 100% de cobertura e repetiu com 27 skips. O backfill global materializou 465 snapshots de 41 fechamentos. A exportacao CSV foi tornada um link de download explicito, com nome e conteudo acessiveis pelo navegador.
Validacao: verificador remoto `ok=true`, 465/465 snapshots disponiveis, zero duplicidade, 465 checksums validos, 41/41 pontes reconciliadas e fingerprints de `fechamentos`/`imoveis` inalterados. O dry-run global identificou 375 de 465 imoveis com linha vinculada (80,65%) e 28 linhas nao vinculadas, preservadas como lacunas preliminares. QA autenticada percorreu as quatro abas, metricas, filtros combinados, troca rapida, reload/URL, busca, ordenacao, paginacao, CSV, teclado, foco, notificacoes e console. Em 360, 390, 768, 1024, 1280 e 1440px nao houve overflow da pagina; sidebar/menu mediram 0/0/72/72/220/220px e heatmap/tabela mantiveram scroll interno. A API respondeu 400 para competencia invalida. Suite 162/162, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `git diff --check` e checklist mestre 6/6 passaram.
Decisoes: o projeto remoto configurado foi tratado como producao e so recebeu escrita depois dos testes descartaveis; a migration de Indicadores foi aplicada isoladamente para nao arrastar `202607070001_iptu_contas_pagar.sql`, que continua pendente. Lacunas historicas permanecem visiveis e preliminares; nao foi criado vinculo automatico sem cadastro.
Arquivos/docs impactados: `components/acr/indicadores/tabs/view-registro.tsx`, `docs/12-execution-roadmap.md`; banco remoto: `public.imovel_competencias` e historico `202607130001`.
Proxima acao: confirmar o deployment do EasyPanel a partir de `main`, executar smoke no dominio publicado e acompanhar a janela operacional; depois corrigir os cadastros que explicam as linhas historicas nao vinculadas.

### 2026-07-13 - Guarda de rota contra revisão sem análise

Status: done.
Job: concluir a correção do falso acesso à Revisão reportado em Alive Imóveis / Grand Messejana I / Mai-2026, que estava em `rascunho`, sem job e sem `analise_completa`.
Outcome entregue: a decisão de destino agora considera job ativo e existência real da análise; job ativo abre Processando, ausência de análise abre Upload e análise válida abre Revisão. A lista consulta apenas os IDs que possuem `analise_completa`, a API de detalhe expõe o snapshot de processamento e a própria rota `/revisao` aplica a guarda, cobrindo URL direta e outros pontos de entrada. O cache global sem vínculo ao ID deixou de alimentar a Revisão, evitando mostrar dados de outro fechamento durante a navegação. Notificações de falha passam a abrir o Upload; notificações concluídas continuam abrindo a Revisão. Falha de reprocessamento preserva a última análise válida.
Validacao: teste de regressão reproduziu o bug antes da correção e passou depois (7/7); suíte completa 162/162, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `git diff --check` e checklist mestre 6/6 passaram. QA autenticada com o fechamento real `5c01572e` confirmou a linha "Aguardando documentos" apontando para `/upload` e o redirecionamento automático de uma URL direta `/revisao` para `/upload`, sem o card "Nenhuma análise carregada".
Decisoes: status persistido isolado não autoriza a Revisão; `analise_completa` é a evidência necessária. Um job ativo tem precedência temporária, e uma análise válida anterior continua acessível quando um reprocessamento falha.
Arquivos/docs impactados: `lib/fechamento-list.ts`, `lib/fechamento-list.test.ts`, `app/api/fechamentos/route.ts`, `app/api/fechamentos/[id]/route.ts`, `app/(app)/fechamentos/[id]/revisao/page.tsx`, `components/acr/views/fechamentos-view.tsx`, `components/acr/notifications-panel.tsx`, `corrigir-intermediacao-processamento-indicadores.md` e docs 02/06/12.
Proxima acao: publicar a correção e repetir a URL reportada no ambiente implantado; o fechamento Grand Messejana I continua aguardando o envio dos documentos.

### 2026-07-13 - Gate final e hardening dos indicadores (Slice 8)

Status: done no codigo; QA autenticada e rollout pendentes.
Job: tornar testes reproduziveis, revisar a entrega contra Standards e Spec e fechar lacunas de confiabilidade antes do rollout.
Outcome entregue: `tsx` foi fixado como devDependency, com scripts `test` e `test:indicadores`; a API ganhou validacao defensiva do envelope no cliente para payload antigo/incompativel virar estado de erro recuperavel. Tres revisores independentes auditaram Standards, Spec e banco. Os findings foram corrigidos: historico nao herda inquilino atual, ausencia legada permanece `null`, ranking mostra apenas gap/risco acionavel, pendentes e reprocessamentos ficam preliminares, serie considera linhas sem vinculo, checksum nativo e recalculado do conteudo persistido, RLS bloqueia acesso direto e trigger atomico impede backfill de substituir snapshot nativo.
Validacao: apos os patches finais, a suite completa passou 160/160; `pnpm exec tsc --noEmit`, `pnpm lint`, `git diff --check` e `pnpm build` passaram. O checklist mestre passou 6/6 em Security, Lint, Schema, Tests, UX e SEO, e a segunda rodada dos revisores nao encontrou P0-P2. A tentativa de recriar PostgreSQL descartavel foi bloqueada por shared memory do sandbox; a aplicacao final da migration continua no canario de staging. Nenhuma escrita em banco remoto foi executada.
Decisoes: tests/build/checklist locais encerram o gate de codigo; navegador e PostgreSQL devem ser repetidos em ambiente integrado; nenhuma escrita historica ocorre antes de canario reconciliado.
Arquivos/docs impactados: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, agregador/testes, repositorio, scripts de backfill/verificacao, migration, view raiz e `docs/12-execution-roadmap.md`.
Proxima acao: QA autenticada e validacao da migration; depois executar dry-run, canario e repeticao em staging.

### 2026-07-13 - Dashboard operacional e receitas por imovel (Slices 6 e 7)

Status: implementado; QA autenticada final pendente.
Job: substituir o painel permissivo por quatro abas operacionais confiaveis, responsivas e explicitas sobre fonte, cobertura e qualidade.
Outcome entregue: `/indicadores` agora usa o titulo "Operacao financeira da carteira", faixa persistente de cobertura, filtros/tabs/metricas preservados na URL, cancelamento de requests antigos, skeleton/retry e dados anteriores durante refetch. Visao geral separa competencia de Hoje e exibe KPIs com fonte; Receita & repasse traz ponte, realizacao contratada, evidencias e ranking; Mapa de calor usa apenas snapshots, valores alem de cor, ausencia `—`, origem recomposta e coluna Hoje; Receitas por imovel oferece busca, ordenacao, paginacao, CSV seguro contra formula injection e linhas expansivas no mobile. A antiga aba "Registro de pagamentos" e os componentes da cascata reconstruida foram removidos.
Validacao: ESLint focado, typecheck global, auditoria estatica de UX/acessibilidade e revisao independente passaram. Shell autenticado ja havia sido conferido em 390, 768, 1024 e 1440px sem overflow/console error; a navegacao automatizada das quatro abas nas seis larguras foi bloqueada pela politica do navegador desta sessao e permanece gate explicito.
Decisoes: frontend somente apresenta o DTO e nao recalcula regra financeira; `null` aparece como `—`; tabelas/heatmap rolam internamente; estados historicos nunca recebem fallback do cadastro atual.
Arquivos/docs impactados: `components/acr/views/indicadores-view.tsx`, `components/acr/indicadores/tabs/*`, `components/acr/indicadores/charts/monthly-series.tsx`, `components/acr/indicadores/lib/presentation.ts`, `components/acr/indicadores/primitives/dashboard-ui.tsx` e remocoes dos componentes obsoletos.
Proxima acao: QA autenticada das quatro abas em 360, 390, 768, 1024, 1280 e 1440px, incluindo troca rapida, URL compartilhavel, CSV e console.

### 2026-07-13 - API agregada operacional (Slice 4)

Status: done.
Job: substituir a agregacao permissiva anterior por um contrato confiavel, filtravel e auditavel, sem consultas N+1 ou fallbacks financeiros inventados.
Outcome entregue: `IndicadoresData` foi reorganizado em meta, cobertura, resumo, ponte financeira, realizacao do aluguel, serie mensal, ranking de atencao, heat, receitas por imovel e filtros. O agregador puro aplica whitelist de status, uniao dos pares esperados, `null` distinto de zero, ocupacao ponderada, filtro UUID de imovel sem rateio de valores do fechamento, repasse embutido separado de comprovante, diferenca comprovado menos apurado e saldo da ponte com tolerancia de R$ 0,01. A camada Supabase usa cinco consultas em lote, nao seleciona token e limita snapshots a 12 competencias ate o mes escolhido. A rota valida somente os quatro parametros permitidos e responde 400/500 sem segredo. `audit-indicadores.ts` foi alinhado ao DTO V2.
Validacao: 62/62 testes focados passaram durante a integracao; no gate final, a suite completa passou 160/160, incluindo o bloqueio de snapshots de fechamento inelegivel no heatmap e as regressoes finais de qualidade. API validator passou 4 checks sem criticos; `pnpm exec tsc --noEmit` e `pnpm lint` globais passaram apos a integracao.
Decisoes: `empresaId` continua sendo a tag segura da conta eGestor; `empreendimentoId` e `imovelId` sao UUIDs; o saldo da ponte e receita menos comissoes, despesas, intermediação e repasse, enquanto `diferencaRepasse` preserva comprovado menos apurado; heatmap historico aceita apenas snapshot ligado a fechamento elegivel.
Arquivos/docs impactados: `lib/indicadores-types.ts`, `lib/indicadores-query.ts`, `lib/indicadores-query.test.ts`, `lib/indicadores-aggregation.ts`, `lib/indicadores-aggregation.test.ts`, `lib/indicadores-domain.ts`, `lib/indicadores-domain.test.ts`, `lib/server/indicadores.ts`, `app/api/indicadores/route.ts`, `scripts/audit-indicadores.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: QA autenticada das quatro abas e gate final; smoke real da API apenas depois da migration em banco descartavel/staging.

### 2026-07-13 - Backfill e verificacao de snapshots (Slice 3)

Status: done no codigo; rollout pendente em staging.
Job: permitir recompor o historico mensal com seguranca, dry-run por padrao e prova de que nenhuma tabela-fonte foi alterada.
Outcome entregue: `backfill-indicadores-snapshots.ts` seleciona apenas fechamentos elegiveis com analise, aceita filtros de competencia e empreendimento, usa o builder congelado e produz plano deterministico de insert/update/skip por imovel + competencia + checksum. Escrita exige `--commit` e e limitada a `imovel_competencias`; snapshots nativos de `processamento` sempre prevalecem sobre recompostos, inclusive sob concorrencia por guarda atomica no banco. `verify-indicadores-snapshots.ts` audita cobertura, duplicidade, checksum esperado, checksum nativo recomposto do conteudo persistido, reconciliacao financeira e fingerprints paginados de `fechamentos`/`imoveis`.
Validacao: 14/14 testes focados passaram e ESLint focado passou. Os cenarios cobrem argumentos, dry-run sem escrita, whitelist, filtros, retomada, segunda execucao idempotente, preservacao de snapshot nativo, chave duplicada, cobertura, checksum, tolerancia de R$ 0,01 e mutacao de fonte. Nenhuma conexao remota ou escrita foi executada. O typecheck geral estava temporariamente bloqueado apenas pelos testes RED paralelos da API, cujos modulos ainda estavam em construcao.
Decisoes: import dos scripts nao executa CLI; producao nao sera o primeiro ambiente; snapshot de processamento nao pode ser rebaixado para backfill; canario e repeticao real permanecem gates obrigatorios antes do backfill completo.
Arquivos/docs impactados: `scripts/backfill-indicadores-snapshots.ts`, `scripts/backfill-indicadores-snapshots.test.ts`, `scripts/verify-indicadores-snapshots.ts`, `scripts/verify-indicadores-snapshots.test.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: aplicar a migration em banco descartavel/staging, rodar dry-run, canario filtrado e repeticao; em paralelo concluir a API da Slice 4.

### 2026-07-13 - Shell responsivo (Slice 5)

Status: done.
Job: tornar a navegacao autenticada utilizavel em desktop, tablet e mobile sem alterar o primitivo compartilhado de sidebar.
Outcome entregue: sidebar fixa de 220px a partir de 1200px, rail de 72px entre 768 e 1199px e menu em `Sheet` abaixo de 768px; topbar e conteudo acompanham os mesmos offsets. O shell ganhou skip link, alvo de conteudo focavel, breadcrumbs compactos no mobile, alvos de toque de 44px e painel de notificacoes contido na viewport. O `Sheet` devolve o foco ao botao de abertura ao fechar.
Validacao: ESLint focado passou; o typecheck completo estava verde antes da abertura dos testes RED paralelos de backfill/API. QA autenticada no navegador confirmou em 390, 768, 1024 e 1440px: nenhum overflow horizontal da pagina, sidebar 0/72/72/220px, offsets de header e main 0/72/72/220px, menu mobile apenas abaixo de 768px e zero erro de console. Em 390px, o painel de notificacoes ficou entre 16px e 374px e o foco retornou ao gatilho apos a animacao de fechamento. A QA detectou e corrigiu o conflito de precedencia do offset em 1440px antes do commit.
Decisoes: breakpoint largo permanece em 1200px conforme contrato; `components/ui/sidebar.tsx` nao foi editado; tabelas e heatmap poderao ter scroll interno, mas o shell evita overflow da pagina.
Arquivos/docs impactados: `app/(app)/layout.tsx`, `components/acr/sidebar.tsx`, `components/acr/topbar.tsx`, `components/acr/notifications-panel.tsx`, `docs/12-execution-roadmap.md`.
Proxima acao: manter o shell congelado e implementar o conteudo responsivo das abas nos Slices 6 e 7.

### 2026-07-13 - Indicadores: materializacao por competencia (Slice 2)

Status: done.
Job: transformar a prestacao processada em uma linha mensal deterministica por imovel, sem confundir ausencia com zero e sem inferir vacancia a partir de linha zerada.
Outcome entregue: `lib/indicadores-domain.ts` concentra normalizacao, chave composta, classificacao de ocupacao, agregacao monetaria, taxa de ocupacao e reconciliacoes puras. `lib/server/indicadores-snapshots.ts` vincula linhas por imobiliaria + empreendimento + unidade normalizada, agrupa aluguel e encargos sem substituir aluguel por total, cria snapshot `desconhecido`/`sem_linha` para imovel esperado sem correspondencia, calcula checksum estavel e faz upsert por `imovel_id,competencia`. O fluxo de processamento/reprocessamento e a correcao manual atualizam o snapshot automaticamente.
Validacao: 25/25 testes focados de dominio e builder passaram; suite completa passou 117/117; `pnpm exec tsc --noEmit` e `pnpm lint` passaram. Os testes cobrem unidades homonimas em empreendimentos distintos, aluguel + multa, zero versus `null`, vacancia apenas explicita, linha sem vinculo, snapshot sem linha, origem de backfill, ordem/checksum deterministas e tolerancia financeira de R$ 0,01. O upsert foi validado por contrato e pela constraint criada no Slice 1; a escrita real fica para o canario do Slice 3 em banco descartavel/staging.
Decisoes: aluguel recebido usa `aluguel_com_desconto ?? aluguel`, nunca `total`; texto de inquilino e observacao compoe a evidencia explicita; snapshot sem aluguel esperado e parcial; ausencia de linha preserva valores monetarios como `null`; reprocessamento substitui a mesma chave mensal por upsert idempotente.
Arquivos/docs impactados: `lib/indicadores-domain.ts`, `lib/indicadores-domain.test.ts`, `lib/server/indicadores-snapshots.ts`, `lib/server/indicadores-snapshots.test.ts`, `lib/server/persist-package.ts`, `app/api/fechamentos/[id]/corrigir/route.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: Slice 3, scripts de backfill/verificacao com dry-run padrao, filtros, canario e repeticao sem mudanca de checksum.

### 2026-07-13 - Indicadores: schema mensal de snapshots (Slice 1)

Status: done.
Job: criar a base mensal de ocupacao e realizacao por imovel sem alterar ou preencher as tabelas-fonte.
Outcome entregue: migration `202607130001_indicadores_snapshots.sql` cria `imovel_competencias` com FKs em cascata, valores `numeric(14,2)`, status/origem/qualidade, versao e checksum, `UNIQUE (imovel_id, competencia)`, indices de leitura e trigger de `atualizado_em`. RLS sem policies bloqueia acesso direto de clientes, grants ficam explicitos para `service_role` e uma trigger atomica impede que backfill substitua snapshot nativo. A migration e somente aditiva e nao contem backfill ou DML de dados.
Validacao: o nucleo da migration foi aplicado em PostgreSQL descartavel local; catalogo confirmou 22 colunas, precisao monetaria, cinco indices e trigger de atualizacao; primeira linha sintetica foi aceita e a duplicata do mesmo imovel/competencia foi rejeitada pela constraint esperada. O hardening posterior de RLS e protecao concorrente passou por duas revisoes estaticas sem P0-P2, mas sua repeticao dinamica ficou pendente porque o sandbox bloqueou shared memory do PostgreSQL. Nenhum banco remoto foi acessado.
Decisoes: manter uma linha por imovel/competencia; origem distingue processamento de backfill; rollback operacional reverte o codigo e preserva a tabela para diagnostico, sem down destrutivo em producao.
Arquivos/docs impactados: `supabase/migrations/202607130001_indicadores_snapshots.sql`, `docs/12-execution-roadmap.md`.
Proxima acao: Slice 2, dominio puro e upsert idempotente integrado a processamento/reprocessamento/correcao.

### 2026-07-13 - Indicadores operacionais: contrato e baseline (Slice 0)

Status: done.
Job: congelar o contrato operacional-financeiro de `/indicadores` antes de alterar schema ou interface, registrar a divergencia da quarta aba e medir o baseline real.
Outcome entregue: branch `codex/indicadores-operacional-financeiro`; plano executavel em `docs/PLAN-indicadores-operacionais.md`; mock, dominio e CA-IND02 a CA-IND12 atualizados. "Registro de pagamentos" foi substituido contratualmente por "Receitas por imovel"; foram definidos cobertura sem limiar arbitrario, fontes monetarias, ponte financeira, realizacao do aluguel, status mensal e separacao entre competencia e Hoje.
Validacao: `pnpm lint`, `pnpm exec tsc --noEmit` e `pnpm build` passaram; suite completa passou 92/92; `scripts/audit-indicadores.ts` passou contra a base configurada. Oraculos sanitizados: 05/2026 receita R$ 41.244,29 versus aluguel cadastrado R$ 67.339,69; 03/2026 receita R$ 92.658,06; ambos exibiam a mesma ocupacao atual de 93,8% (106/113), confirmando a necessidade dos snapshots e da cobertura explicita.
Decisoes: dados processados e pendentes entram como preliminares; rascunhos e arquivados nao entram; snapshots recompostos sao best-effort identificados; `null` nao vira zero; indicadores de investimento ficam fora.
Arquivos/docs impactados: `docs/PLAN-indicadores-operacionais.md`, `docs/02-mock-contract.md`, `docs/03-domain-model.md`, `docs/06-acceptance-criteria.md`, `docs/12-execution-roadmap.md`.
Proxima acao: Slice 1, migration aditiva de `imovel_competencias`, validada em banco descartavel antes de qualquer backfill.

### 2026-07-13 - Intermediação com IPTU, estado real do processamento e paleta dos indicadores

Status: done
Job: corrigir a ausência do IPTU na Intermediação, impedir que rascunhos sem documentos apareçam como processamento ativo e restaurar as cores solicitadas no mapa de calor.
Outcome entregue: a lista consulta `processamento_status`/`processamento_atualizado_em` e diferencia "Aguardando documentos", "Processando" e "Erro na análise", levando rascunhos/erros/jobs travados ao upload e somente jobs ativos ao acompanhamento. A Intermediação separa aluguel/base, IPTU, total recebido, comissão, percentual e repasse; o caso LOCMAIS Mai/2026 fecha em R$ 900,00 + R$ 38,08 = R$ 938,08, comissão R$ 540,00 (60%) e repasse R$ 398,08. A fórmula final também desconta a comissão de intermediação em balde próprio, eliminando a divergência falsa de R$ 540,00. Novas análises preservam IPTU/total/repasse em campos numéricos estruturados, com fallback textual apenas para dados antigos. O mapa voltou às seis faixas verde -> amarelo -> laranja -> vermelho. Acentos roxos da Intermediação foram substituídos por teal e os filtros de Indicadores receberam nomes acessíveis.
Validacao: testes focados da correção final passaram (13/13), suíte completa passou (92/92), `pnpm exec tsc --noEmit`, `pnpm lint` e `pnpm build` passaram. O checklist mestre passou em Segurança, Lint, Schema, Testes, UX e SEO (6/6). QA autenticada confirmou Grand Castelão Abr/Mai como "Aguardando documentos" com ação "Enviar documentos", LOCMAIS Mai/2026 com os valores completos da Intermediação e a legenda do mapa nas seis cores computadas de verde a vermelho.
Decisoes: IPTU compõe o total recebido e o repasse da intermediação, mas não a base da comissão; a comissão de intermediação é descontada separadamente na conciliação final; `rascunho` nunca significa processamento ativo sem `processamento_status=processando`.
Arquivos/docs impactados: `app/api/fechamentos/route.ts`, `components/acr/views/fechamentos-view.tsx`, `components/acr/views/revisao-view.tsx`, `components/acr/views/imovel-historico-drawer.tsx`, `components/acr/views/indicadores-view.tsx`, `app/globals.css`, `lib/fechamento-list.ts`, `lib/intermediacao.ts`, `lib/server/package-rechecks.ts`, `lib/prestacao-types.ts`, `lib/server/analyze-prestacao.ts`, testes focados, prompt Alive, auditor UX e docs 02/03/06/12.
Proxima acao: após o deploy, reprocessar fechamentos antigos que precisem persistir novamente as validações calculadas; Grand Castelão continua aguardando o envio dos documentos.

### 2026-07-09 - IPTU: correcao ao editar parcela

Status: done
Job: corrigir o erro exibido ao salvar uma edicao de parcela em `/iptu`.
Outcome entregue: depois de atualizar a tabela base `iptu_parcelas`, `editarParcela` passa a reler a linha pela view `iptu_parcelas_detalhe`, que contem os campos relacionais usados pela resposta. Antes, o `UPDATE` podia persistir mas a releitura falhava por consultar colunas da view na tabela base, e a UI exibia erro generico. Foi adicionado teste de regressao com cliente Supabase injetado, cobrindo a sequencia tabela base -> tabela base -> view detalhada.
Validacao: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` e os 44 testes puros de IPTU passaram. O checklist passou em seguranca, lint, schema, testes e SEO; a auditoria UX continua apontando problemas pre-existentes e fora deste fluxo em `imovel-historico-drawer.tsx`, `revisao-view.tsx` e `indicadores-view.tsx`. O teste `lib/server/iptu.test.ts` foi verificado pelos tipos; sua execucao requer o runner `tsx`, que nao e uma dependencia instalada neste checkout.
Decisoes: nenhuma migration ou alteracao do contrato de IPTU foi necessaria; a view ja esta disponivel no Supabase configurado.
Arquivos/docs impactados: `lib/server/iptu.ts`, `lib/server/iptu.test.ts`, `docs/12-execution-roadmap.md`.
Proxima acao: validar no navegador uma edicao de parcela paga (responsavel/observacoes) e uma parcela aberta (vencimento/valor), confirmando o retorno sem alerta de erro.

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

### 2026-08-11 - Hardening integral de OCR, fechamento e remessas

Status: done.

Job: resolver os defeitos encontrados na auditoria do corpus completo de
empreendimentos e reparar César Rêgo julho/2026.

Outcome entregue: schema estrito da prestação corrigido; parser Excel lê abas e
headers dinâmicos, acordos, inadimplência, resumo e falha fechado; repasse
embutido só é aceito quando explicitamente marcado; classificação abaixo de
80% fica desconhecida; nomes repetidos são correlacionados por posição; layout
César detectado não cai na IA após erro. Contexto do browser é substituído pelo
cadastro do banco, RBAC usa quatro perfis, claim do job é atômico e todos os
erros Supabase são propagados. Remessas adicionais recebem numeração crescente,
usam deduplicação SHA-256, unem comprovantes parciais/despesas/reajustes e
preservam correções manuais. A RPC `persistir_pacote_fechamento_v1` troca análise,
totais, movimentações, validações e snapshots numa transação otimista.

Reparo: dry-run encontrou João Cordeiro e Galpão Pompílio Gomes sem linhas sem
vínculo e diferença não explicada zero. Commit via RPC v4 aplicado. Nova
execução retornou 2 `unchanged` e 0 escritas propostas. João: receitas R$ 1.237,05,
comissão R$ 61,85, TED R$ 5,55 e repasse R$ 1.169,65. Pompílio: receitas
econômicas R$ 12.414,16, comissão R$ 510,25, TED R$ 5,55 e repasse R$ 11.898,36.
O lançamento eGestor 9041 permanece intocado localmente e requer conferência
manual das três datas em 10/08/2026.

Arquivos/docs impactados: workflow/persistência/parsers/autorização, middleware,
tela de usuários, migrations `202608110004` a `202608110006`, docs 02/03/04/06/12/13
e plano executável de hardening.

Implantação concluída em 2026-08-12 pelo pooler IPv4 de sessão do projeto. O
histórico remoto foi alinhado com as migrations pendentes `202607240001`,
`202607280003`, `202607280004`, `202608050001`, `202608070001`, `202608070002`
e `202608110004` a `202608110006`. Validação pós-migration: todos os IDs locais
e remotos coincidem; `iniciar_processamento_fechamento` e
`persistir_pacote_fechamento_v1` têm EXECUTE apenas para `service_role`; o
bootstrap resultou em um usuário `admin` e um `operador`; João Cordeiro e
Pompílio Gomes preservaram os totais reparados e diferença zero.

### 2026-08-12 - Pendências acionáveis e validação pós-escopo

Status: done.

Job: retirar avisos opcionais sem ação, recalcular os rechecks depois de separar
empreendimentos César Rêgo e reprocessar julho/2026.

Outcome entregue no código: documentos opcionais ausentes passam sem alerta;
despesa zero sem documento passa silenciosamente; linha sem recebimento trata
comissão/repasse nulos como zero; persistência e reparador regeneram rechecks,
guardrails e parecer com regra comercial e histórico do empreendimento.

Dry-run remoto: 3 fechamentos encontrados, 3 reparos propostos, 0 incompletos e
0 divergentes. Pompílio preserva comissão R$ 510,25 e repasse R$ 11.898,36;
João preserva comissão R$ 61,85 e repasse R$ 1.169,65; José Walter preserva
comissão R$ 267,88 e repasse R$ 3.080,64.

Arquivos/docs impactados: `lib/server/package-rechecks.ts`,
`lib/server/persist-package.ts`, `lib/revisao-pendencias.ts`,
`scripts/repair-indicadores-confiabilidade.ts`, testes e docs 02/03/04/06/12.

Rollout concluído: commit `e36b793` publicado na `main`; reparo remoto aplicado
nos três fechamentos de julho. A regra comercial de João Cordeiro foi cadastrada
com 5% de administração, 50% de intermediação e vencimento no dia 10, fazendo
R$ 61,85 reconciliar sobre a base de R$ 1.237,05. A conta
`participacoesmmc@gmail.com` foi promovida de `operador` para `aprovador`.
Verificação final: zero pendência operacional aberta, zero valor consolidado
vazando entre empreendimentos, três pareceres `aprovado_tecnico` e novo dry-run
com 3 `unchanged`, 0 incompletos e 0 divergentes. Nenhum lançamento enviado ao
eGestor foi alterado.

Validação local: suíte completa, lint, typecheck, build, checklist, validador de
API, validador de schema e revisão independente por padrões + especificação
passaram. A revisão encontrou e o ciclo corrigiu preservação de pendências
ignoradas, auditoria de rechecks antes/depois e consistência dos totais usados
na validação. Não há migration nova porque o schema não mudou.

### 2026-08-12 - Vigências contratuais de Pompílio em julho

Status: done.

Job: corrigir o indicador `Aluguel contratado`, que ainda usava os valores
migrados R$ 6.684,85 e R$ 5.347,89 apesar de a prestação 41460 documentar os
aluguéis de julho em R$ 6.896,75 e R$ 5.517,41.

Outcome entregue: a migration `202608120001` encerrou as vigências anteriores
em junho e criou novas vigências a partir de 01/07/2026, vinculadas ao
PDF-fonte. Duas linhas de auditoria registram os valores anteriores e novos.
Nenhum total do fechamento ou lançamento eGestor foi alterado.

Validação: `supabase db push --dry-run` propôs somente a migration nova; o push
remoto concluiu. O backfill de julho encontrou 2 atualizações, cobertura 2/2 e
nenhum imóvel sem vínculo. Depois do commit, o dry-run retornou 0 atualizações
e 2 skips; o verificador confirmou checksums, unicidade, cobertura e
reconciliação. A API de domínio passou a retornar aluguel contratado e recebido
de R$ 12.414,16, com repasse preservado em R$ 11.898,36. O plano documenta o
rollback transacional; a migration também valida, na reexecução, o histórico
anterior, o vínculo ao PDF-fonte e as duas linhas de auditoria. Um dump lógico
do `public` foi restaurado em PostgreSQL descartável: primeira execução,
reexecução idempotente e falha fechada após adulterar o vínculo da fonte
passaram, com total contratado de R$ 12.414,16.

Arquivos/docs impactados: migration `202608120001`, plano executável da
correção e este roadmap.

Próxima ação: conferir o card no ambiente publicado após o próximo deploy; não
há reparo financeiro nem reenvio ao eGestor pendente por esta correção.

### 2026-08-13 - Identidade canônica Plural e José Walter julho

Status: done.

Job: impedir que o código contratual `GA0002/2` recrie um segundo imóvel e
restaurar o aluguel recebido de José Walter em julho/2026.

Outcome entregue: códigos `GA<número>/<revisão>` resolvem para o código
canônico sem o sufixo em sincronização, vínculo, snapshots e cobertura. Outros
formatos com barra permanecem distintos. O reparador histórico também volta a
vincular análises genéricas ao cadastro ativo antes de comparar idempotência.

Reparo remoto: dry-run restrito encontrou 1 reparo, 0 incompletos e 0
divergentes; commit atômico aplicado com auditoria. A API retornou aluguel
recebido R$ 3.348,52, comissão R$ 267,88, repasse R$ 3.080,64, ocupação 100%,
zero linha sem vínculo e somente o cadastro `GA0002`. Nova execução retornou 1
`unchanged`. O lançamento eGestor já enviado não foi alterado.

Validação: regressões direcionadas passaram; suíte completa, lint, typecheck,
build, validador de API e checklist 6/6 passaram. O verificador auxiliar de
type coverage reportou simultaneamente zero `any` em 1.115 arquivos e cobertura
0%, inconsistência conhecida do próprio script sem impacto no gate oficial.

Arquivos/docs impactados: `lib/codigo-imovel.ts`,
`lib/indicadores-domain.ts`, `lib/server/fechamento-imoveis.ts`,
`lib/server/indicadores.ts`, `lib/server/sync-imoveis.ts`,
`scripts/repair-indicadores-confiabilidade.ts`, testes e docs 02/03/06/12.

Próxima ação: executar smoke no ambiente implantado após o deploy; nenhuma
migration de schema é necessária.

### 2026-08-13 - Ocupação histórica de José Walter em junho

Status: done.

Job: corrigir junho/2026, que aparecia com 0% de ocupação apesar da linha de
aluguel recebida no fechamento Plural.

Causa: o fechamento anterior à normalização canônica ainda apontava
`GA0002/2` para o UUID do cadastro duplicado já removido. A movimentação perdeu
o vínculo por integridade referencial e o snapshot do `GA0002` foi materializado
como `sem_linha`/`desconhecido`.

Outcome entregue: o reparador Plural passou a vincular as linhas ao cadastro
ativo antes de reconstruir as dimensões financeiras e a propagar o marcador de
repasse embutido para a validação. O reparo remoto atômico religou análise,
movimentação e snapshot ao imóvel `GA0002`, preservando os totais e a auditoria.

Validação: dry-run encontrou 1 reparo reconciliado e nenhuma divergência; após
o commit, a API retornou aluguel contratado/recebido de R$ 3.200,00, comissão
R$ 256,00, repasse R$ 3.389,95, 1 ocupado, ocupação/cobertura 100% e zero linha
sem vínculo. A segunda execução retornou 1 `unchanged`. Não houve migration nem
alteração de lançamento eGestor.

Arquivos/docs impactados: `lib/indicadores-repair.ts`,
`scripts/repair-indicadores-confiabilidade.ts`, testes e este roadmap.

Próxima ação: publicar a proteção no host da aplicação e executar smoke da série
mensal; o banco usado pelo cliente já está corrigido.

### 2026-08-13 - Período filtrável na evolução mensal

Status: done.

Job: permitir que o operador escolha quanto histórico comparar na Evolução
mensal dos Indicadores, sem alterar a competência usada pelos demais números.

Outcome entregue: a série abre nas últimas 12 competências disponíveis e
oferece atalhos de 3, 6 e 12 meses, além de intervalo personalizado inclusivo
com seletores De/Até. A escolha persiste nos parâmetros `seriePeriodo`,
`serieInicio` e `serieFim` da URL; os KPIs do topo permanecem ligados à
competência selecionada. Períodos longos preservam a legibilidade com rolagem
interna do gráfico, sem overflow horizontal da página.

Validação: teste unitário cobre os quatro modos e os limites inclusivos. Smoke
autenticado confirmou seleção, recarga pela URL e intervalo personalizado em
desktop e 390 px; no mobile, a largura do documento permaneceu igual à viewport
e não houve erro ou alerta no console. Suíte completa com 420 testes, lint,
typecheck, build de produção e checklist 6/6 passaram.

Arquivos/docs impactados: apresentação e gráfico da Visão geral, testes e docs
02/06/12. Não há migration nem alteração de dados financeiros.

Próxima ação: confirmar o deploy da `main` no host da aplicação e repetir o
smoke com uma URL compartilhada de período personalizado.

### 2026-08-13 - Inquilino por competência no mapa de riscos

Status: done.

Job: identificar quem ocupava cada unidade em cada mês do histórico de riscos,
sem confundir o inquilino atual com o histórico.

Outcome entregue: cada célula mensal da unidade mostra o nome persistido no
snapshot da própria competência. Nome ausente aparece como “Inquilino não
informado”; o sistema não usa o cadastro atual como fallback. Em empreendimento
com uma única unidade, o nome também aparece na linha agregada recolhida. Nomes
longos são truncados na grade e permanecem completos no título e na descrição
acessível.

Dados conferidos: José Walter possui nomes históricos em janeiro a maio, mas os
documentos Plural registraram a descrição/endereço do contrato nesse campo; em
junho e julho a fonte não trouxe nome e os snapshots estão nulos. A interface
expõe essa ausência sem inventar um locatário.

Validação: regressão de domínio garante o nome por competência e proíbe fallback
do inquilino atual; testes de apresentação verificam a presença do dado e do
estado “Inquilino não informado”. Suíte completa com 421 testes, lint,
typecheck, build e checklist 6/6 passaram. Smoke autenticado confirmou a linha
recolhida e expandida em desktop, ausência de overflow em 390 px e console sem
alertas. Não há migration nem escrita financeira.

Próxima ação: confirmar o nome civil/empresarial do locatário de José Walter se
o cliente quiser corrigir a fonte histórica, pois ele não consta nos extratos
Plural analisados.

## 2026-08-27 — Recebimentos extraordinários canônicos (sub-plano A do plano v2)

Ciclo executado a partir do feedback de agosto (7 vídeos, 28 imagens, conversa
ACR | YRM), seguindo `docs/superpowers/plans/2026-08-27-recebimentos-canonicos-v2.md`.

Contrato: CA14.2 revisado (base de intermediação = componentes comissionáveis,
aluguel + garagem; valores explícitos preservados e validados pela equação
`recebido − comissão = repasse` ± R$ 0,01); CA27–CA27.3 e CA-IND21–24 criados;
valores-canário de julho congelados em `docs/06-acceptance-criteria.md` e
versionados em `tests/canary/` (`pnpm test:canary`, alvo separado da suíte).
Mock contract e domain model alinhados; seção Prisma obsoleta do AGENTS.md
substituída pela validação Supabase real.

Implementação: novo seam `lib/recebimentos-extraordinarios.ts` — único
resolvedor financeiro de acordos, rescisões, atrasos e intermediações, com
união discriminada por tipo, fail-closed explícito (`pendente` por vínculo
ausente, confiança < 0,7 ou valor inexistente) e fallback legado de observação
absorvido de `lib/intermediacao.ts` (módulo removido). Sete fórmulas paralelas
eliminadas: revisão (linha e totais), resumo de receitas adicionais, comissão
de acordos, agregação (realocação de atraso e comissão de intermediação),
snapshots (atrasos recuperados e outros recebimentos), movimentações
persistidas e histórico por imóvel — todas consomem a resolução canônica.
Parser lê a coluna GARAGEM nas seções de recebidos e herda a competência de
origem do cabeçalho da seção (CA27.3); prompt e schema do agente instruem a
base por componentes e a decomposição principal/ajuste/recebido/comissão/
repasse. `validatePackage` particiona itens inelegíveis antes da normalização
e emite o recheck `recebimentos_sem_evidencia`. A revisão exibe a decomposição
com badge de pendência; teste de contrato congela a allowlist de consumidores
do campo bruto.

Validação: canários 5/5 (Grand Castelão 675/60%/321,44; GM II 750/60%/369,13;
LOCMAIS 1.663,56/116,45/1.547,11; competência herdada; GMI fantasma excluído
com totais intactos); suíte completa 453/453; lint, typecheck, build e
checklist 6/6 verdes. Sem migration SQL (shape novo vive no JSONB
`analise_completa` com adaptador legado) e sem escrita no Supabase.

Próxima ação: sub-plano B (estado × evento + cobrança esperada, com migrations
aditivas e backfill em dry-run) e sub-plano C (gates bloqueantes de fonte/
cobertura + aliases). O reparo de julho (sub-plano D) permanece bloqueado até
aprovação operacional explícita, com dry-run antes de qualquer escrita.

## 2026-08-27 — Estado × evento e cobrança esperada (sub-plano B, núcleo)

Contrato: `status_ocupacao` passa a descrever apenas o estado no fim da
competência (`ocupado | inadimplente | vago | desconhecido`); rescisão e
pagamento atrasado viram eventos independentes (`imovel_competencias.eventos`).
`em_rescisao` permanece legível nos snapshots históricos e o classificador não
o emite mais; rescisão sem aluguel do mês recebido termina a competência como
vago (canário GM Maracanaú 214). Cobrança esperada por componentes
(`aluguel_contratado + garagem_contratada` da vigência, CA-IND23) persiste em
`cobranca_esperada`; a métrica nova `vacanciaFinanceira` soma a cobrança
esperada de todas as vagas, enquanto a vacância da equação de realização
permanece na base do aluguel para reconciliar com o contratado (bases nunca
misturadas). Versão de cálculo `recebimentos-canonicos-v3`.

Migrations aplicadas no Supabase com as credenciais fornecidas pelo usuário:
`202608270001` (colunas aditivas `eventos`, `cobranca_esperada`,
`garagem_contratada` — verificadas no information_schema) e `202608270002`
(RPC `persistir_pacote_fechamento_v1` atualizada para gravar os campos novos;
chamadores antigos continuam válidos). Nenhuma linha existente foi alterada;
o leitor de snapshots tem fallback para o select legado. `garagem_contratada`
está nula em todas as vigências até haver evidência documental por unidade —
o valor 52,07 do apto 204 entra no reparo controlado (sub-plano D).

Validação: suíte 461/461, canários 5/5, lint, typecheck e build verdes.
O gap de inadimplência por componentes (cobrança esperada × recebido
correspondente) ficou explicitamente para o próximo ciclo: exigiria persistir a
garagem recebida por unidade para não comparar bases incompatíveis — a mesma
classe de erro que este plano corrige. Backfill histórico de eventos/estado
permanece no fluxo de reparo (sub-plano D), nunca implícito.

Próxima ação: sub-plano C (gates bloqueantes de fonte/cobertura + aliases),
gap por componentes com garagem recebida persistida, e reparo de julho (D)
mediante aprovação operacional do dry-run.

## Como atualizar este doc

Ao final de cada ciclo, adicione uma entrada no historico e atualize:

- `Status geral`;
- `Proxima acao recomendada`;
- tabela `Progresso por etapa`;
- `Decisoes registradas`, quando houver decisao nova.
