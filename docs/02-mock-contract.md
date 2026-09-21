# 02 - Mock Contract

## Regra obrigatoria

O diretorio `acr-fechamentos-app` e o contrato visual, funcional e de fluxo do produto. A implementacao real deve respeitar esse contrato.

Se uma etapa precisar divergir do mock, o agente deve explicar antes de editar:

- qual ponto do mock sera alterado;
- por que a divergencia e necessaria;
- qual melhoria ou correcao substitui o contrato atual;
- quais docs serao atualizados para registrar a decisao.

## Stack e padrao visual

- Next.js App Router.
- React client components para o mock atual.
- Tailwind CSS.
- shadcn/ui e Radix como base de componentes.
- lucide-react para icones.
- Layout operacional, denso e utilitario, com sidebar fixa, topbar, tabelas, cards de resumo e estados claros.
- Paleta atual centrada em verdes, cinzas claros e alertas amarelo/vermelho; manter consistencia salvo decisao documentada.

## Telas contratadas

- `fechamentos`: lista de fechamentos com busca e filtros combinaveis por status, competencia, imobiliaria e empreendimento; todas as colunas de dados sao ordenaveis, com competencia mais recente como padrao; a lista pagina 25 itens e preserva filtros, ordenacao, pagina e inclusao de arquivados na URL. A tabela mantem os valores financeiros alinhados, resultado/total explicitos, estado vazio recuperavel e rolagem horizontal interna quando necessario. Rascunho sem job ativo aparece como "Aguardando documentos" e abre o upload; somente `processamento_status=processando` aparece como "Processando".
- `novo-fechamento`: formulario com imobiliaria, empreendimento, competencia e observacoes.
- `upload`: upload multiplo, classificacao automatica/manual e bloqueio quando ha documento sem classificacao.
- `processando`: etapas visuais do pipeline: salvar arquivos, classificar, extrair, validar, conciliar e finalizar.
- `revisao`: resumo financeiro agrupado no topo, parecer automático com contagem objetiva de bloqueios/alertas/validações ok, separacao clara entre receitas, comissao administrativa, outras despesas e total comissao + despesas, exibicao da comissao realizada em % e da data do repasse (o badge da taxa cadastrada saiu do cabecalho em 2026-07-15; a taxa cadastrada segue visivel no card de comissao quando ha regra), cards de quebra de receitas por aluguel/garagem/agua/IPTU/seguro incendio/acordos/rescisoes/inadimplencia paga, situacao das unidades separando alugadas, inadimplentes e aptos vagos, pendencias de revisao, receitas por imovel com totalizadores, cabecalho fixo e coluna `Ref.` exibindo a competência original do documento (somente leitura), acordos/rescisoes recebidos no mes, intermediação com aluguel/base, IPTU, total recebido, comissão, percentual e repasse separados, despesas sempre desdobradas com detalhe acessível — ou com a parcela consolidada explicitamente não discriminada quando o documento só trouxer o total —, comprovante de repasse, documentos colapsaveis no fim e acoes. Receitas sem imóvel vinculado são resolvidas em drawer lateral, uma a uma, antes da aprovação. Tentar criar um cadastro com código canônico César Rêgo no empreendimento errado é bloqueado com mensagem acionável, orientando corrigir o empreendimento do fechamento em vez de duplicar o imóvel.
- `imoveis`: area operacional de cadastros com abas para imoveis, imobiliarias, empreendimentos e regras comerciais por imobiliaria + empreendimento, incluindo importacao CSV de imoveis e botao "Sincronizar dos fechamentos" (popula/atualiza o cadastro de imoveis a partir das prestacoes ja processadas). Códigos contratuais Plural no formato `GA0002/2` resolvem para o cadastro canônico `GA0002`: a sincronização atualiza o imóvel existente e não cria duplicata. Cada imovel e clicavel e abre um drawer de Historico do imovel (linha do tempo derivada das prestacoes: aluguel pago/inadimplente/vago, acordos, rescisoes, inadimplencia paga e intermediacao), com resumo e periodos por inquilino. O drawer tambem traz a secao "Acordos parcelados" (Nivel 2): acordos/rescisoes parcelados detectados nas prestacoes, com barra de progresso (parcelas pagas/total), valor pago/total e baixa por parcela (automatica pela prestacao ou manual, clicando na parcela). Botao "Sincronizar dos fechamentos" tambem popula os acordos parcelados.
- `configuracoes`: placeholder atual para preferencias, integracoes e regras.
- `configuracoes`: area operacional de integracao eGestor, com token, teste de conexao, conta disponivel padrao, planos de contas por categoria, contato/tag por imobiliaria e tag por empreendimento.
- `indicadores`: painel operacional-financeiro da carteira, com sub-abas Visão geral, Conciliação financeira, Riscos por imóvel e Detalhamento por imóvel. Filtros por competência, empresa, empreendimento e imóvel por UUID; alternância valor x percentual. A Evolução mensal oferece atalhos de 3, 6 e 12 meses e um período personalizado inclusivo, persistido na URL, sem alterar a competência nem os KPIs do topo. No mapa de Riscos por imóvel, cada célula da unidade identifica o inquilino registrado naquela competência; empreendimentos de uma única unidade também mostram esse nome na linha recolhida. O fechamento documental é a fonte financeira, o comprovante bancário confirma o pagamento e as vigências históricas definem o aluguel contratado. Todo número informa fonte, cobertura e um dos estados `Confirmado`, `Em conferência`, `Incompleto` ou `Com divergência`.
- `iptu`: tela operacional de contas a pagar de IPTU por imovel. Cards de resumo (aberto, vencido, pago, parcelas vencidas, proximo vencimento), barra de filtros (imobiliaria, empreendimento, ano, status calculado, mes de vencimento, busca), tabela densa de parcelas com selecao, e acoes de geracao de carnes em lote (com revisao), edicao de parcela, ajuste do numero de parcelas do carne, baixa individual e baixa em massa. Somente operacional: nao gera lancamento no eGestor nem altera fechamento financeiro.

### Adicao registrada — tela `iptu` (2026-07-07)

- Ponto alterado: o modulo `/iptu` era um fluxo passivo de importacao de certidao/PDF (extracao por IA da contagem de parcelas pagas por unidade). Passou a ser um controle operacional manual de contas a pagar de IPTU por imovel.
- Por que: o operador precisa gerar carnes anuais, controlar vencimentos e valores, e dar baixa (individual e em massa) — nao apenas registrar passivamente o que a certidao informa.
- Decisoes de produto: status calculado (`aberto`/`vencido`/`pago`) a partir de `data_baixa`/`data_vencimento` (timezone-safe, sem status salvo); geracao em lote transacional com revisao previa e alerta de conflito por imovel+ano; `responsavel` (inquilino/proprietario) mantido como coluna extra editavel; importacao por PDF/certidao fica fora do MVP (backend legado mantido, sem acesso na UI); sem integracao com eGestor ou fechamento.
- Docs atualizados: este contrato, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Adicao registrada — tela `indicadores` (2026-06-19)

- Ponto alterado: o contrato nao previa uma tela de indicadores; foi adicionada a partir do prototipo `dashboard-acr-final.html` aprovado pelo usuario.
- Por que: consolidar a carteira (ocupacao, receita, despesa operacional, repasse, taxa total, cascata potencial x realizado, mapa de calor e registro de pagamentos por apto/inquilino) num unico painel.
- Decisoes de produto: KPIs principais = ocupacao, receita, despesa, repasse, taxa total (sem card de inadimplencia); despesa operacional = agua + IPTU + seguro incendio; despesa de venda = taxa de intermediacao; inadimplencia acumulada vira insight (nao entra na cascata do mes); itens sem dado (reajustes, historico mensal) aparecem como "aguardando dados"; escala do mapa verde -> amarelo -> laranja -> vermelho com a linha de media seguindo a mesma escala.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — intermediação, estados e indicadores (2026-07-13)

- Ponto alterado: a Intermediação tinha uma única coluna "Valor recebido"; agora separa aluguel/base, IPTU, total recebido, comissão, percentual e repasse. A comissão permanece calculada somente sobre o aluguel/base.
- Por que: o IPTU recebido junto da intermediação compõe o total e o repasse, mas não pode distorcer o percentual da comissão.
- Regra de conciliação: a fórmula final subtrai comissão administrativa, despesas e comissão de intermediação em baldes separados; a intermediação não pode reaparecer como despesa nem ser omitida do repasse.
- Refinamento visual autorizado: Intermediação usa acento teal no lugar do roxo e os filtros de Indicadores recebem nomes acessíveis; a escala de inadimplência permanece verde → amarelo → laranja → vermelho.
- Estado corrigido: `rascunho` sem processamento deixa de aparecer como "Processando" e volta ao upload. A própria rota de Revisão também redireciona para Upload quando `analise_completa` está ausente, cobrindo URL direta, breadcrumb e notificações sem renderizar uma revisão vazia.
- Paleta confirmada: inadimplência usa seis faixas de verde a vermelho, passando por amarelo e laranja; vacância por imóvel usa somente 0% não vago e 100% vago.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Substituicao registrada — indicadores operacionais confiaveis (2026-07-13)

