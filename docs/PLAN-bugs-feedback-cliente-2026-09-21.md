# Mapa de bugs — feedback do cliente (2026-09-21)

Levantamento de código para cada item reportado: onde vive, o que está errado,
o que muda e o que ainda precisa de decisão. **Nenhum código foi alterado.**

Legenda de confiança:
- **Confirmado** — a causa está lida no código.
- **Provável** — o caminho está mapeado, falta reproduzir com dado real.
- **Decisão** — não é defeito, é regra de negócio a definir antes de codar.

Ordem sugerida de ataque: P0 (números errados) → P1 (leitura errada) →
P2 (renomeações e remoções) → P3 (o que depende de dado novo).

---

## P0 — números errados  ·  ✅ RESOLVIDO EM 2026-09-21

> Itens 1 e 2 corrigidos e verificados; item 3 não reproduziu e segue aberto
> aguardando repro da cliente. Detalhes em `docs/12-execution-roadmap.md`.

### 1. Vaga de moto do apto 7 não somou na inadimplência (GM II, ago/2026) — ✅ CORRIGIDO
**Confiança:** Confirmado no banco. GM II = Grand Messejana II (não Maracanaú).
**Correção:** a cobrança esperada passa a herdar a vaga OBSERVADA em mês pago quando
a vigência não declara `garagem_contratada`. Snapshot `recebimentos-canonicos-v3.4`.
**Pendente:** rematerializar os snapshots para o número mudar na tela.

- Valor do mês inadimplente: [lib/inadimplencia-mes.ts:38](lib/inadimplencia-mes.ts:38) — precedência
  `cobrancaEsperada` → último snapshot pago → aluguel do cadastro → `null`.
- `cobranca_esperada` é montada em
  [lib/server/indicadores-snapshots.ts:536](lib/server/indicadores-snapshots.ts:536):
  `expectedRent + (property.garagemContratada ?? 0)`.
- `garagemContratada` vem de `imovel_vigencias.garagem_contratada` e **só** quando
  `modelo_receita === "fixo"` ([indicadores-snapshots.ts:278](lib/server/indicadores-snapshots.ts:278)).

**Hipótese:** a vigência do apto 7 GM II está sem `garagem_contratada`, então a
vaga de moto some da cobrança esperada — e o inadimplente é cobrado só pelo
aluguel. O `?? 0` faz a ausência virar zero em silêncio, que é o padrão que o
resto do código evita (o projeto trata ausência como `null`, nunca zero).

**Verificar primeiro:**
```sql
select v.vigencia_inicio, v.aluguel_contratado, v.garagem_contratada, v.modelo_receita
from imovel_vigencias v join imoveis i on i.id = v.imovel_id
where i.unidade = '7' and v.ativo order by v.vigencia_inicio;
```

**Correções possíveis (não excludentes):**
1. Backfill da vigência (dado), se for só cadastro faltando.
2. Fallback de observação: [lib/vagas.ts](lib/vagas.ts) já conta vagas no texto
   ("VAGA DE GARAGEM PARA MOTO" aparece nas fixtures de GM II), mas conta
   *quantidade*, não *valor*. Existe `garagem_recebida` no snapshot —
   usar o último valor observado como base quando a vigência não declara.
3. Sinalizar cobertura: quando `garagemContratada` é `null` mas há evidência de
   vaga, a unidade deveria entrar na cobertura como "vaga não precificada" em
   vez de somar zero.

---

### 2. Comissão: 6,1% "efetivo" nos indicadores × 7% no fechamento — ✅ CORRIGIDO
**Confiança:** Confirmado — denominadores diferentes.
**Correção:** o efetivo da administração divide por `base_comissao_administracao`,
a mesma base da Revisão. Soma estrita: fechamento sem a base deixa o efetivo em "—".

- Fechamento: comissão calculada sobre a **base comissionável**
  ([lib/comissao.ts:29](lib/comissao.ts:29)) = aluguel (com desconto) + garagem +
  água + IPTU + seguro incêndio + outros recebimentos.
