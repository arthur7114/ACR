# 15 - Registro de incidentes dos indicadores

Registro vivo de erros que chegaram aos indicadores, com a **classe de causa** de
cada um. O objetivo não é listar bugs — é ver reincidência: quando a mesma classe
aparece pela terceira vez, o conserto não é o bug, é o mecanismo que deixou passar.

Como usar: toda vez que o cliente reportar um número errado, ou um verificador
acusar, adicione uma linha. Classifique pela causa, não pelo sintoma.

## Incidentes

| # | Data | Sintoma | Classe | Como foi detectado | Correção |
|---|---|---|---|---|---|
| 1 | 2026-09-10 | `garagem_recebida` parou de ser gravada | A | leitura de migration | `202609100001` devolve a coluna |
| 2 | 2026-09-10 | `observacao` nunca chegou na RPC de reparo | A | mesma leitura | `202609100001` |
| 3 | 2026-09-10 | Verificador acusava 317 de 355 checksums inválidos (falsos) | B | rodar o verificador | `observacao` no SELECT e no checksum |
| 4 | 2026-09-10 | R$ 3.945,36 rotulados "sem documento", crescendo 0,29%→4,45% | G | conferência manual | decomposto em 3 causas nomeadas |
| 5 | 2026-09-10 | R$ 788,22 de dívida inferida descartados do KPI | D | `verify-consistencia-telas` | portão olha o registro, não o nome da seção |
| 6 | 2026-09-10 | Mesma dívida gravada em dois empreendimentos | E | `verify-consistencia-telas` | guarda de escopo na escrita e nas leituras |
| 7 | 2026-09-16 | Vacância R$ 800 quando era R$ 1.200 | C | **vídeo do cliente** | aluguel do 101 corrigido; 4 imóveis ainda com zero-placeholder |
| 8 | 2026-09-16 | Taxa de administração retida duas vezes (R$ 267,88) | F | **print do cliente** | consolidado do extrato tem prioridade sobre despesa externa |
| 9 | 2026-09-16 | "Com divergência" aceso em 16 de 27 fechamentos | D | **reclamação do cliente** | gatilho passa a olhar o resto não explicado |
| 10 | 2026-09-16 | Agosto: teto da carteira inteira contra recebido de 2 fechamentos (R$ 79.327,25 de resíduo) | H | `verify-indicadores-identidades` | teto limitado aos pares com fechamento na competência |
| 11 | 2026-09-16 | Comissão calculada sem os encargos por atraso (R$ 140,66 em vez de R$ 149,47) | C | **vídeo do cliente** | `outros_recebimentos` entra na base |
| 12 | 2026-09-16 | R$ 0,26 sem explicação em junho: desconto de aluguel atrasado contado como desconto do mês | D | identidade da decomposição | `desconto` do snapshot só soma linhas da própria competência (v3.3) |

## Classes de causa

**A — Mais de um caminho de escrita para a mesma tabela.**
Hoje três escrevem `imovel_competencias`: a RPC de processamento, a RPC de reparo
e um upsert direto em TypeScript (`/corrigir`). Toda coluna nova precisa entrar
nos três. Reincidências: 2. Prevenção estrutural em 2026-09-16.

**B — Leitor e escritor mantêm listas de campos independentes.**
O checksum nasce do row completo do builder; o verificador recompunha a partir do
próprio SELECT. Duas listas sem vínculo, e a divergência vira alarme falso.

**C — Zero usado como valor conhecido quando significa "sem dado".**
Cadastro migrado trouxe aluguel 0 como placeholder. A cobertura só conta
`null`, então o zero passou como conhecido e a vacância ficou menor por 4 meses.

**D — Decisão tomada sobre um proxy, não sobre a coisa.**
"Existe seção chamada inadimplência?" em vez de "existe valor de dívida?".
"Existe diferença?" em vez de "existe diferença sem causa conhecida?".
"Desconto na linha" em vez de "desconto no aluguel deste mês" — o abatimento de um
atraso quitado já vive no valor recuperado e entrava de novo na ponte.
Reincidências: 3.

**E — Dado com escopo aplicado na leitura, não na escrita.**
Um documento cobre a imobiliária inteira e vira dois fechamentos; sem filtro no
momento da escrita, o registro de um empreendimento entra no outro.

**F — Duas fontes para a mesma quantia, prioridade invertida.**
A nota fiscal da taxa de administração descreve a MESMA retenção que o extrato
já deduziu. Ganhou a fonte que não reconcilia o repasse.

**H — Métrica agregando sobre um conjunto diferente do resto da tela.**
"Aluguel contratado" vem das vigências de toda a carteira; recebido, vacância e
inadimplência vêm dos fechamentos existentes. Em mês parcialmente coberto
(agosto: 2 de 9 empreendimentos) a tela compara coisas de escopos diferentes.

**G — Balde residual que absorve tudo.**
Um campo "resto" sem decomposição esconde erro crescente: ninguém olha um número
que sempre existiu.

## O que previne cada classe

| Classe | Mecanismo | Estado |
|---|---|---|
| A | **uma única função SQL grava o snapshot** (`gravar_snapshots_indicadores`, 202609160001): sem lista de colunas — as chaves do JSON são as colunas, o SET vem do catálogo e chave sem coluna é ERRO. As duas RPCs e a via TypeScript delegam a ela; teste estrutural proíbe `insert into imovel_competencias` fora dela | **feito** |
| B | o verificador recompõe a partir da mesma fonte que grava | feito |
| C | **constraint no banco**: `aluguel` é NULL ou > 0 em `imoveis` e `imovel_vigencias` (202609160001, NOT VALID para não travar 3 vigências antigas em zero: TERRENO CASTELÃO, Grand Messejana II 3, LOCMAIS SALA 05). 13 Airbnb em zero viraram NULL. No TypeScript, zero em aluguel fixo vira desconhecido ao montar a propriedade | **feito na escrita**; leitura de vigência antiga em zero ainda a fechar |
| D | identidade canônica por métrica, em `indicadores-identidades.ts` | 42 identidades ativas |
| E | guarda de escopo no ponto de escrita, com a função canônica única | feito para César Rêgo |
| F | a fonte que reconcilia a equação tem prioridade; a outra é conferência | feito |
| G | todo resto tem decomposição nomeada e identidade que fecha | feito |
| H | agregado calculado sobre o mesmo conjunto dos demais números da tela | feito para o teto contratado |

## A lição de processo

Os incidentes 7, 8 e 9 foram detectados por **vídeo e print do cliente**. Os
incidentes 5 e 6 foram detectados por verificadores que já existiam no repositório
— e só rodaram porque alguém os executou à mão.

`verify-consistencia-telas`, `verify-indicadores-identidades` e
`verify-indicadores-snapshots` rodam contra o banco real e não estão agendados.
O #8 (divergência de R$ 267,88 no Galpão José Walter) já estava detectável por
`verify-indicadores-identidades` em 2026-09-15; foi descoberto por WhatsApp em
16/09.

**Maior alavanca disponível hoje: agendar os três verificadores.** A detecção já
existe e está desligada.