- Ponto alterado: a quarta aba deixa de se chamar "Registro de pagamentos" e passa a ser "Receitas por imovel"; a cascata de potencial reconstruido e substituida pela realizacao do aluguel contratado; ocupacao historica deixa de reutilizar o cadastro atual.
- Por que: a fonte atual registra receitas declaradas na prestacao por competencia, nao liquidacoes de um livro bancario. O nome antigo, a cascata circular e a ocupacao atual aplicada a meses anteriores davam uma certeza que a base nao sustentava.
- Melhoria substituta: cobertura persistente e competencia preliminar/completa; KPIs com fonte e qualidade; ponte financeira; aluguel contratado versus recebido; snapshots mensais para ocupacao/vacancia/inadimplencia; coluna separada "Hoje"; tabela por imovel com busca, ordenacao, paginacao e CSV.
- Responsividade: sidebar fixa em desktop, rail em tablet e menu Sheet no mobile, preservando a densidade operacional sem overflow da pagina.
- Fonte da decisao e formulas: `docs/PLAN-indicadores-operacionais.md`.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Substituição registrada — confiabilidade documental dos indicadores (2026-07-28)

- Ponto alterado: `Receita & repasse`, `Mapa de calor` e `Receitas por imóvel`
  passam a se chamar `Conciliação financeira`, `Riscos por imóvel` e
  `Detalhamento por imóvel`. `Receita total`, `Repasse apurado`, `Repasse
  comprovado`, `Informado no extrato`, `Gap` e `Resíduo da reconciliação` são
  substituídos, respectivamente, por `Receitas do fechamento`, `Repasse
  calculado`, `Repasse confirmado pelo banco`, `Repasse declarado pela
  imobiliária`, `Valor não recebido` e `Diferença não explicada`.
- Por que: o contrato anterior permitia somar crédito de passagem como receita,
  comparar comprovantes externos com fechamentos sem comprovante e reutilizar
  cadastro atual para meses históricos. Essas ambiguidades geravam números
  matematicamente fechados, mas conceitualmente falsos.
- Melhoria substituta: um banner único de confiança por competência; cobertura
  derivada de vigências; contratos conhecidos/não aplicáveis/ausentes;
  separação de aluguel da competência, atrasos, outros recebimentos, passagens,
  despesas e tarifas; moeda sem abreviação; ajuda “Como ler este painel” e
  informação acessível por tooltip/popover.
- Semântica visual: `—` é ausência, `R$ 0,00` é zero confirmado e `Não se
  aplica` identifica receita variável. Ocupação sempre mostra percentual,
  classificados e cobertura lado a lado.
- Leitura do histórico: “Riscos por imóvel” prioriza o estado de cada
  competência e resume, por unidade, meses registrados e meses com status
  definido. A origem recomposta não aparece como selo repetido; quando a
  auditoria exige essa origem, o texto é “Importado de documentos”. No modo
  Inadimplência, um resumo antecede o mapa: inadimplência do mês e acumulada
  lado a lado (naturezas diferentes, nunca substituídas uma pela outra) mais o
  total somado, e a lista das unidades inadimplentes na competência com seus
  meses de inadimplência e valor em aberto; clicar na unidade rola até a linha
  correspondente no mapa.
- Fonte da decisão e fórmulas: revisão v2 de
  `docs/PLAN-indicadores-operacionais.md`.
