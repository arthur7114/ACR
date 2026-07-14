# Plano de execução — Indicadores operacionais confiáveis

Status: aprovado para implementação em 2026-07-13.

## 1. Objetivo e escopo

Transformar `/indicadores` em um painel operacional-financeiro confiável para o
proprietário acompanhar receita, despesas, comissões, repasses, ocupação,
vacância e inadimplência.

Decisões congeladas:

- dados processados e pendentes entram por padrão, identificados como
  preliminares;
- rascunhos, processamentos sem análise e fechamentos arquivados não entram nos
  valores;
- ocupação da competência usa snapshots históricos; cadastro atual aparece
  separadamente como **Hoje**;
- haverá tabela mensal de snapshots e backfill idempotente;
- página, sidebar e topbar serão responsivas;
- a execução ocorre na branch `codex/indicadores-operacional-financeiro`, em
  slices e commits atômicos;
- permanecem quatro abas: **Visão geral**, **Receita & repasse**, **Mapa de
  calor** e **Receitas por imóvel**;
- **Receitas por imóvel** substitui **Registro de pagamentos**, porque a fonte
  atual é a prestação da competência, não um livro bancário;
- NOI, cap rate, valorização, financiamento, CAPEX e demais indicadores de
  investimento estão fora deste ciclo.

## 2. Contrato de dados e cálculo

### 2.1 Elegibilidade dos fechamentos

Incluir fechamentos não arquivados, com `analise_completa`, nos status:

- `pendente_revisao`;
- `processado_com_sucesso`;
- `processado_com_alertas`;
- `aprovado`;
- `preparado_egestor`;
- `lancado_egestor`;
- `erro_egestor`.

Excluir `rascunho`, `arquivos_enviados`, processamento sem análise anterior,
`erro` e `cancelado`. Quando houver reprocessamento ativo com análise anterior
válida, manter o último resultado e marcar o par como **Em atualização**.

### 2.2 Cobertura

O universo esperado da competência é a união dos pares ativos
`imobiliária + empreendimento` presentes em regras comerciais ou imóveis
ativos.

A API retorna separadamente:

- pares esperados, processados, aprovados, pendentes, rascunhos, em atualização
  e ausentes;
- percentual de cobertura;
- imóveis esperados, snapshots disponíveis e snapshots desconhecidos;
- imóveis sem aluguel esperado;
- linhas da prestação não vinculadas ao cadastro.

A competência é `completa` somente quando todos os pares esperados estão
processados e não há lacuna estrutural. Nos demais casos é `preliminar`, sem
limiar arbitrário.

### 2.3 Regras monetárias

- `receitaTotal`: soma de `analysis.totals.total_receitas`.
- `aluguelContratado`: soma dos aluguéis esperados conhecidos nos snapshots.
- `aluguelRecebido`: soma de `aluguel_com_desconto`, com fallback para
  `aluguel`, nunca para `total`.
- `comissaoAdministracao`: soma de `analysis.totals.total_comissoes`.
- `comissaoIntermediacao`: soma das comissões dos itens
  `tipo="intermediacao"`.
- `despesasRetidas`: soma de `analysis.totals.total_despesas`.
- `despesaOperacionalDetalhada`: água + IPTU + seguro, sem o rótulo de despesa
  total.
- `repasseApurado`: soma de `analysis.totals.total_a_repassar`.
- `repasseComprovado`: soma apenas dos `valor_comprovado` conhecidos; ausência
  permanece `null`.
- repasse embutido é **Informado no extrato**, nunca comprovante bancário.
- `diferencaRepasse = comprovado - apurado`, preservando o sinal.

A ponte financeira reconcilia receita, comissão administrativa, despesas,
intermediação e repasse com tolerância de R$ 0,01. Resíduo acima da tolerância é
alerta explícito.

### 2.4 Realização do aluguel

Remover a cascata de potencial reconstruído. A reconciliação passa a ser:

`aluguel contratado − vacância − inadimplência do mês − descontos ± outros ajustes = aluguel recebido`

- vacância: aluguel esperado dos snapshots vagos;
- inadimplência do mês: diferença positiva entre esperado e recebido nos
  snapshots explicitamente inadimplentes;
- descontos: descontos documentados;
- outros ajustes: resíduo de proporcionalidade, excedentes ou dados não
  classificados;
- inadimplência acumulada permanece separada e vem da prestação da competência.

### 2.5 Ocupação

Status mensal: `ocupado`, `inadimplente`, `vago`, `em_rescisao` ou
`desconhecido`.

Ordem de classificação:

