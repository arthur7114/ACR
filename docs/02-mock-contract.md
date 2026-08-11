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
- `imoveis`: area operacional de cadastros com abas para imoveis, imobiliarias, empreendimentos e regras comerciais por imobiliaria + empreendimento, incluindo importacao CSV de imoveis e botao "Sincronizar dos fechamentos" (popula/atualiza o cadastro de imoveis a partir das prestacoes ja processadas). Cada imovel e clicavel e abre um drawer de Historico do imovel (linha do tempo derivada das prestacoes: aluguel pago/inadimplente/vago, acordos, rescisoes, inadimplencia paga e intermediacao), com resumo e periodos por inquilino. O drawer tambem traz a secao "Acordos parcelados" (Nivel 2): acordos/rescisoes parcelados detectados nas prestacoes, com barra de progresso (parcelas pagas/total), valor pago/total e baixa por parcela (automatica pela prestacao ou manual, clicando na parcela). Botao "Sincronizar dos fechamentos" tambem popula os acordos parcelados.
- `configuracoes`: placeholder atual para preferencias, integracoes e regras.
- `configuracoes`: area operacional de integracao eGestor, com token, teste de conexao, conta disponivel padrao, planos de contas por categoria, contato/tag por imobiliaria e tag por empreendimento.
- `indicadores`: painel operacional-financeiro da carteira, com sub-abas Visão geral, Conciliação financeira, Riscos por imóvel e Detalhamento por imóvel. Filtros por competência, empresa, empreendimento e imóvel por UUID; alternância valor x percentual. O fechamento documental é a fonte financeira, o comprovante bancário confirma o pagamento e as vigências históricas definem o aluguel contratado. Todo número informa fonte, cobertura e um dos estados `Confirmado`, `Em conferência`, `Incompleto` ou `Com divergência`.
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
- Resolucao de pendencia abre modal claro com valores comparados, escolha do valor oficial e justificativa obrigatoria para auditoria. Quando a pendencia nao tem valor a decidir (documento opcional ausente ou alerta informativo), o modal omite os valores e a escolha e oferece apenas "Ignorar pendencia" com justificativa, sem alterar nenhum valor da prestacao.
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
