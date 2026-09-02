# 14 - Levantamento de gaps — feedback do cliente de 2026-09-01

Fonte: seis vídeos do cliente (WhatsApp, 2026-09-01, 16h48–17h06), todos sobre
**Grand Messejana II · Julho/2026**, cruzados com os quatro PDFs do pacote
(`1. PRESTAÇÃO DE CONTAS`, `2. REPASSE`, `3. RELATÓRIO`, `4. DESPESAS`), a
planilha `CAIXA ADMINISTRAÇÃO LOCAÇÃO - GM II (13).xlsx` (aba `JUL 26`) e o
estado persistido no Supabase (`fechamentos.analise_completa`,
`imovel_competencias`). Os prints de 13 a 18/08 foram revistos para confirmar
recorrência.

## Por que "toda vez tem algo novo"

Os erros não eram aleatórios: caíam em três classes que nenhuma verificação
determinística cobria.

1. **Coluna perdida na leitura sem nenhum total divergir.** O total de cada
   linha é copiado do documento, então uma coluna inteira pode chegar zerada
   (seguro incêndio) e todos os rechecks de total passam. Faltava conferir
   `aluguel + garagem + água + IPTU + seguro = total` por linha.
2. **Definições de contagem diferentes das do cliente.** "Alugadas",
   "Inadimplentes" e "Intermediação" eram baldes exclusivos; para o cliente,
   inadimplente e intermediação **são** unidades alugadas. Cada iteração
   ajustava um balde e desalinhava outro.
3. **Números sem fórmula visível.** O aluguel médio dividia por 23 enquanto o
   tile ao lado mostrava 22 alugadas; o cliente não conseguia reproduzir na
   calculadora e concluía que estava errado.

## Queixas, causa-raiz e correção

| # | Vídeo | Queixa do cliente | Causa-raiz encontrada | Correção |
|---|---|---|---|---|
| 1 | 16h48 | "22 alugadas era pra ser 24: inadimplente e intermediação são imóveis alugados; só tem 3 vagos" | `isRentedCurrentRow` excluía inadimplente e intermediação de Alugadas | Alugadas = unidades com locatário no mês (`isOccupiedRow`); Inadimplentes, Intermediação, Rescisões e Reajustes viram subconjuntos declarados no texto da seção |
| 2 | 16h53 | "Como chegou no aluguel médio? Dividi a receita de aluguel e não bateu" | Denominador (alugadas + inadimplentes = 23) diferente do tile Alugadas (22); fórmula não exibida | Média = aluguel das alugadas ÷ alugadas (mesmo número do tile); tile imprime `R$ 12.811,93 ÷ 24 alugadas` |
| 3 | 16h58 | "Tem 8 seguro incêndio e a coluna está toda zerada" | `findColumn` do parser de planilha exigia igualdade exata; o cabeçalho real é `SEG INC.` (com ponto) → coluna nunca mapeada. Afetou GM II (8 linhas, R$ 1.121,33), GM I (1 linha, R$ 140,40) e Grand Castelão (2 linhas, R$ 281,33) em julho | Casamento ignora pontuação final; novo recheck `linhas_componentes` (alerta) acusa total acima da soma dos componentes |
| 4 | 17h00 | "Deveria ter etiqueta de atualização monetária (foram 5 no mês) e clicar no valor dizer algo" | Coluna REAJUSTE da planilha não era lida; relatório de locação (doc 3) caiu em `desconhecido` (confiança 0,72 < 0,80) e o bloco de reajuste ficou nulo | Parser captura `reajuste_mes`; badge **Reajuste** quando o mês da coluna = competência e a linha não é contrato novo (aptos 2, 19, 20, 21, 25 — os mesmos 5 do relatório); tile Reajustes; prompt do classificador passa a descrever o relatório Alive |
| 5 | 17h03 | "No acordo da Luana não traz as colunas de cima: seguro, água, IPTU, garagem" | Tabela de acordos mostrava só principal/ajuste/recebido | Colunas Aluguel, Garagem, Água, IPTU e Seg. inc. na tabela de acordos, com totais; `seguro_incendio` passa a existir no item de acordo |
| 6 | 17h06 | "Na rescisão daria uma tag de rescisão também" | Linha de rescisão proporcional caía sem badge | Badge **Rescisão** e tile Rescisões (dentro das alugadas) |

