# 03 - Domain Model

## Status do fechamento

Fluxo canonico:

`rascunho -> arquivos_enviados -> processando -> processado_com_sucesso | processado_com_alertas -> pendente_revisao -> documentos_adicionados -> reprocessando_parcial -> processado_com_sucesso | processado_com_alertas -> aprovado -> preparado_egestor -> lancado_egestor`

Estados excepcionais: `erro`, `cancelado` e `erro_egestor`.

O fechamento aceita novos documentos em qualquer status, exceto `aprovado` e `lancado_egestor`.

## Entidades principais

- Fechamento: imobiliaria, empreendimento, competencia, status, totais, valor comprovado, diferenca, tolerancia, aprovacao e auditoria.
- Documento do fechamento: arquivo original imutavel, hash SHA-256, tipo, status de processamento, confianca, parser, erro, classificacao manual e remessa.
- Imobiliaria: nome, CNPJ, layout, tolerancia de repasse e janela de conciliacao.
- Empreendimento: agrupador de imoveis.
- Regra comercial: taxa de administracao e taxa de intermediacao por imobiliaria + empreendimento, com uma regra ativa por par.
- Imovel: unidade, inquilino, status, aluguel esperado e taxa de administracao.
- Imovel por competencia: snapshot mensal imutavel na leitura, ligado ao imovel e ao fechamento que o materializou, com status de ocupacao, aluguel esperado/recebido, receita, desconto, comissao, repasse, origem, qualidade, versao de calculo e checksum. O cadastro do imovel continua sendo a fonte separada da posicao atual ("Hoje").
- Movimentacao: receitas, despesas, comissoes, descontos, repasses, parcelas, origem documental, confianca, imóvel vinculado, competência original e correcao manual.
- Receita por imóvel: linha da prestação com `competencia_original`, `competencia_recebimento`, `dia_vencimento` e `imovel_id`; os quatro conceitos são independentes e o vínculo só existe quando o ID foi persistido.
- Acordo/rescisao recebido: item extraido da prestacao quando houver pagamento, acordo, rescisao, parcela ou decisao recebida no mes, com tipo, inquilino, unidade, valor, competencia original, competencia de recebimento, observacao e confianca.
- Comprovante: repasse, boleto, pix, TED/DOC, valor, datas, partes, codigo/autenticacao e conciliacao.
- Validacao: alerta ou divergencia com severidade, status, valores esperados/encontrados e justificativa.
- Mapeamento eGestor: categorias internas para categorias/tags/contas do eGestor.
- Integracao eGestor V1: fechamento aprovado gera lancamentos consolidados em `egestor_lancamentos`; repasse mensal vira `recebimento`; comissao administrativa e despesas agrupadas viram `pagamentos`; envio real grava codigos eGestor e tentativas em auditoria tecnica.
- Envio eGestor: `egestor_envios` registra acao, payload, resposta, status e erro de envio, retry de anexo e revalidacao.
- Auditoria de status: `fechamento_status_eventos` registra status anterior, status novo, usuario, motivo e data/hora para aprovacao e transicoes eGestor.
- Revalidacao eGestor: lancamento enviado pode gravar `revalidado_em`, `revalidacao_status` e `revalidacao_mensagem`; revalidacao nao cria novo lancamento financeiro.
- Cobertura de indicadores: uniao dos pares ativos imobiliaria + empreendimento presentes em regras comerciais ou imoveis ativos, comparada aos fechamentos elegiveis e snapshots da competencia.

## RBAC

Papeis do MVP:

- `visualizador`: consulta.
- `operador`: cria fechamento, envia documentos, classifica, revisa e corrige campos.
- `aprovador`: aprova fechamentos e justifica bloqueantes quando permitido.
- `admin`: configura regras, parsers, usuarios e permissoes.

Aprovacao exige papel `aprovador` ou `admin`.

## Regras financeiras

