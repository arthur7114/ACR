# Plano revisado (v2) — Correção estrutural do ACR: recebimentos extraordinários canônicos

> Revisão do plano de 2026-08-27 produzido a partir do feedback de agosto (vídeos + conversa ACR | YRM).
> Esta v2 corrige erros factuais verificados contra o código, fecha lacunas de especificação do modelo
> canônico e divide o escopo em quatro sub-planos independentemente entregáveis.
> Cada sub-plano deve ganhar seu próprio plano de implementação bite-sized (TDD) no início da execução —
> este documento é o plano-mestre, não o plano de tarefas.

## O que mudou em relação à v1

| # | v1 dizia | Verificado no código | v2 |
|---|---|---|---|
| 1 | "suíte focada passa 113/113" | `pnpm test` = **421/421** verdes | Números corrigidos; oráculo = 421 verdes + 4 canários vermelhos |
| 2 | "atualizar docs/02-mock-contract.md: alterar CA14.2" | CA14.2 mora em `docs/06-acceptance-criteria.md:37`; o mock contract tem a regra correlata em `docs/02-mock-contract.md:53` | Ambos os arquivos listados, com linha exata |
| 3 | "Validar Prisma/Supabase" | Não há Prisma no repo; referência herdada de seção obsoleta de `AGENTS.md:126-145` | Prisma removido do plano; tarefa nova: limpar AGENTS.md |
| 4 | "CONTEXT.md: retirar regras transitórias que contradigam o mock" | CONTEXT.md não define base de intermediação e não contradiz o mock | Instrução removida |
| 5 | P1.2: "adicionar guarda transacional/índice", "falhar fechado se houver mais de um fechamento elegível" | `unique (imobiliaria_id, empreendimento_id, competencia)` existe desde `202605150001_initial_fechamentos.sql:35` | P1.2 reescopado: o risco real é **duplicata por alias** (IDs diferentes para a mesma entidade), não por ID |
| 6 | P0.5: "bloquear fonte ausente e cobertura incompleta" (como greenfield) | Modelo de cobertura/confiança **já existe** (`buildConfidenceStatus`, `summarizeProofCoverage`) mas é apenas informativo; checksum sha256 já persiste em `documento_fontes` | P0.5 reescopado: **tornar bloqueante o que já é reportado** + adicionar verificação de existência do objeto no Storage no caminho de aprovação |
| 7 | migration aditiva no primeiro ciclo (P0.1) | A análise inteira persiste como JSONB (`fechamentos.analise_completa`) | P0.1 **não precisa de migration SQL**; migrations só em P0.3/P0.4 (snapshots/eventos/cobrança) |
| 8 | componentes com `garagem` monetária no schema atual | Schema atual tem apenas `vagas_garagem` (contagem, inteiro) e `iptu` como único encargo monetário | Adaptador legado especificado sobre os campos que existem de fato |
| 9 | comando de teste aponta para arquivo externo com imports absolutos do checkout principal | `repro-current-bugs.test.ts` importa de `/Users/arthurbrito/Documents/Dev/ACR/` — rodá-lo valida o código do checkout errado quando se trabalha em branch/worktree | Fase 0 porta os canários para o repo com imports relativos |
| 10 | `FinanceiroResolvido.totalRecebido: number` (não-nulo) | — | Contradiz o próprio fail-closed do plano; tipo revisto com estado explícito de "não resolvido" |
| 11 | "teste de contrato impede fórmula financeira direta fora do módulo" (sem mecanismo) | — | Mecanismo especificado (tipo de entrada da agregação + allowlist de acesso a campos brutos) |
| 12 | "119/119 snapshots esperados" (constante mágica) | — | Denominador derivado de dados, com derivação registrada no critério de aceite |

## Diagnóstico (agora confirmado em código, com evidência)

A tese central da v1 está **correta e verificada**: não existe representação canônica para
recebimentos extraordinários, e cada consumidor recalcula por conta própria. Contagem real:
**cinco fórmulas independentes** de comissão/repasse:

1. `components/acr/views/revisao-view.tsx:1559` — `repasse = item.valor - (item.comissao ?? 0)` por linha;
2. `components/acr/views/revisao-view.tsx:768-769` — totais da seção somando `item.valor`;
3. `lib/fechamento-operacional.ts:110-116` — `calcularResumoReceitasAdicionais` classifica por `item.valor`;
4. `lib/indicadores-aggregation.ts:1361-1368` — `sumBrokerageCommission` soma só `comissao`;
5. `lib/server/indicadores-snapshots.ts:349-352, 387-391` — snapshots mapeiam só `item.valor`.