Valores-canário GM II jul/26 após a correção: 27 unidades, 24 alugadas
(22 pagantes + 1 inadimplente + 1 intermediação; apto 26 em rescisão está entre
as pagantes), 3 vagas (6, 12, 18), 1 rescisão (26), 5 reajustes (2, 19, 20, 21,
25), seguro incêndio R$ 1.121,33 em 8 linhas, aluguel médio R$ 12.811,93 ÷ 24 =
R$ 533,83.

## Indicadores — o que bate e o que não bate

- **Ocupação (Indicadores) × Alugadas (Revisão) divergem em um caso, por
  decisão do próprio cliente.** Nos indicadores a rescisão encerra o mês vaga
  (canário Grand Maracanaú 214, 18/08): GM II jul/26 tem 22 ocupados + 1
  inadimplente + 4 vagos. Na Revisão a rescisão proporcional conta como alugada
  no mês (vídeo 16h48): 24 alugadas + 3 vagos. As duas telas agora declaram a
  própria definição no texto; não há erro de cálculo.
- **Aluguel contratado defasado nas unidades reajustadas.** `imovel_competencias`
  de julho registra `aluguel_esperado` 660,00 para os aptos 2 e 20 (e valores
  antigos para 19, 21 e 25) enquanto o recebido já é o reajustado (690,63 etc.).
  Causa: o relatório de reajuste nunca foi processado (classificação abaixo do
  limiar), então `contrato_valores` não recebeu a nova série. Efeito: "Aluguel
  contratado" e "Cobrança esperada" dos Indicadores ficam abaixo do real nessas
  unidades. **Não corrigido neste ciclo**: exige reprocessar o documento 3 pela
  IA (com o prompt do classificador corrigido) ou registrar as vigências
  manualmente; decisão do operador.
- **Intermediação (apto 9, Marília) é ocupado nos Indicadores** e alugada na
  Revisão — consistente.
- **Grand Maracanaú jul/26** foi extraído do PDF pela IA (planilha em Downloads
  não tem aba `JUL 26`); as 30 linhas reconciliam componentes × total, 2 com
  seguro. Sem reprocessamento necessário.
- **Galpão Pompílio Gomes**: componentes acima do total nas duas linhas é o IPTU
  de passagem anulado (layout C) — comportamento esperado; o novo recheck só
  acusa total **acima** da soma.

## Outro empreendimento, outro layout de planilha (2026-09-02)

Cabeçalhos reais das seis planilhas do cliente: Grand Maracanaú traz
`DATA INÍCIO LOCAÇÃO` no lugar de `REAJUSTE` e uma coluna `ENCARGOS`; Terreno
Castelão não tem garagem, água nem seguro; as demais seguem o layout GM II. Uma
coluna numérica desconhecida era descartada em silêncio (o TOTAL da linha vem do
documento, então nenhum total acusava). Fechamento em três camadas:

1. O parser registra em `plano_extracao.colunas_nao_lidas` toda coluna numérica
   da tabela de vigência que não mapeou (rótulo, total e nº de linhas), ignorando
   colunas conhecidas não monetárias (`VENC.`, `CARÊNCIA`, `DATA INÍCIO`).
2. O recheck `linhas_componentes` lê essa lista: nomeia a coluna em vez de
   chutar; **bloqueia** quando há coluna não lida **e** o total da linha excede a
   soma dos componentes (dinheiro real não lido); fica em alerta quando os totais
   fecham (número que não é receita).
3. `ENCARGOS` passou a mapear para `outros_recebimentos` (campo já consumido
   pelos snapshots dos Indicadores), no parser e no prompt/schema da IA. Decisão
   de 2026-09-02. A base da comissão de administração **não** inclui
   `outros_recebimentos`; confirmar com o documento do Maracanaú antes de mudar.

Verificado na planilha real do Grand Maracanaú (aba JUN 26): zero colunas não
lidas; a coluna ENCARGOS foi mapeada (em junho ela está sem valores). O julho
do Maracanaú foi lido do PDF pela IA e suas 30 linhas reconciliam componentes ×
total, então não precisa de reprocessamento.

## Correção do aluguel contratado (2026-09-02)