1. rescisão explícita → `em_rescisao`;
2. Airbnb ou aluguel corrente positivo → `ocupado`;
3. inadimplência explícita sem aluguel corrente → `inadimplente`;
4. imóvel vago explícito sem aluguel corrente → `vago`;
5. linha zerada sem evidência suficiente → `desconhecido`, nunca `vago`.

Taxa de ocupação:

- numerador: ocupado + inadimplente + em rescisão;
- denominador: ocupado + inadimplente + em rescisão + vago;
- desconhecidos ficam fora do denominador e reduzem a cobertura exibida.

### 2.6 Tempo e ausência de dados

- todas as abas respeitam a competência selecionada;
- séries e heatmaps terminam nela e não mostram meses futuros;
- `null` significa ausente e `0` significa zero confirmado;
- médias da carteira são ponderadas pelos denominadores correspondentes.

## 3. Schema, persistência, API e tipos

### 3.1 Migration

Criar `supabase/migrations/202607130001_indicadores_snapshots.sql` com a tabela
`imovel_competencias`:

- `id uuid primary key`;
- `imovel_id uuid not null references imoveis(id) on delete cascade`;
- `fechamento_id uuid not null references fechamentos(id) on delete cascade`;
- `competencia date not null`;
- `status_ocupacao text not null`;
- `status_origem text not null`;
- `inquilino_nome text`;
- `aluguel_esperado numeric(14,2)`;
- `aluguel_esperado_origem text`;
- `aluguel_recebido numeric(14,2)`;
- `receita_total numeric(14,2)`;
- `desconto numeric(14,2)`;
- `comissao_administracao numeric(14,2)`;
- `repasse_apurado numeric(14,2)`;
- `vencimento_referencia text`;
- `quantidade_linhas integer not null default 0`;
- `origem text not null` (`processamento` ou `backfill`);
- `qualidade text not null` (`completo`, `parcial` ou `sem_linha`);
- `calculo_versao text not null`;
- `checksum text not null`;
- `criado_em` e `atualizado_em`.

Constraints e índices:

- `unique(imovel_id, competencia)`;
- checks para status, origem e qualidade;
- índice por competência;
- índice por fechamento;
- índice por `(imovel_id, competencia desc)`;
- trigger de atualização de `atualizado_em`.

A migration é somente aditiva e não executa backfill.

### 3.2 Persistência dos snapshots

Criar:

- `lib/indicadores-domain.ts`: normalização, classificação e cálculos puros;
- `lib/server/indicadores-snapshots.ts`: leitura de imóveis, montagem e upsert;
- `scripts/backfill-indicadores-snapshots.ts`: dry-run padrão e escrita apenas
  com `--commit`;
- `scripts/verify-indicadores-snapshots.ts`: cobertura, duplicidade, checksum e
  reconciliação.

O gerador:

- agrupa várias linhas do mesmo imóvel sem trocar aluguel por multa ou encargo;
- usa `imobiliaria + empreendimento + unidade normalizada`;
- cria snapshot desconhecido para imóvel esperado sem linha;
- persiste ausências como `null`;
- atualiza snapshots ao processar, reprocessar ou corrigir fechamento;
- é determinístico e idempotente.

### 3.3 API e DTO

`GET /api/indicadores` aceita `competencia`, `empresaId`, `empreendimentoId` e
`imovelId`. O imóvel usa UUID real e recalcula todos os indicadores.

A URL da página também preserva `tab`, `metric` e `heatMetric`.

`IndicadoresData` é organizado em:

- `meta`;
- `cobertura`;
- `resumo`;
- `ponteFinanceira`;
- `realizacaoAluguel`;
- `serieMensal`;
- `rankingAtencao`;
- `heat`;
- `receitasPorImovel`;
- `filtros`.

A última competência disponível é o padrão, mesmo parcial, com a parcialidade
sempre explícita.

## 4. Slices e gates

### Slice 0 — Contrato e baseline

Responsável: root.

- criar branch e este plano;
- registrar a divergência da quarta aba antes do código;
- atualizar contrato, modelo de domínio e CA-IND02 em diante;
- rodar lint, typecheck, build, suíte e auditoria;
- registrar oráculos sanitizados para competência recente, março/2026 e cenário
  somente cadastro.

Gate: worktree limpa e baseline documentado.

Commit: `docs(indicadores): congela contrato operacional`.

### Slice 1 — Schema de snapshots

Responsável: `database-architect`. Allowlist: apenas a nova migration.

Gate: migration do zero; duplicidade rejeitada; tipos/índices confirmados;
nenhuma migration anterior alterada.

Commit: `feat(indicadores): adiciona snapshots mensais`.

### Slice 2 — Domínio e persistência

Responsável: `backend-specialist`; `test-engineer` escreve somente testes.

