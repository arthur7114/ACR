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
- Movimentacao: receitas, despesas, comissoes, descontos, repasses, parcelas, origem documental, confianca e correcao manual.
- Acordo/rescisao recebido: item extraido da prestacao quando houver pagamento, acordo, rescisao, parcela ou decisao recebida no mes, com tipo, inquilino, unidade, valor, competencia original, competencia de recebimento, observacao e confianca.
- Comprovante: repasse, boleto, pix, TED/DOC, valor, datas, partes, codigo/autenticacao e conciliacao.
- Validacao: alerta ou divergencia com severidade, status, valores esperados/encontrados e justificativa.
- Mapeamento eGestor: categorias internas para categorias/tags/contas do eGestor.
- Integracao eGestor V1: fechamento aprovado gera lancamentos consolidados em `egestor_lancamentos`; repasse mensal vira `recebimento`; comissao administrativa e despesas agrupadas viram `pagamentos`; envio real grava codigos eGestor e tentativas em auditoria tecnica.
- Envio eGestor: `egestor_envios` registra acao, payload, resposta, status e erro de envio, retry de anexo e revalidacao.
- Auditoria de status: `fechamento_status_eventos` registra status anterior, status novo, usuario, motivo e data/hora para aprovacao e transicoes eGestor.
- Revalidacao eGestor: lancamento enviado pode gravar `revalidado_em`, `revalidacao_status` e `revalidacao_mensagem`; revalidacao nao cria novo lancamento financeiro.

## RBAC

Papeis do MVP:

- `visualizador`: consulta.
- `operador`: cria fechamento, envia documentos, classifica, revisa e corrige campos.
- `aprovador`: aprova fechamentos e justifica bloqueantes quando permitido.
- `admin`: configura regras, parsers, usuarios e permissoes.

Aprovacao exige papel `aprovador` ou `admin`.

## Regras financeiras

- Competencia e o mes/ano de vencimento original, nao necessariamente o mes de pagamento.
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