- Indicadores: `efetivo = administrationCommission ÷ economicRevenue`
  ([lib/indicadores-aggregation.ts:807](lib/indicadores-aggregation.ts:807)), e
  `economicRevenue = analysis.totals.total_receitas`
  ([:707](lib/indicadores-aggregation.ts:707)) — a receita do fechamento inteiro,
  que inclui acordos, rescisões, intermediações e atrasos, itens sobre os quais a
  taxa de administração não incide da mesma forma.

Denominador maior ⇒ percentual menor. 7% vira 6,1%.

**Correção:** o "efetivo" de administração deve dividir pela mesma base do
fechamento (`commissionBaseComponents(...).base` somada por fechamento elegível),
não por `total_receitas`. O alerta "efetivo acima do contrato" (
[view-geral.tsx:580](components/acr/indicadores/tabs/view-geral.tsx:580), gatilho de
meio ponto) hoje nunca acende porque o denominador inflado sempre puxa o efetivo
para baixo — ou seja, o sintoma de retenção dobrada de ago/2026 está mascarado.

**Atenção:** a intermediação usa `baseIntermediacao` (aluguel + garagem), que já
está correta ([:811](lib/indicadores-aggregation.ts:811)). Só a administração muda.

---

### 3. Detalhamento da ocupação não filtra por imóvel — ⚠️ NÃO REPRODUZIU
**Confiança:** Verificado contra o banco real; o filtro funciona nas três camadas.
Carteira 402/467 unidade-mês · imóvel (GM II apto 7) 4/4 · empreendimento (GM II) 90/108.
**Falta:** o repro da cliente — qual filtro, qual competência, qual número apareceu.

Linha em questão: a **segunda** do descritivo sob o Big Number de Ocupação,
[view-geral.tsx:219-227](components/acr/indicadores/tabs/view-geral.tsx:219)
("acumulado desde …: X% · N de M unidade-mês · R$ …"), alimentada por
`resumo.ocupacaoAcumulada` ([indicadores-aggregation.ts:788](lib/indicadores-aggregation.ts:788)).

O que o código **já** faz certo:
- `applyScope` filtra `snapshots` por `filtros.imovelId`
  ([:388-417](lib/indicadores-aggregation.ts:388)).
- `historicalSnapshots` filtra de novo por `expectedPropertyIds`
  ([:265](lib/indicadores-aggregation.ts:265)).
- `byProperty` já anula a inadimplência acumulada, a taxa de contrato, tarifas e
  despesas quando há filtro de imóvel ([:698-740](lib/indicadores-aggregation.ts:698)).

Estaticamente a janela acumulada **deveria** estar filtrada. Antes de codar,
reproduzir: abrir Indicadores, selecionar um imóvel, e comparar as duas linhas.
Suspeitos, nessa ordem:
1. `expectedPropertyIds` vem de `propertiesAtCompetence` (vigência na competência
   selecionada): imóvel sem vigência no mês selecionado zera o denominador atual
   mas o acumulado pode estar lendo outra base.
2. A view lê `data.resumo` mas o PDF e a tabela de registro podem usar recortes
   diferentes — conferir se a divergência aparece só na tela ou também no PDF
   ([lib/indicadores-relatorio.ts:147](lib/indicadores-relatorio.ts:147)).
3. Se o filtro for o de **empreendimento** e não o de imóvel, o caminho é o
   `pairMatch` em [:402](lib/indicadores-aggregation.ts:402).

**Entregável do primeiro passo:** um teste em
[lib/indicadores-aggregation.test.ts](lib/indicadores-aggregation.test.ts) com dois
imóveis e histórico distinto, afirmando que `ocupacaoAcumulada` do recorte de um
imóvel ignora o outro. Se passar de primeira, o bug está na camada de query/tela.

---

## P1 — leitura errada

### 4. Histórico do imóvel: "3 inadimplências" com 1 em aberto (caso Luana)
**Confiança:** Confirmado.

