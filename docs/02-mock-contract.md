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

- `fechamentos`: lista de fechamentos com filtros, status, valores, diferenca e acoes. Rascunho sem job ativo aparece como "Aguardando documentos" e abre o upload; somente `processamento_status=processando` aparece como "Processando".
- `novo-fechamento`: formulario com imobiliaria, empreendimento, competencia e observacoes.
- `upload`: upload multiplo, classificacao automatica/manual e bloqueio quando ha documento sem classificacao.
- `processando`: etapas visuais do pipeline: salvar arquivos, classificar, extrair, validar, conciliar e finalizar.
- `revisao`: resumo financeiro agrupado no topo, parecer automático com contagem objetiva de bloqueios/alertas/validações ok, separacao clara entre receitas, comissao administrativa, outras despesas e total comissao + despesas, exibicao da taxa cadastrada, da comissao realizada em % e da data do repasse, cards de quebra de receitas por aluguel/garagem/agua/IPTU/seguro incendio, situacao das unidades separando alugadas, inadimplentes e aptos vagos, pendencias de revisao, receitas por imovel com totalizadores e cabecalho fixo, acordos/rescisoes recebidos no mes, intermediação com aluguel/base, IPTU, total recebido, comissão, percentual e repasse separados, despesas, comprovante de repasse, documentos colapsaveis no fim e acoes.
- `imoveis`: area operacional de cadastros com abas para imoveis, imobiliarias, empreendimentos e regras comerciais por imobiliaria + empreendimento, incluindo importacao CSV de imoveis e botao "Sincronizar dos fechamentos" (popula/atualiza o cadastro de imoveis a partir das prestacoes ja processadas). Cada imovel e clicavel e abre um drawer de Historico do imovel (linha do tempo derivada das prestacoes: aluguel pago/inadimplente/vago, acordos, rescisoes, inadimplencia paga e intermediacao), com resumo e periodos por inquilino. O drawer tambem traz a secao "Acordos parcelados" (Nivel 2): acordos/rescisoes parcelados detectados nas prestacoes, com barra de progresso (parcelas pagas/total), valor pago/total e baixa por parcela (automatica pela prestacao ou manual, clicando na parcela). Botao "Sincronizar dos fechamentos" tambem popula os acordos parcelados.
- `configuracoes`: placeholder atual para preferencias, integracoes e regras.
- `configuracoes`: area operacional de integracao eGestor, com token, teste de conexao, conta disponivel padrao, planos de contas por categoria, contato/tag por imobiliaria e tag por empreendimento.
- `indicadores`: painel de KPIs da carteira, com sub-abas Visao geral, Receita & repasse, Mapa de calor e Registro de pagamentos. Filtros por competencia, empreendimento e imovel; alternancia valor x percentual. Todos os numeros derivam de dados ja existentes (fechamentos processados, `analise_completa`/PackageTotals e cadastro de imoveis).
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
- Estado corrigido: `rascunho` sem processamento deixa de aparecer como "Processando" e volta ao upload, evitando abrir uma revisão sem análise.
- Paleta confirmada: o mapa de calor volta a usar seis faixas de verde a vermelho, passando por amarelo e laranja.
- Docs atualizados: este contrato, `docs/03-domain-model.md`, `docs/06-acceptance-criteria.md` e `docs/12-execution-roadmap.md`.

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
- Resolucao de pendencia abre modal claro com valores comparados, escolha do valor oficial e justificativa obrigatoria para auditoria.
- Leitura do documento e documentos processados ficam no fim da revisao, em secoes colapsaveis fechadas por padrao, para nao deslocar o resumo financeiro operacional.
- Possivel pagamento repetido de acordo/rescisao e pendencia bloqueante ate resolucao ou justificativa.
- Fechamentos aprovados podem ser vistos em detalhes.
- Depois de aprovado, a revisao exibe a previa eGestor com lancamentos consolidados, status de configuracao, acao de envio real controlado, revalidacao de status, retry de anexos pendentes, historico de envios e auditoria de mudanca de status.

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
