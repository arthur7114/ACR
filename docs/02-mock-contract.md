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

- `fechamentos`: lista de fechamentos com filtros, status, valores, diferenca e acoes.
- `novo-fechamento`: formulario com imobiliaria, empreendimento, competencia e observacoes.
- `upload`: upload multiplo, classificacao automatica/manual e bloqueio quando ha documento sem classificacao.
- `processando`: etapas visuais do pipeline: salvar arquivos, classificar, extrair, validar, conciliar e finalizar.
- `revisao`: resumo financeiro agrupado no topo, parecer automático com contagem objetiva de bloqueios/alertas/validações ok, separacao clara entre receitas, comissao administrativa, outras despesas e total comissao + despesas, exibicao da taxa cadastrada, da comissao realizada em % e da data do repasse, cards de quebra de receitas por aluguel/garagem/agua/IPTU/seguro incendio, situacao das unidades separando alugadas, inadimplentes e aptos vagos, pendencias de revisao, receitas por imovel com totalizadores e cabecalho fixo, acordos/rescisoes recebidos no mes, despesas, comprovante de repasse, documentos colapsaveis no fim e acoes.
- `imoveis`: area operacional de cadastros com abas para imoveis, imobiliarias, empreendimentos e regras comerciais por imobiliaria + empreendimento, incluindo importacao CSV de imoveis.
- `configuracoes`: placeholder atual para preferencias, integracoes e regras.
- `configuracoes`: area operacional de integracao eGestor, com token, teste de conexao, conta disponivel padrao, planos de contas por categoria, contato/tag por imobiliaria e tag por empreendimento.

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
- Depois de aprovado, a revisao exibe a previa eGestor com lancamentos consolidados, status de configuracao e acao de envio real controlado.

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