O único resolvedor que honra `total_recebido`/`repasse`/`iptu` é `lib/intermediacao.ts:20-43`,
aplicado exclusivamente a `tipo === "intermediacao"` — e mesmo ele resolve base sem garagem e
extrai valores de `observacao` por regex (`parseTaggedMoney`), o fallback oculto arquetípico.

Agravante estrutural que a v1 não nomeou: o tipo de entrada da agregação
(`lib/indicadores-aggregation.ts:103-110`) declara apenas
`tipo, comissao, apto, valor, competencia_original, competencia_recebimento` — ou seja,
`total_recebido` e `repasse` são **estruturalmente inalcançáveis** nos indicadores hoje.
Isso é ruim como bug e ótimo como alavanca: trocar esse tipo pela saída canônica gera erro de
compilação em todos os pontos de consumo, transformando a migração em checklist do compilador.

Demais confirmações:

- **Parser** (`lib/server/excel-parser.ts`): `mapColumns` localiza a coluna GARAGEM (`:301`),
  mas `parseReceivedSection` (`:167-199`) nunca a lê; o texto do cabeçalho de seção é descartado
  após o match (`:168`), então "INTERMEDIAÇÃO DE JUNHO DE 2026 RECEBIDA EM JULHO" não vira
  `competencia_original`; `valor = principal ?? total_recebido ?? 0` (`:182`).
- **Prompt** (`lib/server/ai-agents/prestacao-alive-agent.ts:37`): instrui explicitamente
  "sem somar garagem, IPTU, seguro ou encargos" na base. Importante: isso **não é um bug de
  prompt** — é regra documentada em `docs/02-mock-contract.md:53` e CA14.2. A correção é uma
  mudança de especificação amparada na instrução da cliente, e deve ser tratada como tal (Fase 0).
- **Estado mensal** (`lib/indicadores-domain.ts:3-9, 81-83`): enum único; `hasTermination`
  short-circuita antes de vacância e inadimplência — unidade em rescisão nunca conta como vaga.
  Drift latente: `alugado_app` existe no union TS mas não no CHECK do banco nem no classificador.
- **Cobrança esperada**: zero ocorrências de `cobranca_esperada` no repo; gap =
  `aluguelEsperado − recebido` (`lib/indicadores-aggregation.ts:973-975`). Inconsistência extra
  descoberta na verificação: `lib/inadimplencia-mes.ts:29-39` usa `receita_total` do último
  snapshot pago (inclui encargos **por acidente**), divergindo da própria agregação.
- **Fonte/cobertura**: o caminho de aprovação (`fechamento-approval-gates.ts:7-21`) não verifica
  a existência do objeto no Storage; a dedup por sha256 (`persist-package.ts:415-437`) reusa
  `arquivo_url` de linha anterior sem verificar que o objeto ainda existe.

Refutado: duplicata de fechamento por (imobiliária, empreendimento, competência) **com os mesmos
IDs** é irrepresentável no banco. O risco remanescente é semântico: duas linhas de
`empreendimentos`/`imobiliarias` para a mesma entidade real (aliases). P1.2 foi reescopado.

## Decisão de arquitetura (revista)

Mantida a criação do módulo profundo `lib/recebimentos-extraordinarios.ts` como único resolvedor
financeiro. Três correções no contrato:

### 1. União discriminada por tipo, não tipo achatado

O tipo achatado da v1 (tudo opcional, `componentes` misturando `principal`, `aluguelLiquido` e
encargos no mesmo nível) empurra a complexidade de volta para o resolvedor e os consumidores.
Em vez disso:

```ts
type EvidenciaExtracao = {
  documentoId: string | null
  secao: string | null
  linhaOuTrecho: string | null
  confianca: number
}

type BaseRecebimento = {
  imovelId: string | null
  apto: string | null
  inquilino: string | null
  competenciaOrigem: string | null       // herdada do cabeçalho da seção quando a linha não repete
  competenciaRecebimento: string
  evidencia: EvidenciaExtracao
  // valores autoritativos do documento — nunca recalculados silenciosamente
  totalRecebidoInformado: number | null
  comissaoInformada: number | null
  repasseInformado: number | null
}

type RecebimentoExtraordinario = BaseRecebimento & (
  | { tipo: "intermediacao"
      componentes: { aluguel: number | null; garagem: number | null;
                     iptu: number | null; seguro: number | null; outrosEncargos: number | null }
      percentualInformado: number | null }
  | { tipo: "rescisao"
      principal: number | null            // bruto do documento
      ajuste: number | null               // desconto (−) ou crédito (+), sinalizado
      componentes: { garagem: number | null; encargos: number | null } }
  | { tipo: "acordo" | "atraso"
      principal: number | null
      componentes: { garagem: number | null; encargos: number | null } }
  | { tipo: "outro"; valorInformado: number | null }
)
```