Diagnóstico: em julho, 32 das 118 unidades registravam `aluguel_contratado`
ABAIXO do recebido, mais 2 com contrato ativo e valor zero. A carteira aparecia
rendendo mais que o contratado, o que é impossível, e puxava "Cobrança
esperada", "Vacância" e o percentual de realização para baixo. Causa: o
relatório de vigência (documento 3) nunca foi processado — o de julho do Grand
Messejana II estava no Storage classificado como `desconhecido` com status
`erro`, porque a confiança da IA ficou em 0,72, abaixo do limiar de 0,80.

`lib/server/reajuste-relatorio-parser.ts` lê o relatório deterministicamente
(sem IA): seção ATUALIZAÇÃO MONETÁRIA (valor do ano anterior e do ano corrente
por apartamento) e seção APARTAMENTO ALUGADO (contrato novo, com data de
início). O relatório de março que já estava em `docs/Artefatos` virou fixture de
regressão, e um teste garante que a extração por pdfjs (usada pelo script) e por
pdftotext produzem a mesma leitura.

`scripts/aplicar-vigencias-contratuais.ts` aplica a correção com dry-run por
padrão, em duas fontes com autoridade decrescente:

1. **Relatório de vigência.** Guardrail: o valor "anterior" impresso tem de
   bater com o cadastrado, senão a linha é recusada em vez de sobrescrever algo
   de outra origem. Nas 5 atualizações monetárias de julho os cinco valores
   bateram exatamente, o que confirma que o relatório é a fonte certa.
2. **Coluna ALUGUEL da prestação**, só em mês cheio (sem PROPORCIONAL) e só na
   direção defasada (documento comprova valor maior que o cadastro). Mesmo
   precedente do reparo Pompílio/César Rêgo da migration 202608120001.

Nunca reduz valor sem documento, não toca unidade de receita variável (Airbnb) e
não cria vigência para linha sem imóvel vinculado. A vigência antiga é encerrada,
não sobrescrita: o valor velho é o que explica os meses já fechados.

Resultado em julho/2026: 36 vigências corrigidas (5 por atualização monetária, 3
por contrato novo, 28 pela prestação), snapshots recalculados pelo reparador
idempotente, e as unidades com contratado abaixo do recebido caíram de 32 para 1.
A remanescente é o apto 204 do Grand Maracanaú, inadimplente em julho que quitou
atraso de junho: recebido maior que o contratado é o comportamento correto ali.
O relatório de julho do GM II foi reclassificado de `desconhecido`/`erro` para
`relatorio_reajuste`/`processado`.

Duas observações registradas e não corrigidas:

- A tabela `imovel_vigencias` exige `vigencia_inicio` no dia 1 (check
  `imovel_vigencias_competencia_inicio_check`). Os contratos que começam no meio
  do mês (aptos 3, 8 e 23, dias 16, 27 e 30/07) entram no dia 1 com a data real
  preservada no campo `fonte`.
- O reparador de indicadores regenera as validações do Grand Maracanaú a cada
  execução, sem alterar dinheiro nem o conjunto de rechecks. É ruído cosmético de
  idempotência, anterior a este ciclo.

## Prints de agosto (13 a 18/08) — situação

Todos os itens dos prints (José Walter sem aluguel recebido, alerta de
incompleto, vacância Grand Maracanaú, receita × planilha, rescisão não somada,
aptos 202/214) têm commits correspondentes entre 12 e 28/08 e não reapareceram
nos vídeos de 01/09. O item "aluguel médio não está correto" (13/08, João
Cordeiro) reapareceu em 01/09 (GM II) e é o gap #2 acima: a mudança de agosto
corrigiu o denominador, mas não exibiu a fórmula.

## Reprocessamento

Fechamentos de julho/2026 reprocessados a partir da planilha com
`scripts/reprocessar-planilha.ts` (status, movimentações manuais e validações
resolvidas preservados): Grand Messejana II, Grand Messejana I, Grand Castelão I
e LOCMAIS. Resultado registrado no roadmap (`docs/12-execution-roadmap.md`).

## Não verificado neste ciclo

- Prompt do classificador de documentos (relatório de reajuste): alteração de
  texto sem execução real da IA.
- `reajuste_mes` e `seguro_incendio` de acordos no caminho da IA (PDF): schema e
  prompt atualizados; só uma extração nova confirma.
- Tela de Revisão não foi aberta no navegador (login obrigatório); cobertura por
  testes unitários, tipos e lint.