Gate: zero diferente de `null`; homônimos não colidem; multa não substitui
aluguel; zero ambíguo não vira vacância; upsert não duplica; tolerância de
R$ 0,01.

Commit: `feat(indicadores): materializa snapshots por competencia`.

### Slice 3 — Backfill e verificação

Responsáveis: `database-architect` e `test-engineer`.

Gate: dry-run sem escrita; canário; repetição sem duplicidade/checksum novo;
fontes inalteradas; backfill completo só após canário reconciliado.

Commit: `chore(indicadores): adiciona backfill idempotente`.

### Slice 4 — Agregação e API

Responsável: `backend-specialist`.

Gate: sem N+1; 400 em parâmetro inválido; 500 sem segredo; rascunho não altera
resultado; filtro recalcula tudo; sem meses futuros; médias ponderadas; testes
focados verdes.

Commit: `feat(indicadores): publica agregados operacionais confiaveis`.

### Slice 5 — Shell responsivo

Responsável: `frontend-specialist-shell`.

- `>=1200px`: sidebar fixa de 220px;
- `768–1199px`: rail de 72px;
- `<768px`: menu em Sheet e conteúdo com 16px;
- skip link, foco restaurado e notificações dentro da viewport;
- não editar `components/ui/sidebar.tsx`.

Gate: 390, 768, 1024 e 1440px sem overflow da página.

Commit: `feat(shell): torna navegacao responsiva`.

### Slice 6 — Página, Visão geral e Receita & repasse

Responsável: `frontend-specialist-indicadores`.

Entregar título **Operação financeira da carteira**, cobertura persistente,
estado na URL, cancelamento de requests obsoletos, skeleton/retry, fonte e
qualidade dos KPIs, ocupação da competência versus hoje, ponte, realização do
aluguel e ranking orientado à ação.

Gate: frontend não recalcula finanças; ausente não vira zero; resposta antiga
não vence filtro novo; tabs/toggles acessíveis; console limpo.

Commit: `feat(indicadores): redesenha resumo receita e repasse`.

### Slice 7 — Heatmap, receitas por imóvel e hardening

Responsável: `frontend-specialist-indicadores`.

Entregar heatmap de snapshots, coluna Hoje, identificação de histórico
recomposto, ausência com `—`, valores além da cor e tabela com busca,
ordenação, paginação, CSV, referência normalizada e linhas expansíveis no
mobile.

Gate: scroll interno sem overflow da página; semântica de tabela; estados vazio,
parcial, recomposto e erro; 360, 390, 768, 1024, 1280 e 1440px.

Commit: `feat(indicadores): conclui riscos e receitas por imovel`.

### Slice 8 — QA, rollout e documentação

Responsáveis: `test-engineer`, `database-validator` e root.

Adicionar `tsx` como devDependency e scripts reproduzíveis, testes sem produção,
percurso autenticado, migration/backfill em descartável ou staging e atualizar
os documentos finais.

Gate: segurança; schema; testes; typecheck; lint; build; checklist; navegador
sem console error; auditoria de allowlists.

Commits:

- `test(indicadores): cobre fluxos operacionais`;
- `docs(indicadores): registra validacao e rollout`.

Após cada slice, atualizar `docs/12-execution-roadmap.md` com progresso,
validação, decisões, arquivos e próxima ação.

## 5. Orquestração

Máximo: root + três agentes.

| Onda | Agente A | Agente B | Agente C |
|---|---|---|---|
| 0 | Root: contrato/baseline | — | — |
| 1 | Database: migration | Backend: domínio/tipos | Frontend: shell |
| 2 | Backend: persistência/API | Testes: RED/GREEN | Frontend: overview |
| 3 | Database: backfill/canário | Frontend: abas restantes | QA: navegador |
| 4 | Root: integração | QA: gate final | Docs: atualização final |

Regras:

- agentes não executam Git;
- apenas root cria branch, faz stage e commit;
- stage sempre usa paths explícitos;
- cada agente respeita sua allowlist e para se precisar ampliá-la;
- agentes não inventam campos, fórmulas ou fallbacks;
- nenhum escritor começa antes deste contrato.

Cabeçalho obrigatório dos prompts:

```text
Você trabalha em checkout compartilhado e não pode executar comandos Git.
Edite somente a allowlist abaixo.
Leia docs/README.md, docs/02-mock-contract.md,
docs/06-acceptance-criteria.md, docs/12-execution-roadmap.md
e docs/PLAN-indicadores-operacionais.md.
O contrato está congelado. Não invente campos ou regras.
Ao terminar, informe arquivos alterados, comandos executados,
resultado dos gates e riscos restantes.
```

## 6. Matriz mínima de testes