- Docs atualizados: este contrato, `docs/03-domain-model.md`,
  `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.
- Refinamento responsivo aprovado: título e filtros só compartilham a mesma
  linha quando a área útil comporta os quatro campos; o banner distribui a
  cobertura em colunas flexíveis e nunca cria overflow horizontal da página.
- O banner apresenta estado, cobertura e lacunas acionáveis. Motivos técnicos
  internos da avaliação não são repetidos como ressalva textual no topo; os
  valores ainda sem classificação permanecem visíveis na conciliação.

### Ajuste registrado — evolução mensal, mapa e detalhamento (2026-09-01)

- Ponto alterado, 1: a **evolução mensal em valores** deixa de plotar
  "Receitas", "Aluguel recebido" e "Repasse" e passa a medir a realização do
  aluguel contratado: teto contratado, recebido da competência, vacância e
  inadimplência, com a identidade escrita sob a legenda.
- Por que: as três séries antigas não eram comparáveis no mesmo par de eixos.
  "Receitas" e "Aluguel recebido" eram por competência de origem e "Repasse" por
  caixa — em maio/2026 o descasamento era de R$ 2.846,67 — e "Receitas" somava
  aluguel, acordos, rescisões, intermediação e o reembolso de água/IPTU/seguro
  que entra e sai como despesa. A distância vertical entre as linhas, que é o
  que o olho lê primeiro num gráfico de linhas, não descrevia nada.
- Melhoria substituta: quatro séries de uma mesma identidade, verificada nos três
  meses reais, mais a conta escrita citando só os termos que existem no mês. A
  reatribuição por competência sai do valor e vira nota, então cada ponto volta a
  bater com o documento do mês (maio: R$ 85.265,22 em vez de R$ 88.111,89).
- Ponto alterado, 2: no **modo percentual**, sai `Cobertura` e entra
  `Inadimplentes`. Cobertura é qualidade da extração, não indicador de operação, e
  já é declarada no banner de confiança do topo.
- Ponto alterado, 3: no **mapa de riscos**, unidade vaga não exibe nome de
  inquilino; o rótulo da linha declara "Inquilino atual: <nome>", resolvido pela
  evidência mais recente e não pelo cadastro; e a coluna "Hoje" sai, porque a
  competência exibida já vem do filtro.
- Ponto alterado, 4: no **detalhamento por imóvel**, a unidade é clicável e abre
  o drawer de histórico já existente, com uma visão geral da competência em tela
  no topo.
- Critérios: CA-IND31 a CA-IND36 em `docs/06-acceptance-criteria.md`.
- Docs atualizados: este contrato, `docs/06-acceptance-criteria.md` e
  `docs/12-execution-roadmap.md`.

### Ajuste registrado — ausência que esconde dado (2026-09-01)

- Ponto alterado: três lugares deixam de usar "—"/ocultação como resposta e
  passam a mostrar o que existe com a cobertura declarada ao lado.
  1. **Inadimplência acumulada (Indicadores):** exibe a soma declarada pelos
     fechamentos que trazem a seção de dívidas, com a legenda
     "N de M fechamentos com a seção de dívidas" quando o número não fala pelo
     escopo inteiro.
  2. **Inadimplência do mês (Revisão):** o bloco aparece sempre que o documento
     marcar alguma unidade como inadimplente. Unidade que não puder ser apurada
     entra como pendência nominal e o valor vira "—" em vez de R$ 0,00; antes o
     bloco simplesmente não era renderizado.
  3. **Ocupação, barra "Hoje" (Indicadores):** a data é a do próprio cadastro, e
     a barra declara em quantas unidades a posição cadastral discorda da
     competência exibida.
- Por que: a semântica "`—` é ausência" continua válida, mas estava sendo usada
  para o caso errado. Um fechamento sem a seção de dívidas anulava a acumulada
  de todos (jul/2026: R$ 56.199,25 declarados em 5 de 8 apareciam como "—"), uma
  linha sem `imovel_id` zerava a inadimplência do mês da Revisão (GM I maio: 4
  unidades marcadas no documento, R$ 0,00 na tela) e o rótulo do cadastro
  mostrava a data dos fechamentos, anunciando como "sincronizado hoje" uma
  posição de 12/08. Esconder o que se sabe não é conservador: é uma afirmação
  falsa de ausência.
- Melhoria substituta: valor parcial + cobertura explícita, no mesmo idioma de
  cobertura que o painel já usa para ocupação ("percentual, classificados e
  cobertura lado a lado"). Nenhuma métrica passa a afirmar zero onde há
  desconhecido, e a lacuna `inadimplencia_nao_extraida` continua nominando quem
  ficou de fora.
- Critérios: CA-IND27, CA-IND28, CA-IND29 (revisa CA-IND22) e CA-IND30 (revisa
  CA-IND21) em `docs/06-acceptance-criteria.md`.
- Docs atualizados: este contrato, `docs/06-acceptance-criteria.md` e
  `docs/12-execution-roadmap.md`.

### Ajuste registrado — alertas não bloqueantes somem e célula vaga no mapa (2026-09-02)

- Ponto alterado, 1: a Revisão deixa de exibir **alertas não bloqueantes**
  (rechecks `warning`) em qualquer lugar: sai o grupo "Alertas" das pendências,
  a contagem "N alertas" do parecer e do banner, a etiqueta amarela "Alerta" e
  o estado intermediário do banner. O parecer `aprovado_com_ressalvas` se
  apresenta como "Pronto para aprovação" (ressalva = alerta não bloqueante). A
  diferença de repasse dentro da tolerância (até R$ 5,00) é conciliação OK, em
  verde, com a diferença citada na frase.
- Por que: decisão do produto em 2026-09-02 — "não devem aparecer em nenhum
  lugar, nunca". O alerta pedia leitura sem oferecer ação que mudasse a
  aprovação; só bloqueio é trabalho.
- O que permanece: os rechecks `warning` continuam calculados e persistidos em
  `validacoes` com severidade `alerta`, para auditoria e para o dia em que a
  regra mudar. Nenhuma migration; a peneira é `isVisibleValidation` em
  `lib/revisao-pendencias.ts`, e contagem e lista saem dela.
- Ponto alterado, 2: no mapa "Riscos por imóvel" em modo Inadimplência, a
  célula de unidade **vaga** fica branca (contorno fino) e sem valor. Antes
  entrava com 0% (verde) e mostrava o aluguel esperado inteiro como se fosse
  dinheiro em aberto. A legenda ganha o quadrado "vago" só nesse modo. Modo
  Vacância não muda.
- Texto de apoio na Revisão: a derivação de cada KPI de "Situação das
  unidades" e a descrição da seção passam a ficar em tooltip (regra geral do
  produto: texto explicativo que cabe em tooltip não fica solto na tela).
- Ponto alterado, 3 (César Rêgo, layout C): o documento não marca
  inadimplência; a Relação de Imóveis diz se o imóvel está alugado (`SIT=ALUG`)
  e qual foi o último mês pago (`ULT. PG`). Regra do cliente: **alugado sem
  lançamento de ALUGUEL da competência = inadimplente no mês**, mesmo quando o
  inquilino pagou meses anteriores nesse documento (a linha em aberto vem
  primeiro, identificada pelo endereço, com `aluguel_esperado` = coluna ALUGUEL
  da Relação, que a Revisão usa como inadimplência do mês). Os meses entre
  `ULT. PG` e a competência, descontados os pagos no documento, entram em
  **inadimplência acumulada** com o aluguel da Relação (João Cordeiro jul/26:
  julho em aberto + junho acumulado, R$ 788,22 cada). Contrato ativo sem
  `ULT. PG` ou sem aluguel na Relação mantém a métrica declarada como ausente.
  No mapa "Riscos por imóvel", célula **inadimplente** é sempre vermelha —
  status é fato do documento, não fração do aluguel esperado.
- Ponto alterado, 4 (mapa "Riscos por imóvel", modo Inadimplência, reunião de
  2026-09-02): a célula da unidade mostra **só o inquilino** — a cor diz o
  estado; "Vago" segue escrito em branco e "Desconhecido" escrito em cinza. Uma
  inadimplência **quitada em mês posterior** (atraso recuperado cuja
  competência de origem aponta para ela) volta a **verde com um check**; o
  hover diz "Inadimplência de <mês>: R$ X · Quitada em <mês>: R$ Y" (ou, se
  parcial, "pago R$ Y em <mês> · em aberto R$ Z", e a célula segue vermelha).
  A quitação sai do risco do mês na linha do empreendimento e do painel
  "Unidades em aberto", mas fica listada no hover da célula do empreendimento
  ("<mês>: N em aberto · M quitadas" + uma linha por unidade). O histórico
  não apaga que a inadimplência existiu. Célula ocupada cujo snapshot veio sem
  nome usa o inquilino atual da linha (Galpão José Walter jun/jul, Plural).
  Unidade listada na prestação sem inquilino e sem aluguel é **vaga**, mesmo
  com aluguel cadastrado zerado (Grand Maracanaú 101; antes "Desconhecido").
  Leitura da célula do empreendimento: "N / M" é **N unidades em risco entre M
  com dado** — não "alugadas".
- Ponto alterado, 5 (reunião de 2026-09-02, "massa falida" e rescisão):
  - **Dívida registrada pela acumulada.** A seção "Inadimplência acumulada" de
    um fechamento nomeia a competência em aberto (campo estruturado, "VIGÊNCIA
    DE MAIO 2025", "MAIO, JUNHO"). A célula dessa competência recebe a dívida:
    se o mês não tinha evidência própria (sem linha ou "Desconhecido"), passa a
    **inadimplente** e mostra o saldo; se tinha (rescisão, ocupado), o status
    fica e a dívida vai para o hover. O saldo é o do **último fechamento que
    lista a dívida** (cada documento reafirma e corrige o valor); pagamentos são
    acordos/rescisões/atrasos recebidos para a unidade e o inquilino; quando um
    fechamento posterior deixa de listar a dívida, ela está **quitada** (verde
    com check). Grand Maracanaú 202: maio vermelho "saldo R$ 893,33", hover com
    "Pago em jun. de 2026: R$ 480,00 — PRIMEIRA METADE DA MULTA".
  - **Rescisão no mapa.** Mês com evento de rescisão aparece escrito "Rescisão"
    (célula branca, com o inquilino), e o hover traz o recebido proporcional e a
    observação do documento (dias e período). Para isso o snapshot passa a
    guardar `observacao` (migration `202609020001`); rows antigas só ganham o
    texto após recálculo.
  - **"Hoje" sai da Ocupação.** A barra do cadastro (94,1%) divergia do último
    fechamento (87,2%) porque o cadastro é sincronizado à mão, conta locação por
    app como "Ocupado" e carrega status antigos (35 unidades diferentes em
    jul/26). Quem quer a posição mais atual escolhe a competência. A coluna
    "Hoje" do Detalhamento por imóvel permanece.
- Ponto alterado, 6 (reunião de 2026-09-02, **Evolução mensal**): o gráfico de
  linhas vira **barras agrupadas por mês** e o texto sai da tela — fica só a
  legenda. Sai a linha de valores do mês ativo, a identidade escrita e a nota de
  reatribuição (substituição da entrada de 2026-09-01); o detalhamento de cada
  barra — mês, cada série e seu valor — aparece no **hover/foco** da barra ou da
  faixa do mês, com a série sob o ponteiro em destaque, e continua na tabela
  acessível. O aluguel contratado deixa de ser barra: é o **teto do mês**,
  desenhado como linha de referência sobre o grupo. Cores validadas contra
  daltonismo (verde recebido, âmbar vacância, vermelho-escuro inadimplência; o
  par laranja↔vermelho anterior era indistinguível para deutan, ΔE 0,1). Modo
  percentual: barras de ocupação (verde) e inadimplentes (vermelho-escuro).

### Ajuste registrado — locação por app na ocupação (2026-07-31)

- Ponto alterado: a ocupação ganha a categoria própria `Alugado por app`, separada de `Ocupado`, com etiqueta e contagem próprias nos blocos de ocupação, na tabela `Detalhamento por imóvel` e no mapa `Riscos por imóvel`. Conta como ocupada no numerador do percentual.
- Regra: é derivada na apresentação a partir do modelo de receita variável da vigência (Airbnb/temporada); não é um estado persistido nem altera o snapshot no banco. Vacância, inadimplência e rescisão explícitas continuam tendo prioridade sobre a categoria.
- Por que: as unidades de temporada por app são receita variável conhecida pelo cadastro; exibi-las como `Ocupado` genérico ou `Desconhecido` escondia a natureza da operação. Nenhum valor financeiro é inventado (aluguel esperado e recebido seguem as regras existentes de ausência).

### Ajuste registrado — fechamento operacional e competência da receita (2026-07-14)

- Ponto alterado: a coluna `Ref.` deixa de aceitar dia isolado como mês/ano e passa a editar a competência original da receita; o mês do fechamento continua representando o recebimento.
- Correção financeira: IPTU de passagem é visível na quebra de “Receitas”, inclusive em análises legadas, sem alterar receita total, despesa ou repasse. Comissão administrativa discrimina linhas regulares e acordos/rescisões sem duplicar o total.
- Correção operacional: despesas são agrupadas em Energia, Água e esgoto, IPTU, Seguros, Tarifas, Ajustes e Outros, com descrição completa, referência e valor acessíveis por clique, teclado e toque.
- Novo bloqueio: competência ausente ou inválida e receita sem `imovel_id` persistido impedem aprovação. A resolução de imóvel usa drawer lateral com busca/criação, comparação antes de atualizar cadastro, progresso e nenhuma sobrescrita implícita.
- Consistência: correção de competência, vínculo, movimentação, validações e auditoria ocorre em uma única transação. A cópia “Documento informou” passa a “Extraído pela IA”.
- Escopo preservado: nenhuma tela/cálculo de indicadores, integração eGestor ou módulo autônomo de IPTU foi alterado.
- Docs atualizados: este contrato, `CONTEXT.md`, `docs/03-domain-model.md`, `docs/04-user-flows.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Ajuste registrado — competência da receita volta a ser somente leitura (2026-07-15)