- Métrica: `resumo.mesesInadimplente` =
  `mensais.filter(e => e.tipo === "inadimplente").length`
  ([lib/server/imovel-historico.ts:146](lib/server/imovel-historico.ts:146)),
  exibida como "Inadimplente" em
  [imovel-historico-drawer.tsx:196](components/acr/views/imovel-historico-drawer.tsx:196).

É contagem de **meses que já estiveram** inadimplentes — histórico, não saldo.
Lê como "deve 3". O que falta é o saldo em aberto e o valor.

**Mudanças:**
1. `ImovelHistoricoResumo` ([lib/imovel-historico-types.ts:38](lib/imovel-historico-types.ts:38))
   ganha `inadimplenciasEmAberto: number` e `valorEmAberto: number | null`.
   Quitação = evento `atraso`/`acordo` posterior que referencia a competência
   (`competencia_original` já existe nos recebimentos).
2. Drawer passa a mostrar **em aberto (valor)** como número principal e
   "N meses no histórico" como apoio — regra do Arthur: derivação vai para
   tooltip (`Hint`/`HintIcon`), não solta na tela.
3. Reaproveitar a mesma precedência de valor de
   [lib/inadimplencia-mes.ts](lib/inadimplencia-mes.ts) — nunca R$ 0,00 para
   desconhecido.

### 5. Revisão geral de nomenclatura no histórico
**Confiança:** Confirmado — meio caminho já andado.

`tipoMeta` em
[imovel-historico-drawer.tsx:34-43](components/acr/views/imovel-historico-drawer.tsx:34):
- `atraso` **já** se chama "Inadimplência paga" ✅
- `acordo` ainda se chama "Acordo" ❌ → cliente quer "Inadimplência paga"
- métricas: "Acordos" / "Inad. pagas" / "Rescisões" / "Intermed."
  ([:199-202](components/acr/views/imovel-historico-drawer.tsx:199))

**Decisão necessária:** `acordo` e `atraso` viram **um** rótulo só
("Inadimplência paga", com o parcelamento como detalhe) ou continuam separados
com nomes melhores? Unificar na tela é simples; unificar no **tipo** quebra
`EventoTipo` e a tabela de acordos parcelados (Nível 2, `/api/acordos`). Sugestão:
unificar só a apresentação, manter os tipos.

Varrer também: `resumo.acordos`, a seção "Acordos parcelados", e os rótulos de
`view-receita.tsx` ([:246-257](components/acr/indicadores/tabs/view-receita.tsx:246)).

---

## P2 — tabela de intermediação

### 6. Totais da tabela de intermediação
**Confiança:** Confirmado.

[revisao-view.tsx:1364-1435](components/acr/views/revisao-view.tsx:1364): a tabela
não tem `<tfoot>`. O único total existente é o valor de comissão no cabeçalho da
seção (`intermediacaoValor`, [:1371](components/acr/views/revisao-view.tsx:1371)).

**Mudança:** `<tfoot>` somando base comissionável, encargos, total recebido,
comissão e repasse — somando **só** as linhas `status === "resolvido"`, porque
pendentes não têm efeito financeiro (CA27.2, [recebimentos-extraordinarios.ts:70](lib/recebimentos-extraordinarios.ts:70)).
O rodapé precisa dizer quantas linhas ficaram de fora.

### 7. Quebrar "Encargos" nos componentes da planilha
**Confiança:** Confirmado — o dado já existe, é só expor.

Hoje a coluna "Encargos" é um **resíduo derivado**
(`totalRecebido − baseComissionavel`,
[revisao-view.tsx:1414](components/acr/views/revisao-view.tsx:1414)), não a soma
dos componentes.

`ComponentesIntermediacao` já carrega o detalhe
([lib/recebimentos-extraordinarios.ts:28](lib/recebimentos-extraordinarios.ts:28)):
`aluguel`, `garagem`, `iptu`, `seguro`, `outrosEncargos` (= água, via
`aguaDeclarada`). `normalizarItemLegado` ([:164](lib/recebimentos-extraordinarios.ts:164))
já preenche todos, com fallback de observação para IPTU e água.