- status elegível, rascunho, arquivado e reprocessamento;
- unidades homônimas em empreendimentos distintos;
- múltiplas linhas, multa e intermediação;
- zero versus `null`;
- imóvel sem linha, aluguel esperado ou vínculo;
- snapshot nativo, recomposto, parcial e ausente;
- backfill dry-run, canário, repetição e retomada;
- competência parcial explicitamente preliminar;
- séries sem meses futuros;
- ponte com/sem comprovante e repasse embutido;
- despesas detalhadas e legado;
- taxas ponderadas;
- heatmap com zero, ausente, inadimplente e vago;
- filtros isolados/combinados e troca rápida;
- reload e URL compartilhável;
- desktop, tablet, mobile, teclado, foco, contraste e reduced motion.

Bloqueiam a entrega: diferença acima de R$ 0,01; snapshot duplicado; backfill
alterando fontes; filtro incoerente; ausência convertida em zero; 5xx
inesperado; erro de console; teste instável; typecheck, lint ou build vermelho.

## 7. Rollout e rollback

Rollout:

1. aplicar migration aditiva;
2. dry-run;
3. canário de uma competência/empreendimento;
4. reconciliar e repetir o canário;
5. executar backfill completo;
6. publicar backend e testar API;
7. publicar frontend e shell;
8. monitorar erros, latência, cobertura e divergências.

Rollback:

- falha de migration: reverter a transação e não iniciar backfill;
- backfill parcial: interromper e retomar de forma idempotente;
- snapshot incorreto: voltar o backend à leitura anterior e preservar a tabela
  para diagnóstico;
- frontend/shell: restaurar deployment anterior sem tocar o banco;
- nunca executar down migration destrutiva em produção;
- excluir snapshots recompostos só após backup e por `origem` e
  `calculo_versao`.

## 8. Baseline anterior à implementação

Executado em 2026-07-13, commit-base `b45f737`:

- `pnpm lint`: passou;
- `pnpm exec tsc --noEmit`: passou;
- `pnpm build`: passou; único aviso é a convenção legada `middleware`;
- `pnpm dlx tsx --test lib/server/*.test.ts lib/*.test.ts`: 92/92 testes;
- `pnpm dlx tsx scripts/audit-indicadores.ts`: passou contra a base configurada.

Oráculos sanitizados:

| Cenário | Receita | Aluguel cadastrado | Ocupação exibida | Evidência de risco |
|---|---:|---:|---:|---|
| Mais recente, 05/2026 | R$ 41.244,29 | R$ 67.339,69 | 93,8% (106/113) | competência parcial sem cobertura explícita |
| 03/2026 | R$ 92.658,06 | R$ 67.339,69 | 93,8% (106/113) | ocupação repete o cadastro atual e receita supera o aluguel por incluir outros componentes |
| Somente cadastro | `null` financeiro | conforme imóveis ativos | posição atual | a nova UI deve separar **Hoje** e nunca inventar histórico |

O baseline confirma que a implementação não pode comparar receita total com
aluguel contratado como se fossem o mesmo conceito nem reutilizar a posição
atual como ocupação histórica.

## 9. Assumptions

- cadastro de imóveis continua sendo a fonte da posição atual;
- snapshots recompostos são best-effort e sempre identificados;
- histórico não é inventado quando a fonte não permite;
- aging por dias fica fora deste ciclo;
- o mock permanece contrato visual salvo as divergências documentadas;
- produção nunca é o primeiro ambiente da migration ou do backfill.

## 10. Refinamentos de dados após auditoria em navegador — 2026-07-14

Os seguintes comportamentos passam a integrar o contrato operacional:

- a diferença de repasse permanece `comprovado externo − apurado` mesmo quando
  a competência também contém repasse informado no extrato; o valor do extrato
  continua separado e não substitui comprovante;
- filtros por imóvel identificam KPIs atribuíveis como originados do snapshot e
  mantêm como ausentes os baldes do fechamento sem atribuição segura;
- cada lacuna de cobertura inclui os pares, imóveis ou unidades afetados, além
  da contagem agregada;
- qualquer valor não zero em `outrosAjustes` é destacado com seu percentual do
  aluguel contratado e uma ação explícita de revisão;
- referências financeiras contendo apenas um número de 1 a 31 são apresentadas
  como `Dia N`, inclusive no CSV; competências ISO permanecem `MM/AAAA`;
- vacância por imóvel/competência usa escala binária (`0% não vago` e `100%
  vago`); a escala contínua de seis faixas permanece exclusiva da
  inadimplência.

Validação executada com a competência 05/2026 e filtro isolado em 03/2026:
73 testes focados, typecheck e lint verdes; navegador autenticado confirmou
valores, fontes, lacunas nominais, CSV, ausência de overflow em 390 px e console
sem erros.