- Correção de interpretação: a anotação original pedia apenas que a coluna `Ref.` mostrasse mês/ano em vez do dia isolado (`10`); o campo editável com salvamento e bloqueio de aprovação implementado em 2026-07-14 extrapolou o pedido e foi revertido.
- Ponto alterado: a coluna `Ref.` exibe a competência original extraída do documento em `MM/AAAA`, somente leitura, com destaque âmbar quando anterior ao mês do recebimento; ausência aparece como `-`.
- Removidos: o input de edição na tabela, o endpoint `POST /api/fechamentos/[id]/receitas/competencia`, o recheck bloqueante `receitas_competencias` e o gate de aprovação por competência ausente.
- Preservados: a separação `competencia_original` × `competencia_recebimento` × `dia_vencimento`, a persistência da movimentação na competência original e o bloqueio de aprovação por receita sem imóvel vinculado.
- Consequência aceita: receita sem competência no documento persiste com `data_competencia` nula e segue aprovável; a correção do dado acontece na origem, não na tabela de revisão.
- Docs atualizados: este contrato, `docs/04-user-flows.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Ajuste registrado — indicadores do contrato: taxas, acordos, reajuste e receita de locação (2026-09-16)

- Ponto alterado: auditoria dos 13 indicadores do contrato contra `getIndicadores` mostrou 3 ausentes (rentabilidade, reajuste, acordos/rescisões com quantidade e valor) e 4 pela metade (percentual das taxas, vagas na receita, valor de ocupação, % de vacância).
- Visão geral: Vacância ganha "% do contratado"; Ocupação ganha o aluguel contratado das unidades ocupadas; Comissões ganha uma linha por taxa com valor, % efetivo (comissão ÷ base comissionável — ver o ajuste de 2026-09-21) e % de contrato — o efetivo acima do contrato acende, e é o sinal que faltou para a taxa retida duas vezes em ago/2026. Grade de apoio passa de 5 para 4 colunas e recebe dois cards: **Receita de locação** (aluguel + vagas, com cobertura das vagas) e **Rentabilidade**.
- Rentabilidade fica **declaradamente vazia**: é retorno sobre ativo e o cadastro não tem valor venal nem de aquisição de nenhuma unidade. Sem isso, qualquer número seria repasse ÷ contratado com outro nome. O card existe, mostra "—" e diz por quê no tooltip.
- Percentual de contrato só aparece quando todos os pares do recorte têm a mesma taxa; com taxas diferentes fica "—". Média de contratos distintos seria número inventado.
- Conciliação financeira: painel **Acordos e rescisões** com quatro colunas separadas — acordos, rescisões, intermediações (com comissão) e atrasos pagos — cada uma com contagem e valor. Não há total somado: dinheiro entrando e inquilino saindo são fatos diferentes. Atraso ou acordo sem competência de origem aparece à parte, porque não abate o saldo em aberto.
- Detalhamento por imóvel: coluna **Reajuste**. Reajuste é troca de vigência com aluguel diferente da anterior, na competência em que a vigência começa; quando o inquilino também troca, a célula diz "novo contrato". Vigência migrada do cadastro não tem anterior e não gera reajuste.
- Histórico por imóvel (drawer): evento **Reajuste** na linha do tempo, derivado de `imovel_vigencias` — não da prestação, que só informa o mês do reajuste anual, nunca o valor. Aparece antes do aluguel do mês. Com inquilino novo, a observação começa por "Novo contrato". Contador "Reajustes" no resumo.
- Vagas somam o observado (`garagem_recebida`, coluna que existe desde ago/2026); com cobertura parcial o card fica em alerta e a linha diz quantas unidades foram observadas. Regra B, aprovada em 2026-09-16: parcial marcado, nunca "—" escondendo o que os outros dizem.
- Ocupação acumulada (item i): unidade-mês ocupada ÷ unidade-mês com situação conhecida, de todas as competências com histórico até a selecionada, com a janela nomeada na tela ("acumulado desde mai/26"). Não é média dos percentuais mensais — média muda com o tamanho de cada mês — nem a posição do cadastro, que trata locação por app como ocupado e ficava 8 pontos acima. Em reais, o acumulado é soma do aluguel contratado das unidades ocupadas em cada mês. Inadimplência acumulada (item viii) já é saldo e não muda. Rentabilidade (item iv) segue vazia por falta do valor do ativo, decisão do cliente de 2026-09-16 de não tratar agora.

## Fluxo contratado

Fluxo principal do mock:

`Fechamentos -> Novo Fechamento -> Upload -> Processando -> Revisao`

Estados e acoes relevantes:

- "Novo Fechamento" inicia o fluxo.
- Upload aceita documentos Alive / GM II e mostra classificacao com confianca.
- Documento com baixa confianca exige classificacao manual antes de continuar.
- Processamento mostra progresso por etapa.
- Revisao mostra bloqueio de aprovacao quando ha divergencia bloqueante.
- Revisao nao usa percentual de confianca como indicador operacional principal; qualidade de leitura fica restrita a documentos/linhas extraidas.
- Resolucao de pendencia abre modal claro com valores comparados, escolha do valor oficial e justificativa obrigatoria para auditoria. Alertas informativos sem valor a decidir omitem os valores e oferecem apenas "Ignorar pendencia" com justificativa. Documento opcional ausente e despesas confirmadas em R$ 0,00 não geram pendência operacional.
- Leitura do documento e documentos processados ficam no fim da revisao, em secoes colapsaveis fechadas por padrao, para nao deslocar o resumo financeiro operacional.
- Possivel pagamento repetido de acordo/rescisao e pendencia bloqueante ate resolucao ou justificativa.
- Fechamentos aprovados podem ser vistos em detalhes.
- Depois de aprovado, a revisao exibe a previa eGestor com lancamentos consolidados, status de configuracao, acao de envio real controlado, revalidacao de status, retry de anexos pendentes, historico de envios e auditoria de mudanca de status.

### Ajuste registrado — César Rêgo julho e lançamentos manuais eGestor (2026-08-11)

- Ponto alterado: a prévia continua com uma linha automática consolidada por tipo e categoria, mas linhas manuais podem repetir a mesma combinação e sobrevivem a “Gerar prévia”.
- Por que: um mesmo fechamento pode exigir recebimentos separados no eGestor, como os dois imóveis de Pompílio Gomes.
- Correções associadas: `SIT=ALUG` sem lançamento é inadimplência explícita; extrato consolidado é escopado antes dos cálculos; TED global é dividida igualmente entre os empreendimentos; `Vencimento` do cabeçalho alimenta as datas do eGestor quando não há comprovante externo.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/04-user-flows.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Ajuste registrado — hardening do processamento documental (2026-08-11)

- O contrato visual permanece o mesmo; a tela de Configurações acrescenta o
  perfil ao criar/listar usuários.
- Classificação abaixo de 80% fica pendente e nunca escolhe extrator por
  aproximação. Parser César reconhecido falha fechado em vez de cair na IA.
- Remessas adicionais preservam o conjunto anterior, recebem número crescente,
  ignoram repetição por SHA-256 e consolidam comprovantes parciais distintos.
- Processamento concorrente usa claim atômico e a persistência financeira é uma
  troca transacional, preservando correções manuais.

### Ajuste registrado — pendências acionáveis e rechecks escopados (2026-08-12)

- Ponto alterado: documentos opcionais ausentes e despesas confirmadas em R$ 0,00 deixam de aparecer como pendências; registros legados equivalentes continuam auditáveis, mas ficam fora da contagem e da lista operacional.
- Por que: esses itens não exigem decisão do operador e eram ignorados em todos os fechamentos.
- Correção associada: no César Rêgo, os rechecks passam a ser regenerados depois do recorte por empreendimento, impedindo que comissão e repasse de João Cordeiro apareçam no fechamento de Pompílio Gomes.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/04-user-flows.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

### Ajuste registrado — base comissionável da intermediação e recebimentos canônicos (2026-08-27)

- Ponto alterado: a base percentual da intermediação deixa de ser somente o aluguel e passa a ser a soma dos componentes comissionáveis da linha (aluguel + garagem, quando presentes). IPTU, água, seguro e demais encargos seguem compondo total recebido e repasse sem alterar a base.
- Por que: o documento Grand Castelão I de julho/2026 e a instrução explícita da cliente (feedback de agosto) demonstram garagem na base (650 + 25 = 675; 405/675 = 60%). A regra anterior produzia percentual e base errados na revisão e nos indicadores.
- Regra nova de apresentação: acordos, rescisões e atrasos passam a exibir decomposição financeira — principal, ajuste (desconto/crédito), total recebido, comissão e repasse — como conceitos distintos; `valor` deixa de mudar de significado conforme o tipo. Valores explícitos do documento nunca são recalculados silenciosamente; divergência da equação `recebido − comissão = repasse` vira pendência.
- Item sem seção explícita, sem valor próprio ou sem vínculo por unidade/evidência vira pendência de revisão sem efeito financeiro (fail-closed), em vez de pedir ao operador que escolha qual total manter.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/06-acceptance-criteria.md` (CA14.2 revisado, CA27–CA27.3, valores-canário) e `docs/12-execution-roadmap.md`.