### 2. Resolvedor fail-closed de verdade

`FinanceiroResolvido` da v1 forçava `totalRecebido: number` não-nulo — o que obriga o resolvedor
a inventar um número exatamente quando o plano proíbe inventar. Corrigido:

```ts
type ResolucaoFinanceira =
  | { status: "resolvido"
      baseComissionavel: number | null
      totalRecebido: number
      comissao: number
      repasse: number
      percentualRealizado: number | null
      reconciliado: boolean
      divergencias: DivergenciaFinanceira[] }
  | { status: "pendente"
      motivo: "evidencia_insuficiente" | "equacao_inconsistente" | "vinculo_ausente"
      pendencia: PendenciaRevisao }       // vai para o painel de pendências, nunca para totais
```

Item `pendente` nunca entra em soma confirmada, nunca vira zero e sempre gera pendência visível.

### 3. Base comissionável por componente, não par fixo

Em vez de gravar "aluguel + garagem" como regra universal (o próprio risco "regra variar por
imobiliária" da v1), a base é a soma dos **componentes marcados comissionáveis** presentes na
linha. Mapa default: `aluguel` e `garagem` comissionáveis; `iptu`, `agua`, `seguro`,
`outrosEncargos` não. O mapa é dado do domínio (constante versionada e testada), sobreponível por
imobiliária apenas com documento/contrato explícito — nunca inferido. O efeito prático em julho é
idêntico (Grand Castelão: 650 + 25 = 675; 405/675 = 60%), mas a regra fica auditável e extensível.

### 4. Onde a resolução acontece (a v1 era silenciosa nisso)

- **Revisão e resumo**: resolve-at-read a partir do JSONB bruto (`fechamentos.analise_completa`).
  Nada persiste; correções no resolvedor se propagam sem reprocessar.
- **Snapshots e indicadores**: resolve-at-write, gravando junto a versão do resolvedor
  (`resolver_version`). Snapshot antigo declara com qual versão foi calculado; reparo = recalcular
  com versão nova sob o fluxo de reparo auditado (Fase 4), nunca implicitamente.

### Enforcement de "nenhuma fórmula fora do módulo"

A v1 pedia um "teste de contrato" sem dizer como. Mecanismo concreto, em três camadas:

1. **Compilador**: o tipo de entrada de `lib/indicadores-aggregation.ts:103-110` e dos snapshots
   passa a ser `ResolucaoFinanceira` (não o item bruto). Todo call site quebra em compile-time.
2. **Allowlist testada**: teste de contrato (grep estruturado) que falha se
   `total_recebido|repasse|\.valor` de itens de `acordos_rescisoes_recebidos` for lido fora de
   `lib/recebimentos-extraordinarios.ts` e do adaptador legado.
3. **Revisão**: `revisao-view.tsx` deixa de receber itens brutos; recebe itens já resolvidos com
   decomposição (principal / ajustes / recebido / comissão / repasse) e pendências.

## Regras financeiras (inalteradas na substância)

1. Intermediação: base = componentes comissionáveis (aluguel + garagem quando presentes);
   encargos compõem `totalRecebido` e `repasse`, não a base.
2. Acordo/atraso: `principal` não substitui `totalRecebido`; componentes adicionais explícitos.
3. Rescisão: principal bruto, ajuste, líquido recebido, comissão e repasse são grandezas distintas.
4. Valores autoritativos: `totalRecebidoInformado`/`repasseInformado` são preservados e validados
   pela equação (`recebido − comissão = repasse` ± 1 centavo); divergência → `divergencias[]`, não
   recálculo silencioso.
5. Fail-closed: sem evidência suficiente → `status: "pendente"`, fora de qualquer total confirmado.

## Contrato e documentação (ponteiros corrigidos)

Antes ou junto da implementação (Fase 0):

- `docs/06-acceptance-criteria.md:37` — **CA14.2**: estender a regra de preservação de valores
  explícitos (hoje só intermediação) para todos os tipos; alterar a base para componentes
  comissionáveis. Registrar a evidência da mudança (instrução da cliente + documento Grand Castelão).
- `docs/02-mock-contract.md:53` — atualizar a apresentação da base de intermediação (garagem entra).
- `docs/03-domain-model.md` — componentes do recebimento, mapa de comissionabilidade,
  estado-fim-de-competência vs eventos, cobrança esperada.
- `docs/06-acceptance-criteria.md` — novos critérios: acordo, rescisão, competência herdada do
  cabeçalho, fail-closed, e os valores-canário abaixo.
- `.agent/ARCHITECTURE.md` — registrar o seam canônico.
- `AGENTS.md:126-145` — **remover a seção Prisma obsoleta** (não há Prisma no repo).
- `docs/12-execution-roadmap.md` — registrar cada ciclo.

(Removido da v1: edição de CONTEXT.md — verificado que não contém regra transitória conflitante.)

## Escopo dividido em quatro sub-planos entregáveis

Cada um produz software funcional e testável sozinho, e ganha seu plano de implementação
bite-sized próprio ao iniciar.

### Sub-plano A — Financeiro canônico (absorve P0.1 + P0.2)

Arquivos: `lib/prestacao-types.ts`, novo `lib/recebimentos-extraordinarios.ts`,
`lib/fechamento-operacional.ts`, `lib/indicadores-aggregation.ts`,
`lib/server/indicadores-snapshots.ts`, `components/acr/views/revisao-view.tsx`,
`lib/server/excel-parser.ts`, `lib/server/ai-agents/prestacao-alive-agent.ts`,
`lib/server/package-rechecks.ts`, `lib/server/analyze-prestacao.ts`.
`lib/intermediacao.ts` é absorvido pelo módulo canônico (deprecação com adaptador).

- Sem migration SQL: o shape novo vive no JSONB `analise_completa`; adaptador único normaliza
  análises legadas (`valor`, `vagas_garagem`, `iptu`) para `RecebimentoExtraordinario`.
- Parser: ler `columns.garagem` em `parseReceivedSection`; herdar competência do cabeçalho da
  seção; separar origem × recebimento; "R$ -" nunca vira item.
- Guards: seção explícita + valor próprio não-zero + vínculo por unidade ou evidência textual;
  senão `pendente`. ENEL/CAGECE/seguro jamais reclassificados como intermediação.
- Prompt: corrigir a instrução de base (junto com CA14.2, nunca antes).

Aceite (canários A): Grand Maracanaú 204 e total de acordos; LOCMAIS; Grand Castelão; GMI —
tabela abaixo — idênticos em revisão, resumo, snapshot e payload derivado.

### Sub-plano B — Estado × evento + cobrança esperada (absorve P0.3 + P0.4)

Arquivos: `lib/indicadores-domain.ts`, `lib/server/indicadores-snapshots.ts`,
`lib/indicadores-aggregation.ts`, `lib/inadimplencia-mes.ts`, domínio de contratos/vigências,
migrations de `imovel_competencias`.

- `status_fim_competencia`: `ocupado | inadimplente | vago | desconhecido`; eventos independentes
  (`rescisao`, `entrada`, `saida`, `pagamento_atrasado`) em tabela própria.
- Resolver o drift `alugado_app` (existe no TS, não no CHECK nem no classificador): ou promover
  ao banco ou remover do union — decidir na Fase 0.
- `cobranca_esperada` por componentes (aluguel + garagem + aplicáveis), com vigência/evidência;
  gap de inadimplência calculado contra ela. Corrigir também `inadimplencia-mes.ts:29-39`, que
  hoje diverge da agregação por usar `receita_total` encargo-inclusiva por acidente.
- Dívida acumulada vira dimensão própria (coluna/estrutura no snapshot), fora do status.
- Migrations aditivas + backfill em dry-run com relatório; `desconhecido` ≠ zero.

Aceite (canários B): Grand Maracanaú julho = 2 vagas (201, 214), 214 com evento de rescisão;
204 cobrança esperada 414,86 + 52,07 = 466,93 com fórmula visível.

### Sub-plano C — Gates bloqueantes (P0.5 + P1.2 reescopados)

- **Estender, não criar**: `buildConfidenceStatus`/`summarizeProofCoverage` já classificam;
  a mudança é ligar `incompleto`/`com_divergencia` aos gates de aprovação e à elegibilidade
  de agregação (fail-closed com justificativa formal de não-aplicabilidade como escape auditado).
- Verificação de existência + checksum do objeto no Storage no caminho de aprovação
  (`fechamento-approval-gates.ts`), e na dedup por sha256 de `persist-package.ts:415-437`;
  estado `documento_indisponivel` quando o registro existe e o objeto não.
- P1.2 reescopado: normalização de aliases **antes** da criação do fechamento
  (`empreendimento_aliases` já existe — usar como fonte canônica); em leitura, se dois
  fechamentos elegíveis mapearem para a mesma entidade canônica via alias, falhar fechado;
  ação explícita de mesclar/arquivar com auditoria. (O índice único por IDs já existe; não recriar.)
- Denominadores de cobertura (ex.: "9 pares", "119 snapshots") **derivados de consulta**, com a
  derivação registrada no critério de aceite — nunca constantes no código.

Aceite: LOCMAIS julho bloqueado até reupload; Terreno Castelão explícito como incompleto (≠ zero);
cobertura completa só com todos os pares elegíveis ou justificativa formal.

### Sub-plano D — Reparo de julho + aceite com a cliente (Fases 4 + 5 da v1, inalteradas na substância)

Mesma ordem da v1: recuperar LOCMAIS/Terreno Castelão → dry-run dos 9 pares → conferir canários →
aprovação operacional → transação idempotente com snapshot anterior → recalcular indicadores →
**não** reenviar ao eGestor automaticamente (conciliar IDs externos e payloads antes).
Roteiro de aceite com a cliente mantido (4 vídeos, canários, 2 vagas, competência de junho,
GMI, nomes, série de 12 meses, definição de aluguel médio), com um acréscimo: plano de reversão
comunicável caso a cliente rejeite algum valor durante o aceite (restaurar snapshot anterior do
par afetado, registrar exceção no roadmap, manter demais pares aprovados).

P1.1 (despesas itemizadas com proveniência), P1.3 (explicar indicadores) e P2 (observabilidade)
permanecem como na v1, executados após A–D ou intercalados quando não conflitarem.

## Fase 0 revista — congelar o oráculo sem quebrar o portão verde

A v1 mandava "manter os novos testes vermelhos até o início da implementação" — isso quebra
`pnpm test` como portão de qualidade para qualquer outro trabalho no repo. Em vez disso:

1. Portar os 4 canários de `repro-current-bugs.test.ts` para `tests/canary/*.test.ts` **no repo,
   com imports relativos** (os atuais apontam para o checkout principal por caminho absoluto —
   rodá-los de uma branch/worktree valida o código errado).
2. Script separado: `"test:canary": "node --import tsx --test tests/canary/*.test.ts"` —
   permitido vermelho; `pnpm test` continua verde e bloqueante.
3. Cada sub-plano, ao concluir, promove seus canários para a suíte principal.
4. Registrar os valores-canário em `docs/06-acceptance-criteria.md` (aritmética conferida:
   todas as equações da tabela fecham).
5. Atualizar CA14.2 / mock contract / domínio / ARCHITECTURE / AGENTS.md conforme a seção de
   documentação acima.

## Valores-canário de julho (inalterados; aritmética verificada)

| Fechamento | Regra/valor esperado |
|---|---|
| Grand Maracanaú — comissão | regular 381,31; acordos 83,15; total 464,46 |
| Grand Maracanaú — acordo 204 | recebido 466,93; comissão 32,69 (7%); repasse 434,24 |
| Grand Maracanaú — total acordos | recebido 1.187,84; comissão 83,15; repasse 1.104,69 |
| Grand Maracanaú — ocupação | 2 vagas: aptos 201 e 214; 214 com evento de rescisão |
| Grand Castelão I — intermediação | base 675,00 (650 + 25); 60%; comissão 405,00; origem 06/2026; recebido 07/2026; total 726,44; repasse 321,44 |
| LOCMAIS — rescisão | principal 1.890,00; ajuste −226,44; recebido 1.663,56; comissão 116,45; repasse 1.547,11 |
| Grand Messejana I | intermediação 0; ENEL 127,95 (despesa); seguro apto 01 140,40 (despesa) |
| Plural | aluguel 3.348,52; administração 267,88; repasse 3.080,64 |
| César Rêgo | separação João Cordeiro/Pompílio preservada; total líquido conciliado 13.068,01 |
| Terreno Castelão | desconhecido/incompleto até o documento de julho ser disponibilizado |

## Estratégia de testes (ajustes sobre a v1)

- **Camada 1 (domínio puro)**: tabela por tipo da união discriminada; precedência de valores
  informados; equação ± 1 centavo; competência herdada; `pendente` para evidência insuficiente;
  mapa de comissionabilidade.
- **Camada 2 (parser)**: fixtures dos 4 layouts reais anonimizados; coluna garagem lida;
  cabeçalho de competência; seção zerada; metamorfismo (ordem/posição sem mudar semântica);
  coluna reconhecida e descartada → alerta obrigatório.
- **Camada 3 (consumidores)**: mesmo `ResolucaoFinanceira` em revisão, resumo, snapshot,
  indicadores e payload; teste de contrato com allowlist (mecanismo definido acima);
  gates bloqueiam confirmação.
- **Camada 4 (reparo/E2E)**: dry-run determinístico e idempotente; antes/depois por fechamento;
  upload→revisão autenticado; `.agent/scripts/checklist.py`.

Comandos por ciclo:

```
pnpm test:canary        # vermelho até o sub-plano correspondente concluir
pnpm test               # sempre verde (421+ hoje)
pnpm lint
pnpm exec tsc --noEmit
pnpm build
python3 .agent/scripts/checklist.py
```

Migrations: validar via `supabase db push` em ambiente de desenvolvimento + teste de leitura de
compatibilidade. (Sem Prisma — não existe no projeto.)

## Migração e compatibilidade (revista)

- Sub-plano A: **zero migration** — shape novo no JSONB, adaptador para análises antigas com
  telemetria de uso do adaptador.
- Sub-planos B/C: migrations aditivas (eventos, cobrança esperada, `resolver_version`,
  `documento_indisponivel`); backfill em dry-run com relatório; `null`/`desconhecido` ≠ zero.
- Remoção de campos legados (`valor` com semântica polissêmica) só após consumidores, histórico e
  reparos migrarem — ciclo próprio, nunca no primeiro.
- Snapshot do JSON anterior + checksum do documento antes de qualquer reparo; uma competência por
  vez, restaurável.

## Riscos e controles (v1 mantida + novos)

| Risco | Controle |
|---|---|
| Alterar totais históricos corretos | canários + dry-run + whitelist + snapshot anterior |
| Duplicar lançamentos no eGestor | sem reenvio automático; conciliar IDs externos e payloads |
| Aceitar inferência do OCR como fato | fail-closed (`pendente`), evidência por seção/linha |
| Regra variar por imobiliária | mapa de comissionabilidade sobreponível só com documento explícito |
| Backfill converter ausência em zero | `desconhecido` distinto de zero em tipo e em banco |
| **(novo)** Snapshot resolvido ficar obsoleto quando o resolvedor mudar | `resolver_version` gravada; recálculo só via fluxo de reparo auditado |
| **(novo)** Canários validando o checkout errado | canários no repo com imports relativos (Fase 0.1) |
| **(novo)** Suíte principal vermelha bloqueando trabalho paralelo | `test:canary` separado até a promoção |
| **(novo)** Cliente rejeitar valor durante o aceite | reversão por par via snapshot anterior + exceção registrada |
| Complexidade vazar para consumidores | interface única (`ResolucaoFinanceira`); allowlist testada |

## Fora do escopo imediato (inalterado)

Redesenho visual amplo; automação de correções no eGestor; reprocessar competência sem fonte
íntegra; inferir regra comercial por semelhança; tratar arquivos de março como evidência de julho.

## Critério de conclusão (números corrigidos)

1. Contrato, mock e critérios de aceite alinhados (CA14.2 estendido, base por componentes).
2. `pnpm test:canary` 4/4 verde, promovido à suíte principal; `pnpm test` verde (≥ 421 + novos).
3. Todos os consumidores exibem os mesmos valores canônicos (verificado pelo teste de contrato).
4. Pares de julho com cobertura completa ou justificativa formal, com denominador derivado de dados.
5. Documentos-fonte existentes e verificáveis (objeto + checksum) no caminho de aprovação.
6. Reparo de julho auditável, idempotente, aprovado antes da escrita, reversível por par.
7. Cenários dos 4 vídeos reproduzidos com a cliente e aceitos.
8. `docs/12-execution-roadmap.md` registrando validações, decisões, arquivos e próximo passo.