**Mudanças:**
1. `resolverRecebimento` passa a devolver os `componentes` na `ResolucaoFinanceira`
   resolvida (hoje ficam só dentro do item normalizado).
2. Colunas: `Aluguel | Garagem | IPTU | Água | Seguro | Total recebido | Comissão | % | Repasse`.
3. Manter uma coluna de resíduo quando `totalRecebidoInformado` não bate com a
   soma dos componentes — o documento é autoritativo e a diferença tem que
   aparecer, não sumir.

**Pendência:** confirmar com a cliente a ordem e os nomes exatos das colunas da
planilha dela (o pedido é "replicar exatamente"). Vale pedir um print da aba.

---

## P3 — gráfico e legenda

### 8. "Aluguel contratado" → "Aluguel potencial"
**Confiança:** Confirmado.

Ocorrências a trocar:
- [charts/monthly-series.tsx:38](components/acr/indicadores/charts/monthly-series.tsx:38) — `"Aluguel contratado (teto)"` (a legenda citada)
- [view-geral.tsx:243](components/acr/indicadores/tabs/view-geral.tsx:243) — card "Aluguel contratado"
- [view-receita.tsx:173](components/acr/indicadores/tabs/view-receita.tsx:173) — fórmula da ponte
- [lib/indicadores-relatorio.ts](lib/indicadores-relatorio.ts) — PDF

**Decisão:** trocar **só** a legenda do gráfico ou o vocabulário inteiro? Se for
inteiro, `docs/02-mock-contract.md` precisa acompanhar (regra 2/3 do AGENTS.md:
não divergir do mock contract sem justificar).

### 9. Barra empilhada no lugar da linha de teto
**Confiança:** Confirmado — mudança estrutural no gráfico.

Hoje ([monthly-series.tsx:31-42](components/acr/indicadores/charts/monthly-series.tsx:31)):
três barras **agrupadas** (recebido / vacância / inadimplência) + o contratado
como **linha de referência** (`VALUE_CEILING`).

Pedido: barra verde (recebido) **empilhada** subindo até o potencial, com o que
não entrou em **cinza**.

**Impacto no código:** `barX` ([:82](components/acr/indicadores/charts/monthly-series.tsx:82))
e `groupWidth` deixam de valer — passa a ser uma barra por mês com offsets
acumulados; `maxValue` passa a ser o potencial; `VALUE_CEILING` sai da legenda.

**Decisão:** o cinza é **um** bloco ("não concretizado") ou continua separado em
vacância (âmbar) e inadimplência (vermelho) empilhadas acima do verde? O pedido
literal é um cinza só, mas isso apaga a distinção que hoje explica a distância
até o teto — e foi ela que o cliente pediu em 2026-09-02. Recomendo: verde +
âmbar + vermelho empilhados, com o resto não explicado em cinza. Confirmar antes.

---

## P4 — depende de dado novo

### 10. Lista de valor dos imóveis para calcular rentabilidade
**Confiança:** Confirmado — o card já existe vazio, de propósito.

[view-geral.tsx:297-311](components/acr/indicadores/tabs/view-geral.tsx:297):
"Rentabilidade" mostra "—" e explica no tooltip que falta o valor do ativo.
Igual no PDF ([indicadores-relatorio.ts:185](lib/indicadores-relatorio.ts:185)).
Decisão registrada em `docs/02-mock-contract.md:290`.

A tabela `public.imoveis`
([202605220001_cadastros_imobiliarios.sql:17](supabase/migrations/202605220001_cadastros_imobiliarios.sql:17))
**não tem** coluna de valor venal nem de aquisição.

**Trilha:**
1. Migration: `valor_referencia numeric(14,2)`, `valor_referencia_origem text`
   (`venal` | `aquisicao` | `avaliacao`), `valor_referencia_data date`.
   Valor muda no tempo — avaliar se precisa de tabela versionada como
   `imovel_vigencias` em vez de coluna solta.