### Ajuste registrado — a tabela de intermediações classifica a unidade (2026-09-17)

- Ponto alterado: uma unidade é de **intermediação** quando a linha da vigência diz INTERMEDIAÇÃO **ou** quando o apto aparece na seção de intermediações do próprio fechamento. Antes só o texto da linha decidia.
- Por que: a linha da vigência de um apto intermediado vem zerada — o mesmo formato de uma inadimplência — e nem sempre repete a palavra na observação. Em Grand Messejana II ago/2026 a seção "INTERMEDIAÇÕES DE JULHO 2026" lista os aptos 3, 8 e 23, mas a linha do 23 traz apenas "IPTU (8/12). SEGURO QUITADO."; a tela exibia 2 intermediações e 3 inadimplentes, e etiquetava o apto 23 como Inadimplente (feedback do cliente em 2026-09-17, dois vídeos).
- Efeito nos tiles: Intermediação 2 → 3 e Inadimplentes 3 → 2. **Alugadas não muda** (25): intermediação continua dentro das alugadas, porque a unidade tem locatário no mês.
- Contagem do tile: unidades classificadas como intermediação **mais** as intermediações sem linha na vigência — a mesma unidade nunca conta duas vezes. Não há filtro por competência: a seção pertence ao fechamento mesmo quando cobra a vigência do mês anterior.
- Guarda de inquilino: a seção só classifica a linha quando as duas falam da mesma locação — linha zerada (o mês foi cobrado na seção) ou mesmo inquilino. Seção e linha podem descrever pessoas diferentes no mesmo apto (Grand Castelão I mai/2026: rescisão do inquilino que saiu enquanto a linha já é do novo, pagando aluguel cheio). O tile continua contando o evento mesmo quando a etiqueta fica com o pagante.
- Sem seção de intermediações no documento, a observação da linha continua sendo a única evidência (comportamento anterior preservado).
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`. Canários em `lib/fechamento-unidades.test.ts`.

### Ajuste registrado — duas causas do desvio que não são perda (2026-09-17)

- Ponto alterado: a cascata "Do contrato ao recebido" ganha duas linhas nomeadas, recortadas de dentro de "Ocupado sem recebimento" e "Ocupado com recebimento parcial": **Cobrado como intermediação** e **Contrato novo · mês proporcional**. A aritmética não muda; o que muda é parar de chamar de perda o que não é.
- Por que: em Grand Messejana II ago/2026 o cliente viu R$ 2.100,00 como "inquilino nomeado que não pagou o mês" — eram os três aptos de intermediação (3, 8 e 23), cujo mês foi cobrado na seção de intermediações e cujo dinheiro a própria tela mostra em "Intermediações 3 · R$ 2.357,39". E R$ 863,23 de "recebimento parcial" eram dois contratos novos com período declarado na linha (Samuel, 21 dias; Francisco, 1 dia — 700/31 = 22,58, o centavo exato que ele pagou).
- Regra da intermediação: a unidade é reconhecida pela seção do próprio fechamento, casando por inquilino e, como segunda via, pelo número do apto — a seção traz `apto`, nunca `imovel_id`.
- Regra do proporcional: só existe quando a **linha declara** o período ("PROPORCIONAL DE N DIAS"). Nunca é inferido por comparação de valores. Esperado desconhecido continua desconhecido, nunca zero.
- O que **não** mudou: `aluguel_esperado` do snapshot (segue o contratado), a inadimplência do mês, o total recebido e o resíduo "Sem explicação". O selo "fora do previsto" continua armado pelo mesmo `valoresSemClassificacao`.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`. Canários em `lib/indicadores-deficit-causas.test.ts`.

### Ajuste registrado — "Despesa detalhada" passa a ler o que foi pago (2026-09-17)

- Ponto alterado: o recorte de água, IPTU e seguro dos Indicadores vinha de `totals.total_agua/_iptu/_seguro_incendio` — as **colunas de receita** da prestação, ou seja, o que os inquilinos reembolsaram. Passa a vir do **documento de despesas**, o que saiu do caixa.
- Por que: em Grand Messejana II ago/2026 o painel exibia água R$ 1.203,31 (reembolso) enquanto a conta paga à Cagece foi R$ 1.827,90. Os R$ 624,59 que o locador bancou não apareciam em lugar nenhum. O seguro coincidia por acaso (pago = reembolsado = R$ 420,00), o que escondia o erro.
- Regra: sem documento de despesas o recorte é **desconhecido** (—), nunca zero. Com documento lido e sem item da categoria, é **zero confirmado** (GM II não pagou IPTU em agosto).
- O reembolso não sumiu: virou tooltip na própria linha, com o valor pago, o reembolsado e quanto ficou por conta do locador.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — o apto de cada seguro chega à tela (2026-09-17)

