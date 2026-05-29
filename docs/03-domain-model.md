# 03 - Domain Model

## Status do fechamento

Fluxo canonico:

`rascunho -> arquivos_enviados -> processando -> processado_com_sucesso | processado_com_alertas -> pendente_revisao -> documentos_adicionados -> reprocessando_parcial -> processado_com_sucesso | processado_com_alertas -> aprovado -> preparado_egestor -> lancado_egestor`

Estados excepcionais: `erro` e `cancelado`.

O fechamento aceita novos documentos em qualquer status, exceto `aprovado` e `lancado_egestor`.

## Entidades principais

- Fechamento: imobiliaria, empreendimento, competencia, status, totais, valor comprovado, diferenca, tolerancia, aprovacao e auditoria.
- Documento do fechamento: arquivo original imutavel, hash SHA-256, tipo, status de processamento, confianca, parser, erro, classificacao manual e remessa.
- Imobiliaria: nome, CNPJ, layout, tolerancia de repasse e janela de conciliacao.
- Empreendimento: agrupador de imoveis.
- Regra comercial: taxa de administracao e taxa de intermediacao por imobiliaria + empreendimento, com uma regra ativa por par.
- Imovel: unidade, inquilino, status, aluguel esperado e taxa de administracao.
- Movimentacao: receitas, despesas, comissoes, descontos, repasses, parcelas, origem documental, confianca e correcao manual.
- Comprovante: repasse, boleto, pix, TED/DOC, valor, datas, partes, codigo/autenticacao e conciliacao.
- Validacao: alerta ou divergencia com severidade, status, valores esperados/encontrados e justificativa.
- Mapeamento eGestor: categorias internas para categorias/tags/contas do eGestor.

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
- Taxa de intermediacao e cadastrada e exibida como regra comercial, mas nao altera o total a repassar ate haver documento/campo operacional especifico para esse lancamento.