2. Cadastro: campo em [imoveis-view.tsx](components/acr/views/imoveis-view.tsx) +
   import em massa (`/api/cadastros/imoveis/import`), já que é uma lista.
3. Agregação: rentabilidade = receita de locação anualizada ÷ valor de referência,
   com cobertura declarada (quantos imóveis têm valor) — mesmo padrão de
   `vagasCobertura`. Sem cobertura total, o número mente.

**Pendência:** pedir a lista à cliente e definir qual valor é (venal? aquisição?
avaliação de mercado?) e a periodicidade de atualização.

### 11. Terreno Castelão: inadimplência/vacância manual
**Confiança:** Decisão de negócio — regra ainda não definida.

Contexto: é terreno, não unidade residencial; o parser já trata como caso especial
em vários pontos ([competencia-fechamento.test.ts:25](lib/competencia-fechamento.test.ts:25),
[package-rechecks.test.ts:603](lib/server/package-rechecks.test.ts:603),
[inadimplencia-mes.test.ts:68](lib/inadimplencia-mes.test.ts:68) — cadastro migrado
com zero, sem cobrança esperada).

O único override existente hoje é o de **aluguel**:
[app/api/fechamentos/[id]/corrigir/route.ts:11](app/api/fechamentos/[id]/corrigir/route.ts:11)
— `camposPermitidos = new Set(["aluguel"])`.

**O que precisa ser decidido antes de codar:**
- O override é por **competência** (uma correção do fechamento, auditável, como o
  de aluguel) ou uma **propriedade do imóvel** no cadastro?
- Vale só para Terreno Castelão ou vira um mecanismo geral para imóveis sem
  prestação padrão?
- O manual sobrescreve o classificado ou só preenche onde ficou "desconhecido"?
  (o sistema é fail-closed por princípio — sobrescrever exige justificativa e log)

**Trilha técnica, uma vez decidido:** estender `camposPermitidos` para
`status_ocupacao`, gravar em `correcoes` com justificativa obrigatória, e fazer
`classifyOccupancy` ([lib/indicadores-domain.ts:91](lib/indicadores-domain.ts:91))
respeitar o override como evidência de precedência máxima.

### 12. Remover conciliação financeira
**Confiança:** Confirmado — mas o corte não é limpo.

A aba é `{ id: "receita", label: "Conciliação financeira" }`
([indicadores-view.tsx:18](components/acr/views/indicadores-view.tsx:18)),
renderizada por [view-receita.tsx](components/acr/indicadores/tabs/view-receita.tsx).

**Atenção:** a aba não contém só a ponte financeira. Remover a aba inteira também
derruba:
- a ponte contábil ([:151-162](components/acr/indicadores/tabs/view-receita.tsx:151))
- a **realização do aluguel** (contratado → recebido, com vacância, inadimplência,
  descontos, "cobrado como intermediação", mês proporcional)
  ([:173-205](components/acr/indicadores/tabs/view-receita.tsx:173))
- acordos, rescisões, intermediações e atrasos com contagem e valor
  ([:246-258](components/acr/indicadores/tabs/view-receita.tsx:246))

Os dois últimos são indicadores do contrato (docs/12-execution-roadmap.md:244).

**Decisão:** remover só a **ponte** (a tabela de conciliação propriamente dita) e
realocar realização + acordos na Visão geral, ou remover a aba inteira? Assumindo
que a cliente quis dizer "a tabela de conciliação", recomendo o primeiro.

---

## Regra de negócio — mapa de calor (alugados e inadimplentes)

**Pedido:**
1. 15+1 dias do mês com inquilino ou contrato ativo ⇒ o mês conta como **ocupado**.
2. Exemplo Luana: inadimplente que sairia no dia 16 ⇒ o apto conta como
   **inadimplente** no mês, mesmo que entre um inquilino adimplente depois.