- Ponto alterado: no popover de "Outras despesas", cada item do documento de despesas passa a exibir a **unidade** ("apto 12 · Referência: …") quando a prestação a informa.
- Por que: o documento de despesas traz só fornecedor e apólice ("PORTO SEGURO COMPANHIA DE SEGUROS GERAIS"); quem diz de quem é cada seguro é o resumo "OUTRAS COMISSÕES E DESPESAS" da prestação ("SEGURO APTO 12 · R$ 141,04"). O desdobramento preferia o documento de despesas e descartava o resumo inteiro — Grand Messejana II ago/2026 mostrava três seguros idênticos (ponto #9 do feedback de 2026-09-17).
- Regra: a união é pelo **valor exato em centavos**. Valor repetido em aptos diferentes fica **desconhecido** (sem unidade), nunca chutado. A unidade escrita na própria despesa (observação/endereço) tem precedência.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — o total do documento tem dois escopos (2026-09-17)

- Ponto alterado: as validações "Total das linhas de receitas / comissões / repasse" comparavam a soma das linhas da vigência com o consolidado do documento. Passam a aceitar **dois escopos**: só as linhas, ou linhas **mais acordos e rescisões recebidos no mês** — nesta ordem, o segundo só quando o primeiro não explica.
- Por que: em Grand Messejana I e Grand Maracanaú o consolidado inclui os acordos; a validação acusava "divergência" de milhares de reais em documento correto e pedia conferência manual (pontos #10, #11 e #14 do feedback). Em GM II o consolidado cobre só as linhas — por isso não dá para somar os acordos sempre. Nos 31 fechamentos da carteira, **27 dos 35 alertas eram falsos**; os 8 que sobram (Maracanaú mai e ago/2026, Castelão I ago/2026) nenhum escopo explica e continuam em alerta, agora apontando o escopo mais próximo.
- Regra de centavos: diferença **até R$ 1,00** entre o consolidado e a soma das linhas é arredondamento do documento e **passa** com a diferença nomeada ("bate a menos de R$ 0,04 de arredondamento do documento. Nenhum valor precisa ser corrigido."). A frase "o correto pelo recálculo é…" saiu: acusava o documento por centavos (GM II ago/2026, R$ 0,04 — ponto #13).
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — água dos acordos e rescisões (2026-09-17)

- Ponto alterado: a coluna ÁGUA da tabela "Acordos e rescisões recebidos no mês" mostrava "–" onde o documento imprime valor (GM II ago/2026: apto 7, R$ 74,70; aptos 3, 8 e 23, R$ 67,70).
- Por que: o schema enviado ao modelo **não tinha o campo `agua`** nesses itens (as linhas regulares têm). O prompt pedia o campo, o schema proibia — o modelo só podia escrever "ÁGUA: R$ 74,70" na observação. Ponto #12 do feedback ("faltando valores").
- Correção em duas frentes: o schema ganhou `agua` (extrações futuras) e a leitura passa a recuperar o valor marcado na observação quando o campo não veio (fechamentos já gravados exibem certo **sem reprocessar**). O campo estruturado tem precedência; sem marca, continua desconhecido — nunca zero.
- Efeito colateral corrigido: em acordo/atraso/rescisão sem `total_recebido`, o total derivado passa a somar água e seguro (790,33 + 27,58 + 74,70 + 1,57 = 894,18, o TOTAL impresso). Na intermediação a água entra no total e no repasse, não na base percentual.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — reajuste do relatório atualiza o cadastro na aprovação (2026-09-17)

- Ponto alterado: ao **aprovar** um fechamento cujo relatório de reajuste declara "de → para" de aluguel (ex.: GM II ago/2026, apto 17: R$ 628,06 → R$ 655,96, IPCA 4,44%), o sistema atualiza `imoveis.valor_aluguel_esperado` (tela de Imóveis) e a vigência contratual (`imovel_vigencias`, que os Indicadores usam como "contratado"): encerra a vigência anterior no mês anterior ao reajuste e abre outra com o valor novo. Cada troca vai para `auditoria_correcoes`.
- Por que: pedido do cliente — "Quando houver atualização monetária corrigir automaticamente o valor do cadastro." O cadastro ficava no valor antigo e os Indicadores mostravam a diferença como "Sem explicação" (GM II ago/2026: R$ 27,90; LOCMAIS ago/2026: R$ 62,20, ponto #6 do feedback).
- Guarda — nenhuma sobrescrita implícita: só troca quando o cadastro ainda está no valor **anterior** que o documento declara (ou vazio). Já no valor novo: nada a fazer. Em qualquer outro valor: não mexe e devolve `cadastro_divergente` para decisão humana. Vigência de receita variável (temporada) ou em outro valor também não é tocada. Rescisões e outros eventos do mesmo relatório (sem valor anterior) ficam de fora.
- Quando: na aprovação, nunca na extração — a leitura por IA pode errar; a aprovação é o momento em que alguém deu o documento por bom. Falha na aplicação não desfaz a aprovação; volta no resultado.
- Fechamentos aprovados antes desta data: `scripts/aplicar-reajustes-cadastro.ts` (dry-run por padrão, `--aplicar` escreve) usa a mesma função e as mesmas guardas.
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — exportação dos Indicadores em PDF (2026-09-17)

- Ponto alterado: a tela de Indicadores ganha o botão **"Exportar PDF"** ao lado dos filtros. Ele abre `/api/indicadores/pdf` com o mesmo recorte da tela (competência, empresa, empreendimento, imóvel) e devolve um PDF gerado no servidor: visão geral (os 12 cartões), situação das unidades, as duas cascatas da aba Receita, acordos e rescisões, despesa detalhada, evolução mensal, imóveis que pedem atenção e, em página paisagem, o detalhamento por imóvel. Nome do arquivo: `indicadores-AAAA-MM-<escopo>.pdf`.
- Por que: Anexo I do contrato, item 5b — "possibilidade de exportação de relatório em PDF". Era o único item do módulo de indicadores ainda não entregue.
- Regra: o PDF lê o **mesmo objeto** que a tela recebe de `/api/indicadores` e usa os mesmos rótulos e formatações — desconhecido sai como "—", nunca zero. Nada é recalculado na exportação (`lib/indicadores-relatorio.ts` é puro e testado; `lib/server/indicadores-pdf.tsx` só desenha).
- Rentabilidade aparece como "—" com a nota "sem valor do imóvel cadastrado", como na tela (decisão do cliente em 16/09).
- Removido: o botão "Exportar relatório" da tela de Revisão, que nunca teve função. Exportar a revisão não está no contrato; o cliente confirmou que não precisa.

### Ajuste registrado — dívida antiga não vira dívida do mês no mapa de calor (2026-09-17)

- Ponto alterado: no hover das células do mapa de calor, a "dívida registrada" só se ancora num mês quando o documento diz o ano (por extenso, "ABRIL/25" ou "05/2026") — e um ano no fim da lista vale para todos os meses da lista ("MAIO, JUNHO, JULHO E PROPORCIONAL DE AGOSTO DE 2023" são quatro meses de 2023). Mês sem ano nenhum só se ancora quando a dívida é **nova** (apareceu num fechamento e não constava no anterior); dívida que já estava no primeiro fechamento conhecido fica sem mês. O saldo da célula é só do inquilino daquela dívida, nunca a soma de todos que já deveram na unidade.
- Por que: validação dos indicadores de ago/2026. GM II apto 25: a Geisa (inadimplente do mês, R$ 795,52) aparecia no hover devendo R$ 3.836,10 porque a dívida antiga da Shirley ("JULHO, AGOSTO", sem ano) caiu em 2026 e foi somada. GM I apto 15 (DESOCUPADO) mostrava R$ 3.725,09 de "agosto de 2026" que eram do Arthur, de 2021. Maracanaú 205/206: dívidas de 2023 apareciam em mai–jul/2026. 13 das 30 células com dívida estavam no mês errado.
- O que não muda: status e cor das células (vinham da evidência da própria linha); o caso Grand Maracanaú 202 (rescisão registrada em junho com "MAIO, JUNHO") continua marcando maio, porque a dívida era nova.

### Ajuste registrado — aprovação atualiza a ocupação do cadastro (2026-09-17)

- Ponto alterado: ao **aprovar** um fechamento, `imoveis.status` e `imoveis.inquilino_nome` (o "Hoje" dos Indicadores e da tela de Imóveis) passam a refletir o que o snapshot da competência já calculou para o mapa de calor: ocupado, inadimplente ou vago, e o inquilino da linha (vago fica sem inquilino, mesmo com rescisão no meio do mês). Cada troca vai para `auditoria_correcoes`.
- Por que: em ago/2026 o card "Hoje" dizia 7 vagos e o próprio PDF do cliente listava 16 — 22 unidades divergentes. LOCMAIS Galpão 02 constava "vago" com a J Mais dentro desde 13/08; GM I 15 e 21 constavam "inadimplentes" com o documento dizendo DESOCUPADO. O cadastro só mudava por sincronização manual.
- Guardas: snapshot `desconhecido` não mexe; fechamento mais antigo que o último aprovado do par não regride o cadastro; `inativo` é decisão de gente e não é tocado; o valor do aluguel continua sendo do reajuste, não deste ajuste. Falha na aplicação não desfaz a aprovação.
- Fechamentos aprovados antes desta data: `scripts/atualizar-cadastro-ocupacao.ts` (dry-run por padrão, `--aplicar` escreve).
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — toda aprovação deixa rastro na tela de Logs (2026-09-17)

- Ponto alterado: ao aprovar um fechamento, além das linhas de `auditoria_correcoes` por unidade, entra uma **notificação** na tela de Logs resumindo o que a aprovação fez no cadastro: "Aprovação Grand Messejana II 08/2026: cadastro atualizado em 11 unidades, 1 reajuste aplicado", com a lista no corpo. Se a atualização do cadastro falhar, a notificação diz "cadastro NÃO atualizado" com o erro e o que fazer. Reajuste que precisou de decisão humana aparece como "pendente".
- Por que: a API devolvia o resultado, mas a tela de Revisão não o mostra. Uma falha deixava o cadastro velho em silêncio (apontado na validação de 2026-09-17).
- Onde: `lib/server/aprovacao-log.ts`, chamado no fim de `approveFechamentoForEgestor`. Falha ao gravar o log não desfaz a aprovação.

### Ajuste registrado — contrato novo atualiza o aluguel do cadastro na aprovação (2026-09-18)

- Ponto alterado: ao **aprovar** um fechamento, o aluguel cheio de um contrato **novo** passa para `imoveis.valor_aluguel_esperado` e para a vigência (`imovel_vigencias`), como o reajuste já fazia. O valor sai da própria prestação de contas, por três caminhos: (1) linha com "PROPORCIONAL DE N DIAS" de quem entrou (aluguel × dias do mês ÷ N — 474,19 em 21 dias = 700,00; 1.121,61 em 19 dias = 1.830,00); (2) item da seção de intermediações; (3) primeiro mês cheio de inquilino diferente do mês anterior. Cada troca vai para `auditoria_correcoes` e para o log da aprovação.
- Por que: validação de ago/2026. LOCMAIS Galpão 02 estava em 1.700 (inquilino anterior) com a J Mais a 1.830; GM II 26 em 660 com o Samuel a 700. O "contratado" dos Indicadores ficava subestimado até alguém editar a mão.
- Guardas: rescisão também é proporcional, mas de quem saiu — fica de fora (texto "RESCISÃO", tipo rescisão, ou período começando no dia 1). Mesmo inquilino com valor novo é reajuste, não contrato. Cadastro e vigência precisam concordar entre si; valor editado a mão em um deles vira pendência de decisão, não sobrescrita. Centavos ambíguos no inverso do proporcional (22,58 × 31) resolvem pelo valor inteiro que reproduz o observado; o primeiro mês cheio corrige se errar.
- Fechamentos aprovados antes desta data: `scripts/aplicar-contratos-novos-cadastro.ts` (dry-run por padrão, `--aplicar` escreve).
- Docs atualizados: este contrato e `docs/12-execution-roadmap.md`.

## Dados e nomenclatura de exemplo

Manter estes nomes como referencia de copy e seed/demo, salvo decisao documentada:

- Imobiliarias: Alive Imoveis, Cesar Rego, Plural Imobiliaria.
- Empreendimento principal: Grand Messejana II.
- Competencia de exemplo: Marco/2026.
- Documentos: prestacao de contas, comprovante de repasse, relatorio de reajuste, despesas e comprovantes.
- Status visuais: pendente revisao, aprovado, processando.
- Acoes: Revisar, Ver detalhes, Iniciar processamento, Reprocessar, Aprovar fechamento, Marcar como resolvido, Justificar.

## Como atualizar este doc

Atualize este contrato quando o mock mudar ou quando uma implementacao aprovada substituir um comportamento do mock. Registre a mudanca tambem em `12-execution-roadmap.md`.

### Ajuste registrado — denominador do % efetivo de administração (2026-09-21)

- **Ponto alterado:** o % efetivo da comissão de administração passa a dividir
  pela base sobre a qual a taxa realmente incide — `base_comissao_administracao`
  (linhas regulares) **mais** o total dos recebimentos extraordinários que pagam
  administração (acordo, rescisão, atraso) — e não por `total_receitas`.
- **Por quê:** a cliente reportou "6,1% efetivo" na Visão geral contra 7% na
  Revisão do mesmo fechamento. Não era divergência de valor, era de denominador.
  `total_receitas` soma também acordos, rescisões, intermediações e atrasos, e a
  taxa de administração não incide sobre eles. Denominador maior, percentual menor.
- **Consequência que importa mais que o número:** como o denominador inflado
  sempre puxa o efetivo para baixo, o alerta "efetivo acima do contrato" —
  criado justamente para pegar a taxa retida duas vezes em ago/2026 — nunca
  acendia. O sintoma estava mascarado.
- **Fonte única:** a base já era calculada uma vez por `commissionBaseComponents`
  (`lib/comissao.ts`) e gravada em `analise_completa.totals`. A Revisão já a
  mostra no tooltip do valor calculado. Os indicadores passam a ler o mesmo
  número em vez de recalcular por outro caminho.
- **Fail-closed:** fechamento sem a base declarada deixa o efetivo em "—". Somar
  só os fechamentos que declaram produziria uma base menor que a real e um
  percentual maior que o real — exatamente o erro que acende o alerta à toa.
- **Intermediação fica fora do denominador da administração.** Tem comissão
  própria, base própria (aluguel + garagem do contrato novo) e linha própria na
  tela. Deixá-la dentro — como `total_receitas` fazia — era o erro original;
  tirá-la sem somar a base de acordo/rescisão/atraso é o erro simétrico, que
  levava 7,00% a exibir 8,02% e acendia retenção dobrada onde não houve.
- **Verificação:** nos 14 fechamentos de jul e ago/2026, o efetivo agora
  reproduz exatamente o percentual que a Revisão mostra do mesmo fechamento, e
  coincide com a taxa de contrato em todos. Antes: 5,6% a 6,4%.
- **Não muda:** o efetivo da intermediação e o % de contrato.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — derivação da ocupação acumulada sai da tela (2026-09-21)

- **Ponto alterado:** a segunda linha do descritivo da Ocupação passa a exibir
  só `acumulado de N meses desde <mês>: <percentual>`. A contagem em
  unidade-mês, a definição da unidade e o aluguel contratado da janela vão para
  a tooltip (`Hint`).
- **Por quê:** com um empreendimento filtrado, a linha exibia "24 de 27 imóveis"
  e logo abaixo "90 de 108 unidade-mês · R$ 60.550,77". Os dois números estão
  certos e recortados — 108 é 27 unidades × 4 meses — mas a linha trocava a
  unidade de conta sem avisar, e a cliente leu como filtro que não pegou. O
  defeito era de leitura, não de cálculo: verificado que a agregação, a query e
  a API recortam corretamente nos três níveis de filtro.
- **Regra aplicada:** a mesma que `components/acr/hint-tooltip.tsx` enuncia —
  quando o número já se explica sozinho, a derivação não fica solta embaixo dele.
- **"de N meses" fica visível** porque é exatamente a informação que faltava: diz
  que o percentual não é do mês em tela antes de o leitor comparar com o de cima.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — histórico do imóvel fala de dívida, não de meses (2026-09-21)

- **Ponto alterado:** o tile "Inadimplente" (contagem de meses que já estiveram
  inadimplentes) vira **"Em aberto"**: quantas competências seguem devendo, com
  o valor somado embaixo. O histórico (N meses, M já quitados) vai para a
  tooltip.
- **Por quê:** a cliente abriu a Luana (apto 7, GM II) e viu "Inadimplente 3"
  quando junho já fora pago em julho e julho em agosto — só agosto seguia
  devendo. O número estava certo e a leitura, errada: "3" lê como "deve três
  meses". Medido: 8 das 12 unidades com histórico de inadimplência exibiam
  número inflado, três delas mostrando inadimplência com tudo já quitado.
- **Quitação não é inferida na tela.** Vem de `atrasos_competencia_origem` no
  snapshot, a mesma evidência que o mapa de calor usa. Mês sem origem informada
  nunca é dado como pago por chute, e pagamento anterior à dívida não a quita.
- **Valor em aberto** usa `cobranca_esperada` (CA-IND26: mesma base da Revisão e
  dos Indicadores). Sem base de cálculo em algum mês aberto o valor é "—", nunca
  R$ 0,00 — zero afirmaria que a unidade não deve nada.
- **Linha do tempo:** competência inadimplente já quitada ganha o selo
  "quitada depois". O mês continua na linha — quitada não é o mesmo que não ter
  acontecido.
- **Nomenclatura:** "Acordo" vira **"Inadimplência paga"**, igual ao atraso — são
  o mesmo fato para quem lê (dívida antiga paga, negociada em parcelas ou não), e
  na Luana os dois eventos são R$ 894,18 quitando o mês anterior. Os tipos
  `acordo` e `atraso` continuam distintos no dado, porque a tabela de acordos
  parcelados depende deles; os dois tiles viram um só, com a divisão na tooltip.
  "Meses obs." vira "Meses", com a definição na tooltip.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — rodapé de totais na tabela de intermediação (2026-09-21)

- **Ponto alterado:** a tabela de Intermediação ganha `<tfoot>` com base
  comissionável, encargos, total recebido, comissão, % e repasse.
- **Por quê:** a tabela não somava nada. O único total era a comissão no
  cabeçalho da seção, e conferir a soma contra a planilha exigia somar à mão.
- **Soma só o que tem efeito financeiro.** Linha pendente fica de fora (CA27.2),
  mas não some em silêncio: a contagem vai na tooltip do "Total", com um ⚠ no
  rótulo quando há pendente ou base não apurável.
- **Base desconhecida não vira zero.** A célula mostra "-" e o rodapé soma só as
  demais; nesse caso o **%** fica "—", porque a comissão somaria N linhas e a
  base N-1, e a divisão mentiria para cima. Mesmo erro que o efetivo de
  administração tinha nos Indicadores.
- **Uma soma só:** `totalizarRecebimentos` vive no módulo canônico
  (`lib/recebimentos-extraordinarios.ts`) e alimenta o cabeçalho e o rodapé. A
  tela não recalcula por fora (CA27).
- **Verificado** nos 7 fechamentos com intermediação de mai a ago/2026: a
  identidade base + encargos = total recebido fecha em todos.
- **Ainda não feito:** quebrar a coluna "Encargos" nos componentes da planilha
  (IPTU, água, seguro). Depende do print da aba da cliente para replicar ordem e
  nomes — os dados já existem em `ComponentesIntermediacao`.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — fecha a varredura de nomenclatura do drawer (2026-09-21)

- **Ponto alterado:** no drawer do imóvel, a seção "Acordos parcelados" vira
  **"Inadimplência parcelada"** e o título do card, antes "Acordo", vira
  **"Inadimplência parcelada"** (ou **"Rescisão parcelada"** quando
  `acordo.tipo === "rescisao"`).
- **Por quê:** completa o pedido "dar uma revisada geral nas nomenclaturas". A
  palavra "acordo" é jargão de quem lança o dado, não de quem lê a tela: para a
  cliente o fato é dívida antiga sendo paga em parcelas.
- **Por que aqui não é "Inadimplência paga"**, como no tile: o card descreve um
  plano de pagamento que pode ter parcela **em aberto**. Dizer "paga" mentiria
  enquanto houver parcela pendente — quem diz se quitou é o selo ao lado.
- **Fora do escopo de propósito:** `components/acr/indicadores/tabs/view-receita.tsx`
  ("Acordos recebidos", "Atrasos pagos"). É a aba "Conciliação financeira" que a
  cliente pediu para remover (item 12 do mapa); renomear ali agora é trabalho
  jogado fora.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — tabela de intermediação replica as colunas do documento (2026-09-21)

- **Ponto alterado:** a tabela de Intermediação troca as colunas derivadas
  "Base comissionável" e "Encargos" pelas colunas impressas no documento de
  repasse: **Aluguel · Garagem · Água · IPTU · Seg. inc.**, seguidas de Total
  recebido · Comissão interm. · % · Repasse.
- **Por quê:** paridade com o documento de repasse da imobiliária, que é a fonte
  (Arthur, 2026-09-21). As tabelas de Receitas por imóvel e de Acordos já
  replicavam essas colunas; a de intermediação era a única que colapsava tudo em
  duas derivações, e conferir contra o documento exigia abrir os dois lado a lado.
- **Base e encargos não sumiram — viraram tooltip.** São derivação nossa, não
  coluna do documento, e derivação mora em tooltip. Ficam nas linhas do `Hint`
  do "Total" no rodapé, junto com a explicação de que a comissão incide só sobre
  a base. O cabeçalho do "%" diz a mesma coisa em uma linha.
- **Alinhamento à direita** nas colunas de dinheiro, como nas outras duas tabelas.
- **Componente ausente continua "-", nunca zero.** E quando as colunas somam
  menos que o total impresso, a diferença é declarada: ⚠ na célula do total da
  linha, com a conta na tooltip, e uma linha no `Hint` do rodapé. Não virou
  coluna nova porque o documento não tem uma — mas uma tabela que não fecha em
  silêncio é pior que uma sobra declarada.
- **Uma normalização só:** `componentesLinhaIntermediacao` vive no módulo
  canônico e é a mesma que o rodapé soma (CA27). Ela reaproveita
  `normalizarItemLegado`, então herda o fallback que lê `ÁGUA: R$ ...` da
  observação quando o campo não veio estruturado.
- **Verificado** nos 7 fechamentos com intermediação de mai a ago/2026: a
  identidade colunas + sobra = total recebido fecha em todos. Três linhas
  marcam ⚠ — Grand Castelão I ago/2026 (aptos 3 e 101, sobra R$ 47,60 cada) e
  LOCMAIS mai/2026 (SALA 05, R$ 38,08).
- **Pendente de confirmação no documento:** os R$ 47,60 de Castelão I batem
  exatamente com a água da linha de jul/2026 do mesmo empreendimento, o que
  indica que a extração de agosto perdeu a coluna ÁGUA. Falta um PDF de repasse
  de Castelão I ago/2026 para confirmar e corrigir na extração.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — desconto da intermediação, conferido contra o documento (2026-09-21)

- **Fonte:** `1. PRESTAÇÃO DE CONTAS LOCAÇÃO AGOSTO 20.pdf` (GRAND MESSEJANA II),
  seção "INTERMEDIAÇÕES DE JULHO 2026". O "2. REPASSE ..." é só o comprovante
  bancário do Inter; quem tem as colunas é a prestação de contas.
- **Colunas do documento, na ordem impressa:** NOME · APTO · REAJUSTE · ALUGUEL ·
  DESCONTO · ALUGUEL C/ DESCONTO · GARAGEM · ÁGUA · IPTU · SEG INC. · TOTAL ·
  COMISSÃO · REPASSE · OBSERVAÇÃO · VENC. · CARÊNCIA. São as **mesmas** da seção
  de vigência regular.
- **Ponto alterado:** entram as colunas **Desconto** e **Aluguel c/ desc.**, e a
  base comissionável passa a ser `aluguel c/ desconto + garagem`.
- **Por que isso é correção, não cosmética:** `resolverBase` somava o aluguel
  **cheio**. Numa linha com desconto a base ficaria maior que a real, e com ela
  a comissão derivada do percentual e o % exibido. Nenhuma das 7 intermediações
  já persistidas tem desconto, então nenhum número muda hoje — a verificação
  contra o banco confirma os 7 inalterados. O erro era latente, não ativo.
- **Precedência do líquido:** coluna impressa > aluguel − desconto > aluguel
  cheio. Sem aluguel nenhum a base fica desconhecida e o item vira pendência,
  nunca comissão sobre base inventada.
- **Extração:** `desconto` e `aluguel_com_desconto` entram no JSON Schema dos
  itens de `acordos_rescisoes_recebidos`. Análises já persistidas não têm os
  campos — a coluna Desconto mostra "-" e `aluguel c/ desc.` cai no aluguel
  cheio, que é o valor certo quando não houve desconto.
- **Um centavo de propósito.** A linha TOTAL impressa diz IPTU 4,30, TOTAL
  2.357,40 e REPASSE 1.067,40; o documento arredonda cada coluna por conta
  própria. A soma exata é 4,29 / 2.357,39 / 1.067,39, e é ela que a tela mostra:
  herdar o arredondamento do documento quebraria a identidade colunas = total.
- **Colunas do documento ainda ausentes:** REAJUSTE, VENC. e CARÊNCIA. São
  referência, não parcela da soma, e nenhuma está na extração. Ficam para
  decisão do Arthur.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.

### Ajuste registrado — o TOTAL impresso de cada seção vira conferência (2026-09-21)

- **Ponto alterado:** a extração passa a copiar a linha **TOTAL** impressa ao pé
  de cada seção (`totais_secoes`), e um recheck determinístico compara a nossa
  soma das linhas contra ela, **coluna a coluna**.
- **Por quê:** recalcular a soma das linhas é coerente consigo mesmo e não prova
  nada. Se a extração perde uma coluna inteira, a nossa soma erra junto e o
  fechamento passa — foi o que aconteceu no Grand Castelão I ago/2026, que
  perdeu ÁGUA (R$ 47,60 por apto). O total impresso é a única testemunha externa.
- **Coluna a coluna, não só o total:** se apenas o TOTAL fosse comparado, uma
  água que sumiu da coluna mas entrou no total passaria.
- **`null` é "esta seção não tem essa coluna", nunca zero.** O layout varia por
  imobiliária e até por mês no mesmo empreendimento (Grand Maracanaú imprime
  ENCARGOS e não tem ÁGUA; Grand Castelão teve LIXO até dez/2024). Conferir
  contra zero acusaria divergência em documento correto.
- **Tolerância proporcional às linhas.** A planilha guarda precisão cheia (a aba
  do Castelão traz IPTU `3.676834725940346`) e imprime cada célula arredondada.
  O TOTAL impresso soma os valores cheios; nós só enxergamos os impressos. Em 21
  linhas a deriva chega a 7 centavos — tolerância fixa de um centavo acusaria
  divergência num documento perfeitamente correto.
- **Ausência não é aprovação.** Sem total impresso o recheck **não emite nada**.
  Um "passed" ali afirmaria uma conferência que não aconteceu. Vale para os
  layouts B e C, que não imprimem total por seção, e para análises persistidas
  antes deste campo.
- **Divergência bloqueia o parecer técnico** (`status: failed`), como qualquer
  outro recheck determinístico. Só afeta análises novas.
- **Exceção registrada na allowlist do CA27:** `prestacao-rechecks.ts` lê as
  colunas **cruas**. Passar pelo resolvedor canônico inverteria o objetivo — ele
  aplica fallbacks (água lida da observação, total derivado da base) que
  reconstroem justamente o valor perdido, e a coluna faltante deixaria de
  aparecer. Nenhum número daí alimenta tela ou persistência.
- **Ainda não coberto:** o parser de Excel não popula `totais_secoes`, embora a
  planilha traga a linha TOTAL de graça. Upload `.xlsx` segue sem conferência.
- **Docs atualizados:** este contrato e `docs/12-execution-roadmap.md`.