- Competência original é o mês/ano a que cada receita pertence; competência do fechamento/recebimento é o mês em que o dinheiro entrou. Uma não sobrescreve a outra.
- Dia de vencimento é inteiro de 1 a 31. Um valor isolado como `10` nunca satisfaz a competência original.
- Referência de IPTU, seguro ou outra despesa não pode ser inferida como competência do aluguel. Competência ausente ou inválida bloqueia aprovação.
- A movimentação `receita_aluguel` usa a competência original; o fechamento preserva o total do mês de recebimento.
- IPTU de passagem pode ser exposto na discriminação de receitas, mas se anula financeiramente e não altera receita total, despesa ou repasse.
- Receita só está vinculada quando a linha e a movimentação apontam para um `imovel_id` ativo do mesmo par imobiliária + empreendimento; código/unidade equivalente serve apenas como sugestão.
- Correções de competência ou vínculo atualizam fechamento, movimentação, validações, cadastro quando aplicável e auditoria na mesma transação.
- Divergencia de repasse:
  - ate R$ 0,10: baixa;
  - acima de R$ 0,10 ate R$ 5,00: alta;
  - acima de R$ 5,00: bloqueante.
- Janela padrao de conciliacao: inicio da competencia menos 15 dias ate fim da competencia mais 45 dias.
- Prestacao ausente gera alerta bloqueante e impede aprovacao.
- Reprocessamento parcial deve preservar correcoes manuais.
- IA deve retornar JSON validavel e nunca aprovar ou calcular resultado final sem validacao deterministica.
- Comissao administrativa deve ser validada, quando houver regra comercial ativa, pela taxa do par imobiliaria + empreendimento aplicada sobre o total pago pelo inquilino: aluguel com desconto quando existir, senao aluguel, somado a garagem, agua, IPTU e seguro incendio.
- Na intermediação documentada, `valor` representa o aluguel/base da comissão. IPTU não entra na base percentual, mas compõe o total recebido e o repasse da linha; a revisão deve exibir base, IPTU, total, comissão, percentual e repasse sem conflar esses conceitos.
- Taxa de intermediacao cadastrada permanece apenas como regra comercial; o lançamento documentado é a fonte operacional da comissão efetivamente retida.
- Comissao realizada em percentual e calculada como comissao administrativa documentada dividida pela base de comissao administrativa.
- Acordo/rescisao com mesma combinacao normalizada de tipo, inquilino, competencia original e valor ja vista no pacote ou no historico do mesmo par imobiliaria + empreendimento gera alerta bloqueante por possivel pagamento repetido.
- Acordo/rescisao recebido no mes com competencia original diferente da competencia do fechamento gera alerta operacional para revisao.
- Lancamento eGestor com `egestor_codigo` salvo e imutavel para reenvio V1; operador pode apenas revalidar status ou reenviar anexos pendentes.
- Falha de anexo eGestor nao desfaz recebimento/pagamento criado; o lancamento fica `anexo_pendente` ate retry bem-sucedido.
- Indicadores incluem apenas fechamentos nao arquivados, com `analise_completa`, nos status `pendente_revisao`, `processado_com_sucesso`, `processado_com_alertas`, `aprovado`, `preparado_egestor`, `lancado_egestor` e `erro_egestor`. Reprocessamento ativo preserva a ultima analise valida e sinaliza "Em atualizacao".
- A competencia dos indicadores e `completa` somente quando todos os pares esperados foram processados e nao ha lacuna estrutural; caso contrario e `preliminar`.
- Receita total, aluguel contratado e aluguel recebido sao conceitos diferentes: receita total vem de `PackageTotals.total_receitas`; contratado vem do aluguel esperado dos snapshots; recebido usa `aluguel_com_desconto`, com fallback apenas para `aluguel`.
- Ponte financeira: `receita bruta - comissao administrativa - despesas do locador - comissao de intermediacao = repasse apurado`, tolerancia de R$ 0,01. Comprovado ausente permanece `null`; repasse embutido e rotulado como informado no extrato.
- Realizacao do aluguel: `contratado - vacancia - inadimplencia do mes - descontos +/- outros ajustes = recebido`. Inadimplencia acumulada permanece separada.
- Status mensal do imovel e um de `ocupado`, `inadimplente`, `vago`, `em_rescisao` ou `desconhecido`. Zero sem evidencia suficiente e `desconhecido`, nunca vacancia.
- Taxa de ocupacao mensal usa ocupado + inadimplente + em rescisao no numerador e adiciona vago no denominador; desconhecidos ficam fora do denominador e reduzem a cobertura.
- `null` significa dado ausente; `0` significa zero confirmado. Series terminam na competencia selecionada e taxas agregadas sao ponderadas pelos seus denominadores.