**Onde a regra vive hoje:** `classifyOccupancy`
([lib/indicadores-domain.ts:91](lib/indicadores-domain.ts:91)), consumida pelos
snapshots ([indicadores-snapshots.ts:531](lib/server/indicadores-snapshots.ts:531))
e daí pelo mapa de calor ([view-mapa.tsx](components/acr/indicadores/tabs/view-mapa.tsx)).

**Parte 2 já está quase certa:** `hasDelinquency` é a **primeira** verificação
([indicadores-domain.ts:94](lib/indicadores-domain.ts:94)) e vence rescisão. Falta
o caso "saiu inadimplente e entrou outro adimplente no mesmo mês": hoje a linha
do inquilino novo com aluguel recebido faz `rentReceived > 0` ⇒ `"ocupado"`
([:105](lib/indicadores-domain.ts:105)) e a unidade some da inadimplência.
A evidência de dois inquilinos na mesma unidade já é tratada em
[lib/fechamento-unidades.ts:110](lib/fechamento-unidades.ts:110) — é de lá que a
regra precisa puxar: **inadimplência de qualquer ocupante do mês vence**.

**Parte 1 é bloqueada por dado que não existe.** A regra dos 15+1 dias exige data
com granularidade de **dia**. Hoje:
- `imovel_vigencias` é mensal por constraint —
  [202607280003_indicadores_confiabilidade.sql:96](supabase/migrations/202607280003_indicadores_confiabilidade.sql:96)
  força `extract(day from vigencia_inicio) = 1` e o mesmo para `vigencia_fim`.
- O snapshot tem `dia_vencimento`, não data de entrada/saída.
- Rescisão hoje é binária: `hasTermination ⇒ "vago"`
  ([indicadores-domain.ts:100](lib/indicadores-domain.ts:100)), sem olhar o dia,
  mesmo quando recebeu aluguel proporcional (canário GM 214, R$ 77,42).

**O que a regra exige, em ordem:**
1. Migration: `data_entrada` / `data_saida` (date) no contrato ou na vigência, e
   relaxar a constraint de dia 1 — ou uma tabela nova `ocupacao_periodos`
   se quisermos preservar a vigência financeira mensal como está.
2. Extração: a data de saída precisa sair do documento (hoje só existe como texto
   livre na observação de rescisão) ou ser cadastrada à mão.
3. `OccupancyEvidence` ganha `diasOcupados` e `classifyOccupancy` aplica o corte
   em 16 dias, **depois** da checagem de inadimplência (que continua vencendo).
4. Fail-closed: sem data de saída, a regra não se aplica — mantém o
   comportamento atual, não inventa 15 dias.

**A definir com a cliente:**
- "15+1" = 16 dias corridos, ou "mais da metade do mês" (17 em mês de 31 dias)?
- Contrato ativo sem inquilino nomeado conta como ocupado?
- Retroage? Recalcular meses já fechados muda indicadores já aprovados e o
  histórico do imóvel. Provavelmente vale só daqui pra frente, com nota.

---

## Melhorias (só mapeadas, sem plano de execução)

### M1. Puxar as despesas do gestor para os indicadores
A integração eGestor existe (`app/api/egestor/*`, `lib/server/` + migrations
`202606050001`, `202606130001`, `202608110001`) e hoje é de **saída** — envia
lançamentos. As despesas dos indicadores vêm dos documentos de fechamento
(`sumOperationalExpenses`, [indicadores-aggregation.ts:739](lib/indicadores-aggregation.ts:739)).
Traria conciliação de despesa real × declarada. Precisa: leitura de contas a
pagar do eGestor, chave de vínculo por imóvel/competência, e uma regra de
precedência (documento × gestor) quando os dois falam.

### M2. Criar MCP do Claude
Servidor MCP expondo os dados da plataforma (fechamentos, indicadores, histórico
por imóvel) para consulta via Claude. Nada no repo ainda.

---

## Nota de ferramenta
O MCP `code-review-graph` não subiu nesta sessão (`CONNECTION_CLOSED`) — este
mapa foi feito com leitura direta de arquivo e grep. Vale reconectar antes do
próximo levantamento estrutural.
